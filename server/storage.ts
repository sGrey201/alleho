import {
  users,
  articles,
  tags,
  articleTags,
  payments,
  type User,
  type UpsertUser,
  type Article,
  type InsertArticle,
  type UpdateArticle,
  type Tag,
  type InsertTag,
  type UpdateTag,
  type Payment,
  type InsertPayment,
} from "@shared/schema";
import { db } from "./db";
import { eq, or, ilike, sql, inArray } from "drizzle-orm";
import { generateSlugFromTags } from "./utils/slug";

export type ArticleWithTags = Article & { tags: Tag[] };

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserProfile(id: string, profileData: Partial<User>): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserSubscription(id: string, expiresAt: Date | null): Promise<User>;
  createUserWithPassword(email: string, passwordHash: string): Promise<User>;
  updateUserPassword(id: string, passwordHash: string): Promise<User>;
  setResetToken(id: string, token: string, expiresAt: Date): Promise<User>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  clearResetToken(id: string): Promise<User>;

  // Tag operations
  getAllTags(): Promise<Tag[]>;
  getTagsByIds(ids: string[]): Promise<Tag[]>;
  getTagsByCategory(category: 'remedy' | 'situation'): Promise<Tag[]>;
  searchTags(query: string): Promise<Tag[]>;
  createTag(tag: InsertTag): Promise<Tag>;
  updateTag(id: string, tag: UpdateTag): Promise<Tag | undefined>;
  deleteTag(id: string): Promise<boolean>;
  
  // Article operations
  getAllArticles(): Promise<ArticleWithTags[]>;
  getArticleById(id: string): Promise<ArticleWithTags | undefined>;
  getArticleBySlug(slug: string): Promise<ArticleWithTags | undefined>;
  createArticle(article: InsertArticle, tagIds: string[]): Promise<ArticleWithTags>;
  updateArticle(id: string, article: UpdateArticle, tagIds?: string[]): Promise<ArticleWithTags>;
  deleteArticle(id: string): Promise<void>;
  searchArticles(query: string): Promise<ArticleWithTags[]>;
  getArticleTags(articleId: string): Promise<Tag[]>;
  setArticleTags(articleId: string, tagIds: string[]): Promise<void>;

  // Payment operations
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentByInvoiceId(invoiceId: string): Promise<Payment | undefined>;
  updatePaymentStatus(invoiceId: string, status: string, robokassaData?: any): Promise<Payment>;
  getUserPayments(userId: string): Promise<Payment[]>;
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

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUserWithPassword(email: string, passwordHash: string): Promise<User> {
    const trialExpiry = new Date();
    trialExpiry.setDate(trialExpiry.getDate() + 7);
    
    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        subscriptionExpiresAt: trialExpiry,
      })
      .returning();
    return user;
  }

  async updateUserPassword(id: string, passwordHash: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async setResetToken(id: string, token: string, expiresAt: Date): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        resetToken: token,
        resetTokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.resetToken, token));
    return user;
  }

  async clearResetToken(id: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        resetToken: null,
        resetTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Tag operations
  async getAllTags(): Promise<Tag[]> {
    return await db.select().from(tags).orderBy(tags.name);
  }

  async getTagsByIds(ids: string[]): Promise<Tag[]> {
    if (ids.length === 0) return [];
    return await db.select().from(tags).where(inArray(tags.id, ids));
  }

  async getTagsByCategory(category: 'remedy' | 'situation'): Promise<Tag[]> {
    return await db
      .select()
      .from(tags)
      .where(eq(tags.category, category))
      .orderBy(tags.name);
  }

  async searchTags(query: string): Promise<Tag[]> {
    return await db
      .select()
      .from(tags)
      .where(
        or(
          ilike(tags.name, `%${query}%`),
          ilike(tags.slug, `%${query}%`)
        )
      )
      .orderBy(tags.name)
      .limit(50);
  }

  async createTag(tagData: InsertTag): Promise<Tag> {
    const [tag] = await db
      .insert(tags)
      .values(tagData)
      .returning();
    return tag;
  }

  async updateTag(id: string, tagData: UpdateTag): Promise<Tag | undefined> {
    const [tag] = await db
      .update(tags)
      .set({
        ...tagData,
        updatedAt: new Date(),
      })
      .where(eq(tags.id, id))
      .returning();
    return tag;
  }

  async deleteTag(id: string): Promise<boolean> {
    const result = await db.delete(tags).where(eq(tags.id, id)).returning();
    return result.length > 0;
  }

  async getArticleTags(articleId: string): Promise<Tag[]> {
    const result = await db
      .select({ tag: tags })
      .from(articleTags)
      .innerJoin(tags, eq(articleTags.tagId, tags.id))
      .where(eq(articleTags.articleId, articleId));
    
    return result.map(r => r.tag);
  }

  async setArticleTags(articleId: string, tagIds: string[]): Promise<void> {
    // Delete existing tags
    await db.delete(articleTags).where(eq(articleTags.articleId, articleId));
    
    // Insert new tags
    if (tagIds.length > 0) {
      await db.insert(articleTags).values(
        tagIds.map(tagId => ({ articleId, tagId }))
      );
    }
  }

  // Article operations
  async getAllArticles(): Promise<ArticleWithTags[]> {
    const allArticles = await db.select().from(articles).orderBy(sql`${articles.isFree} DESC, ${articles.createdAt} DESC`);
    
    if (allArticles.length === 0) return [];
    
    // Preload all tags for all articles in one query
    const articleIds = allArticles.map(a => a.id);
    const allArticleTags = await db
      .select({ articleId: articleTags.articleId, tag: tags })
      .from(articleTags)
      .innerJoin(tags, eq(articleTags.tagId, tags.id))
      .where(inArray(articleTags.articleId, articleIds));
    
    // Group tags by article ID
    const tagsByArticleId = new Map<string, Tag[]>();
    allArticleTags.forEach(({ articleId, tag }) => {
      if (!tagsByArticleId.has(articleId)) {
        tagsByArticleId.set(articleId, []);
      }
      tagsByArticleId.get(articleId)!.push(tag);
    });
    
    // Attach tags to articles
    return allArticles.map(article => ({
      ...article,
      tags: tagsByArticleId.get(article.id) || []
    }));
  }

  async getArticleById(id: string): Promise<ArticleWithTags | undefined> {
    const [article] = await db.select().from(articles).where(eq(articles.id, id));
    if (!article) return undefined;
    
    const articleTagsList = await this.getArticleTags(id);
    return { ...article, tags: articleTagsList };
  }

  async getArticleBySlug(slug: string): Promise<ArticleWithTags | undefined> {
    const [article] = await db.select().from(articles).where(eq(articles.slug, slug));
    if (!article) return undefined;
    
    const articleTagsList = await this.getArticleTags(article.id);
    return { ...article, tags: articleTagsList };
  }

  async createArticle(articleData: InsertArticle, tagIds: string[]): Promise<ArticleWithTags> {
    const tagsList = await this.getTagsByIds(tagIds);
    const slug = generateSlugFromTags(tagsList);
    
    const [article] = await db
      .insert(articles)
      .values({ ...articleData, slug })
      .returning();
    
    await this.setArticleTags(article.id, tagIds);
    const articleTagsList = await this.getArticleTags(article.id);
    
    return { ...article, tags: articleTagsList };
  }

  async updateArticle(id: string, articleData: UpdateArticle, tagIds?: string[]): Promise<ArticleWithTags> {
    let updateData = { ...articleData, updatedAt: new Date() };
    
    if (tagIds !== undefined) {
      const tagsList = await this.getTagsByIds(tagIds);
      const slug = generateSlugFromTags(tagsList);
      updateData = { ...updateData, slug };
      await this.setArticleTags(id, tagIds);
    }
    
    const [article] = await db
      .update(articles)
      .set(updateData)
      .where(eq(articles.id, id))
      .returning();
    
    const articleTagsList = await this.getArticleTags(id);
    return { ...article, tags: articleTagsList };
  }

  async deleteArticle(id: string): Promise<void> {
    await db.delete(articles).where(eq(articles.id, id));
  }

  async searchArticles(query: string): Promise<ArticleWithTags[]> {
    // Search in articles and tags
    const results = await db
      .selectDistinct({ article: articles })
      .from(articles)
      .leftJoin(articleTags, eq(articles.id, articleTags.articleId))
      .leftJoin(tags, eq(articleTags.tagId, tags.id))
      .where(
        or(
          ilike(articles.content, `%${query}%`),
          ilike(tags.name, `%${query}%`)
        )
      )
      .orderBy(sql`${articles.createdAt} DESC`);
    
    if (results.length === 0) return [];
    
    // Preload all tags for matching articles in one query
    const articleIds = results.map(r => r.article.id);
    const allArticleTags = await db
      .select({ articleId: articleTags.articleId, tag: tags })
      .from(articleTags)
      .innerJoin(tags, eq(articleTags.tagId, tags.id))
      .where(inArray(articleTags.articleId, articleIds));
    
    // Group tags by article ID
    const tagsByArticleId = new Map<string, Tag[]>();
    allArticleTags.forEach(({ articleId, tag }) => {
      if (!tagsByArticleId.has(articleId)) {
        tagsByArticleId.set(articleId, []);
      }
      tagsByArticleId.get(articleId)!.push(tag);
    });
    
    // Attach tags to articles
    return results.map(r => ({
      ...r.article,
      tags: tagsByArticleId.get(r.article.id) || []
    }));
  }

  // Payment operations
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db
      .insert(payments)
      .values(payment)
      .returning();
    return newPayment;
  }

  async getPaymentByInvoiceId(invoiceId: string): Promise<Payment | undefined> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    return payment;
  }

  async updatePaymentStatus(
    invoiceId: string,
    status: string,
    robokassaData?: any
  ): Promise<Payment> {
    const [payment] = await db
      .update(payments)
      .set({
        status,
        robokassaData,
        updatedAt: new Date(),
      })
      .where(eq(payments.invoiceId, invoiceId))
      .returning();
    return payment;
  }

  async getUserPayments(userId: string): Promise<Payment[]> {
    return await db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(sql`${payments.createdAt} DESC`);
  }
}

export const storage = new DatabaseStorage();
