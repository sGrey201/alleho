import { sql } from 'drizzle-orm';
import {
  index,
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
