# EIAMS — Design Tokens

> Status: canonical frontend token reference for the current Tailwind CSS v4
> implementation.
>
> Implementation source of truth: `src/index.css`.

## 1. Purpose and authority

This document translates the approved visual language in `ui-design.md` into
the token vocabulary implemented in `src/index.css`. It does not create a second
theme or replace the CSS file as the executable source of truth.

Use named semantic utilities and existing component variants. Do not introduce
literal color, spacing, radius, shadow, or animation values inside feature
components where a documented token exists.

## 2. Color tokens

### 2.1 Brand palette

| Token | Value | Intended use |
| --- | --- | --- |
| `forest` | `#002623` | Primary surfaces, header, sidebar, primary action |
| `forest-light` | `#054239` | Active and secondary dark state |
| `mountain-teal` | `#428177` | Accent, success, focus, information |
| `golden-wheat` | `#988561` | Warning and decorative accent |
| `antique-sand` | `#B9A779` | Borders, dividers, muted accent |
| `ivory` | `#EDEBE0` | Application background and subtle surface |
| `deep-umber` | `#260F14` | Overlay/dark accent |
| `black-cherry` | `#4A151E` | Destructive/error state |
| `damask` | `#6B1F2A` | Critical/attention state |
| `charcoal` | `#161616` | Primary text |
| `stone` | `#3D3A3B` | Secondary text |

### 2.2 Semantic roles

| Semantic token | Maps to | Use |
| --- | --- | --- |
| `background` / `foreground` | ivory / charcoal | Application surface and default text |
| `primary` / `primary-foreground` | forest / white | Main actions |
| `secondary` / `secondary-foreground` | forest-light / white | Secondary dark emphasis |
| `accent` / `accent-foreground` | mountain-teal / white | Accent surfaces and emphasis |
| `destructive` | black-cherry | Delete and irreversible action affordance |
| `border`, `input` | antique-sand | Control and surface boundaries |
| `ring` | mountain-teal | Keyboard focus indicator |
| `success`, `warning`, `error`, `critical` | teal, wheat, cherry, damask | Status and feedback |

Use semantic roles in reusable components (`bg-primary`, `text-destructive`,
`border-input`) and brand utilities only where the design calls for a specific
brand identity (`bg-forest`, `text-golden-wheat`).

## 3. Typography tokens

| Token | Value / stack | Use |
| --- | --- | --- |
| `font-sans` | Traditional Arabic, Noto Sans Arabic Variable, Inter Variable, Tahoma, sans-serif | Default UI stack |
| `font-arabic` | Traditional Arabic, Noto Sans Arabic, Tahoma, sans-serif | Explicit Arabic content where needed |
| `font-english` | Inter, Segoe UI, Roboto, sans-serif | Predominantly Latin identifiers/content |
| `font-mono` | Cascadia Code, JetBrains Mono, monospace | Codes and technical identifiers |

| Utility | Size | Typical use |
| --- | --- | --- |
| `text-xs` | 12px | Labels, captions, metadata |
| `text-sm` | 13px | Table cells and compact text |
| `text-base` | 14px | Body text and form labels |
| `text-md` | 16px | Emphasized body text |
| `text-lg` | 18px | Section titles |
| `text-xl` | 20px | Card and dialog titles |
| `text-2xl` | 24px | Page title |
| `text-3xl` | 28px | KPI value |
| `text-4xl` | 32px | Main heading |

Use the defined line-height utilities (`leading-tight`, `leading-normal`, and
`leading-relaxed`) instead of arbitrary values. Body text should normally use
the default `font-sans` and 14px base size.

## 4. Spacing and layout

EIAMS uses an 8px-grid design language. The Tailwind v4 native spacing scale is
retained deliberately because redefining its numeric utilities would conflict
with shadcn/Base UI conventions.

| Intent | Preferred utility/value |
| --- | --- |
| Compact internal gap | `gap-2` / 8px |
| Standard control gap | `gap-3` / 12px |
| Table cell vertical/horizontal padding | `py-3 px-4` / 12px, 16px |
| Form field separation | `gap-5` / 20px |
| Card padding | `p-6` / 24px |
| Desktop page padding | `p-8` / 32px |
| Tablet page padding | `p-6` / 24px |
| Mobile page padding | `p-4` / 16px |

Use logical properties for directional values: `ps`/`pe`, `ms`/`me`, `start`,
and `end`. Do not use `left`, `right`, `ml`, or `mr` for RTL layout decisions.

## 5. Radius and elevation

| Token / utility | Value | Use |
| --- | --- | --- |
| `rounded-sm` | 4px | Small controls and skeletons |
| `rounded-md` | 6px | Inputs and buttons |
| `rounded-lg` | 8px | Dropdowns and standard surfaces |
| `rounded-xl` | 12px | Cards and major containers |
| `rounded-4xl` / full | pill | Status badges and avatars |
| `shadow-card` | 0 2px 12px / 8% | Content card |
| `shadow-card-hover` | 0 4px 20px / 12% | Interactive card hover |
| `shadow-modal` | 0 8px 32px / 15% | Dialog |
| `shadow-dropdown` | 0 4px 16px / 10% | Select/popover |
| `shadow-toast` | 0 4px 24px / 15% | Toast |

## 6. Status mapping

`Badge` supplies generic semantic variants. The planned shared `StatusBadge`
component owns entity-specific labels, icons, and mappings. Feature code must
not maintain its own status-color switch statements.

| Status family | Visual intent |
| --- | --- |
| Draft / planned | Warning / Golden Wheat |
| Submitted / active / in progress | Success or Mountain Teal |
| Posted / completed | Forest with optional confirmation icon |
| Cancelled / error | Black Cherry/destructive |
| Pending / attention required | Damask/critical |
| Returned / inactive | Stone/muted |

The component must cover contract states such as `Rejected`, `Reversed`,
`Closed`, and count states explicitly; never fall back silently to a misleading
success color.

## 7. Motion and interaction

| Token | Duration | Use |
| --- | --- | --- |
| `animate-shimmer` | 1.5s linear infinite | Skeleton loading |
| `animate-pulse-dot` | 2s infinite | Current timeline marker |
| Page transition | 200ms | Route/page fade |
| Modal transition | 250ms | Scale and fade open |
| Sidebar transition | 300ms | Width/drawer change |
| Micro-interaction | 150ms | Buttons and table-row hover |

Respect `prefers-reduced-motion` whenever a new motion primitive is introduced.
Motion must not communicate critical state without a text or semantic
alternative.

## 8. Accessibility tokens and rules

- Interactive focus uses the Mountain Teal ring with a visible 2px treatment and
  offset consistent with the existing primitives.
- Normal text requires at least 4.5:1 contrast; large text and graphical UI
  require at least 3:1.
- Color never supplies the only state signal: pair it with text, iconography, or
  an accessible label.
- Use the supplied disabled, invalid, hover, and focus styles rather than
  hand-built alternatives.

## 9. Dark mode

`src/index.css` contains a technical `.dark` token block inherited from the
component setup, but product design has not approved a dark-mode palette or
behavior. Features must not advertise or add a dark-mode switch until a product
decision defines the experience and all semantic tokens are reviewed.

## 10. Token usage checklist

Before adding UI, verify that it:

- uses a primitive or shared component before direct styling;
- uses semantic color, radius, shadow, and typography utilities;
- uses logical RTL properties;
- includes visible focus and accessible contrast;
- avoids literal values that duplicate an existing token;
- supports the documented responsive page padding and layout behavior.

