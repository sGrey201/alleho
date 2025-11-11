import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";
import { insertArticleSchema, updateArticleSchema } from "@shared/schema";

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

      // If no active subscription (or not authenticated), truncate content to preview
      if (!hasActiveSubscription) {
        const previewArticles = articlesList.map(article => ({
          ...article,
          contentRu: article.contentRu.substring(0, 1000),
          contentDe: article.contentDe.substring(0, 1000),
          contentEn: article.contentEn.substring(0, 1000),
        }));
        return res.json(previewArticles);
      }

      res.json(articlesList);
    } catch (error) {
      console.error("Error fetching articles:", error);
      res.status(500).json({ message: "Failed to fetch articles" });
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

      // If no active subscription (or not authenticated), truncate content to preview
      if (!hasActiveSubscription) {
        const previewArticle = {
          ...article,
          contentRu: article.contentRu.substring(0, 1000),
          contentDe: article.contentDe.substring(0, 1000),
          contentEn: article.contentEn.substring(0, 1000),
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
      const language = (req.query.lang as 'ru' | 'de' | 'en') || 'en';
      const results = await storage.searchArticles(query, language);
      
      // Check subscription status
      const hasActiveSubscription = user?.subscriptionExpiresAt 
        ? new Date(user.subscriptionExpiresAt) > new Date() 
        : false;

      // If no active subscription, truncate content to preview
      if (!hasActiveSubscription) {
        const previewResults = results.map(article => ({
          ...article,
          contentRu: article.contentRu.substring(0, 1000),
          contentDe: article.contentDe.substring(0, 1000),
          contentEn: article.contentEn.substring(0, 1000),
        }));
        return res.json(previewResults);
      }

      res.json(results);
    } catch (error) {
      console.error("Error searching articles:", error);
      res.status(500).json({ message: "Failed to search articles" });
    }
  });

  // User preferences
  app.put('/api/user/language', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { language } = req.body;
      
      if (!['ru', 'de', 'en'].includes(language)) {
        return res.status(400).json({ message: "Invalid language" });
      }

      const user = await storage.updateUserLanguage(userId, language);
      res.json(user);
    } catch (error) {
      console.error("Error updating language:", error);
      res.status(500).json({ message: "Failed to update language" });
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
      const validatedData = insertArticleSchema.parse(req.body);
      const article = await storage.createArticle(validatedData);
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
      const validatedData = updateArticleSchema.parse(req.body);
      const article = await storage.updateArticle(req.params.id, validatedData);
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

  const httpServer = createServer(app);
  return httpServer;
}
