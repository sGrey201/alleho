import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { db } from "./db";
import { users, payments, articles } from "@shared/schema";
import { sql, eq, desc } from "drizzle-orm";
import { isAuthenticated, isAdmin } from "./emailAuth";
import { login, requestPasswordReset, resetPassword, getEmailUser, logoutEmail } from "./emailAuth";
import { sendReceiptEmail, sendInviteEmail, sendInviteAccessEmail } from "./email";
import { insertArticleSchema, updateArticleSchema, insertTagSchema, updateTagSchema, tagCategoryEnum, type QuestionnaireData } from "@shared/schema";
import { truncateHtml } from "./utils/htmlTruncate";
import { invalidateCache, invalidateTagCache } from "./prerender";
import {
  insertHealthWallMessageSchema,
  insertConversationSchema,
  insertConversationMessageSchema,
  type QuestionnaireData as QData,
} from "@shared/schema";
import {
  getHealthWallRecentMessages,
  pushHealthWallRecentMessage,
  publishHealthWallMessage,
  publishDoctorChatsUpdated,
  backfillHealthWallRecent,
  getConversationRecentMessages,
  pushConversationRecentMessage,
  publishConversationMessage,
  backfillConversationRecent,
} from "./redis";
import { setupWebSocket } from "./ws";

const PREVIEW_LENGTH = 500;
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

async function checkSubscription(req: any): Promise<boolean> {
  const session = req.session as any;
  
  if (session?.userId && session?.authType === 'email') {
    const user = await storage.getUser(session.userId);
    return user?.subscriptionExpiresAt 
      ? new Date(user.subscriptionExpiresAt) > new Date() 
      : false;
  }
  
  return false;
}

async function getCurrentUserId(req: any): Promise<string | null> {
  const session = req.session as any;
  
  if (session?.userId && session?.authType === 'email') {
    return session.userId;
  }
  
  return null;
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
  const useMemorySessionStore = process.env.NODE_ENV === "development";
  const activeSessionStore = useMemorySessionStore
    ? new session.MemoryStore()
    : sessionStore;
  console.log("[routes] registerRoutes: session store configured");
  app.use(session({
    secret: process.env.SESSION_SECRET,
    store: activeSessionStore,
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
      const baseUrl = process.env.APP_URL || 'https://alleho.ru';
      
      const articles = await storage.getAllArticles();
      
      const staticPages: Array<{ loc: string; priority: string; changefreq: string; lastmod?: string }> = [
        { loc: '/', priority: '1.0', changefreq: 'daily' },
        { loc: '/remedies', priority: '0.9', changefreq: 'weekly' },
        { loc: '/situations', priority: '0.9', changefreq: 'weekly' },
        { loc: '/subscribe', priority: '0.8', changefreq: 'monthly' },
        { loc: '/about', priority: '0.6', changefreq: 'monthly' },
        { loc: '/terms', priority: '0.3', changefreq: 'yearly' },
        { loc: '/oferta', priority: '0.3', changefreq: 'yearly' },
      ];
      
      const articleUrls = articles.map(article => ({
        loc: `/article/${article.slug}`,
        priority: '0.7',
        changefreq: 'weekly',
        lastmod: article.updatedAt ? new Date(article.updatedAt).toISOString().split('T')[0] : undefined,
      }));
      
      const allUrls = [...staticPages, ...articleUrls];
      
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
  app.get('/api/auth/email-user', getEmailUser);
  app.post('/api/auth/logout', logoutEmail);

  // Auth routes (email auth only)
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      const session = req.session as any;
      
      if (session?.userId && session?.authType === 'email') {
        const user = await storage.getUser(session.userId);
        if (user) {
          return res.json({
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
            authType: 'email',
          });
        }
      }
      
      return res.status(401).json({ message: "Unauthorized" });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get('/api/invites/profile-summary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const inviter = await storage.getInviterOfUser(userId);
      const invitedCount = await storage.getAcceptedInvitesCountByUser(userId);

      res.json({
        inviter: inviter
          ? {
              id: inviter.id,
              email: inviter.email,
              firstName: inviter.firstName,
              lastName: inviter.lastName,
            }
          : null,
        invitedCount,
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
        const existingUser = await storage.getUserByEmail(email);
        if (existingUser) return res.status(409).json({ message: "user_exists" });
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
      const baseUrl = process.env.APP_URL || "https://alleho.ru";
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
      if (existingUser) {
        return res.status(409).json({ message: "user_exists" });
      }

      const generatePassword = () => {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        let pass = "";
        for (let i = 0; i < 10; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
        return pass;
      };

      const password = generatePassword();
      const bcrypt = await import("bcryptjs");
      const passwordHash = await bcrypt.hash(password, 10);
      const newUser = await storage.createUserWithPassword(email, passwordHash);

      if (invite.inviteType === "homeopath") {
        await storage.updateUserProfile(newUser.id, { isAdmin: true });
      } else {
        await storage.addHealthWallDoctor(newUser.id, invite.invitedByUserId);
        await publishDoctorChatsUpdated(invite.invitedByUserId);
      }

      await storage.markInviteAccepted(invite.id, newUser.id, email);
      await sendInviteAccessEmail(email, password);

      (req.session as any).userId = newUser.id;
      (req.session as any).authType = "email";

      res.json({
        id: newUser.id,
        email: newUser.email,
        isAdmin: invite.inviteType === "homeopath" ? true : newUser.isAdmin,
      });
    } catch (error) {
      console.error("Error accepting invite:", error);
      res.status(500).json({ message: "Failed to accept invite" });
    }
  });

  // Public article routes (accessible to everyone, preview for non-subscribers)
  app.get('/api/articles', async (req: any, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    try {
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset, 10) : undefined;
      const articlesList = await storage.getAllArticles({ limit, offset });
      const hasActiveSubscription = await checkSubscription(req);
      const userId = await getCurrentUserId(req);

      // Get likes info for all articles in one query
      const articleIds = articlesList.map(a => a.id);
      const likesInfo = await storage.getBulkArticleLikesInfo(articleIds, userId || undefined);

      // Add likes info to articles
      const articlesWithLikes = articlesList.map(article => {
        const likes = likesInfo.get(article.id) || { likesCount: 0, userLiked: false };
        return {
          ...article,
          content: (!hasActiveSubscription && !article.isFree) 
            ? truncateHtml(article.content, PREVIEW_LENGTH) 
            : article.content,
          likesCount: likes.likesCount,
          userLiked: likes.userLiked,
        };
      });

      res.json(articlesWithLikes);
    } catch (error) {
      console.error("Error fetching articles:", error);
      res.status(500).json({ message: "Failed to fetch articles" });
    }
  });

  app.get('/api/articles/slug/:slug', async (req: any, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    try {
      const article = await storage.getArticleBySlug(req.params.slug);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }

      const hasActiveSubscription = await checkSubscription(req);

      if (!hasActiveSubscription && !article.isFree) {
        const previewArticle = {
          ...article,
          content: truncateHtml(article.content, PREVIEW_LENGTH),
        };
        return res.json(previewArticle);
      }

      res.json(article);
    } catch (error) {
      console.error("Error fetching article:", error);
      res.status(500).json({ message: "Failed to fetch article" });
    }
  });

  app.get('/api/articles/:id', async (req: any, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    try {
      const article = await storage.getArticleById(req.params.id);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }

      const hasActiveSubscription = await checkSubscription(req);

      if (!hasActiveSubscription && !article.isFree) {
        const previewArticle = {
          ...article,
          content: truncateHtml(article.content, PREVIEW_LENGTH),
        };
        return res.json(previewArticle);
      }

      res.json(article);
    } catch (error) {
      console.error("Error fetching article:", error);
      res.status(500).json({ message: "Failed to fetch article" });
    }
  });

  // Search articles
  app.get('/api/articles/search/:query', async (req: any, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    try {
      const { query } = req.params;
      const results = await storage.searchArticles(query);
      const hasActiveSubscription = await checkSubscription(req);

      if (!hasActiveSubscription) {
        const previewResults = results.map(article => ({
          ...article,
          content: article.isFree ? article.content : truncateHtml(article.content, PREVIEW_LENGTH),
        }));
        return res.json(previewResults);
      }

      res.json(results);
    } catch (error) {
      console.error("Error searching articles:", error);
      res.status(500).json({ message: "Failed to search articles" });
    }
  });

  // Article like routes
  app.get('/api/articles/:id/likes', async (req: any, res) => {
    try {
      const { id } = req.params;
      const session = req.session as any;
      const userId = session?.userId;
      
      const likesInfo = await storage.getArticleLikesInfo(id, userId);
      res.json(likesInfo);
    } catch (error) {
      console.error("Error fetching likes:", error);
      res.status(500).json({ message: "Failed to fetch likes" });
    }
  });

  app.post('/api/articles/:id/like', async (req: any, res) => {
    try {
      const { id } = req.params;
      const session = req.session as any;
      
      if (!session?.userId) {
        return res.status(401).json({ message: "Необходимо войти в систему" });
      }
      
      const article = await storage.getArticleById(id);
      if (!article) {
        return res.status(404).json({ message: "Статья не найдена" });
      }
      
      if (!article.isFree) {
        const hasActiveSubscription = await checkSubscription(req);
        if (!hasActiveSubscription) {
          return res.status(403).json({ message: "Требуется подписка для лайка этой статьи" });
        }
      }
      
      const result = await storage.toggleLike(id, session.userId);
      res.json(result);
    } catch (error) {
      console.error("Error toggling like:", error);
      res.status(500).json({ message: "Failed to toggle like" });
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

  // Admin tag routes
  app.post('/api/admin/tags', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const validatedData = insertTagSchema.parse(req.body);
      const tag = await storage.createTag(validatedData);
      invalidateTagCache(tag.category as 'remedy' | 'situation');
      res.json(tag);
    } catch (error) {
      console.error("Error creating tag:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid tag data" });
      }
      res.status(500).json({ message: "Failed to create tag" });
    }
  });

  app.put('/api/admin/tags/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = updateTagSchema.parse(req.body);
      const tag = await storage.updateTag(id, validatedData);
      if (!tag) {
        return res.status(404).json({ message: "Tag not found" });
      }
      invalidateTagCache();
      res.json(tag);
    } catch (error) {
      console.error("Error updating tag:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid tag data" });
      }
      res.status(500).json({ message: "Failed to update tag" });
    }
  });

  app.delete('/api/admin/tags/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteTag(id);
      if (!deleted) {
        return res.status(404).json({ message: "Tag not found" });
      }
      invalidateTagCache();
      res.json({ message: "Tag deleted successfully" });
    } catch (error) {
      console.error("Error deleting tag:", error);
      res.status(500).json({ message: "Failed to delete tag" });
    }
  });


  // Admin stats - fast count query
  app.get('/api/admin/stats', isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const [[articlesResult], [usersResult]] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(articles),
        db.select({ count: sql<number>`count(*)::int` }).from(users),
      ]);
      res.json({
        articlesCount: articlesResult?.count || 0,
        usersCount: usersResult?.count || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Admin article routes
  app.get('/api/admin/articles', isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const articlesList = await storage.getAllArticles();
      res.json(articlesList);
    } catch (error) {
      console.error("Error fetching articles:", error);
      res.status(500).json({ message: "Failed to fetch articles" });
    }
  });

  app.post('/api/admin/articles', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { tagIds, ...articleData } = req.body;
      const validatedData = insertArticleSchema.parse(articleData);
      
      // Validate tagIds
      let validatedTagIds: string[] = [];
      if (tagIds) {
        if (!Array.isArray(tagIds)) {
          return res.status(400).json({ message: "tagIds must be an array" });
        }
        
        // Deduplicate and validate format
        const uniqueTagIds = Array.from(new Set(tagIds));
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        for (const id of uniqueTagIds) {
          if (typeof id !== 'string' || !uuidRegex.test(id)) {
            return res.status(400).json({ message: "Invalid tag ID format" });
          }
        }
        
        // Verify all tags exist
        const existingTags = await storage.getTagsByIds(uniqueTagIds);
        if (existingTags.length !== uniqueTagIds.length) {
          return res.status(400).json({ message: "One or more tag IDs do not exist" });
        }
        
        validatedTagIds = uniqueTagIds;
      }
      
      const article = await storage.createArticle(validatedData, validatedTagIds);
      invalidateCache(article.slug);
      res.json(article);
    } catch (error) {
      console.error("Error creating article:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid article data" });
      }
      res.status(500).json({ message: "Failed to create article" });
    }
  });

  app.put('/api/admin/articles/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { tagIds, ...articleData } = req.body;
      const validatedData = updateArticleSchema.parse(articleData);
      
      // Validate tagIds if provided
      let validatedTagIds: string[] | undefined = undefined;
      if (tagIds !== undefined) {
        if (!Array.isArray(tagIds)) {
          return res.status(400).json({ message: "tagIds must be an array" });
        }
        
        // Deduplicate and validate format
        const uniqueTagIds = Array.from(new Set(tagIds));
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        for (const id of uniqueTagIds) {
          if (typeof id !== 'string' || !uuidRegex.test(id)) {
            return res.status(400).json({ message: "Invalid tag ID format" });
          }
        }
        
        // Verify all tags exist
        const existingTags = await storage.getTagsByIds(uniqueTagIds);
        if (existingTags.length !== uniqueTagIds.length) {
          return res.status(400).json({ message: "One or more tag IDs do not exist" });
        }
        
        validatedTagIds = uniqueTagIds;
      }
      
      const article = await storage.updateArticle(req.params.id, validatedData, validatedTagIds);
      invalidateCache(article.slug);
      res.json(article);
    } catch (error) {
      console.error("Error updating article:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid article data" });
      }
      res.status(500).json({ message: "Failed to update article" });
    }
  });

  app.delete('/api/admin/articles/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const article = await storage.getArticleById(req.params.id);
      await storage.deleteArticle(req.params.id);
      if (article) {
        invalidateCache(article.slug);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting article:", error);
      res.status(500).json({ message: "Failed to delete article" });
    }
  });

  // Admin user/subscription routes
  app.get('/api/admin/users', isAuthenticated, isAdmin, async (_req, res) => {
    try {
      // Get all users with their last successful payment date
      const usersWithPayments = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          isAdmin: users.isAdmin,
          subscriptionExpiresAt: users.subscriptionExpiresAt,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          lastPaymentDate: sql<Date | null>`(
            SELECT MAX(p.created_at) 
            FROM payments p 
            WHERE p.user_id = users.id 
            AND p.status = 'completed'
          )`.as('last_payment_date'),
        })
        .from(users)
        .orderBy(sql`(
          SELECT MAX(p.created_at) 
          FROM payments p 
          WHERE p.user_id = users.id 
          AND p.status = 'completed'
        ) DESC NULLS LAST`);
      
      res.json(usersWithPayments);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get user's payment history
  app.get('/api/admin/users/:id/payments', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.userId, req.params.id))
        .orderBy(desc(payments.createdAt));
      
      res.json(userPayments);
    } catch (error) {
      console.error("Error fetching user payments:", error);
      res.status(500).json({ message: "Failed to fetch user payments" });
    }
  });

  // Update payment receipt URL and send email to user
  app.put('/api/admin/payments/:id/receipt', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { receiptUrl } = req.body;
      const [updated] = await db
        .update(payments)
        .set({ receiptUrl, updatedAt: new Date() })
        .where(eq(payments.id, req.params.id))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ message: "Payment not found" });
      }

      // Send receipt email to user
      if (receiptUrl) {
        const [user] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, updated.userId));
        
        if (user?.email) {
          const paymentDate = updated.createdAt 
            ? new Date(updated.createdAt).toLocaleDateString('ru-RU')
            : 'неизвестно';
          
          try {
            await sendReceiptEmail(user.email, receiptUrl, updated.amount, paymentDate);
            console.log(`Receipt email sent to ${user.email}`);
          } catch (emailError) {
            console.error("Error sending receipt email:", emailError);
            // Don't fail the request if email fails
          }
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating receipt URL:", error);
      res.status(500).json({ message: "Failed to update receipt URL" });
    }
  });

  app.put('/api/admin/users/:id/subscription', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { subscriptionExpiresAt } = req.body;
      const expiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
      const user = await storage.updateUserSubscription(req.params.id, expiresAt);
      res.json(user);
    } catch (error) {
      console.error("Error updating subscription:", error);
      res.status(500).json({ message: "Failed to update subscription" });
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
        description = 'Подписка MateriaMedica на 6 месяцев';
      } else {
        // Renewal: 50% discount if subscription is still active
        amount = (hasActiveSubscription ? 1000 : 2000) / adminDiscount;
        description = hasActiveSubscription 
          ? 'Продление подписки MateriaMedica на 6 месяцев (скидка 50%)'
          : 'Продление подписки MateriaMedica на 6 месяцев';
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
      let invitedCount = 0;
      try {
        inviter = await storage.getInviterOfUser(targetUserId);
        invitedCount = await storage.getAcceptedInvitesCountByUser(targetUserId);
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
        invitedCount,
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
        profileImageUrl: profileImageUrl || null,
      });
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Questionnaire routes (available to all authenticated users for their own data)
  app.get('/api/questionnaire', isAuthenticated, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const questionnaire = await storage.getQuestionnaire(userId);
      res.json({ data: questionnaire?.data || {} });
    } catch (error) {
      console.error("Error fetching questionnaire:", error);
      res.status(500).json({ message: "Failed to fetch questionnaire" });
    }
  });

  app.post('/api/questionnaire', isAuthenticated, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const questionnaire = await storage.saveQuestionnaire(userId, req.body);
      res.json(questionnaire);
    } catch (error) {
      console.error("Error saving questionnaire:", error);
      res.status(500).json({ message: "Failed to save questionnaire" });
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

  /** Doctor may edit if linked on Health Wall (invite / health_wall_doctors) or listed in sharedWithEmails. */
  async function canDoctorAccessPatientQuestionnaire(
    doctorUserId: string,
    doctorEmail: string,
    patientId: string,
    existingData: QuestionnaireData | undefined
  ): Promise<boolean> {
    if (await storage.isHealthWallDoctorConnected(patientId, doctorUserId)) {
      return true;
    }
    return !!existingData?.sharedWithEmails?.includes(doctorEmail);
  }

  // Get a patient's questionnaire (Health Wall doctor or sharedWithEmails)
  app.get('/api/patient/:userId/questionnaire', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser?.email) {
        return res.status(400).json({ message: "User email not found" });
      }
      
      const patientId = req.params.userId;
      const questionnaire = await storage.getQuestionnaire(patientId);
      const patient = await storage.getUser(patientId);
      const patientPayload = {
        id: patient?.id,
        email: patient?.email,
        firstName: patient?.firstName,
        lastName: patient?.lastName,
        gender: patient?.gender,
        birthMonth: patient?.birthMonth,
        birthYear: patient?.birthYear,
        height: patient?.height,
        weight: patient?.weight,
        city: patient?.city,
      };

      if (!questionnaire) {
        if (!(await canDoctorAccessPatientQuestionnaire(currentUserId, currentUser.email, patientId, undefined))) {
          return res.status(404).json({ message: "Questionnaire not found" });
        }
        return res.json({
          data: {} as QuestionnaireData,
          patient: patientPayload,
          updatedAt: new Date().toISOString(),
        });
      }

      const data = questionnaire.data as QuestionnaireData;
      if (!(await canDoctorAccessPatientQuestionnaire(currentUserId, currentUser.email, patientId, data))) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json({
        data: questionnaire.data,
        patient: patientPayload,
        updatedAt:
          questionnaire.updatedAt instanceof Date
            ? questionnaire.updatedAt.toISOString()
            : questionnaire.updatedAt,
      });
    } catch (error) {
      console.error("Error fetching patient questionnaire:", error);
      res.status(500).json({ message: "Failed to fetch questionnaire" });
    }
  });

  // Save a patient's questionnaire (Health Wall doctor or sharedWithEmails)
  app.post('/api/patient/:userId/questionnaire', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser?.email) {
        return res.status(400).json({ message: "User email not found" });
      }
      
      const patientId = req.params.userId;
      const existingQuestionnaire = await storage.getQuestionnaire(patientId);
      const existingData = existingQuestionnaire?.data as QuestionnaireData | undefined;

      if (!(await canDoctorAccessPatientQuestionnaire(currentUserId, currentUser.email, patientId, existingData))) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Shallow merge: doctor UI may send a partial payload (e.g. stale cache); never wipe patient-filled fields.
      const incoming = (req.body || {}) as QuestionnaireData;
      const base = (existingData || {}) as Record<string, unknown>;
      const merged = { ...base, ...incoming } as QuestionnaireData;
      const questionnaire = await storage.saveQuestionnaire(patientId, merged);
      res.json(questionnaire);
    } catch (error) {
      console.error("Error saving patient questionnaire:", error);
      res.status(500).json({ message: "Failed to save questionnaire" });
    }
  });

  // Get patients who connected this doctor to their Health Wall
  app.get('/api/my-patients', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const doctorUserId = await getCurrentUserId(req);
      if (!doctorUserId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Get patients from health_wall_doctors table
      const connectedPatients = await storage.getHealthWallPatients(doctorUserId);
      
      const result = await Promise.all(connectedPatients.map(async ({ connection, patient }) => {
        // Get questionnaire for updatedAt only
        const questionnaire = await storage.getQuestionnaire(patient.id);
        const stats = await storage.getPatientHealthWallStats(patient.id, doctorUserId);
        
        // Use patient profile data, not questionnaire data
        return {
          id: connection.id,
          userId: patient.id,
          patientName: patient.firstName || patient.email,
          birthMonth: patient.birthMonth,
          birthYear: patient.birthYear,
          gender: patient.gender,
          email: patient.email,
          updatedAt: questionnaire?.updatedAt || connection.createdAt,
          unreadCount: stats.unreadCount,
          lastMessageAt: stats.lastMessageAt,
        };
      }));
      
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

  // Health Wall Routes

  // Check if current user can access a patient's health wall
  async function canAccessHealthWall(req: any, patientUserId: string): Promise<boolean> {
    const currentUserId = await getCurrentUserId(req);
    if (!currentUserId) return false;
    
    // User can access their own health wall
    if (currentUserId === patientUserId) return true;
    
    // Doctors can access if the patient connected them to their health wall
    const isConnected = await storage.isHealthWallDoctorConnected(patientUserId, currentUserId);
    return isConnected;
  }

  // Get health wall messages for a patient
  app.get('/api/health-wall/:patientUserId', isAuthenticated, async (req: any, res) => {
    try {
      const { patientUserId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      
      if (!await canAccessHealthWall(req, patientUserId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Track visits
      if (currentUserId) {
        if (currentUserId === patientUserId) {
          await storage.updatePatientLastVisit(patientUserId);
        } else {
          const isConnected = await storage.isHealthWallDoctorConnected(patientUserId, currentUserId);
          if (isConnected) {
            await storage.updateDoctorLastVisit(patientUserId, currentUserId);
          }
        }
      }

      const fromRedis = await getHealthWallRecentMessages(patientUserId);
      if (fromRedis.length > 0) {
        return res.json(fromRedis);
      }

      const messages = await storage.getHealthWallMessagesRecent(patientUserId, 100);
      const authorIds = Array.from(new Set(messages.map(m => m.authorUserId)));
      const authors = await Promise.all(authorIds.map(id => storage.getUser(id)));
      const authorMap = new Map(authors.filter(Boolean).map(u => [u!.id, u!]));
      const messagesWithAuthors = messages.map(msg => ({
        ...msg,
        createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : String(msg.createdAt),
        author: {
          id: msg.authorUserId,
          email: authorMap.get(msg.authorUserId)?.email,
          firstName: authorMap.get(msg.authorUserId)?.firstName,
          lastName: authorMap.get(msg.authorUserId)?.lastName,
          isAdmin: authorMap.get(msg.authorUserId)?.isAdmin,
        },
      }));
      res.json(messagesWithAuthors);
      backfillHealthWallRecent(patientUserId, messagesWithAuthors).catch((err) =>
        console.error("Redis backfill error:", err)
      );
    } catch (error) {
      console.error("Error fetching health wall messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post('/api/health-wall/:patientUserId/read', isAuthenticated, async (req: any, res) => {
    try {
      const { patientUserId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!await canAccessHealthWall(req, patientUserId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (currentUserId !== patientUserId) {
        const isConnected = await storage.isHealthWallDoctorConnected(patientUserId, currentUserId);
        if (isConnected) {
          await storage.updateDoctorLastVisit(patientUserId, currentUserId);
        }
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking health wall as read:", error);
      res.status(500).json({ message: "Failed to mark as read" });
    }
  });

  // Post a new message to health wall
  app.post('/api/health-wall/:patientUserId', isAuthenticated, async (req: any, res) => {
    try {
      const { patientUserId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      
      if (!currentUserId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      if (!await canAccessHealthWall(req, patientUserId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Only admins (doctors) can post prescriptions
      const currentUser = await storage.getUser(currentUserId);
      const messageType = req.body.messageType || 'message';
      if (messageType === 'prescription' && !currentUser?.isAdmin) {
        return res.status(403).json({ message: "Only doctors can post prescriptions" });
      }
      
      const validatedData = insertHealthWallMessageSchema.parse({
        patientUserId,
        authorUserId: currentUserId,
        messageType,
        content: req.body.content,
        imageUrl: req.body.imageUrl,
      });
      
      const message = await storage.createHealthWallMessage(validatedData);
      const messageWithAuthor = {
        ...message,
        createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : String(message.createdAt),
        author: {
          id: currentUserId,
          email: currentUser?.email,
          firstName: currentUser?.firstName,
          lastName: currentUser?.lastName,
          isAdmin: currentUser?.isAdmin,
        },
      };
      await pushHealthWallRecentMessage(patientUserId, messageWithAuthor);
      await publishHealthWallMessage(patientUserId, messageWithAuthor);
      res.json(messageWithAuthor);
    } catch (error) {
      console.error("Error posting health wall message:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid message data" });
      }
      res.status(500).json({ message: "Failed to post message" });
    }
  });

  // --- Messenger: paginated chat list for doctors ---
  app.get("/api/me/chats", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });

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
        const [contacts, connectedPatients] = await Promise.all([
          storage.getMessengerPersonalContacts(currentUserId),
          storage.getHealthWallPatients(currentUserId),
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
            lastMessageAt: contact.lastMessageAt?.toISOString() ?? null,
            lastVisitedAt: contact.lastVisitedAt?.toISOString() ?? null,
          };
        });
        const patientItems = await Promise.all(
          connectedPatients.map(async ({ patient }) => {
            const stats = await storage.getPatientHealthWallStats(patient.id, currentUserId);
            const patientName = [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() || patient.email || "Patient";
            return {
              source: "health_wall" as const,
              folder: "personal" as const,
              chatKind: "patient" as const,
              patientUserId: patient.id,
              patientName,
              patientEmail: patient.email,
              lastMessageAt: stats.lastMessageAt?.toISOString() ?? null,
              unreadCount: stats.unreadCount,
            };
          })
        );
        const items = [...patientItems, ...doctorItems];
        items.sort((a, b) => {
          const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          if (aTime !== bTime) return bTime - aTime;
          if (a.source !== b.source) return a.source === "health_wall" ? -1 : 1;
          const aName = a.source === "health_wall" ? a.patientName ?? a.patientEmail ?? "" : a.otherParticipantName ?? "";
          const bName = b.source === "health_wall" ? b.patientName ?? b.patientEmail ?? "" : b.otherParticipantName ?? "";
          return aName.localeCompare(bName, "ru");
        });
        return res.json(paged(items));
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
        }));
        return res.json(paged(items));
      }

      const convList = await storage.getConversationsForUser(currentUserId);
      const groups = await Promise.all(
        convList
          .filter((conv) => conv.type === "group" || conv.type === "consilium")
          .map(async (conv) => {
            const lastMsg = await storage.getLastConversationMessage(conv.id);
            const myRole = conv.participants.find((p) => p.userId === currentUserId)?.role ?? "member";
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
              lastMessageAt: lastMsg?.createdAt instanceof Date ? lastMsg.createdAt.toISOString() : lastMsg?.createdAt ?? null,
            };
          })
      );
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
  app.get("/api/messenger/direct/:userId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const { userId: partnerUserId } = req.params;
      if (partnerUserId === currentUserId) return res.status(400).json({ message: "Cannot open direct chat with yourself" });
      const partner = await storage.getUser(partnerUserId);
      if (!partner) return res.status(404).json({ message: "User not found" });
      if (!partner.isAdmin) return res.status(404).json({ message: "User not found" });
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
  app.get("/api/conversations/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      const participants = await storage.getConversationParticipants(id);
      res.json({ ...conv, participants });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation" });
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

  // Get conversation messages (Redis first, then DB)
  app.get("/api/conversations/:id/messages", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const fromRedis = await getConversationRecentMessages(id);
      if (fromRedis.length > 0) return res.json(fromRedis);
      const messages = await storage.getConversationMessagesRecent(id, 100);
      const authorIds = Array.from(new Set(messages.map((m) => m.authorUserId)));
      const authors = await Promise.all(authorIds.map((uid) => storage.getUser(uid)));
      const authorMap = new Map(authors.filter(Boolean).map((u) => [u!.id, u!]));
      const withAuthors = messages.map((msg) => ({
        ...msg,
        createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : String(msg.createdAt),
        author: {
          id: msg.authorUserId,
          email: authorMap.get(msg.authorUserId)?.email,
          firstName: authorMap.get(msg.authorUserId)?.firstName,
          lastName: authorMap.get(msg.authorUserId)?.lastName,
          isAdmin: authorMap.get(msg.authorUserId)?.isAdmin,
        },
      }));
      res.json(withAuthors);
      backfillConversationRecent(id, withAuthors).catch((err) => console.error("Redis backfill conv:", err));
    } catch (error) {
      console.error("Error fetching conversation messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Post conversation message
  app.post("/api/conversations/:id/messages", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUserId = await getCurrentUserId(req);
      if (!currentUserId) return res.status(401).json({ message: "Unauthorized" });
      const inConv = await storage.isUserInConversation(currentUserId, id);
      if (!inConv) return res.status(403).json({ message: "Access denied" });
      const conv = await storage.getConversation(id);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      const body = req.body as { content?: string; imageUrl?: string; messageType?: string };
      const validated = insertConversationMessageSchema.parse({
        conversationId: id,
        authorUserId: currentUserId,
        messageType: body.messageType ?? "message",
        content: body.content ?? null,
        imageUrl: body.imageUrl ?? null,
      });
      const message = await storage.createConversationMessage(validated);
      const currentUser = await storage.getUser(currentUserId);
      const messageWithAuthor = {
        ...message,
        createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : String(message.createdAt),
        author: {
          id: currentUserId,
          email: currentUser?.email,
          firstName: currentUser?.firstName,
          lastName: currentUser?.lastName,
          isAdmin: currentUser?.isAdmin,
        },
      };
      await pushConversationRecentMessage(id, messageWithAuthor);
      await publishConversationMessage(id, messageWithAuthor);
      res.status(201).json(messageWithAuthor);
    } catch (error) {
      console.error("Error posting conversation message:", error);
      if (error instanceof Error && error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid message data" });
      }
      res.status(500).json({ message: "Failed to post message" });
    }
  });

  // Get patient info for health wall header
  app.get('/api/health-wall/:patientUserId/info', isAuthenticated, async (req: any, res) => {
    try {
      const { patientUserId } = req.params;
      const currentUserId = await getCurrentUserId(req);
      
      if (!await canAccessHealthWall(req, patientUserId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const patient = await storage.getUser(patientUserId);
      
      // Get patient's last visit time for doctors viewing this patient
      let patientLastVisitedAt = null;
      if (currentUserId && currentUserId !== patientUserId) {
        patientLastVisitedAt = await storage.getPatientLastVisit(patientUserId);
      }
      
      // Use patient profile data, not questionnaire data
      res.json({
        id: patient?.id,
        email: patient?.email,
        patientName: patient?.firstName || patient?.email,
        birthMonth: patient?.birthMonth,
        birthYear: patient?.birthYear,
        gender: patient?.gender,
        height: patient?.height,
        weight: patient?.weight,
        city: patient?.city,
        patientLastVisitedAt,
      });
    } catch (error) {
      console.error("Error fetching patient info:", error);
      res.status(500).json({ message: "Failed to fetch patient info" });
    }
  });

  // Health Wall Doctors API

  // Get connected doctors for own health wall
  app.get('/api/health-wall/my/doctors', isAuthenticated, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const doctors = await storage.getHealthWallDoctors(userId);
      res.json(doctors.map(d => ({
        id: d.doctor.id,
        doctorUserId: d.user.id,
        email: d.user.email,
        firstName: d.user.firstName,
        lastName: d.user.lastName,
        createdAt: d.doctor.createdAt,
        lastVisitedAt: d.doctor.lastVisitedAt,
      })));
    } catch (error) {
      console.error("Error fetching connected doctors:", error);
      res.status(500).json({ message: "Failed to fetch connected doctors" });
    }
  });

  // Add doctor to own health wall by email
  app.post('/api/health-wall/my/doctors', isAuthenticated, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Find doctor by email
      const doctor = await storage.getUserByEmail(email);
      if (!doctor) {
        return res.status(404).json({ message: "User not found" });
      }

      // Can't add yourself
      if (doctor.id === userId) {
        return res.status(400).json({ message: "Cannot add yourself as a doctor" });
      }

      // Check if already connected
      const isConnected = await storage.isHealthWallDoctorConnected(userId, doctor.id);
      if (isConnected) {
        return res.status(400).json({ message: "Doctor already connected" });
      }

      const connection = await storage.addHealthWallDoctor(userId, doctor.id);
      res.json({
        id: connection.id,
        doctorUserId: doctor.id,
        email: doctor.email,
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        createdAt: connection.createdAt,
      });
    } catch (error) {
      console.error("Error adding doctor:", error);
      res.status(500).json({ message: "Failed to add doctor" });
    }
  });

  // Remove doctor from own health wall
  app.delete('/api/health-wall/my/doctors/:doctorUserId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { doctorUserId } = req.params;
      const removed = await storage.removeHealthWallDoctor(userId, doctorUserId);
      
      if (!removed) {
        return res.status(404).json({ message: "Doctor connection not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error removing doctor:", error);
      res.status(500).json({ message: "Failed to remove doctor" });
    }
  });

  // Get patients who connected this doctor (for doctors to see their patients)
  app.get('/api/health-wall/my/patients', isAuthenticated, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const patients = await storage.getHealthWallPatients(userId);
      
      // Get additional info for each patient
      const result = await Promise.all(patients.map(async (p) => {
        const stats = await storage.getPatientHealthWallStats(p.patient.id, userId);
        return {
          id: p.connection.id,
          patientUserId: p.patient.id,
          email: p.patient.email,
          firstName: p.patient.firstName,
          lastName: p.patient.lastName,
          birthMonth: p.patient.birthMonth,
          birthYear: p.patient.birthYear,
          createdAt: p.connection.createdAt,
          unreadCount: stats.unreadCount,
          lastMessageAt: stats.lastMessageAt,
        };
      }));

      res.json(result);
    } catch (error) {
      console.error("Error fetching patients:", error);
      res.status(500).json({ message: "Failed to fetch patients" });
    }
  });

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

      const existingUser = await storage.getUserByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(409).json({ message: "user_exists" });
      }

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
      const baseUrl = process.env.APP_URL || "https://alleho.ru";
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
  setupWebSocket(httpServer, activeSessionStore as Parameters<typeof setupWebSocket>[1], process.env.SESSION_SECRET!);
  console.log("[routes] registerRoutes: websocket ready");
  return httpServer;
}
