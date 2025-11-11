# Design Guidelines: Trilingual Homeopathy Content Platform

## Design Approach

**Hybrid Approach**: Medium-inspired reading experience + systematic admin interface
- **Content Pages**: Draw from Medium's clean article layout, generous whitespace, and reader-first typography
- **Admin Dashboard**: Systematic, utility-focused design for efficient content and subscription management
- **Subscription Elements**: Inspired by Boosty's clear value communication and status indicators

## Typography System

**Font Families** (via Google Fonts CDN):
- UI Elements: Source Sans Pro (300, 400, 600, 700)
- Article Titles: Source Sans Pro (700)
- Article Body: Lora (400, 400 italic, 700)

**Type Scale**:
- Hero/Page Titles: text-5xl (48px) font-bold
- Article Titles: text-4xl (36px) font-bold (Lora)
- Section Headers: text-2xl (24px) font-semibold
- Subsection Headers: text-xl (20px) font-semibold
- Article Body: text-lg (18px) leading-relaxed (Lora)
- UI Text: text-base (16px)
- Small/Meta: text-sm (14px)
- Micro/Labels: text-xs (12px)

## Layout System

**Spacing Primitives**: Use Tailwind units 2, 4, 6, 8, 12, 16, 20
- Component padding: p-4, p-6, p-8
- Section spacing: py-12, py-16, py-20
- Element gaps: gap-4, gap-6, gap-8
- Margins: m-2, m-4, mb-8, mt-12

**Container Widths**:
- Article content: max-w-3xl (prose width ~750px)
- Admin forms: max-w-4xl
- Full-width sections: max-w-7xl
- Cards/Lists: max-w-6xl

**Grid Patterns**:
- Article cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Admin tables: Single column with responsive horizontal scroll
- Subscription status: Side-by-side two-column layout (info + actions)

## Component Library

### Navigation
**Header**: Full-width sticky header with max-w-7xl container
- Logo left, language switcher (flag icons + dropdown) center-right, user menu right
- Height: h-16
- Border bottom: border-b with subtle shadow on scroll
- Mobile: Hamburger menu with slide-out drawer

**Language Switcher**: Dropdown showing current language with flags
- Icons: Use flag emoji or Heroicons globe icon
- Dropdown shows all three languages: Русский, Deutsch, English

### Article Components

**Article Card** (Browse page):
- Aspect ratio: 4:3 for featured image area
- Structure: Image top, content bottom with p-6
- Title: text-xl font-bold, 2-line clamp
- Preview: text-base, 3-line clamp
- Meta row: tags (badge style), reading time, language indicator
- Hover: Subtle lift with shadow-lg transition

**Article Reader Page**:
- Hero area: Full-width title + meta (author, date, tags, reading time)
- Content: max-w-3xl centered, generous line-height (leading-relaxed)
- Paragraph spacing: mb-6
- Inline links: Underline on hover
- Subscription Gate: Blur effect on locked content with centered CTA overlay

**Tag System**:
- Visual: Rounded badges with border, px-3 py-1
- Clickable: Hover state with filled background
- Multiple tags: Flex wrap with gap-2
- Color coding: Use accent color for tags

### Admin Dashboard

**Layout**: Sidebar navigation + main content area
- Sidebar: w-64, fixed, full-height with sections (Articles, Users, Subscriptions)
- Main: ml-64, p-8
- Mobile: Sidebar collapses to hamburger

**Article Editor**:
- Tab interface for three languages (Russian, Deutsch, English)
- Active tab highlighted with bottom border
- Fields per language: Title (text input), Content (rich text editor or textarea)
- Shared fields: Tags (multi-select with autocomplete), Publication status toggle
- Action buttons: Save Draft, Publish (prominent), Cancel

**User Management Table**:
- Columns: Email, Role, Subscription Status, Expiry Date, Actions
- Status badges: Active (success), Trial (accent), Expired (neutral)
- Actions: Dropdown menu (Edit, Extend, Deactivate)
- Search bar above table
- Pagination below table

**Subscription Management Modal**:
- Form fields: Subscription status (select), Expiry date (date picker)
- Quick actions: +7 days, +30 days, +1 year buttons
- Save/Cancel buttons

### Authentication & Subscription

**Login/Signup**: Centered card, max-w-md
- Replit Auth button prominent
- Minimal form design

**Subscription Status Indicator**:
- Banner below header showing trial/subscription info
- Format: "Trial: X days remaining" or "Subscribed until: [date]"
- Dismiss option for banner

**Upgrade Prompt** (for free/expired users):
- Modal overlay when attempting to read full article
- Benefits list with checkmarks
- Contact admin CTA (since no Stripe)

### Forms & Inputs

**Text Inputs**: 
- Height: h-12
- Padding: px-4
- Border: border-2, rounded-lg
- Focus: Ring with accent color

**Buttons**:
- Primary: Filled with primary color, px-6 py-3, rounded-lg, font-semibold
- Secondary: Outlined, same padding
- Text buttons: No background, underline on hover

**Search Bar**:
- Width: Full width on mobile, max-w-xl on desktop
- Icon: Heroicons magnifying glass left-aligned
- Clear button: X icon right-aligned when text present
- Autocomplete dropdown: Absolute positioned, shadow-xl, max-h-96 overflow-y-auto

### Feedback Elements

**Badges**: 
- Size: px-3 py-1, text-xs font-semibold, rounded-full
- Types: Status (subscription), Tags (article), Language indicator

**Alerts**: 
- Full-width or contained
- Types: Success (subscription activated), Warning (trial expiring), Info (language changed)
- Dismissible with X button

**Loading States**: 
- Skeleton screens for article cards
- Spinner for form submissions
- Progress bar for file uploads (if article images added later)

## Icons
**Library**: Heroicons via CDN (outline for general UI, solid for emphasis)
- Navigation: menu, user-circle, globe
- Actions: pencil, trash, plus-circle
- Status: check-circle, x-circle, clock
- Search: magnifying-glass
- Language: flag or translation icons

## Responsive Breakpoints
- Mobile: < 768px (base)
- Tablet: 768px - 1024px (md:)
- Desktop: > 1024px (lg:)

**Mobile Adaptations**:
- Stack article cards to single column
- Collapse admin sidebar to drawer
- Full-width search bar
- Simplified table views (card format)

## Accessibility
- ARIA labels for all interactive elements in three languages
- Focus visible states for keyboard navigation
- Sufficient contrast ratios (WCAG AA minimum)
- Screen reader text for icon-only buttons
- Skip to content link
- Language attribute updates on language switch

## Images
**Hero Image**: No dedicated hero image for this content platform - prioritize immediate access to articles

**Article Images**: 
- Featured image for each article card (16:9 or 4:3 aspect ratio)
- Admin can upload one featured image per article
- Placeholder: Professional medical/homeopathy themed stock images (herbs, botanical illustrations, consultation scenes)
- Display: Object-fit cover, lazy loading

**Location**: Article card thumbnails, article header (optional full-width featured image)

## Animation Guidelines
**Minimal Animations Only**:
- Card hover: Subtle lift (translateY -2px) + shadow
- Button states: Standard hover/active without custom animations
- Page transitions: None - instant navigation
- Dropdown/Modal: Simple fade in (duration-200)
- No scroll-triggered animations
- No parallax effects