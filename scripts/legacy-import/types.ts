export type SourceUser = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  profile_image_url?: string | null;
  is_admin?: boolean;
  subscription_expires_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  password_hash?: string | null;
  reset_token?: string | null;
  reset_token_expires_at?: string | null;
  gender?: string | null;
  birth_month?: number | null;
  birth_year?: number | null;
  height?: number | null;
  weight?: number | null;
  city?: string | null;
};

export type SourceTag = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SourceArticleTag = {
  article_id: string;
  tag_id: string;
  created_at?: string | null;
};

export type SourceArticle = {
  id: string;
  slug: string;
  preview: string;
  content: string;
  is_free: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SourceArticleLike = {
  id: string;
  article_id: string;
  user_id: string;
  created_at?: string | null;
};

export type SourcePayment = {
  id: string;
  user_id: string;
  amount: string;
  invoice_id: string;
  description?: string | null;
  status: string;
  receipt_url?: string | null;
  robokassa_data?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ImportPhaseResult = {
  total: number;
  inserted: number;
  skipped: number;
  failed: number;
  details?: Record<string, number>;
};
