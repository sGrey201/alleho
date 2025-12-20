# Trilingual Homeopathy Content Platform

## Overview

This is a subscription-based homeopathy content platform that delivers professional articles about homeopathic remedies and patient cases in three languages: Russian, German, and English. The application features a clean, Medium-inspired reading experience for content consumption and a systematic admin interface for managing articles and user subscriptions. Built with React, Express, and PostgreSQL, it uses Replit Auth for authentication and implements content access control based on subscription status.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Routing**
- React 18 with TypeScript for type safety
- Wouter for lightweight client-side routing
- Vite as the build tool and development server

**UI Component System**
- Radix UI primitives for accessible, unstyled components
- shadcn/ui component library with "new-york" style variant
- Tailwind CSS for styling with custom design tokens
- Custom CSS variables for theme support (light/dark mode ready)

**State Management**
- TanStack Query (React Query) for server state management and caching
- React Context API for language selection and user authentication state
- Local storage for persisting user language preferences

**Design Philosophy**
- Medium-inspired article reading experience with serif fonts (Lora) for content
- Sans-serif fonts (Source Sans Pro) for UI elements
- Generous whitespace and clean typography hierarchy
- Responsive design with mobile-first approach
- Elevation-based visual hierarchy using custom hover/active states

### Backend Architecture

**Server Framework**
- Express.js for HTTP server and API routing
- Session-based authentication using express-session
- Middleware for request logging and JSON body parsing

**Database Layer**
- Drizzle ORM for type-safe database queries
- Neon Serverless PostgreSQL with WebSocket support
- Session storage in PostgreSQL using connect-pg-simple
- Schema-first approach with drizzle-zod for validation

**Authentication & Authorization**
- Replit OpenID Connect (OIDC) authentication
- Passport.js strategy for OIDC integration
- Role-based access control (admin vs regular users)
- Subscription-based content access control
- Return-to-origin navigation: users return to the page they came from after login (via returnTo query parameter)

**Content Access Model**
- Free users: Preview-only access (first 1000 characters of articles)
- Subscribed users: Full article access
- Time-based subscription expiration tracking
- Admin users: Full platform management capabilities

### Data Models

**Users Table**
- Unique identifier, email, profile information
- Admin flag for privileged access
- Subscription expiration timestamp
- Preferred language setting (ru/de/en)
- Audit timestamps (created/updated)

**Articles Table**
- Trilingual content storage (separate fields for ru/de/en)
- Title and content for each language
- Tag-based categorization
- SEO-friendly slug
- Featured status flag
- Publishing status and timestamps

**Tags Table**
- Normalized tag storage with category classification
- Two tag categories: "remedy" (homeopathic remedies from Boericke's Materia Medica) and "situation" (clinical scenarios)
- SEO-friendly slug for each tag
- Many-to-many relationship with articles via article_tags junction table
- Index on category field for efficient filtering

**Sessions Table**
- PostgreSQL-based session storage
- Automatic expiration handling
- Supports Replit Auth token management

### API Structure

**Authentication Routes**
- `/api/auth/user` - Get current user profile
- `/api/login?returnTo=/path` - Initiate OIDC authentication flow with optional return URL
- `/api/callback` - OIDC callback handler (redirects to returnTo or homepage)
- `/api/logout` - End user session

**Public Article Routes** (require authentication)
- `GET /api/articles` - List all articles (content filtered by subscription)
- `GET /api/articles/:id` - Get single article (access controlled by subscription)

**Tag Routes** (require authentication)
- `GET /api/tags` - List all tags with optional category filter (?category=remedy|situation)

**Admin Routes** (require admin role)
- `POST /api/admin/articles` - Create new article
- `PUT /api/admin/articles/:id` - Update article
- `DELETE /api/admin/articles/:id` - Delete article
- `GET /api/admin/users` - List all users
- `PUT /api/admin/users/:id/subscription` - Update user subscription
- `PUT /api/admin/users/:id/language` - Update user language preference
- `POST /api/admin/tags` - Create new tag (with category: remedy|situation)
- `PUT /api/admin/tags/:id` - Update tag
- `DELETE /api/admin/tags/:id` - Delete tag

### Internationalization

**Supported Languages**
- Russian (ru) - Primary language
- German (de) - Secondary language
- English (en) - Secondary language

**Translation Strategy**
- Client-side translation dictionary stored in `client/src/lib/i18n.ts`
- Context provider for language switching
- Persistent language preference in localStorage
- All content (titles, descriptions, body) stored in all three languages
- UI translations for navigation, forms, and system messages

## Recent Changes

**December 20, 2025 - SEO Optimization**
- ✅ Added robots.txt with proper crawling directives
- ✅ Implemented react-helmet-async for dynamic meta tags
- ✅ Dynamic title, description, and Open Graph tags for article pages
- ✅ Schema.org JSON-LD structured data for articles (Article schema)
- ✅ Schema.org structured data for tag collection pages (CollectionPage schema)
- ✅ Dynamic canonical URLs for each page
- ✅ Created "All Remedies" page (/remedies) with full list of homeopathic remedies
- ✅ Created "All Situations" page (/situations) with full list of clinical cases
- ✅ Added catalog section to footer with links to /remedies and /situations
- ✅ Updated sitemap.xml with new pages and improved priority settings
- ✅ SEO component (client/src/components/SEO.tsx) for reusable meta tag management

**November 11, 2025 - Dual Tag Category System Implementation**
- ✅ Normalized tag system with two categories: "remedy" (homeopathic remedies) and "situation" (clinical scenarios)
- ✅ Database migration: added category field to tags table with index for performance
- ✅ Migrated 439 remedy tags from Boericke's Materia Medica as baseline data
- ✅ Dual search interface in ArticleBrowse: separate autocomplete fields for remedies and situations
- ✅ Color-coded badge system: blue/default variant for remedies, green/secondary variant for situations
- ✅ Admin tag management page with category-filtered views
- ✅ AdminArticles enhanced with tabbed tag selector for categorized tag assignment
- ✅ Fixed nested anchor tag issue in ArticleCard component
- ✅ Backend tag CRUD with category filtering via query parameters (/api/tags?category=remedy|situation)

**November 11, 2025 - MVP Completion**
- ✅ Complete trilingual content platform implementation
- ✅ Subscription-based content gating across all endpoints (list, detail, search)
- ✅ Automatic 7-day trial activation for new users
- ✅ Trial preservation logic - existing users retain their subscription status across logins
- ✅ Tag-based article search with multilingual keyword filtering
- ✅ Admin panel for article and subscription management
- ✅ Replit Auth integration with session persistence
- ✅ Medical blue aesthetic design implementation (#2C5282 primary, #38A169 secondary, #805AD5 accent)
- ✅ Fixed unauthenticated user experience (no loading screen loop)

**Critical Bug Fixes**
- Fixed subscription gating bypass in `/api/articles` endpoint
- Fixed subscription gating bypass in `/api/articles/search/:query` endpoint
- Fixed trial overwrite issue where subscriptions were reset on every login
- Implemented separate `updateUserProfile` method to preserve subscription data
- Enhanced search to include tags using PostgreSQL array unnest
- Fixed `useAuth` hook to properly handle 401 errors without infinite loading

## Manual Testing Guide

Since automated E2E tests cannot run due to OIDC test environment configuration, follow these manual testing steps:

### Testing New User Trial Activation
1. Open the application in an incognito/private browser window
2. Click "Login" on the landing page
3. Complete Replit Auth login
4. After redirect, check your subscription banner - it should show trial expiration ~7 days from now
5. Verify in database: `SELECT email, subscription_expires_at FROM users ORDER BY created_at DESC LIMIT 1;`

### Testing Content Gating
1. As a logged-in user, expire your subscription via admin panel OR directly in database:
   ```sql
   UPDATE users SET subscription_expires_at = NOW() - INTERVAL '1 day' WHERE email = 'your@email.com';
   ```
2. Navigate to article browse page
3. Click on any article - you should see only ~1000 characters of preview content
4. Look for subscription prompt/banner
5. Restore subscription: `UPDATE users SET subscription_expires_at = NOW() + INTERVAL '30 days' WHERE email = 'your@email.com';`
6. Refresh article page - full content should now be visible

### Testing Admin Functions
1. Set yourself as admin: `UPDATE users SET is_admin = true WHERE email = 'your@email.com';`
2. Reload the application
3. Navigate to `/admin/articles`
4. Create a new article with content in all three languages (Russian, German, English)
5. Verify article appears in browse page
6. Navigate to `/admin/subscriptions`
7. Extend a user's subscription and verify in database

### Testing Language Switching
1. Use the language selector in the header
2. Switch to Russian - UI and article titles should display in Cyrillic
3. Switch to German - UI and article titles should display in German
4. Switch to English - return to English interface
5. Language preference persists across page reloads

### Testing Dual Search with Tag Categories
1. Navigate to admin tag management page (`/admin/tags`)
2. Create remedy tags (e.g., "Arnica", "Belladonna") and situation tags (e.g., "Headache", "Fever")
3. In admin articles page, assign both remedy and situation tags to an article
4. Return to browse page - observe two separate search fields:
   - "Search by remedy..." (top field)
   - "Search by situation..." (bottom field)
5. Type partial remedy name (e.g., "Arni") - autocomplete should show remedy tags in blue badges
6. Type partial situation name (e.g., "Head") - autocomplete should show situation tags in green badges
7. Click a suggested tag - article list should filter to show matching articles
8. Verify article cards display tags with correct color coding (remedies=blue, situations=green)
9. Content filtering respects subscription status (preview vs full access)

## External Dependencies

### Database
- **Neon Serverless PostgreSQL** - Managed PostgreSQL database with WebSocket support
- Connection string required via `DATABASE_URL` environment variable
- Uses connection pooling for efficient resource usage

### Authentication
- **Replit OIDC** - OpenID Connect authentication service
- Requires `REPL_ID` and `ISSUER_URL` environment variables
- Handles user identity management and profile information
- New users automatically receive 7-day trial subscription

### Session Management
- **PostgreSQL Session Store** - Server-side session storage
- 7-day session TTL (time-to-live)
- Requires `SESSION_SECRET` environment variable

### Frontend Build Tools
- **Vite** - Fast build tool and dev server
- **Replit Vite Plugins** - Development enhancements (error overlay, cartographer, dev banner)

### UI Component Libraries
- **Radix UI** - Comprehensive set of unstyled, accessible component primitives
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Pre-built component library based on Radix UI

### Fonts
- **Google Fonts CDN** - Source Sans Pro (UI) and Lora (article content)
- Preconnected for performance optimization

### Utilities
- **date-fns** - Date formatting and manipulation
- **nanoid** - Unique ID generation for client-side operations
- **zod** - Schema validation for forms and API data