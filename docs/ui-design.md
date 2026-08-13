# EIAMS — UI Design System

## نظام التصميم لواجهة نظام إدارة المخزون والأصول المؤسسي

---

## 1. Brand Colors (Syrian New Identity Palette)

### 1.1 Color Tokens

| Token              | Hex       | Usage                                                                                 |
| ------------------ | --------- | ------------------------------------------------------------------------------------- |
| **Forest**         | `#002623` | Primary dark — headers, sidebar, primary buttons, top navigation                      |
| **Emerald Shadow** | `#054239` | Secondary — hover states, active menu items, secondary buttons                        |
| **Mountain Teal**  | `#428177` | Accent — links, info badges, progress indicators, highlights                          |
| **Golden Wheat**   | `#988561` | Accent Gold — icons, decorative elements, status badges (warning), premium highlights |
| **Antique Sand**   | `#B9A779` | Accent Light — borders, dividers, subtle highlights, disabled state text              |
| **Ivory Mist**     | `#EDEBE0` | Background — page backgrounds, card backgrounds, table alternate rows                 |
| **Deep Umber**     | `#260F14` | Dark accent — footer backgrounds, modal overlays, error/destructive states            |
| **Black Cherry**   | `#4A151E` | Error red — error messages, delete buttons, critical alerts                           |
| **Damask Red**     | `#6B1F2A` | Warning red — pending items, attention-required badges, high-priority indicators      |
| **Charcoal**       | `#161616` | Text primary — main body text, headings, table content                                |
| **Stone**          | `#3D3A3B` | Text secondary — labels, placeholders, helper text, metadata                          |
| **White**          | `#FFFFFF` | Surface — cards, modals, input backgrounds, dropdowns                                 |

### 1.2 Semantic Color Mapping

```typescript
// tailwind.config.ts — Custom Color Extension
colors: {
  primary: {
    DEFAULT: '#002623',    // Forest
    light: '#054239',      // Emerald Shadow
    lighter: '#428177',    // Mountain Teal
  },
  accent: {
    gold: '#988561',       // Golden Wheat
    sand: '#B9A779',       // Antique Sand
  },
  surface: {
    ivory: '#EDEBE0',      // Ivory Mist
    white: '#FFFFFF',
  },
  status: {
    success: '#428177',    // Mountain Teal
    warning: '#988561',    // Golden Wheat
    error: '#4A151E',      // Black Cherry
    critical: '#6B1F2A',   // Damask Red
  },
  text: {
    primary: '#161616',    // Charcoal
    secondary: '#3D3A3B',  // Stone
    inverse: '#FFFFFF',
  },
  destructive: {
    DEFAULT: '#4A151E',    // Black Cherry
    light: '#6B1F2A',      // Damask Red
    dark: '#260F14',       // Deep Umber
  },
}
```

### 1.3 Status Badge Colors

| Status         | Background                           | Text  |
| -------------- | ------------------------------------ | ----- |
| **Draft**      | Golden Wheat `#988561`               | White |
| **Submitted**  | Mountain Teal `#428177`              | White |
| **Approved**   | Forest `#002623`                     | White |
| **Posted**     | Forest `#002623` with checkmark icon | White |
| **Cancelled**  | Black Cherry `#4A151E`               | White |
| **Planned**    | Golden Wheat `#988561`               | White |
| **InProgress** | Mountain Teal `#428177`              | White |
| **Completed**  | Forest `#002623`                     | White |
| **Pending**    | Damask Red `#6B1F2A`                 | White |
| **Active**     | Mountain Teal `#428177`              | White |
| **Returned**   | Stone `#3D3A3B`                      | White |

---

## 2. Typography

### 2.1 Font Stack

| Usage              | Font                                                             |
| ------------------ | ---------------------------------------------------------------- |
| **Arabic UI**      | `'Traditional Arabic', 'Noto Sans Arabic', 'Tahoma', sans-serif` |
| **English UI**     | `'Inter', 'Segoe UI', 'Roboto', sans-serif`                      |
| **Monospace/Code** | `'Cascadia Code', 'JetBrains Mono', monospace`                   |

### 2.2 Type Scale

```typescript
// Design tokens
typography: {
  fontFamily: {
    arabic: "'Traditional Arabic', 'Noto Sans Arabic', 'Tahoma', sans-serif",
    english: "'Inter', 'Segoe UI', 'Roboto', sans-serif",
  },
  fontSize: {
    'xs':   '0.75rem',    // 12px — Labels, captions, metadata
    'sm':   '0.8125rem',  // 13px — Table cells
    'base': '0.875rem',   // 14px — Body text, form labels
    'md':   '1rem',       // 16px — Body large
    'lg':   '1.125rem',   // 18px — Section titles
    'xl':   '1.25rem',    // 20px — Card titles
    '2xl':  '1.5rem',     // 24px — Page headings
    '3xl':  '1.75rem',    // 28px — Dashboard numbers
    '4xl':  '2rem',       // 32px — Main headings
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
}
```

### 2.3 Typography Usage

| Element            | Size             | Weight         | Color                  |
| ------------------ | ---------------- | -------------- | ---------------------- |
| Page title (H1)    | 24px (1.5rem)    | Bold (700)     | Charcoal `#161616`     |
| Section title (H2) | 20px (1.25rem)   | Semibold (600) | Charcoal `#161616`     |
| Card title (H3)    | 18px (1.125rem)  | Semibold (600) | Charcoal `#161616`     |
| Body text          | 14px (0.875rem)  | Regular (400)  | Charcoal `#161616`     |
| Body large         | 16px (1rem)      | Regular (400)  | Charcoal `#161616`     |
| Table header       | 13px (0.8125rem) | Semibold (600) | Stone `#3D3A3B`        |
| Table cell         | 13px (0.8125rem) | Regular (400)  | Charcoal `#161616`     |
| Label              | 12px (0.75rem)   | Medium (500)   | Stone `#3D3A3B`        |
| Placeholder        | 14px (0.875rem)  | Regular (400)  | Stone `#3D3A3B`        |
| Helper text        | 12px (0.75rem)   | Regular (400)  | Stone `#3D3A3B`        |
| KPI value          | 28px (1.75rem)   | Bold (700)     | Charcoal `#161616`     |
| KPI label          | 12px (0.75rem)   | Medium (500)   | Stone `#3D3A3B`        |
| Breadcrumb         | 12px (0.75rem)   | Regular (400)  | Antique Sand `#B9A779` |
| Badge text         | 11px (0.6875rem) | Semibold (600) | White                  |
| Button             | 14px (0.875rem)  | Semibold (600) | —                      |

---

## 3. Spacing & Layout

### 3.1 Spacing Scale (8px Grid System)

```typescript
spacing: {
  '0.5': '0.25rem',   // 4px
  '1':   '0.5rem',    // 8px
  '1.5': '0.75rem',   // 12px
  '2':   '1rem',      // 16px
  '2.5': '1.25rem',   // 20px
  '3':   '1.5rem',    // 24px
  '4':   '2rem',      // 32px
  '5':   '2.5rem',    // 40px
  '6':   '3rem',      // 48px
  '8':   '4rem',      // 64px
  '10':  '5rem',      // 80px
}
```

### 3.2 Layout Spacing Standards

| Context                     | Value                           |
| --------------------------- | ------------------------------- |
| Page padding (desktop)      | 32px                            |
| Page padding (tablet)       | 24px                            |
| Page padding (mobile)       | 16px                            |
| Card padding                | 24px                            |
| Card gap (between cards)    | 24px                            |
| Section margin-bottom       | 32px                            |
| Form field gap              | 20px                            |
| Table cell padding          | 12px 16px                       |
| Modal padding               | 32px                            |
| Button padding (horizontal) | 24px (lg), 16px (md), 12px (sm) |
| Button padding (vertical)   | 12px (lg), 8px (md), 6px (sm)   |

### 3.3 Border Radius

| Token         | Value  | Usage                        |
| ------------- | ------ | ---------------------------- |
| `radius-sm`   | 4px    | Inputs, small badges         |
| `radius-md`   | 6px    | Buttons, form fields         |
| `radius-lg`   | 8px    | Cards, modals, dropdowns     |
| `radius-xl`   | 12px   | Large cards, main containers |
| `radius-full` | 9999px | Pills, status badges, avatar |

### 3.4 Shadows

```typescript
boxShadow: {
  'card':     '0 2px 12px rgba(0, 0, 0, 0.08)',
  'card-hover': '0 4px 20px rgba(0, 0, 0, 0.12)',
  'modal':    '0 8px 32px rgba(0, 0, 0, 0.15)',
  'dropdown': '0 4px 16px rgba(0, 0, 0, 0.1)',
  'sidebar':  '2px 0 12px rgba(0, 0, 0, 0.1)',
  'button':   '0 2px 8px rgba(0, 38, 35, 0.2)',
  'toast':    '0 4px 24px rgba(0, 0, 0, 0.15)',
}
```

---

## 4. Layout Structure

### 4.1 Main Application Layout

```
┌──────────────────────────────────────────────────────────┐
│  Top Navigation Bar (Header) — Forest #002623            │
│  Logo | System Name | Breadcrumb | Notifications | User  │
├──────────┬───────────────────────────────────────────────┤
│          │                                               │
│  Sidebar │  Main Content Area                            │
│  Forest  │  Background: Ivory Mist #EDEBE0              │
│  #002623 │                                               │
│          │  ┌─────────────────────────────────────────┐  │
│          │  │  Page Header (White card)               │  │
│          │  │  Title + Action Buttons                 │  │
│          │  ├─────────────────────────────────────────┤  │
│          │  │                                         │  │
│          │  │  Content Card (White #FFFFFF)           │  │
│          │  │  radius-xl, shadow-card                 │  │
│          │  │                                         │  │
│          │  └─────────────────────────────────────────┘  │
│          │                                               │
├──────────┴───────────────────────────────────────────────┤
│  Footer — Stone #3D3A3B text, small 12px                 │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Top Navigation Bar

- **Height:** 64px
- **Background:** Forest `#002623`
- **Left section:** Small logo (32x32) + "EIAMS" text (White, Bold, 18px)
- **Center section:** Breadcrumb navigation (Antique Sand `#B9A779`, 12px, Regular)
  - Separator: `/` in Antique Sand
  - Active last item: White
- **Right section:**
  - Notification bell icon (White, 20px) with badge (Damask Red `#6B1F2A`, 8px circle, white number 10px)
  - User avatar (36x36 circle, Golden Wheat background, user initials in Forest)
  - User name + role (White, 14px)
  - Dropdown caret icon
  - Dropdown menu: profile, settings, logout

### 4.3 Sidebar

- **Width:** 260px (expanded), 64px (collapsed)
- **Background:** Forest `#002623`
- **Transition:** 300ms smooth width transition
- **Menu items:**
  - Height: 44px
  - Padding: 12px 16px (expanded), centered (collapsed)
  - Icon: 20px, Golden Wheat `#988561` (default), White (active)
  - Text: 14px, Medium, White (active), Antique Sand `#B9A779` (default)
  - Active indicator: 3px left border in Golden Wheat `#988561`
  - Active background: Emerald Shadow `#054239`
  - Hover: subtle Emerald Shadow overlay (rgba(5, 66, 57, 0.5))
- **Group headers:**
  - Text: 11px, Semibold, uppercase, Antique Sand `#B9A779`
  - Padding: 24px 16px 8px
- **Bottom section:**
  - Current scope indicator (warehouse/site name)
  - Background: Emerald Shadow `#054239`
  - Padding: 12px 16px
  - Text: 12px, White

### 4.4 Main Content Area

- **Background:** Ivory Mist `#EDEBE0`
- **Min height:** calc(100vh - 64px - 48px)
- **Page padding:** 32px (desktop), 24px (tablet), 16px (mobile)

### 4.5 Page Header Component

- **Container:** White card with subtle shadow (radius-xl)
- **Padding:** 20px 24px
- **Layout:** Flexbox, space-between
- **Left:** Page title (20px, Semibold, Charcoal) + optional subtitle (14px, Stone)
- **Right:** Action buttons group
- **Bottom (optional):** Filter bar or tabs

### 4.6 Content Card

- **Background:** White `#FFFFFF`
- **Border radius:** 12px (radius-xl)
- **Shadow:** 0 2px 12px rgba(0, 0, 0, 0.08)
- **Padding:** 24px
- **Margin-bottom:** 24px

---

## 5. Component Design System

### 5.1 Buttons

#### Primary Button

- Background: Forest `#002623`
- Text: White, 14px, Semibold
- Border-radius: 8px
- Padding: 12px 24px (lg), 8px 16px (md), 6px 12px (sm)
- Hover: Emerald Shadow `#054239`
- Active: darker Emerald Shadow
- Disabled: 50% opacity, cursor not-allowed
- Loading: spinner icon before text

#### Secondary Button (Outlined)

- Border: 1.5px solid Forest `#002623`
- Text: Forest `#002623`, 14px, Semibold
- Background: transparent
- Hover: Forest `#002623` background, White text

#### Destructive Button

- Background: Black Cherry `#4A151E`
- Text: White
- Hover: Damask Red `#6B1F2A`

#### Ghost/Text Button

- Background: transparent
- Text: Mountain Teal `#428177` or Stone `#3D3A3B`
- Hover: subtle Ivory Mist `#EDEBE0` background

#### Icon Button

- Size: 36x36px (md), 32x32px (sm)
- Icon color: Stone `#3D3A3B` (default), Forest `#002623` (active)
- Hover: Ivory Mist `#EDEBE0` background, radius-lg

### 5.2 Forms & Inputs

#### Text Input

- Height: 40px (md), 36px (sm)
- Border: 1px solid Antique Sand `#B9A779`
- Border-radius: 6px
- Background: White
- Text: 14px, Charcoal
- Placeholder: 14px, Stone
- Padding: 8px 12px
- Focus: 2px Mountain Teal `#428177` outline ring (offset 2px)
- Error: 1px solid Black Cherry `#4A151E` + error icon + message (12px, Black Cherry)
- Disabled: Ivory Mist `#EDEBE0` background, 50% opacity

#### Select / Dropdown

- Same as text input
- Chevron icon (right-to-left aware)
- Options panel: White card, shadow-dropdown, radius-lg, max-h-64, overflow-y-auto
- Option hover: Ivory Mist background
- Option selected: Mountain Teal left border

#### Autocomplete

- Text input with dropdown panel
- Triggers after 2 characters typed
- Dropdown: max 10 results, keyboard navigable (↑↓ + Enter)
- Highlighted match text in Mountain Teal `#428177`
- "إضافة جديد" option at bottom (if applicable)

#### Checkbox & Radio

- Base UI with custom TailwindCSS styling
- Checked: Forest `#002623` background
- Focus: Mountain Teal outline ring

#### Date Picker

- shadcn/ui DatePicker (Base Popover + Calendar) with Arabic locale
- Day.js for date formatting

#### File Upload (Dropzone)

- Border: 2px dashed Antique Sand `#B9A779`
- Background: Ivory Mist `#EDEBE0`
- Border-radius: 8px
- Padding: 32px
- Icon: upload icon (48px, Golden Wheat)
- Text: "اسحب وأفلت الملف هنا أو انقر للاختيار"
- Accepted files: images (jpg, png), PDF
- Max size: 5MB
- After upload: thumbnail preview + filename + remove button
- Error: Black Cherry border + message

### 5.3 Data Table (TanStack Table)

#### Structure

- **Wrapper:** White card, radius-xl, shadow-card, overflow-x-auto
- **Sticky header:** Forest `#002623` background, White text, 13px Semibold
- **Column resizing:** Draggable column borders
- **Sortable columns:** Click header to sort, arrow icon indicates direction
- **Row hover:** Subtle Ivory Mist `#EDEBE0` background
- **Alternating rows:** Even rows get Ivory Mist `#EDEBE0` background
- **Selected row:** Emerald Shadow left border (3px) + subtle Forest tint background
- **Empty state:** Illustrated message with CTA button
- **Loading state:** Skeleton shimmer rows (8 rows)

#### Table Parts

| Part              | Style                                                           |
| ----------------- | --------------------------------------------------------------- |
| Header row        | Forest `#002623`, White text, 13px Semibold                     |
| Header cell       | Padding 12px 16px, border-left: 1px solid rgba(255,255,255,0.1) |
| Body cell         | Padding 12px 16px, 13px Regular, Charcoal `#161616`             |
| Row border-bottom | 1px solid `#E8ECF0`                                             |
| Checkbox column   | Width 48px, centered                                            |
| Action column     | Width 120px, buttons inline                                     |

#### Pagination

- Position: bottom-right of table
- Text: "عرض 1-10 من 50" (Stone, 13px)
- Controls: Previous/Next buttons, page size selector (10, 25, 50, 100)
- Active page: Forest background, White text

### 5.4 Status Badge (Pill)

- **Border-radius:** 9999px (full)
- **Padding:** 4px 12px
- **Font:** 11px, Semibold, White
- **Icon:** optional 12px dot before text

| Status    | Background                   |
| --------- | ---------------------------- |
| Draft     | Golden Wheat `#988561`       |
| Submitted | Mountain Teal `#428177`      |
| Approved  | Forest `#002623`             |
| Posted    | Forest `#002623` + checkmark |
| Cancelled | Black Cherry `#4A151E`       |
| Active    | Mountain Teal `#428177`      |
| Pending   | Damask Red `#6B1F2A`         |
| Inactive  | Stone `#3D3A3B`              |

### 5.5 Modal / Dialog

- **Overlay:** Deep Umber `#260F14` at 60% opacity
- **Container:** White, radius-xl, shadow-modal
- **Padding:** 32px
- **Width:** 480px (sm), 640px (md), 800px (lg), 90vw (xl)
- **Animation:** Scale up (0.95→1) + fade in (250ms, ease-out)
- **Header:** Title (20px, Semibold, Charcoal) + close X button (Stone, hover: Charcoal)
- **Body:** 14px, Regular, Charcoal
- **Footer:** Action buttons (right-aligned in RTL)

### 5.6 Confirmation Dialog

- Same as modal but:
  - Icon at top: Warning triangle (Golden Wheat) or Error circle (Black Cherry)
  - Title: "تأكيد الإجراء" (18px, Semibold)
  - Message: specific to action
  - Optional: reason textarea (for rejections, cancellations)
  - Confirm button: Forest or Black Cherry (destructive)
  - Cancel button: outlined secondary

### 5.7 Toast / Notification

- **Position:** Top-right (RTL: left auto), or top-center on mobile
- **Width:** 400px
- **Border-radius:** 8px
- **Left border:** 4px colored accent
- **Padding:** 16px
- **Animation:** Slide in from top (300ms)
- **Auto-dismiss:** 5 seconds (success/info), manual dismiss for errors

| Type    | Border Color            | Icon            |
| ------- | ----------------------- | --------------- |
| Success | Mountain Teal `#428177` | ✅ Check circle |
| Error   | Black Cherry `#4A151E`  | ❌ X circle     |
| Warning | Golden Wheat `#988561`  | ⚠️ Triangle     |
| Info    | Mountain Teal `#428177` | ℹ️ Info circle  |

### 5.8 KPI Card

- **Background:** White, radius-xl, shadow-card
- **Padding:** 20px 24px
- **Icon:** 32px, Golden Wheat `#988561` (decorative circle background: Ivory Mist)
- **Value:** 28px, Bold, Charcoal `#161616`
- **Label:** 12px, Medium, Stone `#3D3A3B`
- **Trend indicator (optional):** Up (Mountain Teal), Down (Black Cherry), 12px

### 5.9 Loading States

#### Skeleton Loader

- Background: gradient shimmer (Ivory Mist → White → Ivory Mist)
- Animation: `shimmer` 1.5s infinite linear (background-position shift)
- Border-radius: 4px

#### Button Loading

- Spinner icon (rotating circle, 16px) before text
- Text remains visible

#### Page Loading

- Full-page centered spinner (48px, Mountain Teal)
- Below: "جاري التحميل..." (14px, Stone)

#### Table Loading

- 8 skeleton rows matching table structure
- Header visible, body replaced with shimmer lines

### 5.10 Empty State

- **Illustration:** Simple SVG illustration (centered, 120px)
- **Title:** 18px, Semibold, Charcoal
- **Description:** 14px, Stone
- **Action button:** Primary button (optional)
- **Examples:**
  - "لا توجد مستندات" + "ابدأ بإنشاء أول مستند استلام"
  - "🎉 لا توجد عهد معلقة"
  - "لا توجد نتائج للبحث"

---

## 6. Document Timeline Component

مكون خاص بـ EIAMS لعرض دورة حياة المستند بشكل Timeline عمودي:

```
  [●] 15-01-2026 10:30 — تم الإنشاء بواسطة أحمد علي
  [●] 15-01-2026 11:00 — تم الإرسال للاعتماد
  [●] 15-01-2026 11:30 — ✅ تم الاعتماد بواسطة مدير المستودع
  [○]  — بانتظار الترحيل
```

- **Line:** 2px vertical line, Antique Sand `#B9A779`
- **Completed dots:** 12px filled circle, Forest `#002623`
- **Current dot:** 12px filled circle, Mountain Teal `#428177` with pulse animation
- **Pending dot:** 12px outlined circle, Antique Sand `#B9A779`
- **Text:** 13px, Charcoal (completed), Stone (pending)
- **Date:** 11px, Stone (left side of dot)

---

## 7. Responsive Breakpoints

| Breakpoint | Width  | Layout                                            |
| ---------- | ------ | ------------------------------------------------- |
| `sm`       | 640px  | Mobile — bottom nav, single column, stacked cards |
| `md`       | 768px  | Tablet — collapsed sidebar (icons), 2-col → 1-col |
| `lg`       | 1024px | Small desktop — expanded sidebar, 2-col grids     |
| `xl`       | 1280px | Desktop — full layout, 3-col grids                |
| `2xl`      | 1536px | Large desktop — max-width container               |

### Responsive Behavior

| Element         | Desktop (>1024px)      | Tablet (768-1024px)        | Mobile (<768px)   |
| --------------- | ---------------------- | -------------------------- | ----------------- |
| Sidebar         | Expanded (260px)       | Collapsed icons (64px)     | Hidden (drawer)   |
| Top nav         | Full breadcrumb        | Short breadcrumb           | Logo + hamburger  |
| Content padding | 32px                   | 24px                       | 16px              |
| Tables          | Full columns           | Hidden less important cols | Horizontal scroll |
| Cards           | 3-column grid          | 2-column grid              | 1-column stack    |
| Page header     | Title + actions inline | Stacked                    | Stacked           |
| Charts          | Side by side           | Stacked                    | Stacked           |

---

## 8. Animation & Micro-interactions

| Element            | Animation                 | Duration | Easing          |
| ------------------ | ------------------------- | -------- | --------------- |
| Page transition    | Fade                      | 200ms    | ease-in-out     |
| Modal open         | Scale (0.95→1) + fade     | 250ms    | ease-out        |
| Modal close        | Scale (1→0.95) + fade     | 200ms    | ease-in         |
| Sidebar collapse   | Width                     | 300ms    | ease-in-out     |
| Table row hover    | Background color          | 150ms    | ease            |
| Toast enter        | Slide from top            | 300ms    | ease-out        |
| Toast exit         | Slide to top + fade       | 200ms    | ease-in         |
| Notification badge | Scale pulse               | 300ms    | ease            |
| Progress bar       | Width                     | 500ms    | ease            |
| Button hover       | Background color          | 150ms    | ease            |
| Dropdown open      | Fade + slight translateY  | 200ms    | ease-out        |
| Skeleton shimmer   | Background-position shift | 1.5s     | linear infinite |

```css
/* TailwindCSS custom animations */
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
@keyframes pulse-dot {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(66, 129, 119, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(66, 129, 119, 0);
  }
}
```

---

## 9. Accessibility

### 9.1 Color Contrast

- Normal text: minimum 4.5:1 ratio
- Large text (18px+ bold / 24px+ regular): minimum 3:1 ratio
- UI components and graphical objects: minimum 3:1 ratio

### 9.2 Focus Indicators

- All interactive elements: 2px Mountain Teal `#428177` outline ring with 2px offset
- Never remove `outline` without providing an alternative focus style

### 9.3 ARIA

- Proper `aria-label` on icon-only buttons
- `role="alert"` on error messages
- `aria-live="polite"` on dynamic content updates
- Table headers: `scope="col"` on all `<th>` elements
- Modals: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- Navigation landmarks: `<nav aria-label="القائمة الرئيسية">`

### 9.4 Keyboard Navigation

- All interactive elements reachable via Tab
- Tab order follows visual order (RTL-aware)
- Escape closes modals, dropdowns, and dialogs
- Enter/Space activates buttons and links
- Arrow keys navigate within select/autocomplete/table rows

---

## 10. shadcn/ui + TailwindCSS Integration

### 10.1 shadcn/ui Setup

- Run `npx shadcn@latest init` to scaffold `components.json` and CSS variables
- All generated primitives live in `src/shared/ui/` and are configured by `components.json`
- Components use Base UI   + TailwindCSS + class-variance-authority
- Custom theme colors defined in `tailwind.config.ts` (see 10.2) extend shadcn's CSS variable palette
- RTL handled via TailwindCSS logical properties (`inset-inline-start`, `margin-inline-end`, etc.) — Base respects `dir="rtl"` on the document root

### 10.2 TailwindCSS Configuration

```typescript
// tailwind.config.ts
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: "#002623",
          light: "#054239",
        },
        teal: "#428177",
        gold: "#988561",
        sand: "#B9A779",
        ivory: "#EDEBE0",
        umber: "#260F14",
        cherry: "#4A151E",
        damask: "#6B1F2A",
        charcoal: "#161616",
        stone: "#3D3A3B",
      },
      fontFamily: {
        arabic: ["'Traditional Arabic'", "'Noto Sans Arabic'", "Tahoma", "sans-serif"],
      },
      borderRadius: {
        button: "8px",
        card: "12px",
        input: "6px",
      },
      boxShadow: {
        card: "0 2px 12px rgba(0, 0, 0, 0.08)",
        modal: "0 8px 32px rgba(0, 0, 0, 0.15)",
      },
      animation: {
        shimmer: "shimmer 1.5s linear infinite",
        "pulse-dot": "pulse-dot 2s infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-dot": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(66, 129, 119, 0.4)" },
          "50%": { boxShadow: "0 0 0 8px rgba(66, 129, 119, 0)" },
        },
      },
    },
  },
  plugins: [],
};
```

---

## 11. Iconography

- **Library:** Tabler Icons React (`@tabler/icons-react`) — the EIAMS icon set
- **Size:** 20px (default for UI), 24px (page icons), 16px (inline/small)
- **Color:** Inherits from text color, or Golden Wheat `#988561` for decorative icons

### Icon Mapping by Feature

| Feature      | Recommended symbol  |
| ------------ | ------------------- |
| Dashboard    | `LayoutDashboard`   |
| Inventory    | `Package`           |
| Receiving    | `Truck`             |
| Issue        | `ArrowUpFromLine`   |
| Transfer     | `ArrowLeftRight`    |
| Asset        | `Laptop`            |
| Custody      | `ShieldCheck`       |
| Count        | `ClipboardCheck`    |
| Adjustment   | `SlidersHorizontal` |
| Reports      | `BarChart3`         |
| Audit        | `History`           |
| Users        | `Users`             |
| Materials    | `Box`               |
| Warehouse    | `Warehouse`         |
| Sites        | `MapPin`            |
| Organization | `Building2`         |
| Settings     | `Settings`          |
| Bell         | `Bell`              |
| Search       | `Search`            |
| Filter       | `Filter`            |
| Download     | `Download`          |
| Upload       | `Upload`            |
| Print        | `Printer`           |
| Plus (Add)   | `Plus`              |
| Edit         | `Pencil`            |
| Delete       | `Trash2`            |
| Close        | `X`                 |
| Check        | `Check`             |
| More         | `MoreHorizontal`    |

---

## 12. Page Layout Patterns

### 12.1 List Page Pattern

```
┌──────────────────────────────────────────────┐
│ Page Header                                   │
│ [العنوان]                        [إضافة جديد] │
│ [Search Input] [Filter Dropdowns]             │
├──────────────────────────────────────────────┤
│                                               │
│ Data Table (TanStack Table)                   │
│ ┌─────────────────────────────────────────┐  │
│ │ Header │ Col1 │ Col2 │ Col3 │ Actions │  │
│ ├─────────────────────────────────────────┤  │
│ │ Row 1  │ ...  │ ...  │ ...  │ [View]  │  │
│ │ Row 2  │ ...  │ ...  │ ...  │ [View]  │  │
│ │ ...                                       │
│ └─────────────────────────────────────────┘  │
│ Pagination: [Prev] 1 2 3 ... 10 [Next]     │
└──────────────────────────────────────────────┘
```

### 12.2 Create/Edit Form Page Pattern

```
┌──────────────────────────────────────────────┐
│ Page Header                                   │
│ [العنوان]                   [حفظ] [إرسال]     │
├──────────────────────────────────────────────┤
│                                               │
│ ┌─────────────────┐  ┌─────────────────────┐ │
│ │ Info Card       │  │ Lines Table          │ │
│ │ Field 1         │  │ [Add Line Button]    │ │
│ │ Field 2         │  │ ┌────────────────┐  │ │
│ │ Field 3         │  │ │ Material | Qty  │  │ │
│ │ ...             │  │ │ ...             │  │ │
│ └─────────────────┘  │ │ ...             │  │ │
│                       │ └────────────────┘  │ │
│ ┌─────────────────┐  └─────────────────────┘ │
│ │ Attachments     │                          │
│ │ [Upload Zone]   │                          │
│ └─────────────────┘                          │
└──────────────────────────────────────────────┘
```

### 12.3 Detail Page Pattern

```
┌──────────────────────────────────────────────┐
│ Page Header                                   │
│ [الرقم] [Status Badge]    [Edit] [Post] [PDF]│
├──────────────────────────────────────────────┤
│                                               │
│ Document Timeline (vertical)                  │
│ [●] Created            15-01-2026 10:30      │
│ [●] Submitted          15-01-2026 11:00      │
│ [○] Pending Approval                         │
│                                               │
│ ┌─────────────────────────────────────────┐  │
│ │ Document Info                           │  │
│ │ الحقل 1: القيمة 1    الحقل 2: القيمة 2 │  │
│ │ الحقل 3: القيمة 3    الحقل 4: القيمة 4 │  │
│ └─────────────────────────────────────────┘  │
│                                               │
│ ┌─────────────────────────────────────────┐  │
│ │ Line Items Table                        │  │
│ │ Name │ Qty │ Unit │ Price │ Total       │  │
│ │ ...                                      │  │
│ └─────────────────────────────────────────┘  │
│                                               │
│ ┌─────────────────────────────────────────┐  │
│ │ Attachments                             │  │
│ │ [Thumbnail] [Thumbnail] [Thumbnail]     │  │
│ └─────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

### 12.4 Dashboard Page Pattern

```
┌──────────────────────────────────────────────┐
│ Page Header                                   │
│ [لوحة التحكم]                    [آخر تحديث]  │
├──────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐│
│ │ KPI 1│ │ KPI 2│ │ KPI 3│ │ KPI 4│ │ KPI 5││
│ │ value│ │ value│ │ value│ │ value│ │ value││
│ │ label│ │ label│ │ label│ │ label│ │ label││
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘│
│                                               │
│ ┌──────────────────┐ ┌─────────────────────┐ │
│ │ Chart 1          │ │ Chart 2              │ │
│ │ (Line: Inventory)│ │ (Doughnut: Docs)     │ │
│ └──────────────────┘ └─────────────────────┘ │
│                                               │
│ ┌──────────────────┐ ┌─────────────────────┐ │
│ │ Recent Activity  │ │ Alerts & Warnings    │ │
│ │ ● Action 1       │ │ ⚠️ Alert 1          │ │
│ │ ● Action 2       │ │ ⚠️ Alert 2          │ │
│ │ ● Action 3       │ │                      │ │
│ └──────────────────┘ └─────────────────────┘ │
└──────────────────────────────────────────────┘
```

---

## 13. RTL-Specific Notes

### 13.1 Layout Mirroring

- Sidebar on **right** side (RTL)
- Breadcrumbs: right-to-left direction
- Table columns: right-aligned first column (name/code)
- Form labels: right-aligned, input on left
- Button groups: primary button on the rightmost position
- Pagination: Previous button on the right
- Toast: slides from top-left (mirror of top-right)

### 13.2 CSS for RTL

```css
/* RTL-aware margins/paddings using logical properties */
.element {
  margin-inline-start: 16px; /* margin-right in RTL */
  margin-inline-end: 8px; /* margin-left in RTL */
  padding-inline: 16px;
  border-inline-start: 3px solid #002623; /* right border in RTL */
}
```

### 13.3 Icons in RTL

- Tabler icons do not infer reading direction from CSS alone. Use explicit RTL-aware
  icon selection for directional controls, then verify the result in an RTL layout.
- Pair direction-sensitive icons with an Arabic accessible name; an icon must not be
  the sole indication of navigation direction.

---

## 14. File Organization

### 14.1 CSS Strategy

- **TailwindCSS** utility classes for most styling (90%+)
- **shadcn/ui** components pre-styled with TailwindCSS — override via `className` or `cn()` utility
- Minimal custom CSS (only for complex animations or overrides)
- Custom CSS file: `src/styles/globals.css` for base styles, custom utilities, and shadcn CSS variables

### 14.2 Component Implementation Pattern

```typescript
// components/ReceivingForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/ui/form';

const schema = z.object({
  supplierName: z.string().min(1, 'اسم المورد مطلوب'),
  invoiceNumber: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export function ReceivingForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplierName: '',
      invoiceNumber: '',
    },
  });

  return (
    <div className="rounded-xl border bg-card p-6 shadow-card">
      <Form {...form}>
        <form className="space-y-4">
          <FormField
            control={form.control}
            name="supplierName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>اسم المورد</FormLabel>
                <FormControl>
                  <Input placeholder="ابحث عن اسم المورد..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </div>
  );
}
```

---

## 15. Design Principles Summary

1. **Professional & Authoritative** — Dark greens and golds convey trust and heritage
2. **Clean & Uncluttered** — Generous white space, clear hierarchy, max 3 columns
3. **Data-Dense but Readable** — Tables optimized with alternating rows, sticky headers, frozen first column
4. **RTL First** — All layouts designed for right-to-left, Base UI + TailwindCSS logical properties handle direction
5. **Consistent** — 8px grid, standardized components, predictable spacing
6. **Accessible** — Color contrast, keyboard navigation, ARIA labels
7. **Responsive** — Desktop-first with tablet and mobile adaptations

---

_Designed for EIAMS — Enterprise Inventory & Asset Management System v1_
_الهيئة العامة للرقابة والتفتيش — Syrian Government Oversight Authority_
_Last updated: July 2026_
