import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import {
  questionnaireInstanceDataSchema,
  questionnaireTemplateStructureSchema,
  type QuestionnaireInstanceData,
  type QuestionnaireTemplateStructure,
} from "./questionnaireTypes";

export type { QuestionnaireInstanceData, QuestionnaireTemplateStructure };

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (supports both Replit Auth and email/password auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  gender: varchar("gender", { length: 20 }),
  birthMonth: integer("birth_month"),
  birthYear: integer("birth_year"),
  height: integer("height"),
  weight: integer("weight"),
  country: varchar("country", { length: 255 }),
  city: varchar("city", { length: 255 }),
  passwordHash: varchar("password_hash"),
  resetToken: varchar("reset_token"),
  resetTokenExpiresAt: timestamp("reset_token_expires_at"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  questionnaireHintsMode: varchar("questionnaire_hints_mode", { length: 20 }).default("icon").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const inviteTypeEnum = z.enum(["patient", "homeopath"]);
export type InviteType = z.infer<typeof inviteTypeEnum>;

export const inviteStatusEnum = z.enum(["pending", "accepted", "expired", "revoked"]);
export type InviteStatus = z.infer<typeof inviteStatusEnum>;

export const invites = pgTable("invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email"),
  inviteType: varchar("invite_type", { length: 20 }).notNull().default("patient"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
  invitedByUserId: varchar("invited_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  acceptedUserId: varchar("accepted_user_id").references(() => users.id, { onDelete: "set null" }),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("invites_email_idx").on(table.email),
  index("invites_status_idx").on(table.status),
  index("invites_invited_by_idx").on(table.invitedByUserId),
  index("invites_expires_at_idx").on(table.expiresAt),
  index("invites_accepted_user_idx").on(table.acceptedUserId),
]);

export const insertInviteSchema = createInsertSchema(invites).omit({
  id: true,
  acceptedAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  inviteType: inviteTypeEnum.default("patient"),
  status: inviteStatusEnum.default("pending"),
});

export type InsertInvite = z.infer<typeof insertInviteSchema>;
export type Invite = typeof invites.$inferSelect;

// Tag category enum
export const tagCategoryEnum = z.enum(['remedy', 'situation']);
export type TagCategory = z.infer<typeof tagCategoryEnum>;

// Tags table (homeopathic remedies and situations)
export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 255 }).unique().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull().default('remedy'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("tags_category_idx").on(table.category),
]);

export const insertTagSchema = createInsertSchema(tags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  category: tagCategoryEnum.default('remedy'),
});

export const updateTagSchema = createInsertSchema(tags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  category: tagCategoryEnum.optional(),
}).partial();

export type InsertTag = z.infer<typeof insertTagSchema>;
export type UpdateTag = z.infer<typeof updateTagSchema>;
export type Tag = typeof tags.$inferSelect;

// Articles table (Russian content only)
export const articles = pgTable("articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 100 }).unique().notNull(),
  preview: text("preview").notNull(),
  content: text("content").notNull(),
  isFree: boolean("is_free").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("articles_created_at_idx").on(table.createdAt),
]);

// Junction table for article-tag many-to-many relationship
export const articleTags = pgTable("article_tags", {
  articleId: varchar("article_id").notNull().references(() => articles.id, { onDelete: 'cascade' }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("article_tags_article_idx").on(table.articleId),
  index("article_tags_tag_idx").on(table.tagId),
  sql`CONSTRAINT article_tags_unique UNIQUE (article_id, tag_id)`,
]);

export const insertArticleSchema = createInsertSchema(articles).omit({
  id: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
});

export const updateArticleSchema = createInsertSchema(articles).omit({
  createdAt: true,
  updatedAt: true,
}).partial();

export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type UpdateArticle = z.infer<typeof updateArticleSchema>;
export type Article = typeof articles.$inferSelect;

// Payments table for tracking Robokassa payments
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: varchar("amount").notNull(), // Store as string to match Robokassa API
  invoiceId: varchar("invoice_id").unique().notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 50 }).notNull().default('pending'), // pending, completed, failed
  robokassaData: jsonb("robokassa_data"), // Store callback data from Robokassa
  receiptUrl: text("receipt_url"), // URL to payment receipt
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("payments_user_idx").on(table.userId),
  index("payments_status_idx").on(table.status),
]);

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// Article likes table (one like per user per article)
export const articleLikes = pgTable("article_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").notNull().references(() => articles.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("article_likes_article_idx").on(table.articleId),
  index("article_likes_user_idx").on(table.userId),
  sql`CONSTRAINT article_likes_unique UNIQUE (article_id, user_id)`,
]);

export type ArticleLike = typeof articleLikes.$inferSelect;

export const questionnaireTemplates = pgTable(
  "questionnaire_templates",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    ownerUserId: varchar("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    structure: jsonb("structure").notNull().default({ root: [] }),
    isShared: boolean("is_shared").notNull().default(false),
    patientSendCount: integer("patient_send_count").notNull().default(0),
    copyCount: integer("copy_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("questionnaire_templates_owner_idx").on(table.ownerUserId)]
);

export const insertQuestionnaireTemplateSchema = createInsertSchema(questionnaireTemplates).omit({
  id: true,
  patientSendCount: true,
  copyCount: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().trim().min(1).max(255),
  structure: questionnaireTemplateStructureSchema,
});

export type QuestionnaireTemplate = typeof questionnaireTemplates.$inferSelect;
export type InsertQuestionnaireTemplate = z.infer<typeof insertQuestionnaireTemplateSchema>;

/** Messenger conversation messages — includes clinical types, polls, and questionnaires. */
export const conversationMessageTypeEnum = z.enum([
  'message',
  'prescription',
  'followup',
  'poll',
  'questionnaire',
  'questionnaire_template',
  'voice',
]);
export type ConversationMessageType = z.infer<typeof conversationMessageTypeEnum>;

/** JSON stored in conversation_messages.content when message_type is `poll`. */
export const pollPayloadSchema = z.object({
  question: z.string().trim().min(1).max(500),
  options: z.array(z.string().trim().min(1).max(200)).min(2).max(10),
  allowMultiple: z.boolean(),
});
export type PollPayload = z.infer<typeof pollPayloadSchema>;

/**
 * JSON stored in conversation_messages.content when message_type is `voice`.
 * The audio object path itself is stored in the `image_url` column (reused as a
 * generic attachment URL) so no schema migration is required.
 */
export const voicePayloadSchema = z.object({
  durationSec: z.number().int().min(0).max(36000),
});
export type VoicePayload = z.infer<typeof voicePayloadSchema>;

// Messenger: conversation types (doctor-to-doctor, patient chats, groups, consiliums, channels)
export const conversationTypeEnum = z.enum(["direct", "patient", "group", "consilium", "channel"]);
export type ConversationType = z.infer<typeof conversationTypeEnum>;

export const participantRoleEnum = z.enum(["member", "admin", "owner"]);
export type ParticipantRole = z.infer<typeof participantRoleEnum>;

export const conversations = pgTable(
  "conversations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    type: varchar("type", { length: 20 }).notNull(),
    name: varchar("name", { length: 255 }),
    avatarUrl: text("avatar_url"),
    patientUserId: varchar("patient_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Denormalized from latest conversation_messages row — avoids list queries on messages table */
    lastMessageAt: timestamp("last_message_at"),
    lastMessagePreview: text("last_message_preview"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("conversations_type_idx").on(table.type),
    index("conversations_patient_idx").on(table.patientUserId),
  ]
);

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({ type: conversationTypeEnum });

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull().default("member"),
    lastSeenAt: timestamp("last_seen_at"),
    joinedAt: timestamp("joined_at").defaultNow(),
  },
  (table) => [
    index("conversation_participants_conversation_idx").on(table.conversationId),
    index("conversation_participants_user_idx").on(table.userId),
    sql`CONSTRAINT conversation_participants_unique UNIQUE (conversation_id, user_id)`,
  ]
);

export const insertConversationParticipantSchema = createInsertSchema(conversationParticipants).omit({
  id: true,
  lastSeenAt: true,
  joinedAt: true,
}).extend({ role: participantRoleEnum.default("member") });

export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type InsertConversationParticipant = z.infer<typeof insertConversationParticipantSchema>;

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    authorUserId: varchar("author_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    messageType: varchar("message_type", { length: 50 }).notNull().default("message"),
    content: text("content"),
    imageUrl: text("image_url"),
    replyToMessageId: varchar("reply_to_message_id"),
    forwardedFromMessageId: varchar("forwarded_from_message_id"),
    forwardedFromUserId: varchar("forwarded_from_user_id"),
    editedAt: timestamp("edited_at"),
    deletedAt: timestamp("deleted_at"),
    pinnedAt: timestamp("pinned_at"),
    pinnedByUserId: varchar("pinned_by_user_id"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("conversation_messages_conversation_idx").on(table.conversationId),
    index("conversation_messages_created_idx").on(table.createdAt),
    index("conversation_messages_pinned_idx").on(table.conversationId, table.pinnedAt),
  ]
);

export const insertConversationMessageSchema = createInsertSchema(conversationMessages).omit({
  id: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  pinnedAt: true,
  pinnedByUserId: true,
}).extend({ messageType: conversationMessageTypeEnum.default("message") });

export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type InsertConversationMessage = z.infer<typeof insertConversationMessageSchema>;

export const questionnaireInstances = pgTable(
  "questionnaire_instances",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    templateId: varchar("template_id")
      .notNull()
      .references(() => questionnaireTemplates.id, { onDelete: "restrict" }),
    conversationId: varchar("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageId: varchar("message_id").references(() => conversationMessages.id, { onDelete: "set null" }),
    patientUserId: varchar("patient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    doctorUserId: varchar("doctor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    structureSnapshot: jsonb("structure_snapshot").notNull(),
    data: jsonb("data").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("questionnaire_instances_conversation_idx").on(table.conversationId),
    index("questionnaire_instances_patient_idx").on(table.patientUserId),
    index("questionnaire_instances_doctor_idx").on(table.doctorUserId),
  ]
);

export const insertQuestionnaireInstanceSchema = createInsertSchema(questionnaireInstances).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  structureSnapshot: questionnaireTemplateStructureSchema,
  data: questionnaireInstanceDataSchema,
});

export type QuestionnaireInstance = typeof questionnaireInstances.$inferSelect;
export type InsertQuestionnaireInstance = z.infer<typeof insertQuestionnaireInstanceSchema>;

export const conversationPollVotes = pgTable(
  "conversation_poll_votes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    messageId: varchar("message_id")
      .notNull()
      .references(() => conversationMessages.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    optionIndex: integer("option_index").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("conversation_poll_votes_message_idx").on(table.messageId),
    index("conversation_poll_votes_user_idx").on(table.userId),
    sql`CONSTRAINT conversation_poll_votes_unique UNIQUE (message_id, user_id, option_index)`,
  ]
);

export type ConversationPollVote = typeof conversationPollVotes.$inferSelect;

export const conversationMessageReactions = pgTable("conversation_message_reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => conversationMessages.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  emoji: varchar("emoji", { length: 16 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("conversation_message_reactions_message_idx").on(table.messageId),
  index("conversation_message_reactions_user_idx").on(table.userId),
  sql`CONSTRAINT conversation_message_reactions_unique UNIQUE (message_id, user_id, emoji)`,
]);

export const insertConversationMessageReactionSchema = createInsertSchema(conversationMessageReactions).omit({
  id: true,
  createdAt: true,
});

export type ConversationMessageReaction = typeof conversationMessageReactions.$inferSelect;
export type InsertConversationMessageReaction = z.infer<typeof insertConversationMessageReactionSchema>;

export const conversationMessageDeliveries = pgTable(
  "conversation_message_deliveries",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    messageId: varchar("message_id")
      .notNull()
      .references(() => conversationMessages.id, { onDelete: "cascade" }),
    recipientUserId: varchar("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deliveredAt: timestamp("delivered_at").defaultNow().notNull(),
  },
  (table) => [
    index("conversation_message_deliveries_message_idx").on(table.messageId),
    sql`CONSTRAINT conversation_message_deliveries_unique UNIQUE (message_id, recipient_user_id)`,
  ]
);

export const conversationMessageComments = pgTable(
  "conversation_message_comments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    conversationId: varchar("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageId: varchar("message_id")
      .notNull()
      .references(() => conversationMessages.id, { onDelete: "cascade" }),
    authorUserId: varchar("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content"),
    imageUrl: text("image_url"),
    replyToCommentId: varchar("reply_to_comment_id"),
    editedAt: timestamp("edited_at"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("conversation_message_comments_message_idx").on(table.messageId),
    index("conversation_message_comments_author_idx").on(table.authorUserId),
    index("conversation_message_comments_created_idx").on(table.createdAt),
  ]
);

export const insertConversationMessageCommentSchema = createInsertSchema(conversationMessageComments).omit({
  id: true,
  editedAt: true,
  deletedAt: true,
  createdAt: true,
});

export type ConversationMessageComment = typeof conversationMessageComments.$inferSelect;
export type InsertConversationMessageComment = z.infer<typeof insertConversationMessageCommentSchema>;

export const conversationMessageCommentReactions = pgTable(
  "conversation_message_comment_reactions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    commentId: varchar("comment_id")
      .notNull()
      .references(() => conversationMessageComments.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: varchar("emoji", { length: 16 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("conversation_message_comment_reactions_comment_idx").on(table.commentId),
    index("conversation_message_comment_reactions_user_idx").on(table.userId),
    sql`CONSTRAINT conversation_message_comment_reactions_unique UNIQUE (comment_id, user_id, emoji)`,
  ]
);

export const insertConversationMessageCommentReactionSchema = createInsertSchema(
  conversationMessageCommentReactions
).omit({
  id: true,
  createdAt: true,
});

export type ConversationMessageCommentReaction = typeof conversationMessageCommentReactions.$inferSelect;
export type InsertConversationMessageCommentReaction = z.infer<
  typeof insertConversationMessageCommentReactionSchema
>;

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("push_subscriptions_user_idx").on(table.userId),
    sql`CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)`,
  ]
);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;
