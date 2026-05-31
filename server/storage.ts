import {
  users,
  articles,
  tags,
  articleTags,
  payments,
  articleLikes,
  questionnaireTemplates,
  questionnaireInstances,
  invites,
  conversations,
  conversationParticipants,
  conversationMessages,
  conversationMessageReactions,
  conversationMessageComments,
  conversationMessageCommentReactions,
  conversationPollVotes,
  pushSubscriptions,
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
  type QuestionnaireTemplate,
  type QuestionnaireInstance,
  type QuestionnaireInstanceData,
  type QuestionnaireTemplateStructure,
  type Invite,
  type InsertInvite,
  type Conversation,
  type InsertConversation,
  type ConversationParticipant,
  type InsertConversationParticipant,
  type ConversationMessage,
  type InsertConversationMessage,
  type ConversationMessageComment,
  type InsertConversationMessageComment,
  type PushSubscription,
} from "@shared/schema";
import { db } from "./db";
import { eq, ne, or, ilike, sql, inArray, and, desc, count, gt } from "drizzle-orm";
import { generateSlugFromTags } from "./utils/slug";
import { previewFromConversationMessageParts } from "./utils/conversationPreview";
import {
  DEFAULT_QUESTIONNAIRE_TEMPLATE_NAME,
  deepCloneQuestionnaireStructure,
  getDefaultQuestionnaireStructure,
} from "./questionnaireDefaults";
import { emptyQuestionnaireInstanceData } from "@shared/questionnaireTypes";

export type ArticleWithTags = Article & { tags: Tag[] };
export type MessengerPersonalContact = {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
  conversationId?: string;
  lastMessageAt?: Date | null;
  lastMessagePreview?: string | null;
  lastVisitedAt?: Date | null;
};
export type MessengerChannelListItem = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  isMember: boolean;
  participantCount: number;
  createdAt: Date | null;
  lastPostAt: Date | null;
  lastMessagePreview: string | null;
  myRole?: string;
};

export type PatientConversationListItem = {
  conversationId: string;
  name: string | null;
  patientUserId: string | null;
  avatarUrl: string | null;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  otherParticipantId?: string;
  otherParticipantName?: string;
};

export type MessageReactionSummary = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

export type ConversationPollResults = {
  voteCounts: number[];
  totalVotes: number;
  selectedOptionIndices: number[];
};

export type ConversationCommentWithAuthor = {
  id: string;
  conversationId: string;
  messageId: string;
  authorUserId: string;
  content?: string | null;
  imageUrl?: string | null;
  replyToCommentId?: string | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  reactions?: MessageReactionSummary[];
  author: {
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    isAdmin?: boolean | null;
  };
  replyTo?: {
    id: string;
    authorUserId: string;
    content?: string | null;
    imageUrl?: string | null;
    deletedAt?: string | null;
    author?: {
      id: string;
      email?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      isAdmin?: boolean | null;
    } | null;
  } | null;
};

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const pgError = error as { code?: string };
  return pgError.code === "42P01";
}

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

  // Questionnaire template & instance operations
  listQuestionnaireTemplates(ownerUserId: string): Promise<QuestionnaireTemplate[]>;
  getQuestionnaireTemplate(id: string): Promise<QuestionnaireTemplate | undefined>;
  createQuestionnaireTemplate(data: {
    ownerUserId: string;
    name: string;
    structure: QuestionnaireTemplateStructure;
    isShared?: boolean;
  }): Promise<QuestionnaireTemplate>;
  updateQuestionnaireTemplate(
    id: string,
    ownerUserId: string,
    data: Partial<{ name: string; structure: QuestionnaireTemplateStructure; isShared: boolean }>
  ): Promise<QuestionnaireTemplate | undefined>;
  deleteQuestionnaireTemplate(id: string, ownerUserId: string): Promise<boolean>;
  duplicateQuestionnaireTemplate(id: string, ownerUserId: string): Promise<QuestionnaireTemplate | undefined>;
  copySharedQuestionnaireTemplate(
    sourceId: string,
    newOwnerUserId: string,
    name?: string
  ): Promise<QuestionnaireTemplate | undefined>;
  incrementTemplatePatientSendCount(templateId: string): Promise<void>;
  ensureDefaultQuestionnaireTemplate(userId: string): Promise<QuestionnaireTemplate | undefined>;
  backfillDefaultQuestionnaireTemplatesForAdmins(): Promise<number>;
  listSharedQuestionnaireTemplatesByUser(userId: string): Promise<QuestionnaireTemplate[]>;
  getQuestionnaireInstance(id: string): Promise<QuestionnaireInstance | undefined>;
  createQuestionnaireInstance(data: {
    templateId: string;
    conversationId: string;
    messageId: string;
    patientUserId: string;
    doctorUserId: string;
    structureSnapshot: QuestionnaireTemplateStructure;
  }): Promise<QuestionnaireInstance>;
  updateQuestionnaireInstanceData(
    id: string,
    data: QuestionnaireInstanceData
  ): Promise<QuestionnaireInstance | undefined>;
  canAccessQuestionnaireInstance(
    instance: QuestionnaireInstance,
    userId: string
  ): Promise<boolean>;

  // Invite operations
  createInvite(invite: InsertInvite): Promise<Invite>;
  getInviteByTokenHash(tokenHash: string): Promise<Invite | undefined>;
  markInviteAccepted(
    inviteId: string,
    acceptedUserId: string,
    acceptedEmail?: string,
    conversationId?: string
  ): Promise<Invite>;
  markInviteExpired(inviteId: string): Promise<Invite>;
  getInviterOfUser(userId: string): Promise<User | undefined>;
  getAcceptedInvitesCountByUser(inviterUserId: string): Promise<number>;

  // Messenger conversations (doctors only)
  createConversation(data: InsertConversation): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationsForUser(userId: string): Promise<(Conversation & { participants: (ConversationParticipant & { user: User })[] })[]>;
  getConversationParticipants(conversationId: string): Promise<(ConversationParticipant & { user: User })[]>;
  getDirectConversationBetween(userId1: string, userId2: string): Promise<string | undefined>;
  getDiscoverableConversations(
    currentUserId: string,
    options: { type: "group" | "channel"; nameFilter?: string }
  ): Promise<Array<{ id: string; name: string | null; avatarUrl: string | null; participantCount: number; isMember: boolean }>>;
  addConversationParticipant(conversationId: string, userId: string, role?: string): Promise<ConversationParticipant>;
  removeConversationParticipant(conversationId: string, userId: string): Promise<boolean>;
  isUserInConversation(userId: string, conversationId: string): Promise<boolean>;
  getParticipantRole(conversationId: string, userId: string): Promise<string | undefined>;
  markConversationSeen(conversationId: string, userId: string): Promise<Date | null>;
  getConversationParticipantLastSeenAt(conversationId: string, userId: string): Promise<Date | null>;
  isConversationMessageReadByUser(
    conversationId: string,
    userId: string,
    messageCreatedAt: Date
  ): Promise<boolean>;
  getConversationMessages(conversationId: string, limit?: number): Promise<ConversationMessage[]>;
  getConversationMessagesRecent(conversationId: string, limit: number): Promise<ConversationMessage[]>;
  getConversationMessageById(messageId: string): Promise<ConversationMessage | undefined>;
  getConversationMessageComments(
    conversationId: string,
    messageId: string,
    currentUserId: string
  ): Promise<ConversationCommentWithAuthor[]>;
  getConversationMessageCommentById(commentId: string): Promise<ConversationMessageComment | undefined>;
  createConversationMessageComment(comment: InsertConversationMessageComment): Promise<ConversationMessageComment>;
  editConversationMessageComment(commentId: string, content: string): Promise<ConversationMessageComment | undefined>;
  softDeleteConversationMessageComment(commentId: string): Promise<ConversationMessageComment | undefined>;
  toggleConversationMessageCommentReaction(commentId: string, userId: string, emoji: string): Promise<void>;
  getConversationMessageCommentReactionSummaries(
    commentIds: string[],
    currentUserId: string
  ): Promise<Map<string, MessageReactionSummary[]>>;
  getConversationMessageCommentCounts(messageIds: string[]): Promise<Map<string, number>>;
  createConversationMessage(msg: InsertConversationMessage): Promise<ConversationMessage>;
  editConversationMessage(messageId: string, content: string): Promise<ConversationMessage | undefined>;
  softDeleteConversationMessage(messageId: string): Promise<ConversationMessage | undefined>;
  pinConversationMessage(messageId: string, userId: string): Promise<ConversationMessage | undefined>;
  unpinConversationMessage(messageId: string): Promise<ConversationMessage | undefined>;
  toggleConversationMessageReaction(messageId: string, userId: string, emoji: string): Promise<void>;
  getConversationMessageReactionSummaries(
    messageIds: string[],
    currentUserId: string
  ): Promise<Map<string, MessageReactionSummary[]>>;
  setConversationPollVotes(
    messageId: string,
    userId: string,
    selectedOptionIndices: number[],
    optionCount: number
  ): Promise<void>;
  getConversationPollStates(
    entries: Array<{ messageId: string; optionCount: number }>,
    currentUserId: string
  ): Promise<Map<string, ConversationPollResults>>;
  getConversationPinnedMessages(conversationId: string): Promise<ConversationMessage[]>;
  getLastConversationMessage(conversationId: string): Promise<ConversationMessage | null>;
  updateConversation(id: string, data: { name?: string; avatarUrl?: string | null }): Promise<Conversation | undefined>;
  getMessengerPersonalContacts(currentUserId: string): Promise<MessengerPersonalContact[]>;
  getPatientConversationsForUser(userId: string): Promise<PatientConversationListItem[]>;
  getMessengerChannels(currentUserId: string): Promise<MessengerChannelListItem[]>;

  // Web Push subscriptions
  upsertPushSubscription(
    userId: string,
    data: { endpoint: string; p256dh: string; auth: string }
  ): Promise<PushSubscription>;
  deletePushSubscription(userId: string, endpoint: string): Promise<boolean>;
  getPushSubscriptionsByUserIds(userIds: string[]): Promise<PushSubscription[]>;
  deletePushSubscriptionByEndpoint(endpoint: string): Promise<boolean>;
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

  // Questionnaire template & instance operations
  async listQuestionnaireTemplates(ownerUserId: string): Promise<QuestionnaireTemplate[]> {
    return db
      .select()
      .from(questionnaireTemplates)
      .where(eq(questionnaireTemplates.ownerUserId, ownerUserId))
      .orderBy(desc(questionnaireTemplates.updatedAt));
  }

  async getQuestionnaireTemplate(id: string): Promise<QuestionnaireTemplate | undefined> {
    const [row] = await db.select().from(questionnaireTemplates).where(eq(questionnaireTemplates.id, id));
    return row;
  }

  async createQuestionnaireTemplate(data: {
    ownerUserId: string;
    name: string;
    structure: QuestionnaireTemplateStructure;
    isShared?: boolean;
  }): Promise<QuestionnaireTemplate> {
    const [created] = await db
      .insert(questionnaireTemplates)
      .values({
        ownerUserId: data.ownerUserId,
        name: data.name.trim(),
        structure: data.structure,
        isShared: data.isShared ?? false,
      })
      .returning();
    return created;
  }

  async updateQuestionnaireTemplate(
    id: string,
    ownerUserId: string,
    data: Partial<{ name: string; structure: QuestionnaireTemplateStructure; isShared: boolean }>
  ): Promise<QuestionnaireTemplate | undefined> {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.structure !== undefined) patch.structure = data.structure;
    if (data.isShared !== undefined) patch.isShared = data.isShared;
    const [updated] = await db
      .update(questionnaireTemplates)
      .set(patch)
      .where(and(eq(questionnaireTemplates.id, id), eq(questionnaireTemplates.ownerUserId, ownerUserId)))
      .returning();
    return updated;
  }

  async deleteQuestionnaireTemplate(id: string, ownerUserId: string): Promise<boolean> {
    const rows = await db
      .delete(questionnaireTemplates)
      .where(and(eq(questionnaireTemplates.id, id), eq(questionnaireTemplates.ownerUserId, ownerUserId)))
      .returning();
    return rows.length > 0;
  }

  async duplicateQuestionnaireTemplate(
    id: string,
    ownerUserId: string
  ): Promise<QuestionnaireTemplate | undefined> {
    const source = await this.getQuestionnaireTemplate(id);
    if (!source || source.ownerUserId !== ownerUserId) return undefined;
    return this.createQuestionnaireTemplate({
      ownerUserId,
      name: `${source.name} (копия)`,
      structure: deepCloneQuestionnaireStructure(source.structure as QuestionnaireTemplateStructure),
      isShared: false,
    });
  }

  async copySharedQuestionnaireTemplate(
    sourceId: string,
    newOwnerUserId: string,
    name?: string
  ): Promise<QuestionnaireTemplate | undefined> {
    const source = await this.getQuestionnaireTemplate(sourceId);
    if (!source) return undefined;
    const isOwner = source.ownerUserId === newOwnerUserId;
    if (!isOwner && !source.isShared) return undefined;

    const created = await this.createQuestionnaireTemplate({
      ownerUserId: newOwnerUserId,
      name: name?.trim() || `${source.name} (копия)`,
      structure: deepCloneQuestionnaireStructure(source.structure as QuestionnaireTemplateStructure),
      isShared: false,
    });

    if (!isOwner) {
      await db
        .update(questionnaireTemplates)
        .set({
          copyCount: sql`${questionnaireTemplates.copyCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(questionnaireTemplates.id, sourceId));
    }
    return created;
  }

  async incrementTemplatePatientSendCount(templateId: string): Promise<void> {
    await db
      .update(questionnaireTemplates)
      .set({
        patientSendCount: sql`${questionnaireTemplates.patientSendCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(questionnaireTemplates.id, templateId));
  }

  async ensureDefaultQuestionnaireTemplate(userId: string): Promise<QuestionnaireTemplate | undefined> {
    const [existing] = await db
      .select({ id: questionnaireTemplates.id })
      .from(questionnaireTemplates)
      .where(eq(questionnaireTemplates.ownerUserId, userId))
      .limit(1);
    if (existing) return undefined;
    return this.createQuestionnaireTemplate({
      ownerUserId: userId,
      name: DEFAULT_QUESTIONNAIRE_TEMPLATE_NAME,
      structure: getDefaultQuestionnaireStructure(),
      isShared: false,
    });
  }

  async backfillDefaultQuestionnaireTemplatesForAdmins(): Promise<number> {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isAdmin, true));
    let count = 0;
    for (const admin of admins) {
      const created = await this.ensureDefaultQuestionnaireTemplate(admin.id);
      if (created) count += 1;
    }
    return count;
  }

  async listSharedQuestionnaireTemplatesByUser(userId: string): Promise<QuestionnaireTemplate[]> {
    return db
      .select()
      .from(questionnaireTemplates)
      .where(and(eq(questionnaireTemplates.ownerUserId, userId), eq(questionnaireTemplates.isShared, true)))
      .orderBy(desc(questionnaireTemplates.updatedAt));
  }

  async getQuestionnaireInstance(id: string): Promise<QuestionnaireInstance | undefined> {
    const [row] = await db.select().from(questionnaireInstances).where(eq(questionnaireInstances.id, id));
    return row;
  }

  async createQuestionnaireInstance(data: {
    templateId: string;
    conversationId: string;
    messageId: string;
    patientUserId: string;
    doctorUserId: string;
    structureSnapshot: QuestionnaireTemplateStructure;
  }): Promise<QuestionnaireInstance> {
    const [created] = await db
      .insert(questionnaireInstances)
      .values({
        templateId: data.templateId,
        conversationId: data.conversationId,
        messageId: data.messageId,
        patientUserId: data.patientUserId,
        doctorUserId: data.doctorUserId,
        structureSnapshot: data.structureSnapshot,
        data: emptyQuestionnaireInstanceData(),
      })
      .returning();
    return created;
  }

  async updateQuestionnaireInstanceData(
    id: string,
    data: QuestionnaireInstanceData
  ): Promise<QuestionnaireInstance | undefined> {
    const [updated] = await db
      .update(questionnaireInstances)
      .set({ data, updatedAt: new Date() })
      .where(eq(questionnaireInstances.id, id))
      .returning();
    return updated;
  }

  async canAccessQuestionnaireInstance(
    instance: QuestionnaireInstance,
    userId: string
  ): Promise<boolean> {
    if (instance.doctorUserId === userId) return true;
    if (instance.patientUserId === userId) {
      return this.isUserInConversation(userId, instance.conversationId);
    }
    return false;
  }

  async createInvite(invite: InsertInvite): Promise<Invite> {
    const [created] = await db
      .insert(invites)
      .values(invite)
      .returning();
    return created;
  }

  async getInviteByTokenHash(tokenHash: string): Promise<Invite | undefined> {
    const [invite] = await db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, tokenHash));
    return invite;
  }

  async markInviteAccepted(
    inviteId: string,
    acceptedUserId: string,
    acceptedEmail?: string,
    conversationId?: string
  ): Promise<Invite> {
    const [updated] = await db
      .update(invites)
      .set({
        email: acceptedEmail ?? undefined,
        status: "accepted",
        acceptedUserId,
        conversationId: conversationId ?? undefined,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invites.id, inviteId))
      .returning();
    return updated;
  }

  async markInviteExpired(inviteId: string): Promise<Invite> {
    const [updated] = await db
      .update(invites)
      .set({
        status: "expired",
        updatedAt: new Date(),
      })
      .where(eq(invites.id, inviteId))
      .returning();
    return updated;
  }

  async getInviterOfUser(userId: string): Promise<User | undefined> {
    const [invite] = await db
      .select()
      .from(invites)
      .where(and(eq(invites.acceptedUserId, userId), eq(invites.status, "accepted")))
      .orderBy(desc(invites.acceptedAt))
      .limit(1);
    if (!invite) return undefined;
    return this.getUser(invite.invitedByUserId);
  }

  async getAcceptedInvitesCountByUser(inviterUserId: string): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(invites)
      .where(and(eq(invites.invitedByUserId, inviterUserId), eq(invites.status, "accepted")));
    return row?.value ?? 0;
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
  ): Promise<Array<{ id: string; name: string | null; avatarUrl: string | null; participantCount: number; isMember: boolean }>> {
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
    const result: Array<{ id: string; name: string | null; avatarUrl: string | null; participantCount: number; isMember: boolean }> = [];
    for (const conv of list) {
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conv.id));
      const participantCount = Number(countRows[0]?.count ?? 0);
      result.push({
        id: conv.id,
        name: conv.name,
        avatarUrl: conv.avatarUrl ?? null,
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

  async markConversationSeen(conversationId: string, userId: string): Promise<Date | null> {
    const [existing] = await db
      .select({ lastSeenAt: conversationParticipants.lastSeenAt })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId)
        )
      );

    const now = new Date();
    const lastSeenAt = existing?.lastSeenAt ?? null;
    const SEEN_NOTIFY_INTERVAL_MS = 2000;
    if (lastSeenAt && now.getTime() - lastSeenAt.getTime() < SEEN_NOTIFY_INTERVAL_MS) {
      return null;
    }

    await db
      .update(conversationParticipants)
      .set({ lastSeenAt: now })
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId)
        )
      );
    return now;
  }

  async getConversationParticipantLastSeenAt(
    conversationId: string,
    userId: string
  ): Promise<Date | null> {
    const [row] = await db
      .select({ lastSeenAt: conversationParticipants.lastSeenAt })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId)
        )
      );
    return row?.lastSeenAt ?? null;
  }

  async isConversationMessageReadByUser(
    conversationId: string,
    userId: string,
    messageCreatedAt: Date
  ): Promise<boolean> {
    const lastSeenAt = await this.getConversationParticipantLastSeenAt(conversationId, userId);
    if (!lastSeenAt) return false;
    return lastSeenAt.getTime() >= messageCreatedAt.getTime();
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
    const preview = previewFromConversationMessageParts(m.content, m.imageUrl, m.messageType);
    const at = m.createdAt ?? new Date();
    await db
      .update(conversations)
      .set({
        lastMessageAt: at,
        lastMessagePreview: preview,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, m.conversationId));
    return m;
  }

  async getConversationMessageById(messageId: string): Promise<ConversationMessage | undefined> {
    const [m] = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.id, messageId));
    return m;
  }

  async getConversationMessageComments(
    conversationId: string,
    messageId: string,
    currentUserId: string
  ): Promise<ConversationCommentWithAuthor[]> {
    const comments = await db
      .select()
      .from(conversationMessageComments)
      .where(
        and(
          eq(conversationMessageComments.conversationId, conversationId),
          eq(conversationMessageComments.messageId, messageId)
        )
      )
      .orderBy(conversationMessageComments.createdAt);
    if (comments.length === 0) return [];

    const userIds = new Set<string>();
    const replyIds = new Set<string>();
    comments.forEach((comment) => {
      userIds.add(comment.authorUserId);
      if (comment.replyToCommentId) replyIds.add(comment.replyToCommentId);
    });

    const replyTargets = replyIds.size
      ? await db
          .select()
          .from(conversationMessageComments)
          .where(inArray(conversationMessageComments.id, Array.from(replyIds)))
      : [];
    const replyMap = new Map(replyTargets.map((item) => [item.id, item]));
    replyTargets.forEach((item) => userIds.add(item.authorUserId));

    const usersList = userIds.size
      ? await db.select().from(users).where(inArray(users.id, Array.from(userIds)))
      : [];
    const userMap = new Map(usersList.map((user) => [user.id, user]));

    const reactionMap = await this.getConversationMessageCommentReactionSummaries(
      comments.map((comment) => comment.id),
      currentUserId
    );

    const toIso = (value: Date | string | null | undefined): string | null => {
      if (!value) return null;
      return value instanceof Date ? value.toISOString() : String(value);
    };

    return comments.map((comment) => {
      const author = userMap.get(comment.authorUserId);
      const replyTo = comment.replyToCommentId ? replyMap.get(comment.replyToCommentId) : null;
      const replyAuthor = replyTo ? userMap.get(replyTo.authorUserId) : null;
      return {
        id: comment.id,
        conversationId: comment.conversationId,
        messageId: comment.messageId,
        authorUserId: comment.authorUserId,
        content: comment.content ?? null,
        imageUrl: comment.imageUrl ?? null,
        replyToCommentId: comment.replyToCommentId ?? null,
        createdAt: toIso(comment.createdAt) ?? new Date().toISOString(),
        editedAt: toIso(comment.editedAt),
        deletedAt: toIso(comment.deletedAt),
        reactions: reactionMap.get(comment.id) ?? [],
        author: {
          id: author?.id ?? "",
          email: author?.email ?? null,
          firstName: author?.firstName ?? null,
          lastName: author?.lastName ?? null,
          isAdmin: author?.isAdmin ?? null,
        },
        replyTo: replyTo
          ? {
              id: replyTo.id,
              authorUserId: replyTo.authorUserId,
              content: replyTo.content ?? null,
              imageUrl: replyTo.imageUrl ?? null,
              deletedAt: toIso(replyTo.deletedAt),
              author: replyAuthor
                ? {
                    id: replyAuthor.id,
                    email: replyAuthor.email ?? null,
                    firstName: replyAuthor.firstName ?? null,
                    lastName: replyAuthor.lastName ?? null,
                    isAdmin: replyAuthor.isAdmin ?? null,
                  }
                : null,
            }
          : null,
      };
    });
  }

  async getConversationMessageCommentById(commentId: string): Promise<ConversationMessageComment | undefined> {
    const [comment] = await db
      .select()
      .from(conversationMessageComments)
      .where(eq(conversationMessageComments.id, commentId));
    return comment;
  }

  async createConversationMessageComment(
    comment: InsertConversationMessageComment
  ): Promise<ConversationMessageComment> {
    const [created] = await db.insert(conversationMessageComments).values(comment).returning();
    return created;
  }

  async editConversationMessageComment(
    commentId: string,
    content: string
  ): Promise<ConversationMessageComment | undefined> {
    const [comment] = await db
      .update(conversationMessageComments)
      .set({ content, editedAt: new Date() })
      .where(eq(conversationMessageComments.id, commentId))
      .returning();
    return comment;
  }

  async softDeleteConversationMessageComment(
    commentId: string
  ): Promise<ConversationMessageComment | undefined> {
    const [comment] = await db
      .update(conversationMessageComments)
      .set({
        deletedAt: new Date(),
        content: null,
        imageUrl: null,
      })
      .where(eq(conversationMessageComments.id, commentId))
      .returning();
    return comment;
  }

  async toggleConversationMessageCommentReaction(commentId: string, userId: string, emoji: string): Promise<void> {
    try {
      const [existing] = await db
        .select({ id: conversationMessageCommentReactions.id })
        .from(conversationMessageCommentReactions)
        .where(
          and(
            eq(conversationMessageCommentReactions.commentId, commentId),
            eq(conversationMessageCommentReactions.userId, userId),
            eq(conversationMessageCommentReactions.emoji, emoji)
          )
        )
        .limit(1);
      if (existing) {
        await db
          .delete(conversationMessageCommentReactions)
          .where(eq(conversationMessageCommentReactions.id, existing.id));
        return;
      }
      await db.insert(conversationMessageCommentReactions).values({ commentId, userId, emoji });
    } catch (error) {
      if (isMissingRelationError(error)) return;
      throw error;
    }
  }

  async getConversationMessageCommentReactionSummaries(
    commentIds: string[],
    currentUserId: string
  ): Promise<Map<string, MessageReactionSummary[]>> {
    if (commentIds.length === 0) return new Map();
    let rows: Array<{ commentId: string; userId: string; emoji: string }> = [];
    try {
      rows = (await db
        .select()
        .from(conversationMessageCommentReactions)
        .where(inArray(conversationMessageCommentReactions.commentId, commentIds))) as Array<{
        commentId: string;
        userId: string;
        emoji: string;
      }>;
    } catch (error) {
      if (isMissingRelationError(error)) return new Map();
      throw error;
    }
    const byComment = new Map<string, Map<string, MessageReactionSummary>>();
    rows.forEach((row) => {
      if (!byComment.has(row.commentId)) byComment.set(row.commentId, new Map());
      const reactionMap = byComment.get(row.commentId)!;
      const existing = reactionMap.get(row.emoji);
      if (existing) {
        existing.count += 1;
        if (row.userId === currentUserId) existing.reactedByMe = true;
      } else {
        reactionMap.set(row.emoji, {
          emoji: row.emoji,
          count: 1,
          reactedByMe: row.userId === currentUserId,
        });
      }
    });
    const result = new Map<string, MessageReactionSummary[]>();
    byComment.forEach((reactionMap, commentId) => {
      result.set(commentId, Array.from(reactionMap.values()));
    });
    return result;
  }

  async getConversationMessageCommentCounts(messageIds: string[]): Promise<Map<string, number>> {
    if (messageIds.length === 0) return new Map();
    const rows = await db
      .select({
        messageId: conversationMessageComments.messageId,
        value: count(),
      })
      .from(conversationMessageComments)
      .where(
        and(
          inArray(conversationMessageComments.messageId, messageIds),
          sql`${conversationMessageComments.deletedAt} IS NULL`
        )
      )
      .groupBy(conversationMessageComments.messageId);
    const result = new Map<string, number>();
    rows.forEach((row) => {
      result.set(row.messageId, Number(row.value ?? 0));
    });
    return result;
  }

  async editConversationMessage(messageId: string, content: string): Promise<ConversationMessage | undefined> {
    const [m] = await db
      .update(conversationMessages)
      .set({ content, editedAt: new Date() })
      .where(eq(conversationMessages.id, messageId))
      .returning();
    if (!m) return undefined;
    // Refresh conversation preview if this was the last message.
    const last = await this.getLastConversationMessage(m.conversationId);
    if (last && last.id === m.id) {
      const preview = previewFromConversationMessageParts(m.content, m.imageUrl, m.messageType);
      await db
        .update(conversations)
        .set({ lastMessagePreview: preview, updatedAt: new Date() })
        .where(eq(conversations.id, m.conversationId));
    }
    return m;
  }

  async softDeleteConversationMessage(messageId: string): Promise<ConversationMessage | undefined> {
    const [m] = await db
      .update(conversationMessages)
      .set({
        deletedAt: new Date(),
        content: null,
        imageUrl: null,
        pinnedAt: null,
        pinnedByUserId: null,
      })
      .where(eq(conversationMessages.id, messageId))
      .returning();
    if (!m) return undefined;
    const last = await this.getLastConversationMessage(m.conversationId);
    if (last && last.id === m.id) {
      await db
        .update(conversations)
        .set({ lastMessagePreview: null, updatedAt: new Date() })
        .where(eq(conversations.id, m.conversationId));
    }
    return m;
  }

  async pinConversationMessage(messageId: string, userId: string): Promise<ConversationMessage | undefined> {
    const [m] = await db
      .update(conversationMessages)
      .set({ pinnedAt: new Date(), pinnedByUserId: userId })
      .where(eq(conversationMessages.id, messageId))
      .returning();
    return m;
  }

  async unpinConversationMessage(messageId: string): Promise<ConversationMessage | undefined> {
    const [m] = await db
      .update(conversationMessages)
      .set({ pinnedAt: null, pinnedByUserId: null })
      .where(eq(conversationMessages.id, messageId))
      .returning();
    return m;
  }

  async toggleConversationMessageReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    try {
      const [existing] = await db
        .select({ id: conversationMessageReactions.id })
        .from(conversationMessageReactions)
        .where(
          and(
            eq(conversationMessageReactions.messageId, messageId),
            eq(conversationMessageReactions.userId, userId),
            eq(conversationMessageReactions.emoji, emoji)
          )
        )
        .limit(1);
      if (existing) {
        await db.delete(conversationMessageReactions).where(eq(conversationMessageReactions.id, existing.id));
        return;
      }
      await db.insert(conversationMessageReactions).values({ messageId, userId, emoji });
    } catch (error) {
      if (isMissingRelationError(error)) return;
      throw error;
    }
  }

  async getConversationMessageReactionSummaries(
    messageIds: string[],
    currentUserId: string
  ): Promise<Map<string, MessageReactionSummary[]>> {
    if (messageIds.length === 0) return new Map();
    let rows: Array<{ messageId: string; userId: string; emoji: string }> = [];
    try {
      rows = (await db
        .select()
        .from(conversationMessageReactions)
        .where(inArray(conversationMessageReactions.messageId, messageIds))) as Array<{
        messageId: string;
        userId: string;
        emoji: string;
      }>;
    } catch (error) {
      if (isMissingRelationError(error)) return new Map();
      throw error;
    }
    const byMessage = new Map<string, Map<string, MessageReactionSummary>>();
    rows.forEach((row) => {
      if (!byMessage.has(row.messageId)) byMessage.set(row.messageId, new Map());
      const msgMap = byMessage.get(row.messageId)!;
      const existing = msgMap.get(row.emoji);
      if (existing) {
        existing.count += 1;
        if (row.userId === currentUserId) existing.reactedByMe = true;
      } else {
        msgMap.set(row.emoji, {
          emoji: row.emoji,
          count: 1,
          reactedByMe: row.userId === currentUserId,
        });
      }
    });
    const result = new Map<string, MessageReactionSummary[]>();
    byMessage.forEach((emojiMap, messageId) => {
      result.set(messageId, Array.from(emojiMap.values()));
    });
    return result;
  }

  async setConversationPollVotes(
    messageId: string,
    userId: string,
    selectedOptionIndices: number[],
    optionCount: number
  ): Promise<void> {
    const unique = Array.from(new Set(selectedOptionIndices))
      .filter((i) => Number.isInteger(i) && i >= 0 && i < optionCount)
      .sort((a, b) => a - b);
    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(conversationPollVotes)
          .where(and(eq(conversationPollVotes.messageId, messageId), eq(conversationPollVotes.userId, userId)));
        for (const idx of unique) {
          await tx.insert(conversationPollVotes).values({ messageId, userId, optionIndex: idx });
        }
      });
    } catch (error) {
      if (isMissingRelationError(error)) return;
      throw error;
    }
  }

  async getConversationPollStates(
    entries: Array<{ messageId: string; optionCount: number }>,
    currentUserId: string
  ): Promise<Map<string, ConversationPollResults>> {
    const result = new Map<string, ConversationPollResults>();
    if (entries.length === 0) return result;

    const zeroCounts = (n: number) => Array.from({ length: n }, () => 0);
    entries.forEach((e) => {
      result.set(e.messageId, {
        voteCounts: zeroCounts(e.optionCount),
        totalVotes: 0,
        selectedOptionIndices: [],
      });
    });

    const ids = entries.map((e) => e.messageId);
    let rows: Array<{ messageId: string; userId: string; optionIndex: number }> = [];
    try {
      rows = (await db
        .select({
          messageId: conversationPollVotes.messageId,
          userId: conversationPollVotes.userId,
          optionIndex: conversationPollVotes.optionIndex,
        })
        .from(conversationPollVotes)
        .where(inArray(conversationPollVotes.messageId, ids))) as Array<{
        messageId: string;
        userId: string;
        optionIndex: number;
      }>;
    } catch (error) {
      if (isMissingRelationError(error)) return result;
      throw error;
    }
    rows.forEach((row) => {
      const state = result.get(row.messageId);
      if (!state) return;
      const idx = row.optionIndex;
      if (idx >= 0 && idx < state.voteCounts.length) {
        state.voteCounts[idx] += 1;
      }
    });
    result.forEach((state) => {
      state.totalVotes = state.voteCounts.reduce((a, b) => a + b, 0);
    });
    rows.forEach((row) => {
      if (row.userId !== currentUserId) return;
      const state = result.get(row.messageId);
      if (!state) return;
      if (!state.selectedOptionIndices.includes(row.optionIndex)) {
        state.selectedOptionIndices.push(row.optionIndex);
      }
    });
    result.forEach((state) => {
      state.selectedOptionIndices.sort((a, b) => a - b);
    });
    return result;
  }

  async getConversationPinnedMessages(conversationId: string): Promise<ConversationMessage[]> {
    const rows = await db
      .select()
      .from(conversationMessages)
      .where(
        and(
          eq(conversationMessages.conversationId, conversationId),
          sql`${conversationMessages.pinnedAt} IS NOT NULL`,
          sql`${conversationMessages.deletedAt} IS NULL`
        )
      )
      .orderBy(desc(conversationMessages.pinnedAt));
    return rows;
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

  async updateConversation(id: string, data: { name?: string; avatarUrl?: string | null }): Promise<Conversation | undefined> {
    const [c] = await db
      .update(conversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return c;
  }

  async getMessengerPersonalContacts(currentUserId: string): Promise<MessengerPersonalContact[]> {
    const adminUsers = await this.getAdminUsers(currentUserId);
    const rows = await Promise.all(
      adminUsers.map(async (user) => {
        const conversationId = await this.getDirectConversationBetween(currentUserId, user.id);
        const lastVisitedAt = conversationId
          ? await this.getConversationParticipantLastSeenAt(conversationId, currentUserId)
          : null;
        return { user, conversationId, lastVisitedAt };
      })
    );

    const convIds = Array.from(
      new Set(rows.map((r) => r.conversationId).filter((id): id is string => typeof id === "string" && id.length > 0))
    );
    let convById = new Map<string, Conversation>();
    if (convIds.length > 0) {
      const convRows = await db.select().from(conversations).where(inArray(conversations.id, convIds));
      convById = new Map(convRows.map((c) => [c.id, c]));
    }

    const contacts: MessengerPersonalContact[] = rows.map(({ user, conversationId, lastVisitedAt }) => {
      const conv = conversationId ? convById.get(conversationId) : undefined;
      return {
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profileImageUrl: user.profileImageUrl ?? null,
        conversationId,
        lastMessageAt: conv?.lastMessageAt ?? null,
        lastMessagePreview: conv?.lastMessagePreview ?? null,
        lastVisitedAt,
      };
    });

    contacts.sort((a, b) => {
      const aHasConversation = !!a.conversationId && !!a.lastMessageAt;
      const bHasConversation = !!b.conversationId && !!b.lastMessageAt;
      if (aHasConversation !== bHasConversation) return bHasConversation ? 1 : -1;

      if (aHasConversation && bHasConversation) {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        if (aTime !== bTime) return bTime - aTime;
      }

      const aVisit = a.lastVisitedAt ? new Date(a.lastVisitedAt).getTime() : 0;
      const bVisit = b.lastVisitedAt ? new Date(b.lastVisitedAt).getTime() : 0;
      if (aVisit !== bVisit) return bVisit - aVisit;

      const aName = [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || a.email || "";
      const bName = [b.firstName, b.lastName].filter(Boolean).join(" ").trim() || b.email || "";
      return aName.localeCompare(bName, "ru");
    });

    return contacts;
  }

  async getMessengerChannels(currentUserId: string): Promise<MessengerChannelListItem[]> {
    const myChannels = await db
      .select({
        id: conversations.id,
        name: conversations.name,
        avatarUrl: conversations.avatarUrl,
        createdAt: conversations.createdAt,
        lastPostAt: conversations.lastMessageAt,
        lastMessagePreview: conversations.lastMessagePreview,
        myRole: conversationParticipants.role,
      })
      .from(conversationParticipants)
      .innerJoin(conversations, eq(conversationParticipants.conversationId, conversations.id))
      .where(
        and(
          eq(conversationParticipants.userId, currentUserId),
          eq(conversations.type, "channel")
        )
      )
      .orderBy(desc(conversations.createdAt));

    const channels = await Promise.all(
      myChannels.map(async (channel) => {
        const [participantCountRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(conversationParticipants)
          .where(eq(conversationParticipants.conversationId, channel.id));
        return {
          id: channel.id,
          name: channel.name,
          avatarUrl: channel.avatarUrl ?? null,
          participantCount: Number(participantCountRow?.count ?? 0),
          isMember: true,
          myRole: channel.myRole ?? undefined,
          createdAt: channel.createdAt ?? null,
          lastPostAt: channel.lastPostAt ?? null,
          lastMessagePreview: channel.lastMessagePreview ?? null,
        };
      })
    );

    channels.sort((a, b) => {
      const aLastPostTime = a.lastPostAt ? new Date(a.lastPostAt).getTime() : 0;
      const bLastPostTime = b.lastPostAt ? new Date(b.lastPostAt).getTime() : 0;
      if (aLastPostTime !== bLastPostTime) return bLastPostTime - aLastPostTime;

      const aCreatedAt = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreatedAt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (aCreatedAt !== bCreatedAt) return bCreatedAt - aCreatedAt;

      return (a.name ?? "").localeCompare(b.name ?? "", "ru");
    });

    return channels;
  }

  async upsertPushSubscription(
    userId: string,
    data: { endpoint: string; p256dh: string; auth: string }
  ): Promise<PushSubscription> {
    const [row] = await db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId,
          p256dh: data.p256dh,
          auth: data.auth,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async deletePushSubscription(userId: string, endpoint: string): Promise<boolean> {
    const rows = await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
      .returning();
    return rows.length > 0;
  }

  async deletePushSubscriptionByEndpoint(endpoint: string): Promise<boolean> {
    const rows = await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).returning();
    return rows.length > 0;
  }

  async getPushSubscriptionsByUserIds(userIds: string[]): Promise<PushSubscription[]> {
    if (userIds.length === 0) return [];
    return db
      .select()
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, userIds));
  }

  async getPatientConversationsForUser(userId: string): Promise<PatientConversationListItem[]> {
    const parts = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, userId));
    const convIds = parts.map((p) => p.conversationId);
    if (convIds.length === 0) return [];

    const convRows = await db
      .select()
      .from(conversations)
      .where(and(inArray(conversations.id, convIds), eq(conversations.type, "patient")));

    const currentUser = await this.getUser(userId);
    const isDoctor = !!currentUser?.isAdmin;

    const items: PatientConversationListItem[] = [];
    for (const conv of convRows) {
      const participants = await this.getConversationParticipants(conv.id);
      const other = participants.find((p) => p.userId !== userId);
      const lastSeenAt = await this.getConversationParticipantLastSeenAt(conv.id, userId);

      const unreadConditions = [
        eq(conversationMessages.conversationId, conv.id),
        ne(conversationMessages.authorUserId, userId),
        sql`${conversationMessages.deletedAt} IS NULL`,
      ];
      if (lastSeenAt) {
        unreadConditions.push(gt(conversationMessages.createdAt, lastSeenAt));
      }
      const [unreadRow] = await db
        .select({ c: count() })
        .from(conversationMessages)
        .where(and(...unreadConditions));

      let avatarUrl: string | null = conv.avatarUrl ?? null;
      let otherParticipantId: string | undefined;
      let otherParticipantName: string | undefined;

      if (isDoctor) {
        const patientUser = conv.patientUserId ? await this.getUser(conv.patientUserId) : undefined;
        avatarUrl = conv.avatarUrl ?? patientUser?.profileImageUrl ?? null;
        otherParticipantName = conv.name ?? undefined;
      } else if (other?.user) {
        otherParticipantId = other.userId;
        avatarUrl = conv.avatarUrl ?? other.user.profileImageUrl ?? null;
        otherParticipantName =
          [other.user.firstName, other.user.lastName].filter(Boolean).join(" ").trim() ||
          other.user.email ||
          undefined;
      }

      items.push({
        conversationId: conv.id,
        name: conv.name,
        patientUserId: conv.patientUserId,
        avatarUrl,
        lastMessageAt: conv.lastMessageAt,
        lastMessagePreview: conv.lastMessagePreview,
        unreadCount: Number(unreadRow?.c ?? 0),
        otherParticipantId,
        otherParticipantName: isDoctor ? conv.name ?? otherParticipantName : otherParticipantName,
      });
    }

    items.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return (a.name ?? "").localeCompare(b.name ?? "", "ru");
    });

    return items;
  }
}

export const storage = new DatabaseStorage();
