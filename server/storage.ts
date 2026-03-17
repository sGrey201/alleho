import {
  users,
  articles,
  tags,
  articleTags,
  payments,
  articleLikes,
  userQuestionnaires,
  healthWallMessages,
  healthWallDoctors,
  conversations,
  conversationParticipants,
  conversationMessages,
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
  type ArticleLike,
  type UserQuestionnaire,
  type QuestionnaireData,
  type HealthWallMessage,
  type InsertHealthWallMessage,
  type HealthWallDoctor,
  type InsertHealthWallDoctor,
  type Conversation,
  type InsertConversation,
  type ConversationParticipant,
  type InsertConversationParticipant,
  type ConversationMessage,
  type InsertConversationMessage,
} from "@shared/schema";
import { db } from "./db";
import { eq, ne, or, ilike, sql, inArray, and, desc } from "drizzle-orm";
import { generateSlugFromTags } from "./utils/slug";

export type ArticleWithTags = Article & { tags: Tag[] };

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserProfile(id: string, profileData: Partial<User>): Promise<User>;
  getAllUsers(): Promise<User[]>;
  getAdminUsers(excludeUserId: string, nameFilter?: string): Promise<User[]>;
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
  getAllArticles(options?: { limit?: number; offset?: number }): Promise<ArticleWithTags[]>;
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

  // Like operations
  toggleLike(articleId: string, userId: string): Promise<{ liked: boolean; likesCount: number }>;
  getLikesCount(articleId: string): Promise<number>;
  hasUserLiked(articleId: string, userId: string): Promise<boolean>;
  getArticleLikesInfo(articleId: string, userId?: string): Promise<{ likesCount: number; userLiked: boolean }>;
  getBulkArticleLikesInfo(articleIds: string[], userId?: string): Promise<Map<string, { likesCount: number; userLiked: boolean }>>;

  // Questionnaire operations
  getQuestionnaire(userId: string): Promise<UserQuestionnaire | undefined>;
  saveQuestionnaire(userId: string, data: QuestionnaireData): Promise<UserQuestionnaire>;
  getQuestionnairesSharedWith(email: string): Promise<{ questionnaire: UserQuestionnaire; user: User }[]>;

  // Health wall operations
  getHealthWallMessages(patientUserId: string): Promise<HealthWallMessage[]>;
  getHealthWallMessagesRecent(patientUserId: string, limit: number): Promise<HealthWallMessage[]>;
  createHealthWallMessage(message: InsertHealthWallMessage): Promise<HealthWallMessage>;
  getPatientHealthWallStats(patientUserId: string, doctorUserId: string): Promise<{ unreadCount: number; lastMessageAt: Date | null }>;

  // Health wall doctors operations
  getHealthWallDoctors(patientUserId: string): Promise<{ doctor: HealthWallDoctor; user: User }[]>;
  getHealthWallPatients(doctorUserId: string): Promise<{ connection: HealthWallDoctor; patient: User }[]>;
  addHealthWallDoctor(patientUserId: string, doctorUserId: string): Promise<HealthWallDoctor>;
  removeHealthWallDoctor(patientUserId: string, doctorUserId: string): Promise<boolean>;
  isHealthWallDoctorConnected(patientUserId: string, doctorUserId: string): Promise<boolean>;

  // Messenger conversations (doctors only)
  createConversation(data: InsertConversation): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationsForUser(userId: string): Promise<(Conversation & { participants: (ConversationParticipant & { user: User })[] })[]>;
  getConversationParticipants(conversationId: string): Promise<(ConversationParticipant & { user: User })[]>;
  getDirectConversationBetween(userId1: string, userId2: string): Promise<string | undefined>;
  getDiscoverableConversations(
    currentUserId: string,
    options: { type: "group" | "channel"; nameFilter?: string }
  ): Promise<Array<{ id: string; name: string | null; participantCount: number; isMember: boolean }>>;
  addConversationParticipant(conversationId: string, userId: string, role?: string): Promise<ConversationParticipant>;
  removeConversationParticipant(conversationId: string, userId: string): Promise<boolean>;
  isUserInConversation(userId: string, conversationId: string): Promise<boolean>;
  getParticipantRole(conversationId: string, userId: string): Promise<string | undefined>;
  getConversationMessages(conversationId: string, limit?: number): Promise<ConversationMessage[]>;
  getConversationMessagesRecent(conversationId: string, limit: number): Promise<ConversationMessage[]>;
  createConversationMessage(msg: InsertConversationMessage): Promise<ConversationMessage>;
  getLastConversationMessage(conversationId: string): Promise<ConversationMessage | null>;
  updateConversation(id: string, data: { name?: string }): Promise<Conversation | undefined>;
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

  async getAdminUsers(excludeUserId: string, nameFilter?: string): Promise<User[]> {
    const conditions = [eq(users.isAdmin, true), ne(users.id, excludeUserId)];
    if (nameFilter?.trim()) {
      const pattern = `%${nameFilter.trim()}%`;
      // Search in firstName, lastName, email, and combined full name (handles NULLs and "Таня" etc.)
      conditions.push(
        or(
          ilike(users.firstName, pattern),
          ilike(users.lastName, pattern),
          ilike(users.email, pattern),
          sql`(COALESCE(${users.firstName}, '') || ' ' || COALESCE(${users.lastName}, '')) ILIKE ${pattern}`
        )!
      );
    }
    return await db
      .select()
      .from(users)
      .where(and(...conditions))
      .orderBy(users.lastName, users.firstName);
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
    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
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
  async getAllArticles(options?: { limit?: number; offset?: number }): Promise<ArticleWithTags[]> {
    let query = db.select().from(articles).orderBy(sql`${articles.createdAt} DESC`);
    
    if (options?.limit) {
      query = query.limit(options.limit) as typeof query;
    }
    if (options?.offset) {
      query = query.offset(options.offset) as typeof query;
    }
    
    const allArticles = await query;
    
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
    const updateData = { ...articleData, updatedAt: new Date() };
    
    if (tagIds !== undefined) {
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

  // Like operations
  async toggleLike(articleId: string, userId: string): Promise<{ liked: boolean; likesCount: number }> {
    const existingLike = await db
      .select()
      .from(articleLikes)
      .where(sql`${articleLikes.articleId} = ${articleId} AND ${articleLikes.userId} = ${userId}`);

    if (existingLike.length > 0) {
      await db
        .delete(articleLikes)
        .where(sql`${articleLikes.articleId} = ${articleId} AND ${articleLikes.userId} = ${userId}`);
      const likesCount = await this.getLikesCount(articleId);
      return { liked: false, likesCount };
    } else {
      await db.insert(articleLikes).values({ articleId, userId });
      const likesCount = await this.getLikesCount(articleId);
      return { liked: true, likesCount };
    }
  }

  async getLikesCount(articleId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(articleLikes)
      .where(eq(articleLikes.articleId, articleId));
    return Number(result[0]?.count || 0);
  }

  async hasUserLiked(articleId: string, userId: string): Promise<boolean> {
    const result = await db
      .select()
      .from(articleLikes)
      .where(sql`${articleLikes.articleId} = ${articleId} AND ${articleLikes.userId} = ${userId}`);
    return result.length > 0;
  }

  async getArticleLikesInfo(articleId: string, userId?: string): Promise<{ likesCount: number; userLiked: boolean }> {
    const likesCount = await this.getLikesCount(articleId);
    const userLiked = userId ? await this.hasUserLiked(articleId, userId) : false;
    return { likesCount, userLiked };
  }

  async getBulkArticleLikesInfo(articleIds: string[], userId?: string): Promise<Map<string, { likesCount: number; userLiked: boolean }>> {
    if (articleIds.length === 0) {
      return new Map();
    }

    // Get likes count for all articles in one query
    const likesCountResult = await db
      .select({ 
        articleId: articleLikes.articleId, 
        count: sql<number>`count(*)` 
      })
      .from(articleLikes)
      .where(inArray(articleLikes.articleId, articleIds))
      .groupBy(articleLikes.articleId);

    // Get user likes in one query if userId provided
    let userLikedSet = new Set<string>();
    if (userId) {
      const userLikesResult = await db
        .select({ articleId: articleLikes.articleId })
        .from(articleLikes)
        .where(and(
          inArray(articleLikes.articleId, articleIds),
          eq(articleLikes.userId, userId)
        ));
      userLikedSet = new Set(userLikesResult.map(r => r.articleId));
    }

    // Build result map
    const result = new Map<string, { likesCount: number; userLiked: boolean }>();
    const likesCountMap = new Map(likesCountResult.map(r => [r.articleId, Number(r.count)]));
    
    for (const articleId of articleIds) {
      result.set(articleId, {
        likesCount: likesCountMap.get(articleId) || 0,
        userLiked: userLikedSet.has(articleId)
      });
    }

    return result;
  }

  // Questionnaire operations
  async getQuestionnaire(userId: string): Promise<UserQuestionnaire | undefined> {
    const [questionnaire] = await db
      .select()
      .from(userQuestionnaires)
      .where(eq(userQuestionnaires.userId, userId));
    return questionnaire;
  }

  async saveQuestionnaire(userId: string, data: QuestionnaireData): Promise<UserQuestionnaire> {
    const existing = await this.getQuestionnaire(userId);
    
    if (existing) {
      const [updated] = await db
        .update(userQuestionnaires)
        .set({
          data,
          updatedAt: new Date(),
        })
        .where(eq(userQuestionnaires.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(userQuestionnaires)
        .values({
          userId,
          data,
        })
        .returning();
      return created;
    }
  }

  async getQuestionnairesSharedWith(email: string): Promise<{ questionnaire: UserQuestionnaire; user: User }[]> {
    const allQuestionnaires = await db
      .select()
      .from(userQuestionnaires)
      .innerJoin(users, eq(userQuestionnaires.userId, users.id));
    
    const result: { questionnaire: UserQuestionnaire; user: User }[] = [];
    
    for (const row of allQuestionnaires) {
      const data = row.user_questionnaires.data as QuestionnaireData;
      if (data.sharedWithEmails?.includes(email)) {
        result.push({
          questionnaire: row.user_questionnaires,
          user: row.users,
        });
      }
    }
    
    return result;
  }

  // Health wall operations
  async getHealthWallMessages(patientUserId: string): Promise<HealthWallMessage[]> {
    return await db
      .select()
      .from(healthWallMessages)
      .where(eq(healthWallMessages.patientUserId, patientUserId))
      .orderBy(healthWallMessages.createdAt);
  }

  async getHealthWallMessagesRecent(patientUserId: string, limit: number): Promise<HealthWallMessage[]> {
    const rows = await db
      .select()
      .from(healthWallMessages)
      .where(eq(healthWallMessages.patientUserId, patientUserId))
      .orderBy(desc(healthWallMessages.createdAt))
      .limit(limit);
    return rows.reverse();
  }

  async createHealthWallMessage(message: InsertHealthWallMessage): Promise<HealthWallMessage> {
    const [created] = await db
      .insert(healthWallMessages)
      .values(message)
      .returning();
    return created;
  }

  async getPatientHealthWallStats(patientUserId: string, doctorUserId: string): Promise<{ unreadCount: number; lastMessageAt: Date | null }> {
    const messages = await db
      .select()
      .from(healthWallMessages)
      .where(eq(healthWallMessages.patientUserId, patientUserId))
      .orderBy(desc(healthWallMessages.createdAt));

    if (messages.length === 0) {
      return { unreadCount: 0, lastMessageAt: null };
    }

    const lastMessageAt = messages[0].createdAt;
    
    const doctorLastMessageIndex = messages.findIndex(m => m.authorUserId === doctorUserId);
    
    let unreadCount = 0;
    if (doctorLastMessageIndex === -1) {
      unreadCount = messages.filter(m => m.authorUserId === patientUserId).length;
    } else {
      for (let i = 0; i < doctorLastMessageIndex; i++) {
        if (messages[i].authorUserId === patientUserId) {
          unreadCount++;
        }
      }
    }

    return { unreadCount, lastMessageAt };
  }

  // Health wall doctors operations
  async getHealthWallDoctors(patientUserId: string): Promise<{ doctor: HealthWallDoctor; user: User }[]> {
    const connections = await db
      .select()
      .from(healthWallDoctors)
      .where(eq(healthWallDoctors.patientUserId, patientUserId))
      .orderBy(healthWallDoctors.createdAt);

    const result: { doctor: HealthWallDoctor; user: User }[] = [];
    for (const connection of connections) {
      const user = await this.getUser(connection.doctorUserId);
      if (user) {
        result.push({ doctor: connection, user });
      }
    }
    return result;
  }

  async getHealthWallPatients(doctorUserId: string): Promise<{ connection: HealthWallDoctor; patient: User }[]> {
    const connections = await db
      .select()
      .from(healthWallDoctors)
      .where(eq(healthWallDoctors.doctorUserId, doctorUserId))
      .orderBy(healthWallDoctors.createdAt);

    const result: { connection: HealthWallDoctor; patient: User }[] = [];
    for (const connection of connections) {
      const patient = await this.getUser(connection.patientUserId);
      if (patient) {
        result.push({ connection, patient });
      }
    }
    return result;
  }

  async addHealthWallDoctor(patientUserId: string, doctorUserId: string): Promise<HealthWallDoctor> {
    const [created] = await db
      .insert(healthWallDoctors)
      .values({ patientUserId, doctorUserId })
      .returning();
    return created;
  }

  async removeHealthWallDoctor(patientUserId: string, doctorUserId: string): Promise<boolean> {
    const result = await db
      .delete(healthWallDoctors)
      .where(
        and(
          eq(healthWallDoctors.patientUserId, patientUserId),
          eq(healthWallDoctors.doctorUserId, doctorUserId)
        )
      )
      .returning();
    return result.length > 0;
  }

  async isHealthWallDoctorConnected(patientUserId: string, doctorUserId: string): Promise<boolean> {
    const [connection] = await db
      .select()
      .from(healthWallDoctors)
      .where(
        and(
          eq(healthWallDoctors.patientUserId, patientUserId),
          eq(healthWallDoctors.doctorUserId, doctorUserId)
        )
      );
    return !!connection;
  }

  async updateDoctorLastVisit(patientUserId: string, doctorUserId: string): Promise<void> {
    await db
      .update(healthWallDoctors)
      .set({ lastVisitedAt: new Date() })
      .where(
        and(
          eq(healthWallDoctors.patientUserId, patientUserId),
          eq(healthWallDoctors.doctorUserId, doctorUserId)
        )
      );
  }

  async getDoctorLastVisit(patientUserId: string, doctorUserId: string): Promise<Date | null> {
    const [connection] = await db
      .select({ lastVisitedAt: healthWallDoctors.lastVisitedAt })
      .from(healthWallDoctors)
      .where(
        and(
          eq(healthWallDoctors.patientUserId, patientUserId),
          eq(healthWallDoctors.doctorUserId, doctorUserId)
        )
      );
    return connection?.lastVisitedAt || null;
  }

  async updatePatientLastVisit(patientUserId: string): Promise<void> {
    await db
      .update(healthWallDoctors)
      .set({ patientLastVisitedAt: new Date() })
      .where(eq(healthWallDoctors.patientUserId, patientUserId));
  }

  async getPatientLastVisit(patientUserId: string): Promise<Date | null> {
    const [connection] = await db
      .select({ patientLastVisitedAt: healthWallDoctors.patientLastVisitedAt })
      .from(healthWallDoctors)
      .where(eq(healthWallDoctors.patientUserId, patientUserId))
      .orderBy(healthWallDoctors.patientLastVisitedAt)
      .limit(1);
    return connection?.patientLastVisitedAt || null;
  }

  // Messenger conversations
  async createConversation(data: InsertConversation): Promise<Conversation> {
    const [c] = await db.insert(conversations).values(data).returning();
    return c;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [c] = await db.select().from(conversations).where(eq(conversations.id, id));
    return c;
  }

  async getConversationsForUser(userId: string): Promise<(Conversation & { participants: (ConversationParticipant & { user: User })[] })[]> {
    const parts = await db
      .select()
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, userId));
    const convIds = parts.map((p) => p.conversationId);
    if (convIds.length === 0) return [];
    const list = await db
      .select()
      .from(conversations)
      .where(inArray(conversations.id, convIds));
    const result: (Conversation & { participants: (ConversationParticipant & { user: User })[] })[] = [];
    for (const conv of list) {
      const participants = await this.getConversationParticipants(conv.id);
      result.push({ ...conv, participants });
    }
    return result;
  }

  async getConversationParticipants(conversationId: string): Promise<(ConversationParticipant & { user: User })[]> {
    const parts = await db
      .select()
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId));
    const result: (ConversationParticipant & { user: User })[] = [];
    for (const p of parts) {
      const user = await this.getUser(p.userId);
      if (user) result.push({ ...p, user });
    }
    return result;
  }

  async getDirectConversationBetween(userId1: string, userId2: string): Promise<string | undefined> {
    const directConvs = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.type, "direct"));
    for (const conv of directConvs) {
      const participants = await db
        .select({ userId: conversationParticipants.userId })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conv.id));
      if (participants.length !== 2) continue;
      const ids = new Set(participants.map((p) => p.userId));
      if (ids.has(userId1) && ids.has(userId2)) return conv.id;
    }
    return undefined;
  }

  async getDiscoverableConversations(
    currentUserId: string,
    options: { type: "group" | "channel"; nameFilter?: string }
  ): Promise<Array<{ id: string; name: string | null; participantCount: number; isMember: boolean }>> {
    const conditions = [eq(conversations.type, options.type)];
    if (options.nameFilter?.trim()) {
      conditions.push(ilike(conversations.name, `%${options.nameFilter.trim()}%`));
    }
    const list = await db
      .select()
      .from(conversations)
      .where(and(...conditions));
    const myParticipation = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, currentUserId));
    const myConvIds = new Set(myParticipation.map((p) => p.conversationId));
    const result: Array<{ id: string; name: string | null; participantCount: number; isMember: boolean }> = [];
    for (const conv of list) {
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conv.id));
      const participantCount = Number(countRows[0]?.count ?? 0);
      result.push({
        id: conv.id,
        name: conv.name,
        participantCount,
        isMember: myConvIds.has(conv.id),
      });
    }
    return result;
  }

  async addConversationParticipant(conversationId: string, userId: string, role: string = "member"): Promise<ConversationParticipant> {
    const [p] = await db
      .insert(conversationParticipants)
      .values({ conversationId, userId, role })
      .returning();
    return p;
  }

  async removeConversationParticipant(conversationId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId)
        )
      )
      .returning();
    return result.length > 0;
  }

  async isUserInConversation(userId: string, conversationId: string): Promise<boolean> {
    const [p] = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId)
        )
      );
    return !!p;
  }

  async getParticipantRole(conversationId: string, userId: string): Promise<string | undefined> {
    const [p] = await db
      .select({ role: conversationParticipants.role })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId)
        )
      );
    return p?.role;
  }

  async getConversationMessages(conversationId: string, limit: number = 100): Promise<ConversationMessage[]> {
    const rows = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(conversationMessages.createdAt)
      .limit(limit);
    return rows;
  }

  async getConversationMessagesRecent(conversationId: string, limit: number): Promise<ConversationMessage[]> {
    const rows = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(desc(conversationMessages.createdAt))
      .limit(limit);
    return rows.reverse();
  }

  async createConversationMessage(msg: InsertConversationMessage): Promise<ConversationMessage> {
    const [m] = await db.insert(conversationMessages).values(msg).returning();
    return m;
  }

  async getLastConversationMessage(conversationId: string): Promise<ConversationMessage | null> {
    const [m] = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(desc(conversationMessages.createdAt))
      .limit(1);
    return m || null;
  }

  async updateConversation(id: string, data: { name?: string }): Promise<Conversation | undefined> {
    const [c] = await db
      .update(conversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return c;
  }
}

export const storage = new DatabaseStorage();
