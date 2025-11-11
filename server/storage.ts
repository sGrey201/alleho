import {
  users,
  articles,
  type User,
  type UpsertUser,
  type Article,
  type InsertArticle,
  type UpdateArticle,
} from "@shared/schema";
import { db } from "./db";
import { eq, or, ilike, sql } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserProfile(id: string, profileData: Partial<User>): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserSubscription(id: string, expiresAt: Date | null): Promise<User>;
  updateUserLanguage(id: string, language: string): Promise<User>;

  // Article operations
  getAllArticles(): Promise<Article[]>;
  getArticleById(id: string): Promise<Article | undefined>;
  createArticle(article: InsertArticle): Promise<Article>;
  updateArticle(id: string, article: UpdateArticle): Promise<Article>;
  deleteArticle(id: string): Promise<void>;
  searchArticles(query: string, language: 'ru' | 'de' | 'en'): Promise<Article[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    return user;
  }

  async updateUserProfile(id: string, profileData: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        ...profileData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(users.createdAt);
  }

  async updateUserSubscription(id: string, expiresAt: Date | null): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        subscriptionExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserLanguage(id: string, language: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        preferredLanguage: language,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Article operations
  async getAllArticles(): Promise<Article[]> {
    return await db.select().from(articles).orderBy(sql`${articles.createdAt} DESC`);
  }

  async getArticleById(id: string): Promise<Article | undefined> {
    const [article] = await db.select().from(articles).where(eq(articles.id, id));
    return article;
  }

  async createArticle(articleData: InsertArticle): Promise<Article> {
    const [article] = await db
      .insert(articles)
      .values(articleData)
      .returning();
    return article;
  }

  async updateArticle(id: string, articleData: UpdateArticle): Promise<Article> {
    const [article] = await db
      .update(articles)
      .set({
        ...articleData,
        updatedAt: new Date(),
      })
      .where(eq(articles.id, id))
      .returning();
    return article;
  }

  async deleteArticle(id: string): Promise<void> {
    await db.delete(articles).where(eq(articles.id, id));
  }

  async searchArticles(query: string, language: 'ru' | 'de' | 'en'): Promise<Article[]> {
    const titleCol = language === 'ru' ? articles.titleRu : language === 'de' ? articles.titleDe : articles.titleEn;
    const contentCol = language === 'ru' ? articles.contentRu : language === 'de' ? articles.contentDe : articles.contentEn;
    
    return await db
      .select()
      .from(articles)
      .where(
        or(
          ilike(titleCol, `%${query}%`),
          ilike(contentCol, `%${query}%`),
          sql`EXISTS (SELECT 1 FROM unnest(${articles.tags}) AS tag WHERE tag ILIKE ${`%${query}%`})`
        )
      )
      .orderBy(sql`${articles.createdAt} DESC`);
  }
}

export const storage = new DatabaseStorage();
