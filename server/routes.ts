import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";
import { insertArticleSchema, updateArticleSchema, insertTagSchema, updateTagSchema, tagCategoryEnum } from "@shared/schema";
import { generatePaymentUrl, checkPayment, robokassa } from "./robokassa";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Public article routes (accessible to everyone, preview for non-subscribers)
  app.get('/api/articles', async (req: any, res) => {
    try {
      const articlesList = await storage.getAllArticles();
      
      // Check if user is authenticated and has active subscription
      let hasActiveSubscription = false;
      if (req.isAuthenticated?.() && req.user?.claims?.sub) {
        const user = await storage.getUser(req.user.claims.sub);
        hasActiveSubscription = user?.subscriptionExpiresAt 
          ? new Date(user.subscriptionExpiresAt) > new Date() 
          : false;
      }

      // If no active subscription, truncate content to preview (except for free articles)
      if (!hasActiveSubscription) {
        const previewArticles = articlesList.map(article => ({
          ...article,
          content: article.isFree ? article.content : article.content.substring(0, 1000),
        }));
        return res.json(previewArticles);
      }

      res.json(articlesList);
    } catch (error) {
      console.error("Error fetching articles:", error);
      res.status(500).json({ message: "Failed to fetch articles" });
    }
  });

  app.get('/api/articles/slug/:slug', async (req: any, res) => {
    try {
      const article = await storage.getArticleBySlug(req.params.slug);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }

      // Check if user is authenticated and has active subscription
      let hasActiveSubscription = false;
      if (req.isAuthenticated?.() && req.user?.claims?.sub) {
        const user = await storage.getUser(req.user.claims.sub);
        hasActiveSubscription = user?.subscriptionExpiresAt 
          ? new Date(user.subscriptionExpiresAt) > new Date() 
          : false;
      }

      // If no active subscription, truncate content to preview (except for free articles)
      if (!hasActiveSubscription && !article.isFree) {
        const previewArticle = {
          ...article,
          content: article.content.substring(0, 1000),
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
    try {
      const article = await storage.getArticleById(req.params.id);
      if (!article) {
        return res.status(404).json({ message: "Article not found" });
      }

      // Check if user is authenticated and has active subscription
      let hasActiveSubscription = false;
      if (req.isAuthenticated?.() && req.user?.claims?.sub) {
        const user = await storage.getUser(req.user.claims.sub);
        hasActiveSubscription = user?.subscriptionExpiresAt 
          ? new Date(user.subscriptionExpiresAt) > new Date() 
          : false;
      }

      // If no active subscription, truncate content to preview (except for free articles)
      if (!hasActiveSubscription && !article.isFree) {
        const previewArticle = {
          ...article,
          content: article.content.substring(0, 1000),
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
  app.get('/api/articles/search/:query', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      const { query } = req.params;
      const results = await storage.searchArticles(query);
      
      // Check subscription status
      const hasActiveSubscription = user?.subscriptionExpiresAt 
        ? new Date(user.subscriptionExpiresAt) > new Date() 
        : false;

      // If no active subscription, truncate content to preview (except for free articles)
      if (!hasActiveSubscription) {
        const previewResults = results.map(article => ({
          ...article,
          content: article.isFree ? article.content : article.content.substring(0, 1000),
        }));
        return res.json(previewResults);
      }

      res.json(results);
    } catch (error) {
      console.error("Error searching articles:", error);
      res.status(500).json({ message: "Failed to search articles" });
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
      res.json({ message: "Tag deleted successfully" });
    } catch (error) {
      console.error("Error deleting tag:", error);
      res.status(500).json({ message: "Failed to delete tag" });
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
      await storage.deleteArticle(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting article:", error);
      res.status(500).json({ message: "Failed to delete article" });
    }
  });

  // Admin user/subscription routes
  app.get('/api/admin/users', isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const usersList = await storage.getAllUsers();
      res.json(usersList);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
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

      const userId = req.user.claims.sub;
      const { subscriptionType } = req.body; // 'initial' or 'renewal'

      if (!subscriptionType || !['initial', 'renewal'].includes(subscriptionType)) {
        return res.status(400).json({ message: "Invalid subscription type" });
      }

      const amount = subscriptionType === 'initial' ? 2000 : 1000;
      const description = subscriptionType === 'initial' 
        ? 'Подписка MateriaMedica на 6 месяцев'
        : 'Продление подписки MateriaMedica на 6 месяцев';

      // Generate unique invoice ID (timestamp + random)
      const invoiceId = Date.now() + Math.floor(Math.random() * 1000);

      // Create payment record
      const payment = await storage.createPayment({
        userId,
        amount: amount.toString(),
        invoiceId: invoiceId.toString(),
        description,
        status: 'pending',
        robokassaData: null,
      });

      // Generate payment URL
      const paymentUrl = generatePaymentUrl({
        amount,
        description,
        invoiceId,
        userId,
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
    try {
      if (!robokassa) {
        console.error('Robokassa not configured but received callback');
        return res.status(503).send('Payment system not configured');
      }

      // Validate signature
      const isValid = checkPayment(req.body);
      
      if (!isValid) {
        console.error('Invalid Robokassa signature:', req.body);
        return res.status(400).send('Invalid signature');
      }

      const { InvId, OutSum, shp_user_id, shp_subscription_type } = req.body;

      // Update payment status
      await storage.updatePaymentStatus(
        InvId.toString(),
        'completed',
        req.body
      );

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
        
        console.log(`Payment successful: User ${shp_user_id}, Amount ${OutSum}, Invoice ${InvId}`);
      }

      // Must respond with OK + invoice ID
      res.send(`OK${InvId}`);
    } catch (error) {
      console.error('Payment processing error:', error);
      res.status(500).send('Error processing payment');
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
