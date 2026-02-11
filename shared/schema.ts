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
  city: varchar("city", { length: 255 }),
  passwordHash: varchar("password_hash"),
  resetToken: varchar("reset_token"),
  resetTokenExpiresAt: timestamp("reset_token_expires_at"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

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

// User questionnaire table
export const userQuestionnaires = pgTable("user_questionnaires", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  data: jsonb("data").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("user_questionnaires_user_idx").on(table.userId),
]);

export const questionnaireDataSchema = z.object({
  head: z.object({
    problem: z.string().optional(),
    better: z.string().optional(),
    worse: z.string().optional(),
  }).optional(),
  face: z.object({
    problem: z.string().optional(),
    better: z.string().optional(),
    worse: z.string().optional(),
  }).optional(),
  neck: z.object({
    problem: z.string().optional(),
    better: z.string().optional(),
    worse: z.string().optional(),
  }).optional(),
  chest: z.object({
    problem: z.string().optional(),
    better: z.string().optional(),
    worse: z.string().optional(),
  }).optional(),
  heartBreathing: z.object({
    problem: z.string().optional(),
    better: z.string().optional(),
    worse: z.string().optional(),
  }).optional(),
  stomach: z.object({
    problem: z.string().optional(),
    better: z.string().optional(),
    worse: z.string().optional(),
  }).optional(),
  back: z.object({
    problem: z.string().optional(),
    better: z.string().optional(),
    worse: z.string().optional(),
  }).optional(),
  arms: z.object({
    problem: z.string().optional(),
    better: z.string().optional(),
    worse: z.string().optional(),
  }).optional(),
  legs: z.object({
    problem: z.string().optional(),
    better: z.string().optional(),
    worse: z.string().optional(),
  }).optional(),
  joints: z.object({
    problem: z.string().optional(),
    better: z.string().optional(),
    worse: z.string().optional(),
  }).optional(),
  muscles: z.object({
    problem: z.string().optional(),
    better: z.string().optional(),
    worse: z.string().optional(),
  }).optional(),
  skin: z.object({
    problem: z.string().optional(),
    better: z.string().optional(),
    worse: z.string().optional(),
  }).optional(),
  reproductive: z.object({
    problem: z.string().optional(),
    better: z.string().optional(),
    worse: z.string().optional(),
  }).optional(),
  psyche: z.string().optional(),
  sleep: z.string().optional(),
  energy: z.string().optional(),
  cognitive: z.string().optional(),
  behavior: z.string().optional(),
  character: z.string().optional(),
  social: z.string().optional(),
  general: z.string().optional(),
  medicalHistory: z.string().optional(),
  homeopathNotes: z.string().optional(),
  // General patient info section
  occupation: z.object({ tags: z.array(z.string()).optional(), description: z.string().optional() }).optional(),
  familyStatus: z.object({ tags: z.array(z.string()).optional(), description: z.string().optional() }).optional(),
  appearanceConstitution: z.object({ tags: z.array(z.string()).optional(), description: z.string().optional() }).optional(),
  // Medical history section
  familyDiseases: z.object({ tags: z.array(z.string()).optional(), description: z.string().optional() }).optional(),
  // Psyche and mental section
  moodAndEnergy: z.object({
    tags: z.array(z.string()).optional(),
    description: z.string().optional(),
  }).optional(),
  socialRelations: z.object({
    tags: z.array(z.string()).optional(),
    description: z.string().optional(),
  }).optional(),
  willControl: z.object({
    tags: z.array(z.string()).optional(),
    description: z.string().optional(),
  }).optional(),
  intellectImagination: z.object({ tags: z.array(z.string()).optional(), description: z.string().optional() }).optional(),
  fears: z.object({ tags: z.array(z.string()).optional(), description: z.string().optional() }).optional(),
  emotionalReactions: z.object({ tags: z.array(z.string()).optional(), description: z.string().optional() }).optional(),
  specialMentalStates: z.object({ tags: z.array(z.string()).optional(), description: z.string().optional() }).optional(),
  desiresAversions: z.object({ tags: z.array(z.string()).optional(), description: z.string().optional() }).optional(),
  reactionToSuffering: z.object({ tags: z.array(z.string()).optional(), description: z.string().optional() }).optional(),
  // Settings fields
  patientName: z.string().optional(),
  birthMonth: z.number().min(1).max(12).optional(),
  birthYear: z.number().min(1900).max(2100).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  sharedWithEmails: z.array(z.string().email()).optional(),
});

export type QuestionnaireData = z.infer<typeof questionnaireDataSchema>;
export type UserQuestionnaire = typeof userQuestionnaires.$inferSelect;

// Health wall message type enum
export const healthWallMessageTypeEnum = z.enum(['message', 'prescription', 'followup']);
export type HealthWallMessageType = z.infer<typeof healthWallMessageTypeEnum>;

// Health wall messages table (chat between doctor and patient)
export const healthWallMessages = pgTable("health_wall_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientUserId: varchar("patient_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  authorUserId: varchar("author_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  messageType: varchar("message_type", { length: 50 }).notNull().default('message'),
  content: text("content"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("health_wall_patient_idx").on(table.patientUserId),
  index("health_wall_created_idx").on(table.createdAt),
]);

export const insertHealthWallMessageSchema = createInsertSchema(healthWallMessages).omit({
  id: true,
  createdAt: true,
}).extend({
  messageType: healthWallMessageTypeEnum.default('message'),
});

export type InsertHealthWallMessage = z.infer<typeof insertHealthWallMessageSchema>;
export type HealthWallMessage = typeof healthWallMessages.$inferSelect;

// Health wall doctors table (doctors connected to patient's health wall)
export const healthWallDoctors = pgTable("health_wall_doctors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientUserId: varchar("patient_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  doctorUserId: varchar("doctor_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").defaultNow(),
  lastVisitedAt: timestamp("last_visited_at"),
  patientLastVisitedAt: timestamp("patient_last_visited_at"),
}, (table) => [
  index("health_wall_doctors_patient_idx").on(table.patientUserId),
  index("health_wall_doctors_doctor_idx").on(table.doctorUserId),
  sql`CONSTRAINT health_wall_doctors_unique UNIQUE (patient_user_id, doctor_user_id)`,
]);

export const insertHealthWallDoctorSchema = createInsertSchema(healthWallDoctors).omit({
  id: true,
  createdAt: true,
  lastVisitedAt: true,
  patientLastVisitedAt: true,
});

export type InsertHealthWallDoctor = z.infer<typeof insertHealthWallDoctorSchema>;
export type HealthWallDoctor = typeof healthWallDoctors.$inferSelect;
