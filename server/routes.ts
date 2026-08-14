import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { canUserReadChannel, canUserSubscribeToChannel, canUserViewChannelProfile, buildChannelAccessContext } from "./channelAccess";
import { canUserJoinGroup, canUserReadGroup } from "./groupAccess";
import { db } from "./db";
import { users, payments } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { isAuthenticated, isAdmin } from "./emailAuth";
import { register, login, requestPasswordReset, resetPassword, changePassword, getEmailUser, logoutEmail } from "./emailAuth";
import { generateAuthPassword } from "./authPassword";
import { sendInviteEmail, sendInviteAccessEmail } from "./email";
import { BASE_URL, APP_HOME_PATH } from "@shared/brand";
import { isPositiveTierAmount, clampDiscountPercent, resolveContentTierAmount } from "@shared/sponsorTiers";
import { tagCategoryEnum } from "@shared/schema";
import {
  questionnaireInstanceDataSchema,
  questionnaireTemplateStructureSchema,
  validateQuestionnaireStructureDepth,
  questionnaireMessageContentSchema,
  questionnaireTemplateMessageContentSchema,
  parseQuestionnaireHintsMode,
  type QuestionnaireHintsMode,
  type QuestionnaireTemplateStructure,
} from "@shared/questionnaireTypes";
import { deepCloneQuestionnaireStructure } from "./questionnaireDefaults";
import {
  insertConversationSchema,
  insertConversationMessageSchema,
  insertConversationMessageCommentSchema,
  pollPayloadSchema,
  voicePayloadSchema,
  videoPayloadSchema,
  filePayloadSchema,
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
import {
  startCall,
  acceptCall,
  declineCall,
  leaveCall,
  endCall,
  getCallStateDto,
  createCallAccessToken,
  isCallableConversationType,
  isLiveKitConfigured,
  getLiveKitUrl,
  reconcileConversationCallBeforeStart,
  reconcileStaleCall,
} from "./voiceCall";
import { notifyConversationSeen } from "./seenNotify";
import { notifyMessengerConversationActivity } from "./doctorChatsNotify";
import {
  getVapidPublicKey,
  isPushConfigured,
  notifyConversationNewMessage,
  sendPushToUsers,
} from "./push";
import {
  filterMessageForNonSponsor,
  hasSponsorSections,
} from "@shared/messageFormatting";
import {
  cleanupCommentAttachments,
  cleanupMessageAttachments,
  cleanupReplacedMessageAttachments,
} from "./utils/messageAttachmentCleanup";

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
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    isAdmin: user.isAdmin,
    requiresRoleSelection: user.requiresRoleSelection,
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

  app.get("/", (_req, res) => {
    res.redirect(301, APP_HOME_PATH);
  });

  // Sitemap.xml - dynamic generation
  app.get('/sitemap.xml', async (req, res) => {
    try {
      const baseUrl = process.env.APP_URL || BASE_URL;
      
      const staticPages: Array<{ loc: string; priority: string; changefreq: string; lastmod?: string }> = [
        { loc: APP_HOME_PATH, priority: '1.0', changefreq: 'daily' },
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
  app.post('/api/auth/register', register);
  app.post('/api/auth/login', login);
  app.post('/api/auth/complete-role-selection', isAuthenticated, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (!user.requiresRoleSelection) {
        return res.status(400).json({ message: "role_selection_not_required" });
      }
      const isHomeopathRaw = req.body?.isHomeopath;
      const displayName = String(req.body?.displayName || "").trim();
      if (typeof isHomeopathRaw !== "boolean") {
        return res.status(400).json({ message: "role_selection_required" });
      }
      if (displayName.length < 2) {
        return res.status(400).json({ message: "display_name_required" });
      }
      const updatedUser = await storage.updateUserProfile(userId, {
        firstName: displayName,
        isAdmin: isHomeopathRaw,
        requiresRoleSelection: false,
      });
      res.json(toAuthUserResponse(updatedUser));
    } catch (error) {
      console.error("Error completing role selection:", error);
      res.status(500).json({ message: "Failed to complete role selection" });
    }
  });
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
      const inviteTypeRaw = String(req.body?.inviteType || "").trim().toLowerCase();
      if (inviteTypeRaw !== "homeopath" && inviteTypeRaw !== "patient") {
        return res.status(400).json({ message: "invite_type_required" });
      }
      const inviteType = inviteTypeRaw as "patient" | "homeopath";
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

  app.post("/api/patient-invites", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const patientName = String(req.body?.patientName || "").trim();
      if (patientName.length < 1) {
        return res.status(400).json({ message: "patient_name_required" });
      }

      const conv = await storage.createConversation({
        type: "patient",
        name: null,
        patientUserId: null,
      });
      await storage.addConversationParticipant(conv.id, userId, "owner", patientName);

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await storage.createInvite({
        email: null,
        inviteType: "patient",
        status: "pending",
        tokenHash,
        token,
        invitedByUserId: userId,
        conversationId: conv.id,
        expiresAt,
      });

      await postPatientChatStatusMessage(conv.id, userId, PATIENT_INVITE_SENT_MESSAGE);
      await publishDoctorChatsUpdated(userId);

      const baseUrl = process.env.APP_URL || BASE_URL;
      const inviteUrl = `${baseUrl}/invite/accept?token=${token}`;

      res.status(201).json({
        success: true,
        inviteType: "patient" as const,
        conversationId: conv.id,
        expiresAt: expiresAt.toISOString(),
        inviteUrl,
      });
    } catch (error) {
      console.error("Error creating patient invite:", error);
      res.status(500).json({ message: "Failed to create patient invite" });
    }
  });

  app.get('/api/invites/check-email', async (req: any, res) => {
    try {
      const token = String(req.query?.token || "").trim();
      const email = String(req.query?.email || "").trim().toLowerCase();
      if (!token || !email) {
        return res.status(400).json({ message: "token_and_email_required" });
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const invite = await storage.getInviteByTokenHash(tokenHash);
      if (!invite) return res.status(404).json({ message: "invalid_invite" });
      if (invite.email && invite.email !== email) {
        return res.status(400).json({ message: "invalid_invite_email" });
      }
      if (invite.status !== "pending") {
        return res.status(400).json({ message: "invite_inactive" });
      }
      if (new Date(invite.expiresAt).getTime() <= Date.now()) {
        return res.status(400).json({ message: "invite_expired" });
      }

      const user = await storage.getUserByEmail(email);
      res.json({ exists: !!user });
    } catch (error) {
      console.error("Error checking invite email:", error);
      res.status(500).json({ message: "Failed to check email" });
    }
  });

  app.get('/api/invites/preview', async (req: any, res) => {
    try {
      const token = String(req.query?.token || "").trim();
      if (!token) return res.status(400).json({ message: "token_required" });

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const invite = await storage.getInviteByTokenHash(tokenHash);
      if (!invite) return res.status(404).json({ message: "invalid_invite" });
      if (invite.status !== "pending") {
        return res.status(400).json({ message: "invite_inactive" });
      }
      if (new Date(invite.expiresAt).getTime() <= Date.now()) {
        await storage.markInviteExpired(invite.id);
        return res.status(400).json({ message: "invite_expired" });
      }

      const inviter = await storage.getUser(invite.invitedByUserId);
      const inviterName =
        [inviter?.firstName, inviter?.lastName].filter(Boolean).join(" ").trim() ||
        inviter?.email ||
        "Ваш гомеопат";

      res.json({
        inviteType: invite.inviteType,
        precreatedPatientChat: invite.inviteType === "patient" && !!invite.conversationId,
        groupName:
          invite.inviteType === "group_member" && invite.conversationId
            ? (await storage.getConversation(invite.conversationId))?.name ?? null
            : null,
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

  app.post('/api/invites/prepare-registration', async (req: any, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const token = String(req.body?.token || "").trim();
      if (!email || !token) {
        return res.status(400).json({ message: "Email and token are required" });
      }

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
      if (existingUser) {
        return res.status(409).json({ message: "user_exists" });
      }

      const password = generateAuthPassword();
      const bcrypt = await import("bcryptjs");
      const passwordHash = await bcrypt.hash(password, 10);
      await storage.createUserWithPassword(email, passwordHash);

      try {
        await sendInviteAccessEmail(email, password);
      } catch (emailError) {
        console.error("Failed to send invite access email:", emailError);
        return res.status(500).json({ message: "Failed to send password email" });
      }

      // Invite stays pending until the user logs in with this password and accepts.
      res.status(201).json({ message: "password_sent", email });
    } catch (error) {
      console.error("Error preparing invite registration:", error);
      res.status(500).json({ message: "Failed to prepare registration" });
    }
  });

  app.post('/api/invites/accept', async (req: any, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const token = String(req.body?.token || "").trim();
      const firstName = String(req.body?.firstName || "").trim();
      const lastName = String(req.body?.lastName || "").trim();
      const patientName = String(req.body?.patientName || req.body?.chatName || "").trim();
      const isHomeopathRaw = req.body?.isHomeopath;
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
      if (!canJoinAsExistingUser) {
        // New invitees must verify email by logging in with the mailed password first.
        if (!existingUser) {
          return res.status(401).json({ message: "login_required" });
        }
        return res.status(409).json({ message: "user_exists" });
      }

      const targetUser = existingUser!;

      let effectiveInviteType: "patient" | "homeopath";
      if (invite.inviteType === "open") {
        if (typeof isHomeopathRaw !== "boolean") {
          return res.status(400).json({ message: "role_selection_required" });
        }
        effectiveInviteType = isHomeopathRaw ? "homeopath" : "patient";
      } else {
        effectiveInviteType = invite.inviteType === "homeopath" ? "homeopath" : "patient";
      }

      let conversationId: string | undefined;
      if (effectiveInviteType === "homeopath") {
        await storage.updateUserProfile(targetUser.id, { isAdmin: true, requiresRoleSelection: false });

        let directConversationId = await storage.getDirectConversationBetween(
          invite.invitedByUserId,
          targetUser.id
        );
        if (!directConversationId) {
          const conv = await storage.createConversation({
            type: "direct",
            name: null,
            patientUserId: null,
          });
          await storage.addConversationParticipant(conv.id, invite.invitedByUserId, "owner");
          await storage.addConversationParticipant(conv.id, targetUser.id, "member");
          directConversationId = conv.id;
        }
        conversationId = directConversationId;
        await postPatientChatStatusMessage(
          directConversationId,
          targetUser.id,
          PATIENT_INVITE_ACCEPTED_MESSAGE
        );
        await publishDoctorChatsUpdated(invite.invitedByUserId);
        await publishDoctorChatsUpdated(targetUser.id);
      } else {
        if (!firstName) {
          return res.status(400).json({ message: "first_name_required" });
        }
        const patientChatTitle = patientName || firstName;
        const patientProfile: {
          firstName?: string;
          lastName?: string;
          isAdmin: boolean;
          requiresRoleSelection: boolean;
        } = {
          isAdmin: false,
          requiresRoleSelection: false,
        };
        if (!targetUser.firstName?.trim()) {
          patientProfile.firstName = firstName;
          if (lastName) patientProfile.lastName = lastName;
        }
        await storage.updateUserProfile(targetUser.id, patientProfile);

        if (invite.conversationId) {
          const conv = await storage.getConversation(invite.conversationId);
          if (!conv || conv.type !== "patient") {
            return res.status(400).json({ message: "invalid_invite_conversation" });
          }
          if (conv.patientUserId) {
            return res.status(400).json({ message: "invite_inactive" });
          }
          const ownerRole = await storage.getParticipantRole(conv.id, invite.invitedByUserId);
          if (ownerRole !== "owner") {
            return res.status(400).json({ message: "invalid_invite_conversation" });
          }
          await storage.updateConversation(conv.id, { patientUserId: targetUser.id });
          await storage.addConversationParticipant(conv.id, targetUser.id, "member", patientChatTitle);
          conversationId = conv.id;
          await postPatientChatStatusMessage(conv.id, targetUser.id, PATIENT_INVITE_ACCEPTED_MESSAGE);
          await publishDoctorChatsUpdated(invite.invitedByUserId);
          await publishDoctorChatsUpdated(targetUser.id);
        } else {
          const conv = await storage.createConversation({
            type: "patient",
            name: patientChatTitle,
            patientUserId: targetUser.id,
          });
          await storage.addConversationParticipant(conv.id, invite.invitedByUserId, "owner", patientChatTitle);
          await storage.addConversationParticipant(conv.id, targetUser.id, "member", patientChatTitle);
          conversationId = conv.id;
          await publishDoctorChatsUpdated(invite.invitedByUserId);
        }
      }

      await storage.markInviteAccepted(invite.id, targetUser.id, email, conversationId, {
        inviteType: effectiveInviteType,
      });

      res.json({
        id: targetUser.id,
        email: targetUser.email,
        isAdmin: effectiveInviteType === "homeopath" ? true : targetUser.isAdmin,
        joinedAsExistingUser: true,
        conversationId: conversationId ?? null,
      });
    } catch (error) {
      console.error("Error accepting invite:", error);
      res.status(500).json({ message: "Failed to accept invite" });
    }
  });

  // Tag routes
  app.get('/api/tags', isAuthenticated, async (req, res) => {
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

  app.get('/api/tags/search/:query', isAuthenticated, async (req, res) => {
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
      
      const { firstName, lastName, gender, birthMonth, birthYear, height, weight, country, city, profileImageUrl } = req.body;
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
      const name = String(req.body?.name ?? "Новый опросник").trim();
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
      const patch: Partial<{ name: string; structure: QuestionnaireTemplateStructure; isShared: boolean; hintsMode: QuestionnaireHintsMode }> = {};
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
      if (req.body?.hintsMode === "always" || req.body?.hintsMode === "icon") {
        patch.hintsMode = req.body.hintsMode;
      }
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
      const conversationId = req.body?.conversationId ? String(req.body.conversationId).trim() : "";
      const messageId = req.body?.messageId ? String(req.body.messageId).trim() : "";

      let allowUnshared = false;
      let messagePayload: ReturnType<typeof questionnaireTemplateMessageContentSchema.parse> | null = null;
      if (conversationId && messageId) {
        const inConv = await storage.isUserInConversation(userId, conversationId);
        if (!inConv) return res.status(403).json({ message: "Access denied" });
        const msg = await storage.getConversationMessageById(messageId);
        if (!msg || msg.conversationId !== conversationId || msg.deletedAt) {
          return res.status(404).json({ message: "Message not found" });
        }
        if (msg.messageType !== "questionnaire_template") {
          return res.status(400).json({ message: "Message is not a questionnaire template" });
        }
        try {
          messagePayload = questionnaireTemplateMessageContentSchema.parse(JSON.parse(msg.content || "{}"));
        } catch {
          return res.status(400).json({ message: "Invalid template message" });
        }
        if (messagePayload.templateId !== req.params.id) {
          return res.status(400).json({ message: "Template does not match message" });
        }
        allowUnshared = true;
      }

      let copy = await storage.copySharedQuestionnaireTemplate(req.params.id, userId, name, {
        allowUnshared,
      });

      // Fallback: source template may be gone, but the chat message still has a snapshot.
      if (!copy && allowUnshared && messagePayload?.snapshot) {
        const resolvedName =
          name ||
          (await storage.resolveQuestionnaireTemplateCopyName(userId, messagePayload.templateName));
        copy = await storage.createQuestionnaireTemplate({
          ownerUserId: userId,
          name: resolvedName,
          structure: deepCloneQuestionnaireStructure(messagePayload.snapshot),
          hintsMode: parseQuestionnaireHintsMode(messagePayload.hintsMode),
          isShared: false,
        });
      }

      if (!copy) return res.status(404).json({ message: "Template not found or not shared" });
      res.status(201).json(copy);
    } catch (error) {
      console.error("Error copying questionnaire template:", error);
      res.status(500).json({ message: "Failed to copy template" });
    }
  });

  app.get("/api/users/:userId/questionnaire-templates", isAuthenticated, async (req: any, res) => {
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
      // Edits only from participants of the original patient chat (not via forwarded copies).
      if (!(await storage.isUserInConversation(userId, instance.conversationId))) {
        return res.status(403).json({ message: "Questionnaire is read-only outside the patient chat" });
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
  app.get("/api/me/chats/unread-summary", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const summary = await storage.getMessengerUnreadSummary(currentUserId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching /api/me/chats/unread-summary:", error);
      res.status(500).json({ message: "Failed to fetch unread summary" });
    }
  });

  app.get("/api/me/channel-subscriptions", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const subscriptions = await storage.getUserChannelSubscriptions(currentUserId);
      res.json({
        subscriptions: subscriptions.map((sub) => ({
          conversationId: sub.conversationId,
          name: sub.name,
          expiresAt: sub.expiresAt.toISOString(),
          isActive: sub.isActive,
        })),
      });
    } catch (error) {
      console.error("Error fetching /api/me/channel-subscriptions:", error);
      res.status(500).json({ message: "Failed to fetch channel subscriptions" });
    }
  });

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

      // Flags conversations that currently have a ringing/active voice call.
      const annotateActiveCalls = async <T extends { conversationId?: string }>(
        items: T[]
      ): Promise<(T & { hasActiveCall: boolean })[]> => {
        const ids = items.map((i) => i.conversationId).filter((x): x is string => !!x);
        const activeSet = new Set(
          await storage.getConversationIdsWithActiveCalls(ids, currentUserId)
        );
        return items.map((i) => ({
          ...i,
          hasActiveCall: !!i.conversationId && activeSet.has(i.conversationId),
        }));
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
          return res.json(paged(await annotateActiveCalls(items)));
        }

        const [contacts, patientChats] = await Promise.all([
          storage.getMessengerPersonalContacts(currentUserId),
          storage.getPatientConversationsForUser(currentUserId),
        ]);
        const doctorItems = await Promise.all(
          contacts.map(async (contact) => {
            const otherParticipantName =
              [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || contact.email || "Doctor";
            const unreadCount = contact.conversationId
              ? await storage.getConversationUnreadCount(contact.conversationId, currentUserId)
              : 0;
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
              unreadCount,
            };
          })
        );
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
        return res.json(paged(await annotateActiveCalls(items)));
      }

      if (folder === "channels") {
        const browse = await storage.getMessengerChannelBrowseList(
          currentUserId,
          !!currentUser.isAdmin
        );
        const items: Array<Record<string, unknown>> = [];
        for (const channel of browse.subscriptions) {
          items.push({
            source: "conversation" as const,
            folder: "channels" as const,
            section: "subscriptions" as const,
            conversationId: channel.id,
            type: "channel",
            name: channel.name ?? undefined,
            avatarUrl: channel.avatarUrl ?? null,
            participantCount: channel.participantCount,
            myRole: channel.myRole,
            isMember: channel.isMember,
            lastMessageAt: channel.lastPostAt?.toISOString() ?? null,
            lastMessagePreview: channel.lastMessagePreview ?? null,
            lastVisitedAt: channel.lastVisitedAt?.toISOString() ?? null,
            unreadCount: channel.unreadCount,
          });
        }
        if (browse.subscriptions.length > 0 && browse.discover.length > 0) {
          items.push({
            source: "conversation" as const,
            folder: "channels" as const,
            type: "divider",
            dividerKey: "channels-split",
          });
        }
        for (const channel of browse.discover) {
          items.push({
            source: "conversation" as const,
            folder: "channels" as const,
            section: "discover" as const,
            conversationId: channel.id,
            type: "channel",
            name: channel.name ?? undefined,
            avatarUrl: channel.avatarUrl ?? null,
            participantCount: channel.participantCount,
            isMember: false,
            lastMessageAt: channel.lastMessageAt?.toISOString() ?? null,
            lastMessagePreview: channel.lastMessagePreview ?? null,
            unreadCount: 0,
          });
        }
        return res.json(paged(items));
      }

      if (!currentUser.isAdmin) {
        return res.json(paged([]));
      }

      const browse = await storage.getMessengerGroupBrowseList(currentUserId);
      const items: Array<Record<string, unknown>> = [];
      for (const group of browse.subscriptions) {
        items.push({
          source: "conversation" as const,
          folder: "groups" as const,
          section: "subscriptions" as const,
          conversationId: group.id,
          type: group.type,
          name: group.name ?? undefined,
          avatarUrl: group.avatarUrl ?? null,
          participantCount: group.participantCount,
          patientUserId: group.patientUserId ?? undefined,
          myRole: group.myRole,
          isMember: true,
          lastMessageAt: group.lastMessageAt?.toISOString() ?? null,
          lastMessagePreview: group.lastMessagePreview ?? null,
          unreadCount: group.unreadCount,
        });
      }
      if (browse.subscriptions.length > 0 && browse.discover.length > 0) {
        items.push({
          source: "conversation" as const,
          folder: "groups" as const,
          type: "divider",
          dividerKey: "groups-split",
        });
      }
      for (const group of browse.discover) {
        items.push({
          source: "conversation" as const,
          folder: "groups" as const,
          section: "discover" as const,
          conversationId: group.id,
          type: "group",
          name: group.name ?? undefined,
          avatarUrl: group.avatarUrl ?? null,
          participantCount: group.participantCount,
          isMember: false,
          lastMessageAt: group.lastMessageAt?.toISOString() ?? null,
          lastMessagePreview: group.lastMessagePreview ?? null,
          unreadCount: 0,
        });
      }
      return res.json(paged(await annotateActiveCalls(items)));
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

  // Patient messenger search: subscribed + patient-available discover channels
  app.get("/api/messenger/patient-channel-search", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });
      if (currentUser.isAdmin) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (!q) return res.json({ channels: [] });

      const channelNameMatchesQuery = (name: string | null) => {
        const nameLower = (name ?? "").toLowerCase();
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        return words.every((word) => nameLower.includes(word));
      };

      const subscriptions = await storage.getMessengerChannels(currentUserId);
      const matchedSubscriptions = subscriptions
        .filter((channel) => channelNameMatchesQuery(channel.name))
        .map((channel) => ({
          id: channel.id,
          name: channel.name,
          avatarUrl: channel.avatarUrl ?? null,
          isMember: true,
          lastMessagePreview: channel.lastMessagePreview ?? null,
          lastMessageAt: channel.lastPostAt?.toISOString() ?? null,
        }));

      const discover = await storage.getDiscoverableConversations(currentUserId, {
        type: "channel",
        excludeClosed: true,
        excludeHidden: true,
        patientAvailableOnly: true,
        excludeConversationIds: subscriptions.map((channel) => channel.id),
      });
      const matchedDiscover = discover.filter((channel) => channelNameMatchesQuery(channel.name));

      res.json({
        channels: [
          ...matchedSubscriptions,
          ...matchedDiscover.map((channel) => ({
            id: channel.id,
            name: channel.name,
            avatarUrl: channel.avatarUrl ?? null,
            isMember: false,
            lastMessagePreview: channel.lastMessagePreview ?? null,
            lastMessageAt: channel.lastMessageAt?.toISOString() ?? null,
          })),
        ],
      });
    } catch (error) {
      console.error("Error fetching /api/messenger/patient-channel-search:", error);
      res.status(500).json({ message: "Failed to search channels" });
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
        excludeClosed: true,
      });
      const channels = await storage.getDiscoverableConversations(currentUserId, {
        type: "channel",
        nameFilter: q || undefined,
        excludeClosed: true,
        excludeHidden: true,
      });

      res.json({
        doctors,
        groups: groups.map((g) => ({
          id: g.id,
          name: g.name,
          avatarUrl: g.avatarUrl ?? null,
          participantCount: g.participantCount,
          isMember: g.isMember,
          lastMessagePreview: g.lastMessagePreview ?? null,
          lastMessageAt: g.lastMessageAt?.toISOString() ?? null,
        })),
        channels: channels.map((c) => ({
          id: c.id,
          name: c.name,
          avatarUrl: c.avatarUrl ?? null,
          isMember: c.isMember,
          lastMessagePreview: c.lastMessagePreview ?? null,
          lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
        })),
      });
    } catch (error) {
      console.error("Error fetching /api/messenger/search:", error);
      res.status(500).json({ message: "Failed to search" });
    }
  });

  // Search users (doctors + patients) for closed channel member invite — channel owner only.
  app.get("/api/users/search", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const conversationId =
        typeof req.query.conversationId === "string" ? req.query.conversationId : "";
      if (!conversationId) return res.status(400).json({ message: "conversationId required" });
      const role = await storage.getParticipantRole(conversationId, currentUserId);
      if (role !== "owner") return res.status(403).json({ message: "Only owner can search users" });
      const conv = await storage.getConversation(conversationId);
      if (!conv || conv.type !== "channel" || !conv.isClosed) {
        return res.status(400).json({ message: "User search only for closed channels" });
      }
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (!q) return res.json({ users: [] });
      const usersFound = await storage.searchUsersForInvite(currentUserId, q);
      res.json({
        users: usersFound.map((u) => ({
          userId: u.id,
          firstName: u.firstName ?? undefined,
          lastName: u.lastName ?? undefined,
          email: u.email ?? undefined,
          isAdmin: u.isAdmin,
        })),
      });
    } catch (error) {
      console.error("Error fetching /api/users/search:", error);
      res.status(500).json({ message: "Failed to search users" });
    }
  });

  // Join public group (self-join)
  app.post("/api/conversations/:id/join", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });
      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      if (conv.type !== "group") return res.status(400).json({ message: "Not a group" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!canUserJoinGroup(conv, inConv, !!currentUser.isAdmin)) {
        return res.status(403).json({ message: "only_owner_can_add_members" });
      }
      await storage.addConversationParticipant(id, currentUserId, "member");
      await publishDoctorChatsUpdated(currentUserId);
      res.json({ success: true });
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
      if (validated.type === "group") {
        await storage.updateConversation(conv.id, { isClosed: true });
      }
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
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      const participantRole = inConv ? await storage.getParticipantRole(id, currentUserId) : undefined;
      const membershipStatus = inConv
        ? await storage.getParticipantMembershipStatus(id, currentUserId)
        : undefined;
      const channelCtx = buildChannelAccessContext(
        inConv,
        !!currentUser.isAdmin,
        participantRole,
        membershipStatus
      );
      const canReadConversation =
        conv.type === "channel"
          ? canUserViewChannelProfile(conv, channelCtx)
          : conv.type === "group"
            ? canUserReadGroup(conv, inConv, !!currentUser.isAdmin)
            : inConv;
      if (!canReadConversation) return res.status(403).json({ message: "Access denied" });
      const participants = await storage.getConversationParticipants(id);
      const sponsorSettings =
        conv.type === "channel" ? await storage.getChannelSponsorSettings(id) : null;
      const sponsorExpiresAt =
        conv.type === "channel"
          ? await storage.getParticipantSponsorExpiresAt(id, currentUserId)
          : null;
      const channelSponsorExpiresAt =
        conv.type === "channel"
          ? await storage.getParticipantSponsorListingExpiresAt(id, currentUserId)
          : null;
      const isSponsor =
        conv.type === "channel"
          ? await storage.isActiveChannelSponsor(id, currentUserId)
          : false;
      const isChannelSponsor =
        conv.type === "channel"
          ? await storage.isActiveChannelSponsorListing(id, currentUserId)
          : false;
      const sponsorCount =
        conv.type === "channel" ? await storage.countActiveChannelSponsors(id) : undefined;
      const myParticipant = participants.find((p) => p.userId === currentUserId);
      const myDisplayName =
        myParticipant?.displayName?.trim() ||
        (conv.type === "patient" ? conv.name?.trim() : null) ||
        null;
      res.json({
        ...conv,
        participants,
        myDisplayName,
        ...(conv.type === "channel"
          ? {
              participantCount: participants.length,
              sponsorCount,
              myMembershipStatus: membershipStatus ?? null,
              canReadChannelContent: canUserReadChannel(conv, channelCtx),
              subscriptionPending: membershipStatus === "pending",
            }
          : {}),
        sponsorSettings: sponsorSettings
          ? {
              enabled: sponsorSettings.enabled,
              paymentInstructions: sponsorSettings.paymentInstructions,
              tier1Amount: sponsorSettings.tier1Amount,
              tier2Amount: sponsorSettings.tier2Amount,
              durationDays: sponsorSettings.durationDays,
              contentDurationDays: sponsorSettings.contentDurationDays,
              sponsorDurationDays: sponsorSettings.sponsorDurationDays,
              contentRenewalDiscountPercent: sponsorSettings.contentRenewalDiscountPercent,
            }
          : null,
        isSponsor,
        sponsorExpiresAt: sponsorExpiresAt?.toISOString() ?? null,
        isChannelSponsor,
        channelSponsorExpiresAt: channelSponsorExpiresAt?.toISOString() ?? null,
        hasContentAccess: isSponsor,
      });
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
      if (body.name != null) {
        await storage.updateConversationParticipantDisplayName(id, currentUserId, trimmedName);
      }
      if (body.avatarUrl !== undefined) {
        await storage.updateConversation(id, { avatarUrl: body.avatarUrl });
      }
      const updatedConv = await storage.getConversation(id);
      const participants = await storage.getConversationParticipants(id);
      const myParticipant = participants.find((p) => p.userId === currentUserId);
      const myDisplayName =
        myParticipant?.displayName?.trim() ||
        updatedConv?.name?.trim() ||
        null;
      const owner = participants.find((p) => p.role === "owner");
      if (owner?.userId) {
        await publishDoctorChatsUpdated(owner.userId);
      }
      const patientPart = participants.find((p) => p.role === "member");
      if (patientPart?.userId) {
        await publishDoctorChatsUpdated(patientPart.userId);
      }
      res.json({ ...updatedConv, participants, myDisplayName });
    } catch (error) {
      console.error("Error updating patient chat settings:", error);
      res.status(500).json({ message: "Failed to update conversation" });
    }
  });

  app.post("/api/conversations/:id/patient-invite-link", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });

      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      if (conv.type !== "patient") {
        return res.status(400).json({ message: "not_a_patient_chat" });
      }
      if (conv.patientUserId) {
        return res.status(400).json({ message: "patient_already_joined" });
      }

      const role = await storage.getParticipantRole(id, currentUserId);
      if (role !== "owner") return res.status(403).json({ message: "Access denied" });

      const baseUrl = process.env.APP_URL || BASE_URL;
      const existingInvite = await storage.getPendingPatientInviteByConversationId(id);
      const now = new Date();
      if (
        existingInvite &&
        existingInvite.expiresAt > now &&
        existingInvite.token
      ) {
        const inviteUrl = `${baseUrl}/invite/accept?token=${existingInvite.token}`;
        return res.json({
          inviteUrl,
          expiresAt: existingInvite.expiresAt.toISOString(),
        });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      if (existingInvite) {
        await storage.renewInviteToken(existingInvite.id, tokenHash, expiresAt, token);
      } else {
        await storage.createInvite({
          email: null,
          inviteType: "patient",
          status: "pending",
          tokenHash,
          token,
          invitedByUserId: currentUserId,
          conversationId: id,
          expiresAt,
        });
      }

      const inviteUrl = `${baseUrl}/invite/accept?token=${token}`;

      res.json({ inviteUrl, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      console.error("Error issuing patient invite link:", error);
      res.status(500).json({ message: "Failed to issue patient invite link" });
    }
  });

  app.post("/api/conversations/:id/group-invite-link", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });

      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      if (conv.type !== "group") {
        return res.status(400).json({ message: "not_a_group" });
      }
      if (!conv.isClosed) {
        return res.status(400).json({ message: "group_is_public" });
      }

      const role = await storage.getParticipantRole(id, currentUserId);
      if (role !== "owner") return res.status(403).json({ message: "Access denied" });

      const baseUrl = process.env.APP_URL || BASE_URL;
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await storage.createInvite({
        email: null,
        inviteType: "group_member",
        status: "pending",
        tokenHash,
        token,
        invitedByUserId: currentUserId,
        conversationId: id,
        expiresAt,
      });

      const inviteUrl = `${baseUrl}/invite/accept?token=${token}`;
      res.json({ inviteUrl, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      console.error("Error issuing group invite link:", error);
      res.status(500).json({ message: "Failed to issue group invite link" });
    }
  });

  app.post("/api/group-invites/accept", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      if (!token) return res.status(400).json({ message: "token_required" });

      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const invite = await storage.getInviteByTokenHash(tokenHash);
      if (!invite || invite.inviteType !== "group_member") {
        return res.status(400).json({ message: "invalid_invite" });
      }
      if (invite.status !== "pending") {
        return res.status(400).json({ message: "invite_inactive" });
      }
      if (new Date(invite.expiresAt).getTime() <= Date.now()) {
        await storage.markInviteExpired(invite.id);
        return res.status(400).json({ message: "invite_expired" });
      }
      if (!invite.conversationId) {
        return res.status(400).json({ message: "invalid_invite" });
      }

      const conv = await storage.getConversation(invite.conversationId);
      if (!conv || conv.type !== "group" || !conv.isClosed) {
        return res.status(400).json({ message: "invalid_invite_conversation" });
      }

      const ownerRole = await storage.getParticipantRole(conv.id, invite.invitedByUserId);
      if (ownerRole !== "owner") {
        return res.status(400).json({ message: "invalid_invite_conversation" });
      }

      const inConv = await storage.isUserInConversation(currentUserId, conv.id);
      if (!inConv) {
        await storage.addConversationParticipant(conv.id, currentUserId, "member");
      }

      const currentUser = await storage.getUser(currentUserId);
      await storage.markInviteAccepted(invite.id, currentUserId, currentUser?.email ?? undefined, conv.id, {
        inviteType: "group_member",
      });
      await publishDoctorChatsUpdated(currentUserId);

      res.json({
        conversationId: conv.id,
        alreadyMember: inConv,
      });
    } catch (error) {
      console.error("Error accepting group invite:", error);
      res.status(500).json({ message: "Failed to accept group invite" });
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
      const body = req.body as {
        name?: string;
        avatarUrl?: string | null;
        addParticipantIds?: string[];
        patientAvailable?: boolean;
        isClosed?: boolean;
        isHidden?: boolean;
        allowCalls?: boolean;
      };
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
      if (conv.type === "channel" && (body.patientAvailable !== undefined || body.isClosed !== undefined || body.isHidden !== undefined)) {
        if (role !== "owner") return res.status(403).json({ message: "only_owner_can_edit_conversation" });
        await storage.updateConversation(id, {
          ...(body.patientAvailable !== undefined ? { patientAvailable: body.patientAvailable } : {}),
          ...(body.isClosed !== undefined ? { isClosed: body.isClosed } : {}),
          ...(body.isHidden !== undefined ? { isHidden: body.isHidden } : {}),
        });
      }
      if (conv.type === "group" && (body.isClosed !== undefined || body.allowCalls !== undefined)) {
        if (role !== "owner") return res.status(403).json({ message: "only_owner_can_edit_conversation" });
        await storage.updateConversation(id, {
          ...(body.isClosed !== undefined ? { isClosed: body.isClosed } : {}),
          ...(body.allowCalls !== undefined ? { allowCalls: body.allowCalls } : {}),
        });
      }
      if (Array.isArray(body.addParticipantIds)) {
        if (role !== "owner") return res.status(403).json({ message: "only_owner_can_add_members" });
        const canAddMembers =
          conv.type === "group" || (conv.type === "channel" && conv.isClosed);
        if (!canAddMembers) {
          return res.status(400).json({ message: "members_can_be_added_only_to_groups_or_closed_channels" });
        }
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

  // Soft-delete group or channel (owner only)
  app.delete("/api/conversations/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const role = await storage.getParticipantRole(id, currentUserId);
      if (role !== "owner") return res.status(403).json({ message: "only_owner_can_delete_conversation" });
      const deleted = await storage.markConversationDeleted(id);
      if (!deleted) return res.status(404).json({ message: "Conversation not found" });
      res.json({ ok: true });
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ message: "Failed to delete conversation" });
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
  app.post("/api/conversations/:id/subscribe", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });
      const conv = await storage.getConversation(id);
      if (!conv || conv.type !== "channel") return res.status(404).json({ message: "Not a channel" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      const participantRole = inConv ? await storage.getParticipantRole(id, currentUserId) : undefined;
      const membershipStatus = inConv
        ? await storage.getParticipantMembershipStatus(id, currentUserId)
        : undefined;
      const channelCtx = buildChannelAccessContext(
        inConv,
        !!currentUser.isAdmin,
        participantRole,
        membershipStatus
      );
      if (!canUserSubscribeToChannel(conv, channelCtx)) {
        return res.status(403).json({ message: "Cannot subscribe to this channel" });
      }
      if (conv.isHidden) {
        await storage.addConversationParticipant(id, currentUserId, "member", undefined, "pending");
        await publishDoctorChatsUpdated(currentUserId);
        return res.json({ success: true, pending: true });
      }
      await storage.addConversationParticipant(id, currentUserId, "member");
      await publishDoctorChatsUpdated(currentUserId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error subscribing to channel:", error);
      res.status(500).json({ message: "Failed to subscribe" });
    }
  });

  app.post(
    "/api/conversations/:id/subscription-requests/:userId/approve",
    isAuthenticated,
    isAdmin,
    async (req: any, res) => {
      try {
        const { id, userId } = req.params;
        const currentUserId = await getCurrentUserId(req);
        if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
        const role = await storage.getParticipantRole(id, currentUserId);
        if (role !== "owner") return res.status(403).json({ message: "Only owner can approve subscriptions" });
        const conv = await storage.getConversation(id);
        if (!conv || conv.type !== "channel" || !conv.isHidden) {
          return res.status(400).json({ message: "Subscription approval only for hidden channels" });
        }
        const approved = await storage.approveChannelSubscription(id, userId);
        if (!approved) return res.status(404).json({ message: "Pending subscription not found" });
        await publishDoctorChatsUpdated(userId);
        res.json({ success: true });
      } catch (error) {
        console.error("Error approving channel subscription:", error);
        res.status(500).json({ message: "Failed to approve subscription" });
      }
    }
  );

  // Unsubscribe from channel
  app.delete("/api/conversations/:id/subscribe", isAuthenticated, async (req: any, res) => {
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

  // Channel sponsor settings
  app.get("/api/conversations/:id/sponsor-settings", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const conv = await storage.getConversation(id);
      if (!conv || conv.type !== "channel") {
        return res.status(404).json({ message: "Channel not found" });
      }
      const settings = await storage.getChannelSponsorSettings(id);
      const hasContentAccess = await storage.isActiveChannelSponsor(id, currentUserId);
      const isChannelSponsor = await storage.isActiveChannelSponsorListing(id, currentUserId);
      const contentExpiresAt = await storage.getParticipantSponsorExpiresAt(id, currentUserId);
      const channelSponsorExpiresAt = await storage.getParticipantSponsorListingExpiresAt(
        id,
        currentUserId
      );
      const role = await storage.getParticipantRole(id, currentUserId);
      const hasActiveSponsors =
        role === "owner" ? await storage.hasActiveMonetizationParticipants(id) : undefined;
      const hasPriorContentSubscription = await storage.hasPriorChannelContentSubscription(
        id,
        currentUserId
      );
      const contentRenewalDiscountPercent = settings?.contentRenewalDiscountPercent ?? 0;
      const contentDurationDays =
        settings?.contentDurationDays ?? settings?.durationDays ?? 30;
      const sponsorDurationDays =
        settings?.sponsorDurationDays ?? settings?.durationDays ?? 30;
      const tier1 = settings?.tier1Amount?.trim();
      const tier2 = settings?.tier2Amount?.trim();
      const contentTierResolved = isPositiveTierAmount(tier1)
        ? resolveContentTierAmount({
            baseAmount: tier1!,
            discountPercent: contentRenewalDiscountPercent,
            hasPriorContentSubscription,
          })
        : null;
      const tiers = [
        ...(contentTierResolved
          ? [
              {
                type: "content" as const,
                amount: contentTierResolved.amount,
                payableAmount: contentTierResolved.payableAmount,
                isRenewalDiscount: contentTierResolved.isRenewalDiscount,
                durationDays: contentDurationDays,
              },
            ]
          : []),
        ...(isPositiveTierAmount(tier2)
          ? [
              {
                type: "content_thanks" as const,
                amount: tier2!,
                payableAmount: tier2!,
                isRenewalDiscount: false,
                durationDays: sponsorDurationDays,
              },
            ]
          : []),
      ];
      res.json({
        enabled: settings?.enabled ?? false,
        paymentInstructions: settings?.paymentInstructions ?? null,
        tier1Amount: settings?.tier1Amount ?? null,
        tier2Amount: settings?.tier2Amount ?? null,
        durationDays: contentDurationDays,
        contentDurationDays,
        sponsorDurationDays,
        contentRenewalDiscountPercent,
        hasPriorContentSubscription,
        tiers,
        isSponsor: hasContentAccess,
        sponsorExpiresAt: contentExpiresAt?.toISOString() ?? null,
        hasContentAccess,
        isChannelSponsor,
        channelSponsorExpiresAt: channelSponsorExpiresAt?.toISOString() ?? null,
        ...(hasActiveSponsors !== undefined ? { hasActiveSponsors } : {}),
      });
    } catch (error) {
      console.error("Error fetching sponsor settings:", error);
      res.status(500).json({ message: "Failed to fetch sponsor settings" });
    }
  });

  app.patch("/api/conversations/:id/sponsor-settings", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const conv = await storage.getConversation(id);
      if (!conv || conv.type !== "channel") {
        return res.status(404).json({ message: "Channel not found" });
      }
      const role = await storage.getParticipantRole(id, currentUserId);
      if (role !== "owner") {
        return res.status(403).json({ message: "only_owner_can_edit_sponsor_settings" });
      }
      const body = req.body as {
        enabled?: boolean;
        paymentInstructions?: string | null;
        tier1Amount?: string | null;
        tier2Amount?: string | null;
        durationDays?: number;
        contentDurationDays?: number;
        sponsorDurationDays?: number;
        contentRenewalDiscountPercent?: number;
      };
      if (body.enabled === false && (await storage.hasActiveMonetizationParticipants(id))) {
        return res.status(400).json({ message: "cannot_disable_sponsor_monetization_with_active_sponsors" });
      }
      const parseDays = (value: unknown) =>
        typeof value === "number" && value > 0 ? Math.floor(value) : undefined;
      const parseDiscount = (value: unknown) =>
        typeof value === "number" && Number.isFinite(value)
          ? clampDiscountPercent(value)
          : undefined;
      const contentDurationDays =
        parseDays(body.contentDurationDays) ?? parseDays(body.durationDays);
      const sponsorDurationDays = parseDays(body.sponsorDurationDays) ?? parseDays(body.durationDays);
      const contentRenewalDiscountPercent = parseDiscount(body.contentRenewalDiscountPercent);
      const settings = await storage.upsertChannelSponsorSettings(id, {
        ...(body.enabled !== undefined ? { enabled: !!body.enabled } : {}),
        ...(body.paymentInstructions !== undefined
          ? { paymentInstructions: body.paymentInstructions }
          : {}),
        ...(body.tier1Amount !== undefined ? { tier1Amount: body.tier1Amount } : {}),
        ...(body.tier2Amount !== undefined ? { tier2Amount: body.tier2Amount } : {}),
        ...(contentDurationDays !== undefined ? { contentDurationDays } : {}),
        ...(sponsorDurationDays !== undefined ? { sponsorDurationDays } : {}),
        ...(contentRenewalDiscountPercent !== undefined
          ? { contentRenewalDiscountPercent }
          : {}),
      });
      res.json(settings);
    } catch (error) {
      console.error("Error updating sponsor settings:", error);
      res.status(500).json({ message: "Failed to update sponsor settings" });
    }
  });

  app.get("/api/conversations/:id/sponsor-payments", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const conv = await storage.getConversation(id);
      if (!conv || conv.type !== "channel") {
        return res.status(404).json({ message: "Channel not found" });
      }
      const role = await storage.getParticipantRole(id, currentUserId);
      const isOwner = role === "owner";
      const payments = await storage.getChannelSponsorPayments(
        id,
        isOwner ? undefined : { userId: currentUserId }
      );
      res.json(
        payments.map((p) => ({
          ...p,
          submittedAt: p.submittedAt?.toISOString() ?? null,
          validFrom: p.validFrom?.toISOString() ?? null,
          validUntil: p.validUntil?.toISOString() ?? null,
          reviewedAt: p.reviewedAt?.toISOString() ?? null,
          createdAt: p.createdAt?.toISOString() ?? null,
          updatedAt: p.updatedAt?.toISOString() ?? null,
          user: p.user
            ? {
                id: p.user.id,
                firstName: p.user.firstName,
                lastName: p.user.lastName,
                email: p.user.email,
              }
            : undefined,
        }))
      );
    } catch (error) {
      console.error("Error fetching sponsor payments:", error);
      res.status(500).json({ message: "Failed to fetch sponsor payments" });
    }
  });

  app.post("/api/conversations/:id/sponsor-payments", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });
      const conv = await storage.getConversation(id);
      if (!conv || conv.type !== "channel") {
        return res.status(404).json({ message: "Channel not found" });
      }
      const inConv = await storage.isUserInConversation(currentUserId, id);
      const participantRole = inConv ? await storage.getParticipantRole(id, currentUserId) : undefined;
      const membershipStatus = inConv
        ? await storage.getParticipantMembershipStatus(id, currentUserId)
        : undefined;
      const channelCtx = buildChannelAccessContext(
        inConv,
        !!currentUser.isAdmin,
        participantRole,
        membershipStatus
      );
      if (!canUserReadChannel(conv, channelCtx)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const body = req.body as {
        receiptUrl?: string;
        donationType?: string;
      };
      if (!body.receiptUrl?.trim()) {
        return res.status(400).json({ message: "receipt_required" });
      }
      if (body.donationType !== "content" && body.donationType !== "content_thanks") {
        return res.status(400).json({ message: "donation_type_required" });
      }
      const payment = await storage.submitChannelSponsorPayment(id, currentUserId, {
        receiptUrl: body.receiptUrl.trim(),
        donationType: body.donationType,
      });
      if (!inConv) {
        await publishDoctorChatsUpdated(currentUserId);
      }
      const payer = await storage.getUser(currentUserId);
      const participants = await storage.getConversationParticipants(id);
      const owner = participants.find((p) => p.role === "owner");
      if (owner) {
        const payerName = payer
          ? [payer.firstName, payer.lastName].filter(Boolean).join(" ").trim() || payer.email
          : "Пользователь";
        await sendPushToUsers([owner.userId], {
          title: conv.name ?? "Канал",
          body: `${payerName} прикрепил чек об оплате`,
          url: `/messenger/channel/${id}/settings?section=sponsor`,
          tag: `sponsor-payment-${payment.id}`,
        });
      }
      const sponsorExpiresAt = await storage.getParticipantSponsorExpiresAt(id, currentUserId);
      res.status(201).json({
        ...payment,
        submittedAt: payment.submittedAt?.toISOString() ?? null,
        validFrom: payment.validFrom?.toISOString() ?? null,
        validUntil: payment.validUntil?.toISOString() ?? null,
        sponsorExpiresAt: sponsorExpiresAt?.toISOString() ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit payment";
      if (message === "sponsor_monetization_disabled") {
        return res.status(400).json({ message });
      }
      if (message === "sponsor_tier_amount_not_configured") {
        return res.status(400).json({ message });
      }
      if (message === "cannot_join_channel") {
        return res.status(403).json({ message });
      }
      console.error("Error submitting sponsor payment:", error);
      res.status(500).json({ message: "Failed to submit payment" });
    }
  });

  app.post(
    "/api/conversations/:id/sponsor-payments/:paymentId/approve",
    isAuthenticated,
    isAdmin,
    async (req: any, res) => {
      try {
        const { id, paymentId } = req.params;
        const currentUserId = await getCurrentUserId(req);
        if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
        const role = await storage.getParticipantRole(id, currentUserId);
        if (role !== "owner") {
          return res.status(403).json({ message: "only_owner_can_review_payments" });
        }
        const updated = await storage.approveChannelSponsorPayment(paymentId, currentUserId);
        if (!updated || updated.conversationId !== id) {
          return res.status(404).json({ message: "Payment not found" });
        }
        res.json(updated);
      } catch (error) {
        console.error("Error approving sponsor payment:", error);
        res.status(500).json({ message: "Failed to approve payment" });
      }
    }
  );

  app.post(
    "/api/conversations/:id/sponsor-payments/:paymentId/dispute",
    isAuthenticated,
    isAdmin,
    async (req: any, res) => {
      try {
        const { id, paymentId } = req.params;
        const currentUserId = await getCurrentUserId(req);
        if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
        const role = await storage.getParticipantRole(id, currentUserId);
        if (role !== "owner") {
          return res.status(403).json({ message: "only_owner_can_review_payments" });
        }
        const body = req.body as { reason?: string | null };
        const updated = await storage.disputeChannelSponsorPayment(
          paymentId,
          currentUserId,
          body.reason ?? null
        );
        if (!updated || updated.conversationId !== id) {
          return res.status(404).json({ message: "Payment not found" });
        }
        const conv = await storage.getConversation(id);
        await sendPushToUsers([updated.userId], {
          title: conv?.name ?? "Канал",
          body: "Оплата оспорена. Статус спонсора снят.",
          url: `/messenger/channel/${id}/settings?section=sponsor`,
          tag: `sponsor-dispute-${paymentId}`,
        });
        res.json(updated);
      } catch (error) {
        console.error("Error disputing sponsor payment:", error);
        res.status(500).json({ message: "Failed to dispute payment" });
      }
    }
  );

  const fetchChannelSponsors = async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const conv = await storage.getConversation(id);
      if (!conv || conv.type !== "channel") {
        return res.status(404).json({ message: "Channel not found" });
      }
      const settings = await storage.getChannelSponsorSettings(id);
      if (!settings?.enabled) {
        return res.json([]);
      }
      const sponsors = await storage.getChannelSponsors(id);
      res.json(sponsors);
    } catch (error) {
      console.error("Error fetching channel sponsors:", error);
      res.status(500).json({ message: "Failed to fetch channel sponsors" });
    }
  };

  app.get("/api/conversations/:id/channel-sponsors", isAuthenticated, fetchChannelSponsors);
  app.get("/api/conversations/:id/sponsor-thanks", isAuthenticated, fetchChannelSponsors);

  app.patch(
    "/api/conversations/:id/sponsor-thanks-visibility",
    isAuthenticated,
    isAdmin,
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const currentUserId = await getCurrentUserId(req);
        if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
        const conv = await storage.getConversation(id);
        if (!conv || conv.type !== "channel") {
          return res.status(404).json({ message: "Channel not found" });
        }
        const body = req.body as { showInSponsorThanks?: boolean };
        if (typeof body.showInSponsorThanks !== "boolean") {
          return res.status(400).json({ message: "showInSponsorThanks_required" });
        }
        const ok = await storage.setShowInSponsorThanks(id, currentUserId, body.showInSponsorThanks);
        if (!ok) {
          return res.status(403).json({ message: "not_active_sponsor" });
        }
        res.json({ showInSponsorThanks: body.showInSponsorThanks });
      } catch (error) {
        console.error("Error updating sponsor thanks visibility:", error);
        res.status(500).json({ message: "Failed to update visibility" });
      }
    }
  );

  // Conversation message helpers
  const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;
  const RECENT_MESSAGES_LIMIT = 100;
  const DEFAULT_MESSAGES_PAGE_LIMIT = 30;
  const MAX_MESSAGES_PAGE_LIMIT = 50;

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
    currentUserId: string,
    sponsorFilter?: { monetizationEnabled: boolean; filterContent: boolean }
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
    const applySponsorFilter = (content: string | null | undefined) => {
      if (!content) {
        return { content: null as string | null, hasSponsorContent: false, isContentTruncated: false };
      }
      const hasPaid =
        sponsorFilter?.monetizationEnabled === true && hasSponsorSections(content);
      if (!sponsorFilter?.filterContent) {
        return { content, hasSponsorContent: hasPaid, isContentTruncated: false };
      }
      const filtered = filterMessageForNonSponsor(content, {
        monetizationEnabled: sponsorFilter.monetizationEnabled,
      });
      return {
        content: filtered.content,
        hasSponsorContent: filtered.hasSponsorContent,
        isContentTruncated: filtered.isTruncated,
      };
    };
    const base = messages.map((m) => {
      const replyTarget = m.replyToMessageId ? replyMap.get(m.replyToMessageId) : null;
      const replyAuthor = replyTarget ? userMap.get(replyTarget.authorUserId) : null;
      const mainContent = applySponsorFilter(m.content);
      const replyContent = replyTarget ? applySponsorFilter(replyTarget.content) : null;
      return {
        id: m.id,
        conversationId: m.conversationId,
        authorUserId: m.authorUserId,
        messageType: m.messageType,
        content: mainContent.content,
        hasSponsorContent: mainContent.hasSponsorContent,
        isContentTruncated: mainContent.isContentTruncated,
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
              content: replyContent?.content ?? null,
              imageUrl: replyTarget.imageUrl ?? null,
              messageType: replyTarget.messageType,
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

  const PATIENT_INVITE_SENT_MESSAGE = "Приглашение отправлено";
  const PATIENT_INVITE_ACCEPTED_MESSAGE = "Приглашение принято";

  async function postPatientChatStatusMessage(
    conversationId: string,
    authorUserId: string,
    text: string
  ): Promise<void> {
    const message = await storage.createConversationMessage({
      conversationId,
      authorUserId,
      messageType: "message",
      content: text,
    });
    const sponsorFilter = await getChannelSponsorFilterContext(conversationId, authorUserId, "patient");
    const [enriched] = await enrichConversationMessages([message], authorUserId, sponsorFilter);
    const [wsPayload] = await enrichConversationMessages([message], authorUserId, {
      monetizationEnabled: sponsorFilter.monetizationEnabled,
      filterContent: sponsorFilter.monetizationEnabled,
    });
    await pushConversationRecentMessage(conversationId, wsPayload);
    await publishConversationMessage(conversationId, wsPayload);
    void notifyMessengerConversationActivity(conversationId, authorUserId).catch((err) =>
      console.error("[DoctorChats] messenger conversation notify error:", err)
    );
    void enriched;
  }

  async function getChannelSponsorFilterContext(
    conversationId: string,
    userId: string,
    convType: string
  ): Promise<{ monetizationEnabled: boolean; filterContent: boolean }> {
    if (convType !== "channel") {
      return { monetizationEnabled: false, filterContent: false };
    }
    const settings = await storage.getChannelSponsorSettings(conversationId);
    const monetizationEnabled = settings?.enabled ?? false;
    if (!monetizationEnabled) {
      return { monetizationEnabled: false, filterContent: false };
    }
    const isSponsor = await storage.isActiveChannelSponsor(conversationId, userId);
    return { monetizationEnabled: true, filterContent: !isSponsor };
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
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      const participantRole = inConv ? await storage.getParticipantRole(id, currentUserId) : undefined;
      const membershipStatus = inConv
        ? await storage.getParticipantMembershipStatus(id, currentUserId)
        : undefined;
      const channelCtx = buildChannelAccessContext(
        inConv,
        !!currentUser.isAdmin,
        participantRole,
        membershipStatus
      );
      const canReadMessages =
        conv.type === "channel"
          ? canUserReadChannel(conv, channelCtx)
          : conv.type === "group"
            ? canUserReadGroup(conv, inConv, !!currentUser.isAdmin)
            : inConv;
      if (!canReadMessages) return res.status(403).json({ message: "Access denied" });
      const sponsorFilter = await getChannelSponsorFilterContext(id, currentUserId, conv.type);
      const rawLimit = parseInt(String(req.query.limit ?? DEFAULT_MESSAGES_PAGE_LIMIT), 10);
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), MAX_MESSAGES_PAGE_LIMIT)
        : DEFAULT_MESSAGES_PAGE_LIMIT;
      const before =
        typeof req.query.before === "string" && req.query.before.length > 0
          ? req.query.before
          : null;
      const { messages, hasMore } = await storage.getConversationMessagesBefore(id, before, limit);
      const withAuthors = await enrichConversationMessages(messages, currentUserId, sponsorFilter);
      const nextBefore = withAuthors.length > 0 ? withAuthors[0]!.id : null;
      res.json({
        items: withAuthors,
        hasMore,
        nextBefore: hasMore ? nextBefore : null,
      });
      if (!before) {
        const recentForCache = await storage.getConversationMessagesRecent(id, RECENT_MESSAGES_LIMIT);
        const enrichedForCache = await enrichConversationMessages(
          recentForCache,
          currentUserId,
          sponsorFilter
        );
        backfillConversationRecent(id, enrichedForCache).catch((err) =>
          console.error("Redis backfill conv:", err)
        );
      }
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
        voiceDurationSec?: number;
        videoPosterUrl?: string;
        fileName?: string;
        fileSize?: number;
        fileMimeType?: string;
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
        } else if (messageType === "voice") {
          if (!imageUrl) {
            return res.status(400).json({ message: "Voice message requires audio" });
          }
          const parsed = voicePayloadSchema.parse({
            durationSec: Math.round(Number(body.voiceDurationSec ?? 0)),
          });
          content = JSON.stringify(parsed);
        } else if (messageType === "video") {
          if (!imageUrl) {
            return res.status(400).json({ message: "Video message requires video" });
          }
          const parsed = videoPayloadSchema.parse({
            posterUrl: body.videoPosterUrl?.trim() || undefined,
          });
          content = parsed.posterUrl ? JSON.stringify(parsed) : null;
        } else if (messageType === "file") {
          if (!imageUrl) {
            return res.status(400).json({ message: "File message requires attachment" });
          }
          const parsed = filePayloadSchema.parse({
            name: body.fileName,
            size: Math.round(Number(body.fileSize ?? 0)),
            mimeType: body.fileMimeType || "application/octet-stream",
          });
          content = JSON.stringify(parsed);
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
        if (!template.isShared) {
          await storage.updateQuestionnaireTemplate(template.id, currentUserId, { isShared: true });
        }
        const payload = questionnaireTemplateMessageContentSchema.parse({
          templateId: template.id,
          templateName: template.name,
          snapshot: deepCloneQuestionnaireStructure(template.structure as QuestionnaireTemplateStructure),
          hintsMode: parseQuestionnaireHintsMode(template.hintsMode),
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
            hintsModeSnapshot: parseQuestionnaireHintsMode(template.hintsMode),
          });
          const payload = questionnaireMessageContentSchema.parse({
            instanceId: instance.id,
            templateName: template.name,
          });
          const updatedContent = JSON.stringify(payload);
          await storage.editConversationMessage(message.id, { content: updatedContent });
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

      const sponsorFilter = await getChannelSponsorFilterContext(id, currentUserId, conv.type);
      const [enriched] = await enrichConversationMessages([finalMessage], currentUserId, sponsorFilter);
      const [wsPayload] = await enrichConversationMessages([finalMessage], currentUserId, {
        monetizationEnabled: sponsorFilter.monetizationEnabled,
        filterContent: sponsorFilter.monetizationEnabled,
      });
      await pushConversationRecentMessage(id, wsPayload);
      await publishConversationMessage(id, wsPayload);
      void notifyConversationNewMessage(id, currentUserId, enriched).catch((err) =>
        console.error("[Push] conversation notify error:", err)
      );
      void notifyMessengerConversationActivity(id, currentUserId).catch((err) =>
        console.error("[DoctorChats] messenger conversation notify error:", err)
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

  // ---- Voice conferences (LiveKit) ----

  // Start a voice conference in a conversation.
  app.post("/api/conversations/:id/calls", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      if (!isLiveKitConfigured()) {
        return res.status(503).json({ message: "Voice calls are not configured" });
      }
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      if (!isCallableConversationType(conv.type)) {
        return res.status(400).json({ message: "Calls are not allowed in this chat" });
      }
      if (conv.type === "group" && !conv.allowCalls) {
        return res.status(403).json({ message: "calls_disabled_in_group" });
      }
      if (isLiveKitConfigured()) {
        await reconcileConversationCallBeforeStart(id);
      }
      const existing = await storage.getActiveCallForConversation(id);
      if (existing) {
        return res.status(409).json({ message: "A call is already in progress", callId: existing.id });
      }
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });

      let state;
      try {
        state = await startCall(id, currentUser);
      } catch (err) {
        // Unique partial index race: another call started concurrently.
        const again = await storage.getActiveCallForConversation(id);
        if (again) {
          return res.status(409).json({ message: "A call is already in progress", callId: again.id });
        }
        throw err;
      }
      const token = await createCallAccessToken(state.id, currentUser);
      res.status(201).json({ call: state, token, livekitUrl: getLiveKitUrl() });
    } catch (error) {
      console.error("Error starting call:", error);
      res.status(500).json({ message: "Failed to start call" });
    }
  });

  // Get the active call for a conversation (UI restore on open).
  app.get("/api/conversations/:id/calls/active", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      let call = await storage.getActiveCallForConversation(id, currentUserId);
      if (call && isLiveKitConfigured()) {
        const ended = await reconcileStaleCall(call);
        if (ended) call = undefined;
      }
      if (!call) return res.json({ call: null });
      const state = await getCallStateDto(call.id);
      res.json({ call: state });
    } catch (error) {
      console.error("Error fetching active call:", error);
      res.status(500).json({ message: "Failed to fetch active call" });
    }
  });

  // Accept (join) a call — returns a LiveKit token.
  app.post("/api/conversations/:id/calls/:callId/accept", isAuthenticated, async (req: any, res) => {
    try {
      const { id, callId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const call = await storage.getCallById(callId);
      if (!call || call.conversationId !== id) {
        return res.status(404).json({ message: "Call not found" });
      }
      if (call.status === "ended" || call.status === "cancelled") {
        return res.status(409).json({ message: "Call has ended" });
      }
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) return res.status(401).json({ message: "Unauthorized" });
      await acceptCall(call, currentUserId);
      const token = await createCallAccessToken(call.id, currentUser);
      const state = await getCallStateDto(call.id);
      res.json({ call: state, token, livekitUrl: getLiveKitUrl() });
    } catch (error) {
      console.error("Error accepting call:", error);
      res.status(500).json({ message: "Failed to accept call" });
    }
  });

  // Decline a call.
  app.post("/api/conversations/:id/calls/:callId/decline", isAuthenticated, async (req: any, res) => {
    try {
      const { id, callId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const call = await storage.getCallById(callId);
      if (!call || call.conversationId !== id) {
        return res.status(404).json({ message: "Call not found" });
      }
      await declineCall(call, currentUserId);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error declining call:", error);
      res.status(500).json({ message: "Failed to decline call" });
    }
  });

  // Leave a call (the participant disconnects).
  app.post("/api/conversations/:id/calls/:callId/leave", isAuthenticated, async (req: any, res) => {
    try {
      const { id, callId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const call = await storage.getCallById(callId);
      if (!call || call.conversationId !== id) {
        return res.status(404).json({ message: "Call not found" });
      }
      await leaveCall(call, currentUserId);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error leaving call:", error);
      res.status(500).json({ message: "Failed to leave call" });
    }
  });

  // End the whole call (initiator or any joined participant).
  app.post("/api/conversations/:id/calls/:callId/end", isAuthenticated, async (req: any, res) => {
    try {
      const { id, callId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const call = await storage.getCallById(callId);
      if (!call || call.conversationId !== id) {
        return res.status(404).json({ message: "Call not found" });
      }
      await endCall(call, "ended");
      res.json({ ok: true });
    } catch (error) {
      console.error("Error ending call:", error);
      res.status(500).json({ message: "Failed to end call" });
    }
  });

  // Edit conversation message (author only; 48h limit except channel posts)
  app.patch("/api/conversations/:id/messages/:messageId", isAuthenticated, async (req: any, res) => {
    try {
      const { id, messageId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const conv = await storage.getConversation(id);
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
      if (existing.messageType === "voice" || existing.messageType === "file") {
        return res.status(400).json({ message: "Cannot edit this message type" });
      }
      if (existing.deletedAt) return res.status(400).json({ message: "Message deleted" });
      const createdAt = existing.createdAt instanceof Date ? existing.createdAt.getTime() : new Date(String(existing.createdAt)).getTime();
      if (conv?.type !== "channel" && Date.now() - createdAt > EDIT_WINDOW_MS) {
        return res.status(400).json({ message: "Edit window expired" });
      }

      const body = req.body as {
        content?: string;
        imageUrl?: string;
        videoPosterUrl?: string;
      };

      if (existing.messageType === "video" && body.imageUrl) {
        const parsed = videoPayloadSchema.parse({
          posterUrl: body.videoPosterUrl?.trim() || undefined,
        });
        const content = parsed.posterUrl ? JSON.stringify(parsed) : null;
        const attachmentBefore = {
          imageUrl: existing.imageUrl,
          content: existing.content,
          messageType: existing.messageType,
        };
        const updated = await storage.editConversationMessage(messageId, {
          content,
          imageUrl: body.imageUrl,
        });
        if (!updated) return res.status(404).json({ message: "Message not found" });
        await cleanupReplacedMessageAttachments(attachmentBefore, {
          imageUrl: updated.imageUrl,
          content: updated.content,
          messageType: updated.messageType,
        });
        const editedAt = (updated.editedAt instanceof Date ? updated.editedAt : new Date()).toISOString();
        await syncConversationRecentCache(id, currentUserId);
        await publishConversationMessageEdited(id, {
          conversationId: id,
          messageId,
          content: updated.content ?? null,
          imageUrl: updated.imageUrl ?? null,
          editedAt,
        });
        return res.json({
          ok: true,
          content: updated.content ?? null,
          imageUrl: updated.imageUrl ?? null,
          editedAt,
        });
      }

      const content = (body.content ?? "").toString().trim();
      if (!content) return res.status(400).json({ message: "Content required" });
      const updated = await storage.editConversationMessage(messageId, { content });
      if (!updated) return res.status(404).json({ message: "Message not found" });
      const editedAt = (updated.editedAt instanceof Date ? updated.editedAt : new Date()).toISOString();
      await syncConversationRecentCache(id, currentUserId);
      await publishConversationMessageEdited(id, {
        conversationId: id,
        messageId,
        content: updated.content ?? null,
        editedAt,
      });
      res.json({ ok: true, content: updated.content ?? null, editedAt });
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
      const attachmentSnapshot = {
        imageUrl: existing.imageUrl,
        content: existing.content,
        messageType: existing.messageType,
      };
      const updated = await storage.softDeleteConversationMessage(messageId);
      if (!updated) return res.status(404).json({ message: "Message not found" });
      await cleanupMessageAttachments(attachmentSnapshot);
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
      if (poll.quizMode) {
        const priorStates = await storage.getConversationPollStates(
          [{ messageId, optionCount }],
          currentUserId
        );
        const prior = priorStates.get(messageId);
        if (prior && prior.selectedOptionIndices.length > 0) {
          return res.status(400).json({ message: "Quiz votes cannot be changed" });
        }
        if (unique.length !== 1) {
          return res.status(400).json({ message: "Quiz requires exactly one answer" });
        }
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
        const attachmentSnapshot = { imageUrl: comment.imageUrl };
        const updated = await storage.softDeleteConversationMessageComment(commentId);
        if (!updated) return res.status(404).json({ message: "Comment not found" });
        await cleanupCommentAttachments(attachmentSnapshot);
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
