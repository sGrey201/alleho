import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { db } from "./db";
import { users, payments } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { isAuthenticated, isAdmin } from "./emailAuth";
import { login, requestPasswordReset, resetPassword, changePassword, getEmailUser, logoutEmail } from "./emailAuth";
import { sendInviteEmail, sendInviteAccessEmail } from "./email";
import { BASE_URL } from "@shared/brand";
import { tagCategoryEnum } from "@shared/schema";
import {
  questionnaireInstanceDataSchema,
  questionnaireTemplateStructureSchema,
  validateQuestionnaireStructureDepth,
  questionnaireMessageContentSchema,
  questionnaireTemplateMessageContentSchema,
  type QuestionnaireTemplateStructure,
} from "@shared/questionnaireTypes";
import { deepCloneQuestionnaireStructure } from "./questionnaireDefaults";
import {
  insertConversationSchema,
  insertConversationMessageSchema,
  insertConversationMessageCommentSchema,
  pollPayloadSchema,
  type User,
  type ConversationMessage,
} from "@shared/schema";
import {
  publishDoctorChatsUpdated,
  type MessageAuthor,
  pushConversationRecentMessage,
  publishConversationMessage,
  publishConversationMessageEdited,
  publishConversationMessageDeleted,
  publishConversationMessagePinned,
  publishConversationMessageUnpinned,
  publishConversationComment,
  publishConversationCommentEdited,
  publishConversationCommentDeleted,
  publishConversationCommentReaction,
  publishConversationPollUpdated,
  backfillConversationRecent,
  type ConversationMessageWithAuthor,
  type ConversationMessageAuthor,
  type ConversationCommentWithAuthor,
} from "./redis";
import { setupWebSocket } from "./ws";
import { notifyConversationSeen } from "./seenNotify";
import { notifyPatientConversationActivity } from "./doctorChatsNotify";
import {
  getVapidPublicKey,
  isPushConfigured,
  notifyConversationNewMessage,
} from "./push";

let robokassaModulePromise: Promise<typeof import("./robokassa")> | null = null;
let objectStorageModulePromise: Promise<typeof import("./replit_integrations/object_storage")> | null = null;

function getRobokassaModule(): Promise<typeof import("./robokassa")> {
  if (!robokassaModulePromise) {
    robokassaModulePromise = import("./robokassa");
  }
  return robokassaModulePromise;
}

function getObjectStorageModule(): Promise<typeof import("./replit_integrations/object_storage")> {
  if (!objectStorageModulePromise) {
    objectStorageModulePromise = import("./replit_integrations/object_storage");
  }
  return objectStorageModulePromise;
}

async function getCurrentUserId(req: any): Promise<string | null> {
  const session = req.session as any;
  
  if (session?.userId && session?.authType === 'email') {
    return session.userId;
  }
  
  return null;
}

function toAuthUserResponse(user: any) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
    gender: user.gender,
    birthMonth: user.birthMonth,
    birthYear: user.birthYear,
    height: user.height,
    weight: user.weight,
    country: user.country,
    city: user.city,
    questionnaireHintsMode: user.questionnaireHintsMode ?? "icon",
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    isAdmin: user.isAdmin,
    authType: "email",
    hasPassword: !!user.passwordHash,
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  console.log("[routes] registerRoutes: begin");
  // Session middleware (required for email auth)
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in environment variables");
  }
  
  app.set("trust proxy", 1);
  const sessionTtl = 28 * 24 * 60 * 60 * 1000; // 4 weeks
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  console.log("[routes] registerRoutes: session store configured");
  app.use(session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Secure только по HTTPS; при доступе по HTTP (localhost/docker dev) — false
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      maxAge: sessionTtl,
    },
  }));

  // Sitemap.xml - dynamic generation
  app.get('/sitemap.xml', async (req, res) => {
    try {
      const baseUrl = process.env.APP_URL || BASE_URL;
      
      const staticPages: Array<{ loc: string; priority: string; changefreq: string; lastmod?: string }> = [
        { loc: '/', priority: '1.0', changefreq: 'daily' },
        { loc: '/subscribe', priority: '0.8', changefreq: 'monthly' },
        { loc: '/about', priority: '0.6', changefreq: 'monthly' },
        { loc: '/terms', priority: '0.3', changefreq: 'yearly' },
        { loc: '/oferta', priority: '0.3', changefreq: 'yearly' },
      ];
      
      const allUrls = staticPages;
      
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(url => `  <url>
    <loc>${baseUrl}${url.loc}</loc>
    <priority>${url.priority}</priority>
    <changefreq>${url.changefreq}</changefreq>${url.lastmod ? `
    <lastmod>${url.lastmod}</lastmod>` : ''}
  </url>`).join('\n')}
</urlset>`;
      
      res.set('Content-Type', 'application/xml');
      res.send(xml);
    } catch (error) {
      console.error('Error generating sitemap:', error);
      res.status(500).send('Error generating sitemap');
    }
  });

  // Email auth routes
  app.post('/api/auth/register', (_req, res) => {
    res.status(403).json({ message: "Регистрация доступна только по ссылке-приглашению" });
  });
  app.post('/api/auth/login', login);
  app.post('/api/auth/forgot-password', requestPasswordReset);
  app.post('/api/auth/reset-password', resetPassword);
  app.post('/api/auth/change-password', isAuthenticated, changePassword);
  app.get('/api/auth/email-user', getEmailUser);
  app.post('/api/auth/logout', logoutEmail);

  // Auth routes (email auth only)
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      const session = req.session as any;
      
      if (session?.userId && session?.authType === 'email') {
        const user = await storage.getUser(session.userId);
        if (user) {
          return res.json(toAuthUserResponse(user));
        }
      }
      
      return res.status(401).json({ message: "Unauthorized" });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/push/vapid-public-key", (_req, res) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      return res.status(503).json({ message: "Push notifications are not configured" });
    }
    res.json({ publicKey });
  });

  app.post("/api/push/subscribe", isAuthenticated, async (req: any, res) => {
    try {
      if (!isPushConfigured()) {
        return res.status(503).json({ message: "Push notifications are not configured" });
      }
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
      const p256dh = typeof req.body?.keys?.p256dh === "string" ? req.body.keys.p256dh : "";
      const auth = typeof req.body?.keys?.auth === "string" ? req.body.keys.auth : "";
      if (!endpoint || !p256dh || !auth) {
        return res.status(400).json({ message: "Invalid subscription" });
      }

      await storage.upsertPushSubscription(userId, { endpoint, p256dh, auth });
      res.status(201).json({ ok: true });
    } catch (error) {
      console.error("Error saving push subscription:", error);
      res.status(500).json({ message: "Failed to save subscription" });
    }
  });

  app.delete("/api/push/subscribe", isAuthenticated, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
      if (!endpoint) return res.status(400).json({ message: "endpoint required" });
      await storage.deletePushSubscription(userId, endpoint);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error deleting push subscription:", error);
      res.status(500).json({ message: "Failed to delete subscription" });
    }
  });

  app.get('/api/invites/profile-summary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const inviter = await storage.getInviterOfUser(userId);
      const acceptedInvites = await storage.getAcceptedInvitesCountsByUser(userId);

      res.json({
        inviter: inviter
          ? {
              id: inviter.id,
              email: inviter.email,
              firstName: inviter.firstName,
              lastName: inviter.lastName,
            }
          : null,
        acceptedInvites,
      });
    } catch (error) {
      console.error("Error fetching invite profile summary:", error);
      res.status(500).json({ message: "Failed to fetch invite summary" });
    }
  });

  app.post('/api/invites', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const emailRaw = String(req.body?.email || "").trim().toLowerCase();
      const email = emailRaw || null;
      const inviteTypeRaw = String(req.body?.inviteType || "patient").trim().toLowerCase();
      const inviteType = inviteTypeRaw === "homeopath" ? "homeopath" : "patient";
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return res.status(400).json({ message: "Invalid email" });
        if (inviteType === "homeopath") {
          const existingUser = await storage.getUserByEmail(email);
          if (existingUser) return res.status(409).json({ message: "user_exists" });
        }
      }

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await storage.createInvite({
        email,
        inviteType,
        status: "pending",
        tokenHash,
        invitedByUserId: userId,
        expiresAt,
      });

      const inviter = await storage.getUser(userId);
      const doctorName =
        [inviter?.firstName, inviter?.lastName].filter(Boolean).join(" ") ||
        inviter?.email ||
        "Ваш гомеопат";
      const baseUrl = process.env.APP_URL || BASE_URL;
      const inviteUrl = `${baseUrl}/invite/accept?token=${token}`;
      if (email) {
        const inviteUrlWithEmail = `${inviteUrl}&email=${encodeURIComponent(email)}`;
        await sendInviteEmail(email, inviteUrlWithEmail, inviteType, doctorName, inviter?.email);
      }

      res.json({ success: true, email, inviteType, expiresAt, inviteUrl });
    } catch (error) {
      console.error("Error creating invite:", error);
      res.status(500).json({ message: "Failed to create invite" });
    }
  });

  app.get('/api/invites/preview', async (req: any, res) => {
    try {
      const token = String(req.query?.token || "").trim();
      if (!token) return res.status(400).json({ message: "token_required" });

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const invite = await storage.getInviteByTokenHash(tokenHash);
      if (!invite) return res.status(404).json({ message: "invalid_invite" });

      const inviter = await storage.getUser(invite.invitedByUserId);
      const inviterName =
        [inviter?.firstName, inviter?.lastName].filter(Boolean).join(" ").trim() ||
        inviter?.email ||
        "Ваш гомеопат";

      res.json({
        inviteType: invite.inviteType,
        inviter: {
          id: inviter?.id ?? null,
          name: inviterName,
          email: inviter?.email ?? null,
        },
      });
    } catch (error) {
      console.error("Error fetching invite preview:", error);
      res.status(500).json({ message: "Failed to fetch invite preview" });
    }
  });

  app.post('/api/invites/accept', async (req: any, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const token = String(req.body?.token || "").trim();
      const firstName = String(req.body?.firstName || "").trim();
      const lastName = String(req.body?.lastName || "").trim();
      if (!email || !token) return res.status(400).json({ message: "Email and token are required" });

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const invite = await storage.getInviteByTokenHash(tokenHash);
      if (!invite) {
        return res.status(400).json({ message: "invalid_invite" });
      }
      if (invite.email && invite.email !== email) {
        return res.status(400).json({ message: "invalid_invite_email" });
      }
      if (invite.status !== "pending") {
        return res.status(400).json({ message: "invite_inactive" });
      }
      if (new Date(invite.expiresAt).getTime() <= Date.now()) {
        await storage.markInviteExpired(invite.id);
        return res.status(400).json({ message: "invite_expired" });
      }

      const existingUser = await storage.getUserByEmail(email);
      const sessionUserId = await getCurrentUserId(req);
      const sessionUser = sessionUserId ? await storage.getUser(sessionUserId) : null;
      const canJoinAsExistingUser =
        !!existingUser &&
        !!sessionUser &&
        sessionUser.email?.toLowerCase() === email &&
        sessionUser.id === existingUser.id;
      if (existingUser && !canJoinAsExistingUser) {
        return res.status(409).json({ message: "user_exists" });
      }

      const generatePassword = () => {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        let pass = "";
        for (let i = 0; i < 10; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
        return pass;
      };

      let password: string | null = null;
      let targetUser = existingUser ?? null;
      if (!targetUser) {
        password = generatePassword();
        const bcrypt = await import("bcryptjs");
        const passwordHash = await bcrypt.hash(password, 10);
        targetUser = await storage.createUserWithPassword(email, passwordHash);
      }
      if (!targetUser) {
        return res.status(500).json({ message: "Failed to create or resolve user" });
      }

      let conversationId: string | undefined;
      if (invite.inviteType === "homeopath") {
        await storage.updateUserProfile(targetUser.id, { isAdmin: true });
        await storage.ensureDefaultQuestionnaireTemplate(targetUser.id);
      } else {
        if (!firstName || !lastName) {
          return res.status(400).json({ message: "first_name_and_last_name_required" });
        }
        const chatName = `${lastName} ${firstName}`.trim();
        if (!canJoinAsExistingUser) {
          await storage.updateUserProfile(targetUser.id, { firstName, lastName });
        }
        const conv = await storage.createConversation({
          type: "patient",
          name: chatName,
          patientUserId: targetUser.id,
        });
        await storage.addConversationParticipant(conv.id, invite.invitedByUserId, "owner");
        await storage.addConversationParticipant(conv.id, targetUser.id, "member");
        conversationId = conv.id;
        await publishDoctorChatsUpdated(invite.invitedByUserId);
      }

      await storage.markInviteAccepted(invite.id, targetUser.id, email, conversationId);
      if (password) {
        await sendInviteAccessEmail(email, password);
      }

      (req.session as any).userId = targetUser.id;
      (req.session as any).authType = "email";

      res.json({
        id: targetUser.id,
        email: targetUser.email,
        isAdmin: invite.inviteType === "homeopath" ? true : targetUser.isAdmin,
        joinedAsExistingUser: canJoinAsExistingUser,
        conversationId: conversationId ?? null,
      });
    } catch (error) {
      console.error("Error accepting invite:", error);
      res.status(500).json({ message: "Failed to accept invite" });
    }
  });

  // Tag routes (public - for browsing and searching)
  app.get('/api/tags', async (req, res) => {
    try {
      const { category } = req.query;
      
      // Validate category if provided
      if (category) {
        const parsed = tagCategoryEnum.safeParse(category);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid category. Must be 'remedy' or 'situation'" });
        }
        const tagsList = await storage.getTagsByCategory(parsed.data);
        return res.json(tagsList);
      }
      
      const tagsList = await storage.getAllTags();
      res.json(tagsList);
    } catch (error) {
      console.error("Error fetching tags:", error);
      res.status(500).json({ message: "Failed to fetch tags" });
    }
  });

  app.get('/api/tags/search/:query', async (req, res) => {
    try {
      const { query } = req.params;
      const results = await storage.searchTags(query);
      res.json(results);
    } catch (error) {
      console.error("Error searching tags:", error);
      res.status(500).json({ message: "Failed to search tags" });
    }
  });

  // Payment routes
  app.post('/api/payment/create', isAuthenticated, async (req: any, res) => {
    try {
      const robokassaModule = await getRobokassaModule();
      if (!robokassaModule.robokassa) {
        return res.status(503).json({ message: "Payment system not configured" });
      }

      const user = req.dbUser;
      const userId = user.id;
      const userEmail = user.email;
      const { subscriptionType } = req.body; // 'initial' or 'renewal'

      if (!subscriptionType || !['initial', 'renewal'].includes(subscriptionType)) {
        return res.status(400).json({ message: "Invalid subscription type" });
      }

      // Check subscription status
      const hasActiveSubscription = user?.subscriptionExpiresAt 
        ? new Date(user.subscriptionExpiresAt) > new Date()
        : false;

      // Pricing: Initial = 2000₽, Renewal with active subscription = 1000₽ (50% discount), Renewal after expiry = 2000₽
      // Admins get 100x discount for testing
      const adminDiscount = user.isAdmin ? 100 : 1;
      let amount: number;
      let description: string;
      
      if (subscriptionType === 'initial') {
        amount = 2000 / adminDiscount;
        description = 'Подписка hovial на 6 месяцев';
      } else {
        // Renewal: 50% discount if subscription is still active
        amount = (hasActiveSubscription ? 1000 : 2000) / adminDiscount;
        description = hasActiveSubscription 
          ? 'Продление подписки hovial на 6 месяцев (скидка 50%)'
          : 'Продление подписки hovial на 6 месяцев';
      }

      // Generate unique invoice ID (timestamp + random) as string
      const invoiceId = (Date.now() + Math.floor(Math.random() * 1000)).toString();

      // Create payment record
      const payment = await storage.createPayment({
        userId,
        amount: amount.toString(),
        invoiceId: invoiceId,
        description,
        status: 'pending',
        robokassaData: null,
      });

      // Generate payment URL with user email
      const paymentUrl = robokassaModule.generatePaymentUrl({
        amount,
        description,
        invoiceId,
        userId,
        userEmail,
        subscriptionType,
      });

      res.json({ paymentUrl, invoiceId: payment.invoiceId });
    } catch (error) {
      console.error("Error creating payment:", error);
      res.status(500).json({ message: "Failed to create payment" });
    }
  });

  // Robokassa Result URL callback (no auth required - called by Robokassa)
  app.post('/payment/result', async (req, res) => {
    console.log('🔔 Robokassa Result URL called:', {
      method: req.method,
      body: req.body,
      query: req.query,
    });

    try {
      const robokassaModule = await getRobokassaModule();
      if (!robokassaModule.robokassa) {
        console.error('Robokassa not configured but received callback');
        return res.status(503).send('Payment system not configured');
      }

      // Validate signature
      const isValid = robokassaModule.checkPayment(req.body);
      
      if (!isValid) {
        console.error('❌ Invalid Robokassa signature:', req.body);
        return res.status(400).send('Invalid signature');
      }
      
      console.log('✅ Valid Robokassa signature');

      const { InvId, OutSum, shp_user_id, shp_subscription_type } = req.body;

      console.log('📦 Processing payment:', {
        InvId,
        OutSum,
        shp_user_id,
        shp_subscription_type,
      });

      // Filter out null values from Robokassa data to avoid Drizzle ORM errors
      const robokassaData = Object.fromEntries(
        Object.entries(req.body).filter(([_, value]) => value !== null)
      );

      // Update payment status
      await storage.updatePaymentStatus(
        InvId.toString(),
        'completed',
        robokassaData
      );
      console.log('✅ Payment status updated');

      // Extend user subscription
      const user = await storage.getUser(shp_user_id);
      if (user) {
        const currentExpiry = user.subscriptionExpiresAt 
          ? new Date(user.subscriptionExpiresAt)
          : new Date();
        
        // If subscription already expired, start from now
        const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
        
        // Add 6 months
        const newExpiry = new Date(baseDate);
        newExpiry.setMonth(newExpiry.getMonth() + 6);

        await storage.updateUserSubscription(shp_user_id, newExpiry);
        
        console.log(`✅ Payment successful: User ${shp_user_id}, Amount ${OutSum}, Invoice ${InvId}, New expiry: ${newExpiry}`);
      } else {
        console.error(`❌ User not found: ${shp_user_id}`);
      }

      // Must respond with OK + invoice ID
      console.log(`Responding: OK${InvId}`);
      res.send(`OK${InvId}`);
    } catch (error) {
      console.error('Payment processing error:', error);
      res.status(500).send('Error processing payment');
    }
  });

  // User profile update route
  app.get('/api/users/:id/profile', isAuthenticated, async (req: any, res) => {
    try {
      const targetUserId = req.params.id;
      if (!targetUserId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      let inviter: Awaited<ReturnType<typeof storage.getInviterOfUser>> | undefined;
      let acceptedInvites = { homeopath: 0, patient: 0 };
      try {
        inviter = await storage.getInviterOfUser(targetUserId);
        acceptedInvites = await storage.getAcceptedInvitesCountsByUser(targetUserId);
      } catch (inviteError) {
        // Do not block profile view if invite subsystem is unavailable.
        console.error("Invite summary unavailable for profile:", inviteError);
      }

      res.json({
        user: {
          id: targetUser.id,
          email: targetUser.email,
          firstName: targetUser.firstName,
          lastName: targetUser.lastName,
          profileImageUrl: targetUser.profileImageUrl,
          country: targetUser.country,
          city: targetUser.city,
          isAdmin: targetUser.isAdmin,
        },
        inviter: inviter
          ? {
              id: inviter.id,
              email: inviter.email,
              firstName: inviter.firstName,
              lastName: inviter.lastName,
            }
          : null,
        acceptedInvites,
      });
    } catch (error) {
      console.error("Error fetching public profile:", error);
      res.status(500).json({ message: "Failed to fetch user profile" });
    }
  });

  app.put('/api/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { firstName, lastName, gender, birthMonth, birthYear, height, weight, country, city, profileImageUrl, questionnaireHintsMode } = req.body;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      let profileImageUrlToSave: string | null =
        typeof profileImageUrl === "string" && profileImageUrl.trim()
          ? profileImageUrl.trim()
          : null;
      if (profileImageUrlToSave?.startsWith("https://") && profileImageUrlToSave.includes("storage.yandexcloud.net")) {
        try {
          const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
          profileImageUrlToSave = new ObjectStorageService().normalizeObjectEntityPath(profileImageUrlToSave);
        } catch (normalizeError) {
          console.error("Profile image URL normalize skipped:", normalizeError);
        }
      }
      
      const updatedUser = await storage.updateUserProfile(userId, {
        firstName: firstName || null,
        lastName: lastName || null,
        gender: gender || null,
        birthMonth: birthMonth || null,
        birthYear: birthYear || null,
        height: height || null,
        weight: weight || null,
        country: country || null,
        city: city || null,
        profileImageUrl: profileImageUrlToSave,
        ...(questionnaireHintsMode === "always" || questionnaireHintsMode === "icon"
          ? { questionnaireHintsMode }
          : {}),
      });
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Questionnaire templates (doctors only)
  app.get("/api/questionnaire-templates", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const templates = await storage.listQuestionnaireTemplates(userId);
      res.json(templates);
    } catch (error) {
      console.error("Error listing questionnaire templates:", error);
      res.status(500).json({ message: "Failed to list templates" });
    }
  });

  app.post("/api/questionnaire-templates", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const name = String(req.body?.name ?? "Новая анкета").trim();
      if (!name) return res.status(400).json({ message: "Name is required" });
      let structure = req.body?.structure
        ? questionnaireTemplateStructureSchema.parse(req.body.structure)
        : { root: [] };
      if (!validateQuestionnaireStructureDepth(structure)) {
        return res.status(400).json({ message: "Structure exceeds max depth" });
      }
      const template = await storage.createQuestionnaireTemplate({ ownerUserId: userId, name, structure });
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating questionnaire template:", error);
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  app.post("/api/questionnaire-templates/restore-default", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const template = await storage.ensureDefaultQuestionnaireTemplate(userId);
      if (!template) {
        return res.status(409).json({ message: "Default template already exists" });
      }
      res.status(201).json(template);
    } catch (error) {
      console.error("Error restoring default questionnaire template:", error);
      res.status(500).json({ message: "Failed to restore default template" });
    }
  });

  app.get("/api/questionnaire-templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const template = await storage.getQuestionnaireTemplate(req.params.id);
      if (!template) return res.status(404).json({ message: "Template not found" });
      if (template.ownerUserId !== userId && !template.isShared) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error fetching questionnaire template:", error);
      res.status(500).json({ message: "Failed to fetch template" });
    }
  });

  app.patch("/api/questionnaire-templates/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const patch: Partial<{ name: string; structure: QuestionnaireTemplateStructure; isShared: boolean }> = {};
      if (req.body?.name !== undefined) {
        const name = String(req.body.name).trim();
        if (!name) return res.status(400).json({ message: "Name cannot be empty" });
        patch.name = name;
      }
      if (req.body?.structure !== undefined) {
        const structure = questionnaireTemplateStructureSchema.parse(req.body.structure);
        if (!validateQuestionnaireStructureDepth(structure)) {
          return res.status(400).json({ message: "Structure exceeds max depth" });
        }
        patch.structure = structure;
      }
      if (req.body?.isShared !== undefined) patch.isShared = !!req.body.isShared;
      const updated = await storage.updateQuestionnaireTemplate(req.params.id, userId, patch);
      if (!updated) return res.status(404).json({ message: "Template not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating questionnaire template:", error);
      res.status(500).json({ message: "Failed to update template" });
    }
  });

  app.delete("/api/questionnaire-templates/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const deleted = await storage.deleteQuestionnaireTemplate(req.params.id, userId);
      if (!deleted) return res.status(404).json({ message: "Template not found" });
      res.json({ ok: true });
    } catch (error) {
      console.error("Error deleting questionnaire template:", error);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  app.post("/api/questionnaire-templates/:id/duplicate", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const copy = await storage.duplicateQuestionnaireTemplate(req.params.id, userId);
      if (!copy) return res.status(404).json({ message: "Template not found" });
      res.status(201).json(copy);
    } catch (error) {
      console.error("Error duplicating questionnaire template:", error);
      res.status(500).json({ message: "Failed to duplicate template" });
    }
  });

  app.post("/api/questionnaire-templates/:id/copy", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const name = req.body?.name ? String(req.body.name).trim() : undefined;
      const copy = await storage.copySharedQuestionnaireTemplate(req.params.id, userId, name);
      if (!copy) return res.status(404).json({ message: "Template not found or not shared" });
      res.status(201).json(copy);
    } catch (error) {
      console.error("Error copying questionnaire template:", error);
      res.status(500).json({ message: "Failed to copy template" });
    }
  });

  app.get("/api/users/:userId/questionnaire-templates", async (req: any, res) => {
    try {
      const templates = await storage.listSharedQuestionnaireTemplatesByUser(req.params.userId);
      res.json(
        templates.map((t) => ({
          id: t.id,
          name: t.name,
          copyCount: t.copyCount,
          patientSendCount: t.patientSendCount,
          updatedAt: t.updatedAt,
        }))
      );
    } catch (error) {
      console.error("Error listing shared questionnaire templates:", error);
      res.status(500).json({ message: "Failed to list shared templates" });
    }
  });

  app.get("/api/questionnaire-instances/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const instance = await storage.getQuestionnaireInstance(req.params.id);
      if (!instance) return res.status(404).json({ message: "Instance not found" });
      if (!(await storage.canAccessQuestionnaireInstance(instance, userId))) {
        return res.status(403).json({ message: "Access denied" });
      }
      const template = await storage.getQuestionnaireTemplate(instance.templateId);
      res.json({
        ...instance,
        templateName: template?.name ?? "",
      });
    } catch (error) {
      console.error("Error fetching questionnaire instance:", error);
      res.status(500).json({ message: "Failed to fetch instance" });
    }
  });

  app.patch("/api/questionnaire-instances/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const currentUser = await storage.getUser(userId);
      const instance = await storage.getQuestionnaireInstance(req.params.id);
      if (!instance) return res.status(404).json({ message: "Instance not found" });
      if (!(await storage.canAccessQuestionnaireInstance(instance, userId))) {
        return res.status(403).json({ message: "Access denied" });
      }
      const parsed = questionnaireInstanceDataSchema.parse(req.body?.data ?? req.body);
      const toSave = currentUser?.isAdmin
        ? parsed
        : { ...parsed, homeopathNotes: undefined };
      const updated = await storage.updateQuestionnaireInstanceData(instance.id, toSave);
      res.json(updated);
    } catch (error) {
      console.error("Error updating questionnaire instance:", error);
      if (error instanceof Error && error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid instance data" });
      }
      res.status(500).json({ message: "Failed to update instance" });
    }
  });

  // Check if user exists by email (for doctor access sharing)
  app.get('/api/users/check-email', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const email = req.query.email as string;
      if (!email) {
        return res.status(400).json({ exists: false, message: "Email is required" });
      }
      
      const user = await storage.getUserByEmail(email);
      res.json({ exists: !!user });
    } catch (error) {
      console.error("Error checking user email:", error);
      res.status(500).json({ exists: false, message: "Failed to check email" });
    }
  });


  // Get patients for this doctor (legacy admin list — one row per patient chat)
  app.get('/api/my-patients', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const doctorUserId = await getCurrentUserId(req);
      if (!doctorUserId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const patientChats = await storage.getPatientConversationsForUser(doctorUserId);
      const result = await Promise.all(
        patientChats.map(async (chat) => {
          const patientId = chat.patientUserId;
          const patient = patientId ? await storage.getUser(patientId) : undefined;
          return {
            id: chat.conversationId,
            userId: patientId,
            conversationId: chat.conversationId,
            patientName: chat.name ?? patient?.email ?? "",
            birthMonth: patient?.birthMonth,
            birthYear: patient?.birthYear,
            gender: patient?.gender,
            email: patient?.email,
            profileImageUrl: chat.avatarUrl ?? patient?.profileImageUrl ?? null,
            updatedAt: chat.lastMessageAt ?? null,
            unreadCount: chat.unreadCount,
            lastMessageAt: chat.lastMessageAt,
          };
        })
      );

      result.sort((a, b) => {
        if (!a.lastMessageAt && !b.lastMessageAt) return 0;
        if (!a.lastMessageAt) return 1;
        if (!b.lastMessageAt) return -1;
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching my patients:", error);
      res.status(500).json({ message: "Failed to fetch patients" });
    }
  });

  // --- Messenger: paginated chat list ---
  app.get("/api/me/chats", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

      const folder = typeof req.query.folder === "string" ? req.query.folder : "personal";
      const parsedLimit = Number(req.query.limit);
      const parsedOffset = Number(req.query.offset);
      const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 20;
      const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

      const paged = <T,>(items: T[]) => {
        const rows = items.slice(offset, offset + limit);
        const nextOffset = offset + rows.length;
        return {
          items: rows,
          hasMore: nextOffset < items.length,
          nextOffset: nextOffset < items.length ? nextOffset : null,
          total: items.length,
        };
      };

      if (folder === "personal") {
        if (!currentUser.isAdmin) {
          const patientChats = await storage.getPatientConversationsForUser(currentUserId);
          const items = patientChats.map((chat) => ({
            source: "conversation" as const,
            folder: "personal" as const,
            type: "patient" as const,
            conversationId: chat.conversationId,
            name: chat.name ?? chat.otherParticipantName ?? undefined,
            patientUserId: chat.patientUserId ?? undefined,
            otherParticipantId: chat.otherParticipantId,
            otherParticipantName: chat.otherParticipantName,
            avatarUrl: chat.avatarUrl,
            lastMessageAt: chat.lastMessageAt?.toISOString() ?? null,
            lastMessagePreview: chat.lastMessagePreview ?? null,
            unreadCount: chat.unreadCount,
          }));
          items.sort((a, b) => {
            const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            if (aTime !== bTime) return bTime - aTime;
            return (a.name ?? a.otherParticipantName ?? "").localeCompare(
              b.name ?? b.otherParticipantName ?? "",
              "ru"
            );
          });
          return res.json(paged(items));
        }

        const [contacts, patientChats] = await Promise.all([
          storage.getMessengerPersonalContacts(currentUserId),
          storage.getPatientConversationsForUser(currentUserId),
        ]);
        const doctorItems = contacts.map((contact) => {
          const otherParticipantName =
            [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || contact.email || "Doctor";
          return {
            source: "conversation" as const,
            folder: "personal" as const,
            type: "direct",
            conversationId: contact.conversationId,
            otherParticipantId: contact.userId,
            otherParticipantName,
            avatarUrl: contact.profileImageUrl ?? null,
            lastMessageAt: contact.lastMessageAt?.toISOString() ?? null,
            lastMessagePreview: contact.lastMessagePreview ?? null,
            lastVisitedAt: contact.lastVisitedAt?.toISOString() ?? null,
          };
        });
        const patientItems = patientChats.map((chat) => ({
          source: "conversation" as const,
          folder: "personal" as const,
          type: "patient" as const,
          conversationId: chat.conversationId,
          name: chat.name ?? undefined,
          patientUserId: chat.patientUserId ?? undefined,
          patientName: chat.name ?? undefined,
          avatarUrl: chat.avatarUrl,
          lastMessageAt: chat.lastMessageAt?.toISOString() ?? null,
          lastMessagePreview: chat.lastMessagePreview ?? null,
          unreadCount: chat.unreadCount,
        }));
        const items = [...patientItems, ...doctorItems];
        items.sort((a, b) => {
          const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          if (aTime !== bTime) return bTime - aTime;
          if (a.type !== b.type) return a.type === "patient" ? -1 : 1;
          const aName =
            a.type === "patient"
              ? ("name" in a ? a.name : "") ?? ""
              : ("otherParticipantName" in a ? a.otherParticipantName : "") ?? "";
          const bName =
            b.type === "patient"
              ? ("name" in b ? b.name : "") ?? ""
              : ("otherParticipantName" in b ? b.otherParticipantName : "") ?? "";
          return aName.localeCompare(bName, "ru");
        });
        return res.json(paged(items));
      }

      if (!currentUser.isAdmin) {
        return res.json(paged([]));
      }

      if (folder === "channels") {
        const channels = await storage.getMessengerChannels(currentUserId);
        const items = channels.map((channel) => ({
          source: "conversation" as const,
          folder: "channels" as const,
          conversationId: channel.id,
          type: "channel",
          name: channel.name ?? undefined,
          avatarUrl: channel.avatarUrl ?? null,
          participantCount: channel.participantCount,
          myRole: channel.myRole,
          isMember: channel.isMember,
          lastMessageAt: channel.lastPostAt?.toISOString() ?? null,
          lastMessagePreview: channel.lastMessagePreview ?? null,
        }));
        return res.json(paged(items));
      }

      const convList = await storage.getConversationsForUser(currentUserId);
      const groups = convList
        .filter((conv) => conv.type === "group" || conv.type === "consilium")
        .map((conv) => {
          const myRole = conv.participants.find((p) => p.userId === currentUserId)?.role ?? "member";
          const lm = conv.lastMessageAt;
          return {
            source: "conversation" as const,
            folder: "groups" as const,
            conversationId: conv.id,
            type: conv.type,
            name: conv.name ?? undefined,
            avatarUrl: conv.avatarUrl ?? null,
            participantCount: conv.participants.length,
            patientUserId: conv.patientUserId ?? undefined,
            myRole,
            lastMessageAt: lm instanceof Date ? lm.toISOString() : lm ?? null,
            lastMessagePreview: conv.lastMessagePreview ?? null,
          };
        });
      groups.sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });
      return res.json(paged(groups));
    } catch (error) {
      console.error("Error fetching /api/me/chats:", error);
      res.status(500).json({ message: "Failed to fetch chats" });
    }
  });

  // Get or create direct conversation with another user (by their userId). Prevents duplicate direct chats.
  app.get("/api/messenger/direct/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const { userId: partnerUserId } = req.params;
      if (partnerUserId === currentUserId) return res.status(400).json({ message: "Cannot open direct chat with yourself" });
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });
      const partner = await storage.getUser(partnerUserId);
      if (!partner) return res.status(404).json({ message: "User not found" });
      if (!currentUser.isAdmin || !partner.isAdmin) {
        return res.status(404).json({ message: "User not found" });
      }
      let conversationId = await storage.getDirectConversationBetween(currentUserId, partnerUserId);
      if (!conversationId) {
        const conv = await storage.createConversation({ type: "direct", name: null, patientUserId: null });
        await storage.addConversationParticipant(conv.id, currentUserId, "owner");
        await storage.addConversationParticipant(conv.id, partnerUserId, "member");
        conversationId = conv.id;
      }
      res.json({ conversationId });
    } catch (error) {
      console.error("Error get-or-create direct conversation:", error);
      res.status(500).json({ message: "Failed to get conversation" });
    }
  });

  // Messenger search: doctors, groups (no consilium), channels
  app.get("/api/messenger/search", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

      const adminUsers = await storage.getAdminUsers(currentUserId, q || undefined);
      const doctors = await Promise.all(
        adminUsers.map(async (u) => {
          const conversationId = await storage.getDirectConversationBetween(currentUserId, u.id);
          return {
            userId: u.id,
            firstName: u.firstName ?? undefined,
            lastName: u.lastName ?? undefined,
            email: u.email ?? undefined,
            conversationId: conversationId ?? undefined,
          };
        })
      );

      const groups = await storage.getDiscoverableConversations(currentUserId, {
        type: "group",
        nameFilter: q || undefined,
      });
      const channels = await storage.getDiscoverableConversations(currentUserId, {
        type: "channel",
        nameFilter: q || undefined,
      });

      res.json({
        doctors,
        groups: groups.map((g) => ({ id: g.id, name: g.name, avatarUrl: g.avatarUrl ?? null, participantCount: g.participantCount, isMember: g.isMember })),
        channels: channels.map((c) => ({ id: c.id, name: c.name, avatarUrl: c.avatarUrl ?? null, isMember: c.isMember })),
      });
    } catch (error) {
      console.error("Error fetching /api/messenger/search:", error);
      res.status(500).json({ message: "Failed to search" });
    }
  });

  // Join group (self-join disabled; owner adds members)
  app.post("/api/conversations/:id/join", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      if (conv.type !== "group") return res.status(400).json({ message: "Not a group" });
      return res.status(403).json({ message: "only_owner_can_add_members" });
    } catch (error) {
      console.error("Error joining conversation:", error);
      res.status(500).json({ message: "Failed to join" });
    }
  });

  // Create conversation (direct, group, consilium, channel)
  app.post("/api/conversations", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const body = req.body as { type: string; name?: string; participantUserIds?: string[]; patientUserId?: string };
      const validated = insertConversationSchema.parse({
        type: body.type,
        name: body.name ?? null,
        patientUserId: body.patientUserId ?? null,
      });
      const conv = await storage.createConversation(validated);
      await storage.addConversationParticipant(conv.id, currentUserId, "owner");
      const participantIds = body.participantUserIds ?? [];
      for (const uid of participantIds) {
        if (uid !== currentUserId) {
          try {
            await storage.addConversationParticipant(conv.id, uid, "member");
          } catch {
            // ignore duplicate
          }
        }
      }
      const participants = await storage.getConversationParticipants(conv.id);
      res.status(201).json({ ...conv, participants });
    } catch (error) {
      console.error("Error creating conversation:", error);
      if (error instanceof Error && error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid input" });
      }
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  // Get conversation by id
  app.get("/api/conversations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      const canReadConversation = inConv || conv.type === "channel";
      if (!canReadConversation) return res.status(403).json({ message: "Access denied" });
      if (inConv) {
        await notifyConversationSeen(id, currentUserId);
      }
      const participants = await storage.getConversationParticipants(id);
      res.json({ ...conv, participants });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  // Patient chat settings (name/avatar) — editable by doctor and patient participants
  app.patch("/api/conversations/:id/patient-settings", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      if (conv.type !== "patient") {
        return res.status(400).json({ message: "settings_available_only_for_patient_chat" });
      }
      const body = req.body as { name?: string; avatarUrl?: string | null };
      const trimmedName = typeof body.name === "string" ? body.name.trim() : "";
      if (!trimmedName && body.name != null) {
        return res.status(400).json({ message: "name_required" });
      }
      await storage.updateConversation(id, {
        ...(body.name != null ? { name: trimmedName } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      });
      const updatedConv = await storage.getConversation(id);
      const participants = await storage.getConversationParticipants(id);
      const owner = participants.find((p) => p.role === "owner");
      if (owner?.userId) {
        await publishDoctorChatsUpdated(owner.userId);
      }
      res.json({ ...updatedConv, participants });
    } catch (error) {
      console.error("Error updating patient chat settings:", error);
      res.status(500).json({ message: "Failed to update conversation" });
    }
  });

  // Update conversation (owner can edit group/channel name/avatar; group owner can add participants)
  app.patch("/api/conversations/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const role = await storage.getParticipantRole(id, currentUserId);
      if (role !== "owner" && role !== "admin") return res.status(403).json({ message: "Only owner or admin can update" });
      const body = req.body as { name?: string; avatarUrl?: string | null; addParticipantIds?: string[] };
      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      if (body.name != null || body.avatarUrl !== undefined) {
        if (role !== "owner") return res.status(403).json({ message: "only_owner_can_edit_conversation" });
        if (conv.type !== "group" && conv.type !== "channel") {
          return res.status(400).json({ message: "settings_available_only_for_group_or_channel" });
        }
        await storage.updateConversation(id, {
          name: body.name ?? conv.name ?? undefined,
          avatarUrl: body.avatarUrl === undefined ? conv.avatarUrl ?? null : body.avatarUrl,
        });
      }
      if (Array.isArray(body.addParticipantIds)) {
        if (role !== "owner") return res.status(403).json({ message: "only_owner_can_add_members" });
        if (conv.type !== "group") return res.status(400).json({ message: "members_can_be_added_only_to_groups" });
        for (const uid of body.addParticipantIds) {
          if (!uid || uid === currentUserId) continue;
          try {
            await storage.addConversationParticipant(id, uid, "member");
          } catch {
            // ignore duplicate
          }
        }
      }
      const updatedConv = await storage.getConversation(id);
      const participants = await storage.getConversationParticipants(id);
      res.json({ ...updatedConv, participants });
    } catch (error) {
      console.error("Error updating conversation:", error);
      res.status(500).json({ message: "Failed to update conversation" });
    }
  });

  // Remove participant from group (owner only; owner cannot remove self)
  app.delete("/api/conversations/:id/participants/:userId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id, userId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      if (conv.type !== "group") return res.status(400).json({ message: "participants_can_be_removed_only_from_groups" });
      const role = await storage.getParticipantRole(id, currentUserId);
      if (role !== "owner") return res.status(403).json({ message: "only_owner_can_remove_members" });
      if (userId === currentUserId) return res.status(400).json({ message: "owner_cannot_remove_self" });
      await storage.removeConversationParticipant(id, userId);
      const updatedConv = await storage.getConversation(id);
      const participants = await storage.getConversationParticipants(id);
      res.json({ ...updatedConv, participants });
    } catch (error) {
      console.error("Error removing participant:", error);
      res.status(500).json({ message: "Failed to remove participant" });
    }
  });

  // Leave conversation
  app.post("/api/conversations/:id/leave", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      await storage.removeConversationParticipant(id, currentUserId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error leaving conversation:", error);
      res.status(500).json({ message: "Failed to leave" });
    }
  });

  // Subscribe to channel (join as member)
  app.post("/api/conversations/:id/subscribe", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const conv = await storage.getConversation(id);
      if (!conv || conv.type !== "channel") return res.status(404).json({ message: "Not a channel" });
      await storage.addConversationParticipant(id, currentUserId, "member");
      res.json({ success: true });
    } catch (error) {
      console.error("Error subscribing to channel:", error);
      res.status(500).json({ message: "Failed to subscribe" });
    }
  });

  // Unsubscribe from channel
  app.delete("/api/conversations/:id/subscribe", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      await storage.removeConversationParticipant(id, currentUserId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error unsubscribing:", error);
      res.status(500).json({ message: "Failed to unsubscribe" });
    }
  });

  // Conversation message helpers
  const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;
  const RECENT_MESSAGES_LIMIT = 100;

  function userToConvAuthor(u: User | undefined | null): ConversationMessageAuthor {
    return {
      id: u?.id ?? "",
      email: u?.email ?? null,
      firstName: u?.firstName ?? null,
      lastName: u?.lastName ?? null,
      isAdmin: u?.isAdmin ?? null,
    };
  }

  async function mergeConversationPollResults(
    messages: ConversationMessageWithAuthor[],
    currentUserId: string
  ): Promise<ConversationMessageWithAuthor[]> {
    const pollEntries: Array<{ messageId: string; optionCount: number }> = [];
    for (const m of messages) {
      if (m.messageType !== "poll" || !m.content) continue;
      try {
        const p = pollPayloadSchema.parse(JSON.parse(m.content));
        pollEntries.push({ messageId: m.id, optionCount: p.options.length });
      } catch {
        continue;
      }
    }
    if (pollEntries.length === 0) return messages;
    const states = await storage.getConversationPollStates(pollEntries, currentUserId);
    return messages.map((m) => {
      const st = states.get(m.id);
      if (!st || m.messageType !== "poll") return m;
      return { ...m, pollResults: st };
    });
  }

  async function enrichConversationMessages(
    messages: ConversationMessage[],
    currentUserId: string
  ): Promise<ConversationMessageWithAuthor[]> {
    const userIds = new Set<string>();
    messages.forEach((m) => {
      userIds.add(m.authorUserId);
      if (m.forwardedFromUserId) userIds.add(m.forwardedFromUserId);
      if (m.pinnedByUserId) userIds.add(m.pinnedByUserId);
    });
    const replyIds = Array.from(
      new Set(
        messages
          .map((m) => m.replyToMessageId)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    );
    const replyTargets =
      replyIds.length > 0
        ? await Promise.all(replyIds.map((rid) => storage.getConversationMessageById(rid)))
        : [];
    const replyMap = new Map<string, ConversationMessage>();
    replyTargets.forEach((rm) => {
      if (rm) {
        replyMap.set(rm.id, rm);
        userIds.add(rm.authorUserId);
      }
    });
    const userIdsArr = Array.from(userIds);
    const users = userIdsArr.length
      ? await Promise.all(userIdsArr.map((uid) => storage.getUser(uid)))
      : [];
    const userMap = new Map<string, User>();
    users.forEach((u) => {
      if (u) userMap.set(u.id, u);
    });
    const reactionMap = await storage.getConversationMessageReactionSummaries(
      messages.map((m) => m.id),
      currentUserId
    );
    const commentCountMap = await storage.getConversationMessageCommentCounts(messages.map((m) => m.id));
    const base = messages.map((m) => {
      const replyTarget = m.replyToMessageId ? replyMap.get(m.replyToMessageId) : null;
      const replyAuthor = replyTarget ? userMap.get(replyTarget.authorUserId) : null;
      return {
        id: m.id,
        conversationId: m.conversationId,
        authorUserId: m.authorUserId,
        messageType: m.messageType,
        content: m.content ?? null,
        imageUrl: m.imageUrl ?? null,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
        editedAt: m.editedAt ? (m.editedAt instanceof Date ? m.editedAt.toISOString() : String(m.editedAt)) : null,
        deletedAt: m.deletedAt ? (m.deletedAt instanceof Date ? m.deletedAt.toISOString() : String(m.deletedAt)) : null,
        pinnedAt: m.pinnedAt ? (m.pinnedAt instanceof Date ? m.pinnedAt.toISOString() : String(m.pinnedAt)) : null,
        pinnedByUserId: m.pinnedByUserId ?? null,
        replyToMessageId: m.replyToMessageId ?? null,
        forwardedFromMessageId: m.forwardedFromMessageId ?? null,
        forwardedFromUserId: m.forwardedFromUserId ?? null,
        replyTo: replyTarget
          ? {
              id: replyTarget.id,
              authorUserId: replyTarget.authorUserId,
              content: replyTarget.content ?? null,
              imageUrl: replyTarget.imageUrl ?? null,
              deletedAt: replyTarget.deletedAt
                ? replyTarget.deletedAt instanceof Date
                  ? replyTarget.deletedAt.toISOString()
                  : String(replyTarget.deletedAt)
                : null,
              author: userToConvAuthor(replyAuthor ?? null),
            }
          : null,
        forwardedFromAuthor: m.forwardedFromUserId
          ? userToConvAuthor(userMap.get(m.forwardedFromUserId) ?? null)
          : null,
        reactions: reactionMap.get(m.id) ?? [],
        commentsCount: commentCountMap.get(m.id) ?? 0,
        author: userToConvAuthor(userMap.get(m.authorUserId) ?? null),
      };
    });
    return mergeConversationPollResults(base, currentUserId);
  }

  async function syncConversationRecentCache(
    conversationId: string,
    currentUserId: string
  ): Promise<void> {
    const messages = await storage.getConversationMessagesRecent(conversationId, RECENT_MESSAGES_LIMIT);
    const enriched = await enrichConversationMessages(messages, currentUserId);
    await backfillConversationRecent(conversationId, enriched);
  }

  app.post("/api/conversations/:id/seen", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      await notifyConversationSeen(id, currentUserId);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error marking conversation seen:", error);
      res.status(500).json({ message: "Failed to mark seen" });
    }
  });

  // Get conversation messages (Postgres; Redis write-through cache)
  app.get("/api/conversations/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      const canReadMessages = inConv || conv.type === "channel";
      if (!canReadMessages) return res.status(403).json({ message: "Access denied" });
      if (inConv) {
        await notifyConversationSeen(id, currentUserId);
      }
      const messages = await storage.getConversationMessagesRecent(id, RECENT_MESSAGES_LIMIT);
      const withAuthors = await enrichConversationMessages(messages, currentUserId);
      res.json(withAuthors);
      backfillConversationRecent(id, withAuthors).catch((err) => console.error("Redis backfill conv:", err));
    } catch (error) {
      console.error("Error fetching conversation messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Post conversation message (supports reply + forward)
  app.post("/api/conversations/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      if (conv.type === "channel") {
        const role = await storage.getParticipantRole(id, currentUserId);
        const canPostToChannel = role === "owner" || role === "admin";
        if (!canPostToChannel) {
          return res.status(403).json({ message: "only_owner_or_admin_can_post_to_channel" });
        }
      }
      const currentUser = await storage.getUser(currentUserId);
      const body = req.body as {
        content?: string;
        imageUrl?: string;
        messageType?: string;
        templateId?: string;
        replyToMessageId?: string;
        poll?: unknown;
        forwardSource?: { conversationId?: string; patientUserId?: string; messageId: string };
      };

      let content: string | null = body.content ?? null;
      let imageUrl: string | null = body.imageUrl ?? null;
      let messageType: string = body.messageType ?? "message";
      let forwardedFromMessageId: string | null = null;
      let forwardedFromUserId: string | null = null;
      const resolveForwardedAuthorId = async (params: {
        directForwardedFromUserId?: string | null;
        directForwardedFromMessageId?: string | null;
        fallbackAuthorUserId: string;
      }) => {
        if (params.directForwardedFromUserId) return params.directForwardedFromUserId;
        if (params.directForwardedFromMessageId) {
          const root = await storage.getConversationMessageById(params.directForwardedFromMessageId);
          if (root) return root.forwardedFromUserId ?? root.authorUserId;
        }
        return params.fallbackAuthorUserId;
      };

      if (body.forwardSource?.conversationId) {
        const sourceConversationId = String(body.forwardSource.conversationId);
        const inSource = await storage.isUserInConversation(currentUserId, sourceConversationId);
        if (!inSource) return res.status(403).json({ message: "Cannot forward from this chat" });
        const src = await storage.getConversationMessageById(body.forwardSource.messageId);
        if (!src || src.conversationId !== sourceConversationId || src.deletedAt) {
          return res.status(404).json({ message: "Source message not found" });
        }
        content = src.content ?? null;
        imageUrl = src.imageUrl ?? null;
        forwardedFromMessageId = src.id;
        forwardedFromUserId = await resolveForwardedAuthorId({
          directForwardedFromUserId: src.forwardedFromUserId,
          directForwardedFromMessageId: src.forwardedFromMessageId,
          fallbackAuthorUserId: src.authorUserId,
        });
        messageType = src.messageType;
        if (messageType === "poll" && content) {
          try {
            pollPayloadSchema.parse(JSON.parse(content));
          } catch {
            return res.status(400).json({ message: "Invalid poll data" });
          }
        }
      } else if (body.forwardSource) {
        return res.status(400).json({ message: "Invalid forward source" });
      } else {
        if (body.poll !== undefined && body.poll !== null) {
          const parsed = pollPayloadSchema.parse(body.poll);
          messageType = "poll";
          content = JSON.stringify(parsed);
          imageUrl = null;
        } else if (messageType === "poll") {
          if (!content?.trim()) {
            return res.status(400).json({ message: "Poll content required" });
          }
          const parsed = pollPayloadSchema.parse(JSON.parse(content));
          content = JSON.stringify(parsed);
          imageUrl = null;
        } else if (messageType === "questionnaire" || messageType === "questionnaire_template") {
          if (!currentUser?.isAdmin) {
            return res.status(403).json({ message: "Only doctors can send questionnaires" });
          }
          const templateId = String(body.templateId || "").trim();
          if (!templateId) {
            return res.status(400).json({ message: "templateId is required" });
          }
          const template = await storage.getQuestionnaireTemplate(templateId);
          if (!template || template.ownerUserId !== currentUserId) {
            return res.status(404).json({ message: "Template not found" });
          }
          if (messageType === "questionnaire") {
            if (conv.type !== "patient") {
              return res.status(400).json({ message: "Questionnaire instances only in patient chats" });
            }
            if (!conv.patientUserId) {
              return res.status(400).json({ message: "Patient not found in conversation" });
            }
          } else if (conv.type === "patient") {
            return res.status(400).json({ message: "Template preview not allowed in patient chats" });
          }
          imageUrl = null;
        }
      }

      if (
        (messageType === "prescription" || messageType === "followup") &&
        !currentUser?.isAdmin
      ) {
        return res.status(403).json({ message: "Only doctors can post prescriptions" });
      }
      if (conv.type === "patient" && messageType === "poll") {
        return res.status(400).json({ message: "Polls are not allowed in patient chats" });
      }

      let replyToMessageId: string | null = null;
      if (body.replyToMessageId) {
        const reply = await storage.getConversationMessageById(body.replyToMessageId);
        if (!reply || reply.conversationId !== id) {
          return res.status(400).json({ message: "Invalid reply target" });
        }
        replyToMessageId = reply.id;
      }

      if (messageType === "poll" && imageUrl) {
        return res.status(400).json({ message: "Poll cannot have image" });
      }
      if ((messageType === "questionnaire" || messageType === "questionnaire_template") && imageUrl) {
        return res.status(400).json({ message: "Questionnaire cannot have image" });
      }

      if (messageType === "questionnaire_template") {
        const template = await storage.getQuestionnaireTemplate(String(body.templateId));
        if (!template || template.ownerUserId !== currentUserId) {
          return res.status(404).json({ message: "Template not found" });
        }
        const payload = questionnaireTemplateMessageContentSchema.parse({
          templateId: template.id,
          templateName: template.name,
          snapshot: deepCloneQuestionnaireStructure(template.structure as QuestionnaireTemplateStructure),
        });
        content = JSON.stringify(payload);
      }

      const validated = insertConversationMessageSchema.parse({
        conversationId: id,
        authorUserId: currentUserId,
        messageType,
        content,
        imageUrl,
        replyToMessageId,
        forwardedFromMessageId,
        forwardedFromUserId,
      });
      const message = await storage.createConversationMessage(validated);

      let finalMessage = message;
      if (messageType === "questionnaire" && conv.patientUserId) {
        const template = await storage.getQuestionnaireTemplate(String(body.templateId));
        if (template) {
          const instance = await storage.createQuestionnaireInstance({
            templateId: template.id,
            conversationId: id,
            messageId: message.id,
            patientUserId: conv.patientUserId,
            doctorUserId: currentUserId,
            structureSnapshot: deepCloneQuestionnaireStructure(
              template.structure as QuestionnaireTemplateStructure
            ),
          });
          const payload = questionnaireMessageContentSchema.parse({
            instanceId: instance.id,
            templateName: template.name,
          });
          const updatedContent = JSON.stringify(payload);
          await storage.editConversationMessage(message.id, updatedContent);
          finalMessage = (await storage.getConversationMessageById(message.id)) ?? message;
          finalMessage.content = updatedContent;
          await storage.incrementTemplatePatientSendCount(template.id);
          const pinned = await storage.pinConversationMessage(message.id, currentUserId);
          if (pinned) {
            finalMessage = pinned;
            await publishConversationMessagePinned(id, {
              conversationId: id,
              messageId: message.id,
              pinnedAt: (pinned.pinnedAt instanceof Date ? pinned.pinnedAt : new Date()).toISOString(),
              pinnedByUserId: currentUserId,
            });
          }
        }
      }

      const [enriched] = await enrichConversationMessages([finalMessage], currentUserId);
      await pushConversationRecentMessage(id, enriched);
      await publishConversationMessage(id, enriched);
      void notifyConversationNewMessage(id, currentUserId, enriched).catch((err) =>
        console.error("[Push] conversation notify error:", err)
      );
      void notifyPatientConversationActivity(id, currentUserId).catch((err) =>
        console.error("[DoctorChats] patient conversation notify error:", err)
      );
      res.status(201).json(enriched);
    } catch (error) {
      console.error("Error posting conversation message:", error);
      if (error instanceof Error && error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid message data" });
      }
      res.status(500).json({ message: "Failed to post message" });
    }
  });

  // Edit conversation message (author only, within 48h, not deleted)
  app.patch("/api/conversations/:id/messages/:messageId", isAuthenticated, async (req: any, res) => {
    try {
      const { id, messageId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const existing = await storage.getConversationMessageById(messageId);
      if (!existing || existing.conversationId !== id) {
        return res.status(404).json({ message: "Message not found" });
      }
      if (existing.authorUserId !== currentUserId) {
        return res.status(403).json({ message: "Only author can edit" });
      }
      if (existing.messageType === "poll") {
        return res.status(400).json({ message: "Cannot edit poll" });
      }
      if (existing.deletedAt) return res.status(400).json({ message: "Message deleted" });
      const createdAt = existing.createdAt instanceof Date ? existing.createdAt.getTime() : new Date(String(existing.createdAt)).getTime();
      if (Date.now() - createdAt > EDIT_WINDOW_MS) {
        return res.status(400).json({ message: "Edit window expired" });
      }
      const content = (req.body?.content ?? "").toString().trim();
      if (!content) return res.status(400).json({ message: "Content required" });
      const updated = await storage.editConversationMessage(messageId, content);
      if (!updated) return res.status(404).json({ message: "Message not found" });
      await syncConversationRecentCache(id, currentUserId);
      await publishConversationMessageEdited(id, {
        conversationId: id,
        messageId,
        content: updated.content ?? null,
        editedAt: (updated.editedAt instanceof Date ? updated.editedAt : new Date()).toISOString(),
      });
      res.json({ ok: true });
    } catch (error) {
      console.error("Error editing conversation message:", error);
      res.status(500).json({ message: "Failed to edit message" });
    }
  });

  // Delete conversation message (author OR conversation owner). Soft delete.
  app.delete("/api/conversations/:id/messages/:messageId", isAuthenticated, async (req: any, res) => {
    try {
      const { id, messageId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const existing = await storage.getConversationMessageById(messageId);
      if (!existing || existing.conversationId !== id) {
        return res.status(404).json({ message: "Message not found" });
      }
      if (existing.deletedAt) {
        return res.json({ ok: true });
      }
      const myRole = await storage.getParticipantRole(id, currentUserId);
      const canDelete = existing.authorUserId === currentUserId || myRole === "owner";
      if (!canDelete) return res.status(403).json({ message: "Forbidden" });
      const updated = await storage.softDeleteConversationMessage(messageId);
      if (!updated) return res.status(404).json({ message: "Message not found" });
      await syncConversationRecentCache(id, currentUserId);
      await publishConversationMessageDeleted(id, {
        conversationId: id,
        messageId,
        deletedAt: (updated.deletedAt instanceof Date ? updated.deletedAt : new Date()).toISOString(),
      });
      res.json({ ok: true });
    } catch (error) {
      console.error("Error deleting conversation message:", error);
      res.status(500).json({ message: "Failed to delete message" });
    }
  });

  // Pin conversation message
  app.post("/api/conversations/:id/messages/:messageId/pin", isAuthenticated, async (req: any, res) => {
    try {
      const { id, messageId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const existing = await storage.getConversationMessageById(messageId);
      if (!existing || existing.conversationId !== id) {
        return res.status(404).json({ message: "Message not found" });
      }
      if (existing.deletedAt) return res.status(400).json({ message: "Message deleted" });
      const updated = await storage.pinConversationMessage(messageId, currentUserId);
      if (!updated) return res.status(404).json({ message: "Message not found" });
      await syncConversationRecentCache(id, currentUserId);
      await publishConversationMessagePinned(id, {
        conversationId: id,
        messageId,
        pinnedAt: (updated.pinnedAt instanceof Date ? updated.pinnedAt : new Date()).toISOString(),
        pinnedByUserId: currentUserId,
      });
      res.json({ ok: true });
    } catch (error) {
      console.error("Error pinning conversation message:", error);
      res.status(500).json({ message: "Failed to pin message" });
    }
  });

  // Unpin conversation message
  app.post("/api/conversations/:id/messages/:messageId/unpin", isAuthenticated, async (req: any, res) => {
    try {
      const { id, messageId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const existing = await storage.getConversationMessageById(messageId);
      if (!existing || existing.conversationId !== id) {
        return res.status(404).json({ message: "Message not found" });
      }
      const updated = await storage.unpinConversationMessage(messageId);
      if (!updated) return res.status(404).json({ message: "Message not found" });
      await syncConversationRecentCache(id, currentUserId);
      await publishConversationMessageUnpinned(id, {
        conversationId: id,
        messageId,
      });
      res.json({ ok: true });
    } catch (error) {
      console.error("Error unpinning conversation message:", error);
      res.status(500).json({ message: "Failed to unpin message" });
    }
  });

  app.put("/api/conversations/:id/messages/:messageId/poll-vote", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id, messageId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const existing = await storage.getConversationMessageById(messageId);
      if (!existing || existing.conversationId !== id) {
        return res.status(404).json({ message: "Message not found" });
      }
      if (existing.messageType !== "poll" || existing.deletedAt) {
        return res.status(400).json({ message: "Not a poll" });
      }
      let poll;
      try {
        poll = pollPayloadSchema.parse(JSON.parse(existing.content ?? ""));
      } catch {
        return res.status(400).json({ message: "Invalid poll data" });
      }
      const optionCount = poll.options.length;
      const raw = req.body?.selectedOptionIndices;
      if (!Array.isArray(raw)) {
        return res.status(400).json({ message: "selectedOptionIndices required" });
      }
      const indices = raw
        .map((x: unknown) => Number(x))
        .filter((n: number) => Number.isInteger(n));
      const unique = Array.from(new Set(indices))
        .filter((i) => i >= 0 && i < optionCount)
        .sort((a, b) => a - b);
      if (!poll.allowMultiple && unique.length > 1) {
        return res.status(400).json({ message: "Single choice only" });
      }
      await storage.setConversationPollVotes(messageId, currentUserId, unique, optionCount);
      const states = await storage.getConversationPollStates(
        [{ messageId, optionCount }],
        currentUserId
      );
      const state = states.get(messageId);
      if (!state) return res.status(500).json({ message: "Failed to load poll state" });
      await publishConversationPollUpdated(id, {
        conversationId: id,
        messageId,
        voteCounts: state.voteCounts,
        totalVotes: state.totalVotes,
      });
      res.json({ messageId, pollResults: state });
    } catch (error) {
      console.error("Error voting on poll:", error);
      res.status(500).json({ message: "Failed to vote" });
    }
  });

  app.post("/api/conversations/:id/messages/:messageId/reactions", isAuthenticated, async (req: any, res) => {
    try {
      const { id, messageId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const existing = await storage.getConversationMessageById(messageId);
      if (!existing || existing.conversationId !== id) {
        return res.status(404).json({ message: "Message not found" });
      }
      if (existing.deletedAt) {
        return res.status(400).json({ message: "Message deleted" });
      }
      const emoji = String(req.body?.emoji ?? "").trim();
      const allowed = new Set(["👍", "❤️", "🔥", "😂", "🙏", "😢"]);
      if (!allowed.has(emoji)) {
        return res.status(400).json({ message: "Unsupported reaction" });
      }
      await storage.toggleConversationMessageReaction(messageId, currentUserId, emoji);
      const reactions = (await storage.getConversationMessageReactionSummaries([messageId], currentUserId)).get(messageId) ?? [];
      await syncConversationRecentCache(id, currentUserId);
      res.json({ messageId, reactions });
    } catch (error) {
      console.error("Error toggling conversation reaction:", error);
      res.status(500).json({ message: "Failed to toggle reaction" });
    }
  });

  app.get("/api/conversations/:id/messages/:messageId/comments", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id, messageId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const message = await storage.getConversationMessageById(messageId);
      if (!message || message.conversationId !== id) {
        return res.status(404).json({ message: "Message not found" });
      }
      const comments = await storage.getConversationMessageComments(id, messageId, currentUserId);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching conversation comments:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.post("/api/conversations/:id/messages/:messageId/comments", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id, messageId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const message = await storage.getConversationMessageById(messageId);
      if (!message || message.conversationId !== id) {
        return res.status(404).json({ message: "Message not found" });
      }
      if (message.deletedAt) {
        return res.status(400).json({ message: "Message deleted" });
      }

      const body = req.body as {
        content?: string;
        imageUrl?: string;
        replyToCommentId?: string;
      };
      let replyToCommentId: string | null = null;
      if (body.replyToCommentId) {
        const replyTo = await storage.getConversationMessageCommentById(body.replyToCommentId);
        if (!replyTo || replyTo.conversationId !== id || replyTo.messageId !== messageId) {
          return res.status(400).json({ message: "Invalid reply target" });
        }
        replyToCommentId = replyTo.id;
      }
      const validated = insertConversationMessageCommentSchema.parse({
        conversationId: id,
        messageId,
        authorUserId: currentUserId,
        content: body.content ?? null,
        imageUrl: body.imageUrl ?? null,
        replyToCommentId,
      });
      if (!validated.content && !validated.imageUrl) {
        return res.status(400).json({ message: "Comment cannot be empty" });
      }

      const created = await storage.createConversationMessageComment(validated);
      const list = await storage.getConversationMessageComments(id, messageId, currentUserId);
      const enriched = list.find((comment) => comment.id === created.id);
      if (!enriched) return res.status(500).json({ message: "Failed to load created comment" });
      const commentsCount = (await storage.getConversationMessageCommentCounts([messageId])).get(messageId) ?? 0;
      const payload: ConversationCommentWithAuthor = { ...enriched, messageId, commentsCount };
      await publishConversationComment(id, payload);
      await syncConversationRecentCache(id, currentUserId);
      res.status(201).json(payload);
    } catch (error) {
      console.error("Error creating conversation comment:", error);
      if (error instanceof Error && error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid comment data" });
      }
      res.status(500).json({ message: "Failed to create comment" });
    }
  });

  app.patch(
    "/api/conversations/:id/messages/:messageId/comments/:commentId",
    isAuthenticated,
    isAdmin,
    async (req: any, res) => {
      try {
        const { id, messageId, commentId } = req.params;
        const currentUserId = await getCurrentUserId(req);
        if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
        const inConv = await storage.isUserInConversation(currentUserId, id);
        if (!inConv) return res.status(403).json({ message: "Access denied" });
        const comment = await storage.getConversationMessageCommentById(commentId);
        if (!comment || comment.conversationId !== id || comment.messageId !== messageId) {
          return res.status(404).json({ message: "Comment not found" });
        }
        if (comment.authorUserId !== currentUserId) {
          return res.status(403).json({ message: "Only author can edit" });
        }
        if (comment.deletedAt) return res.status(400).json({ message: "Comment deleted" });
        const content = String(req.body?.content ?? "").trim();
        if (!content) return res.status(400).json({ message: "Content required" });
        const updated = await storage.editConversationMessageComment(commentId, content);
        if (!updated) return res.status(404).json({ message: "Comment not found" });
        await publishConversationCommentEdited(id, {
          conversationId: id,
          messageId,
          commentId,
          content: updated.content ?? null,
          editedAt: (updated.editedAt instanceof Date ? updated.editedAt : new Date()).toISOString(),
        });
        res.json({ ok: true });
      } catch (error) {
        console.error("Error editing conversation comment:", error);
        res.status(500).json({ message: "Failed to edit comment" });
      }
    }
  );

  app.delete(
    "/api/conversations/:id/messages/:messageId/comments/:commentId",
    isAuthenticated,
    isAdmin,
    async (req: any, res) => {
      try {
        const { id, messageId, commentId } = req.params;
        const currentUserId = await getCurrentUserId(req);
        if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
        const inConv = await storage.isUserInConversation(currentUserId, id);
        if (!inConv) return res.status(403).json({ message: "Access denied" });
        const comment = await storage.getConversationMessageCommentById(commentId);
        if (!comment || comment.conversationId !== id || comment.messageId !== messageId) {
          return res.status(404).json({ message: "Comment not found" });
        }
        if (comment.deletedAt) return res.json({ ok: true });
        const myRole = await storage.getParticipantRole(id, currentUserId);
        const canDelete = comment.authorUserId === currentUserId || myRole === "owner";
        if (!canDelete) return res.status(403).json({ message: "Forbidden" });
        const updated = await storage.softDeleteConversationMessageComment(commentId);
        if (!updated) return res.status(404).json({ message: "Comment not found" });
        await publishConversationCommentDeleted(id, {
          conversationId: id,
          messageId,
          commentId,
          deletedAt: (updated.deletedAt instanceof Date ? updated.deletedAt : new Date()).toISOString(),
        });
        await syncConversationRecentCache(id, currentUserId);
        res.json({ ok: true });
      } catch (error) {
        console.error("Error deleting conversation comment:", error);
        res.status(500).json({ message: "Failed to delete comment" });
      }
    }
  );

  app.post(
    "/api/conversations/:id/messages/:messageId/comments/:commentId/reactions",
    isAuthenticated,
    isAdmin,
    async (req: any, res) => {
      try {
        const { id, messageId, commentId } = req.params;
        const currentUserId = await getCurrentUserId(req);
        if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
        const inConv = await storage.isUserInConversation(currentUserId, id);
        if (!inConv) return res.status(403).json({ message: "Access denied" });
        const comment = await storage.getConversationMessageCommentById(commentId);
        if (!comment || comment.conversationId !== id || comment.messageId !== messageId) {
          return res.status(404).json({ message: "Comment not found" });
        }
        if (comment.deletedAt) {
          return res.status(400).json({ message: "Comment deleted" });
        }
        const emoji = String(req.body?.emoji ?? "").trim();
        const allowed = new Set(["👍", "❤️", "🔥", "😂", "🙏", "😢"]);
        if (!allowed.has(emoji)) {
          return res.status(400).json({ message: "Unsupported reaction" });
        }
        await storage.toggleConversationMessageCommentReaction(commentId, currentUserId, emoji);
        const reactions =
          (await storage.getConversationMessageCommentReactionSummaries([commentId], currentUserId)).get(commentId) ??
          [];
        await publishConversationCommentReaction(id, { conversationId: id, messageId, commentId, reactions });
        res.json({ commentId, reactions });
      } catch (error) {
        console.error("Error toggling conversation comment reaction:", error);
        res.status(500).json({ message: "Failed to toggle comment reaction" });
      }
    }
  );

  // Invite patient (legacy endpoint kept for compatibility with existing client)
  app.post('/api/invite-patient', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const normalizedEmail = email.toLowerCase().trim();

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await storage.createInvite({
        email: normalizedEmail,
        inviteType: "patient",
        status: "pending",
        tokenHash,
        invitedByUserId: userId,
        expiresAt,
      });

      const doctor = await storage.getUser(userId);
      const doctorName = [doctor?.firstName, doctor?.lastName].filter(Boolean).join(' ') || doctor?.email || 'Ваш гомеопат';
      const baseUrl = process.env.APP_URL || BASE_URL;
      const inviteUrl = `${baseUrl}/invite/accept?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;

      try {
        await sendInviteEmail(normalizedEmail, inviteUrl, "patient", doctorName, doctor?.email);
      } catch (emailError) {
        console.error('Failed to send invite email:', emailError);
        return res.status(500).json({ message: "Failed to send invite email" });
      }

      res.json({ success: true, email: normalizedEmail });
    } catch (error) {
      console.error("Error inviting patient:", error);
      res.status(500).json({ message: "Failed to invite patient" });
    }
  });

  // Do not block server startup on object storage integration initialization.
  void getObjectStorageModule()
    .then((objectStorageModule) => {
      objectStorageModule.registerObjectStorageRoutes(app);
      console.log("[routes] object storage routes registered");
    })
    .catch((err) => {
      console.error("[routes] object storage init failed:", err);
    });
  console.log("[routes] registerRoutes: handlers registered, creating HTTP server");

  const httpServer = createServer(app);
  setupWebSocket(httpServer, sessionStore as Parameters<typeof setupWebSocket>[1], process.env.SESSION_SECRET!);
  console.log("[routes] registerRoutes: websocket ready");
  return httpServer;
}
