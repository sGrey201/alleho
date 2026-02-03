import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { users, payments, articles } from "@shared/schema";
import { sql, eq, desc } from "drizzle-orm";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";
import { register, login, requestPasswordReset, resetPassword, getEmailUser, logoutEmail } from "./emailAuth";
import { sendReceiptEmail } from "./email";
import { insertArticleSchema, updateArticleSchema, insertTagSchema, updateTagSchema, tagCategoryEnum, type QuestionnaireData } from "@shared/schema";
import { generatePaymentUrl, checkPayment, robokassa } from "./robokassa";
import { truncateHtml } from "./utils/htmlTruncate";
import { invalidateCache, invalidateTagCache } from "./prerender";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { insertHealthWallMessageSchema, type QuestionnaireData as QData } from "@shared/schema";

const PREVIEW_LENGTH = 500;

async function checkSubscription(req: any): Promise<boolean> {
  const session = req.session as any;
  
  // Check email auth
  if (session?.userId && session?.authType === 'email') {
    const user = await storage.getUser(session.userId);
    return user?.subscriptionExpiresAt 
      ? new Date(user.subscriptionExpiresAt) > new Date() 
      : false;
  }
  
  // Check Replit Auth
  if (req.isAuthenticated?.() && req.user?.claims?.sub) {
    const user = await storage.getUser(req.user.claims.sub);
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
  
  if (req.isAuthenticated?.() && req.user?.claims?.sub) {
    return req.user.claims.sub;
  }
  
  return null;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Sitemap.xml - dynamic generation
  app.get('/sitemap.xml', async (req, res) => {
    try {
      const baseUrl = process.env.APP_URL || 'https://materiamedica.pro';
      
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
  app.post('/api/auth/register', register);
  app.post('/api/auth/login', login);
  app.post('/api/auth/forgot-password', requestPasswordReset);
  app.post('/api/auth/reset-password', resetPassword);
  app.get('/api/auth/email-user', getEmailUser);
  app.post('/api/auth/logout', logoutEmail);

  // Auth routes (supports both Replit Auth and email auth)
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      const session = req.session as any;
      
      // Check email auth first
      if (session?.userId && session?.authType === 'email') {
        const user = await storage.getUser(session.userId);
        if (user) {
          return res.json({
            id: user.id,
            email: user.email,
            subscriptionExpiresAt: user.subscriptionExpiresAt,
            isAdmin: user.isAdmin,
            authType: 'email',
          });
        }
      }
      
      // Check Replit Auth
      if (req.isAuthenticated?.() && req.user?.claims?.sub) {
        const userId = req.user.claims.sub;
        const user = await storage.getUser(userId);
        if (user) {
          return res.json({
            ...user,
            authType: 'replit',
          });
        }
      }
      
      return res.status(401).json({ message: "Unauthorized" });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
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
      if (!robokassa) {
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
      const paymentUrl = generatePaymentUrl({
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
      if (!robokassa) {
        console.error('Robokassa not configured but received callback');
        return res.status(503).send('Payment system not configured');
      }

      // Validate signature
      const isValid = checkPayment(req.body);
      
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

  // Questionnaire routes (admin only)
  app.get('/api/questionnaire', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = await getCurrentUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const questionnaire = await storage.getQuestionnaire(userId);
      res.json(questionnaire?.data || {});
    } catch (error) {
      console.error("Error fetching questionnaire:", error);
      res.status(500).json({ message: "Failed to fetch questionnaire" });
    }
  });

  app.post('/api/questionnaire', isAuthenticated, isAdmin, async (req: any, res) => {
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

  // Get a patient's questionnaire (only if shared with current user)
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
      
      if (!questionnaire) {
        return res.status(404).json({ message: "Questionnaire not found" });
      }
      
      const data = questionnaire.data as QuestionnaireData;
      if (!data.sharedWithEmails?.includes(currentUser.email)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const patient = await storage.getUser(patientId);
      
      res.json({
        data: questionnaire.data,
        patient: {
          id: patient?.id,
          email: patient?.email,
          firstName: patient?.firstName,
          lastName: patient?.lastName,
        },
        updatedAt: questionnaire.updatedAt,
      });
    } catch (error) {
      console.error("Error fetching patient questionnaire:", error);
      res.status(500).json({ message: "Failed to fetch questionnaire" });
    }
  });

  // Save a patient's questionnaire (only if shared with current user)
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
      
      if (!existingQuestionnaire) {
        return res.status(404).json({ message: "Questionnaire not found" });
      }
      
      const existingData = existingQuestionnaire.data as QuestionnaireData;
      if (!existingData.sharedWithEmails?.includes(currentUser.email)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const questionnaire = await storage.saveQuestionnaire(patientId, req.body);
      res.json(questionnaire);
    } catch (error) {
      console.error("Error saving patient questionnaire:", error);
      res.status(500).json({ message: "Failed to save questionnaire" });
    }
  });

  // Get questionnaires shared with current user (My Patients)
  app.get('/api/my-patients', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const doctorUserId = await getCurrentUserId(req);
      if (!doctorUserId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const doctor = await storage.getUser(doctorUserId);
      if (!doctor?.email) {
        return res.status(400).json({ message: "User email not found" });
      }
      
      const sharedQuestionnaires = await storage.getQuestionnairesSharedWith(doctor.email);
      
      const result = await Promise.all(sharedQuestionnaires.map(async ({ questionnaire, user }) => {
        const stats = await storage.getPatientHealthWallStats(user.id, doctorUserId);
        return {
          id: questionnaire.id,
          userId: user.id,
          patientName: (questionnaire.data as any)?.patientName || user.firstName || user.email,
          birthMonth: (questionnaire.data as any)?.birthMonth,
          birthYear: (questionnaire.data as any)?.birthYear,
          gender: (questionnaire.data as any)?.gender,
          email: user.email,
          updatedAt: questionnaire.updatedAt,
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
    
    // Doctors (admins) can access if the patient shared their questionnaire with them
    const currentUser = await storage.getUser(currentUserId);
    if (!currentUser?.email || !currentUser.isAdmin) return false;
    
    const questionnaire = await storage.getQuestionnaire(patientUserId);
    if (!questionnaire) return false;
    
    const data = questionnaire.data as QData;
    return data.sharedWithEmails?.includes(currentUser.email) ?? false;
  }

  // Get health wall messages for a patient
  app.get('/api/health-wall/:patientUserId', isAuthenticated, async (req: any, res) => {
    try {
      const { patientUserId } = req.params;
      
      if (!await canAccessHealthWall(req, patientUserId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const messages = await storage.getHealthWallMessages(patientUserId);
      
      // Get author info for each message
      const authorIds = Array.from(new Set(messages.map(m => m.authorUserId)));
      const authors = await Promise.all(authorIds.map(id => storage.getUser(id)));
      const authorMap = new Map(authors.filter(Boolean).map(u => [u!.id, u!]));
      
      const messagesWithAuthors = messages.map(msg => ({
        ...msg,
        author: {
          id: msg.authorUserId,
          email: authorMap.get(msg.authorUserId)?.email,
          firstName: authorMap.get(msg.authorUserId)?.firstName,
          lastName: authorMap.get(msg.authorUserId)?.lastName,
          isAdmin: authorMap.get(msg.authorUserId)?.isAdmin,
        },
      }));
      
      res.json(messagesWithAuthors);
    } catch (error) {
      console.error("Error fetching health wall messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
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
      
      // Return with author info
      res.json({
        ...message,
        author: {
          id: currentUserId,
          email: currentUser?.email,
          firstName: currentUser?.firstName,
          lastName: currentUser?.lastName,
          isAdmin: currentUser?.isAdmin,
        },
      });
    } catch (error) {
      console.error("Error posting health wall message:", error);
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid message data" });
      }
      res.status(500).json({ message: "Failed to post message" });
    }
  });

  // Get patient info for health wall header
  app.get('/api/health-wall/:patientUserId/info', isAuthenticated, async (req: any, res) => {
    try {
      const { patientUserId } = req.params;
      
      if (!await canAccessHealthWall(req, patientUserId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const patient = await storage.getUser(patientUserId);
      const questionnaire = await storage.getQuestionnaire(patientUserId);
      const data = questionnaire?.data as QData | undefined;
      
      res.json({
        id: patient?.id,
        email: patient?.email,
        patientName: data?.patientName || patient?.firstName || patient?.email,
        birthMonth: data?.birthMonth,
        birthYear: data?.birthYear,
        gender: data?.gender,
      });
    } catch (error) {
      console.error("Error fetching patient info:", error);
      res.status(500).json({ message: "Failed to fetch patient info" });
    }
  });

  // Register object storage routes for file uploads
  registerObjectStorageRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
