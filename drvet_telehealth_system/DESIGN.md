---
name: DrVet Telehealth System
colors:
  surface: '#f6faff'
  surface-dim: '#c2def4'
  surface-bright: '#f6faff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#ebf5ff'
  surface-container: '#dff0ff'
  surface-container-high: '#d4ebff'
  surface-container-highest: '#cbe6fc'
  on-surface: '#001e2e'
  on-surface-variant: '#3d4945'
  inverse-surface: '#183344'
  inverse-on-surface: '#e5f2ff'
  outline: '#6d7a75'
  outline-variant: '#bccac3'
  surface-tint: '#006b57'
  primary: '#006b57'
  on-primary: '#ffffff'
  primary-container: '#13a88a'
  on-primary-container: '#003529'
  inverse-primary: '#5ddbbb'
  secondary: '#406279'
  on-secondary: '#ffffff'
  secondary-container: '#c0e4ff'
  on-secondary-container: '#44677d'
  tertiary: '#006b5d'
  on-tertiary: '#ffffff'
  tertiary-container: '#00a894'
  on-tertiary-container: '#00352d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#7cf8d6'
  primary-fixed-dim: '#5ddbbb'
  on-primary-fixed: '#002019'
  on-primary-fixed-variant: '#005141'
  secondary-fixed: '#c7e7ff'
  secondary-fixed-dim: '#a7cbe5'
  on-secondary-fixed: '#001e2e'
  on-secondary-fixed-variant: '#274a60'
  tertiary-fixed: '#72f8e0'
  tertiary-fixed-dim: '#52dbc5'
  on-tertiary-fixed: '#00201b'
  on-tertiary-fixed-variant: '#005046'
  background: '#f6faff'
  on-background: '#001e2e'
  surface-variant: '#cbe6fc'
typography:
  display-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
  display-hero-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

The design system establishes a premium, human-centric clinical SaaS language dedicated to veterinary telecare and pet health intelligence. It positions veterinary medicine at the intersection of rigorous clinical expertise and domestic warmth. 

The aesthetic is Modern Clinical Telehealth:
- Clean clinical confidence balanced with organic warmth.
- Fluid, generous structural radiuses (`rounded-xl` to `rounded-2xl`) that remove technical severity.
- Subtle frosted atmospheric transitions, crisp boundary definitions, and expansive, breathing negative space.
- Interaction cues that evoke immediacy, reassurance, and empathy, reducing anxiety during triage or emergency teleconsultations.

## Colors

The palette leverages a dedicated duo of medical clarity and clinical authority:

- **Primary (`#13A88A` - Veterinary Emerald):** The foundational brand color representing animal wellness, vitality, and clinical precision. Utilized for primary calls-to-action, success confirmations, and active navigation indicators.
- **Secondary (`#153B50` - Deep Ocean Navy):** Establishes institutional gravitas, security, and typographic structure. Applied to high-emphasis headlines, sidebars, and critical data containers.
- **Tertiary (`#35C6B0` - Crisp Turquoise):** A high-energy accent for telemetry metrics, interactive badges, micro-highlights, and dynamic teleconsultation indicators.
- **Neutral & Canvas Foundation:**
  - Base Background: `#F5F8FA` provides a soft, non-glare surface suited for prolonged clinical and pet-parent viewing.
  - Surface Pure: `#FFFFFF` for elevated data cards, interactive panels, and floating sheets.
  - Tinted Surface / Secondary Canvas: `#EAF5F8` for subtle table alternate rows, inactive chips, and nested containers.
- **Typography & Semantic Palette:**
  - High Emphasis Text: `#183344`
  - Medium / Muted Secondary Text: `#718096`
  - Feedback Success: `#16A36A`
  - Feedback Warning / Triage Alert: `#F2A93B`
  - Feedback Error / Critical Incident: `#DC4545`

## Typography

The design system implements **Plus Jakarta Sans** as the unified typeface across all viewports. Its geometric foundations, generous counter spaces, and subtly sculpted terminals deliver modern clinical clarity paired with organic approachability.

- Headings employ tight tracking (`-0.02em` on displays, `-0.01em` on section titles) to retain structural authority and punchiness.
- Body text utilizes standard tracking with relaxed line heights (`1.55` to `1.625`) to preserve rapid legibility during high-stress medical triage and prescription review.
- Data chips, CRMV medical license verification stamps, and teleconsultation badges use `label-md` and `label-sm` with slight positive tracking (`+0.02em`) in medium-to-bold weights to guarantee readability at glance speeds.

## Layout & Spacing

The layout is structured on an 8pt architectural rhythm using a fluid, responsive 12-column grid on desktop and tablet, collapsing to a 4-column flow on mobile viewports:

- **Desktop (1024px+):** Max-width containment at `1280px` or `1440px` for high-density clinical dashboards. Columns are divided by a `1.5rem` (`24px`) gutter and bound by minimum `2rem` (`32px`) margins. Side-by-side teleconsultation views maintain an asymmetric 8:4 ratio (video stream + clinical notes / pet health history).
- **Tablet (768px - 1023px):** Adapts to an 8-column layout with `1.25rem` gutters, transforming docked secondary sidebars into collapsible drawer sheets.
- **Mobile (< 768px):** Strict 4-column framework with a compact `1rem` margin and `1rem` gutter. Bottom tab navigation bars anchor primary tasks (Início, Consultas, Meus Pets, Perfil).

Spacing scale enforcement:
- `space-xs` (4px): Icon-to-text spacing, micro badge padding.
- `space-sm` (8px): Form input inner paddings, list item gaps.
- `space-md` (16px): Card internal padding, button inline gaps.
- `space-lg` (24px): Inter-card spacing, container block separation.
- `space-xl` (40px): Major section divides, modal dialog offsets.

## Elevation & Depth

Visual hierarchy is maintained via translucent, diffused oceanic elevations rather than stark opaque drops:

- **Level 0 (Flat Canvas):** Surfaces rest on `#F5F8FA` with no elevation, relying on tonal distinction.
- **Level 1 (Subtle Cards & Lists):** `#FFFFFF` surfaces layered with a continuous ghost border (`1px solid rgba(21, 59, 80, 0.06)`) and a subtle ambient float: `box-shadow: 0 4px 16px -2px rgba(21, 59, 80, 0.04), 0 2px 6px -1px rgba(21, 59, 80, 0.02)`.
- **Level 2 (Interactive Hover & Sticky Navbars):** `box-shadow: 0 10px 25px -4px rgba(21, 59, 80, 0.08), 0 4px 10px -2px rgba(19, 168, 138, 0.04)`.
- **Level 3 (Modals, Video Call overlays, Floating Triage Sheets):** `box-shadow: 0 20px 40px -8px rgba(21, 59, 80, 0.14), 0 8px 16px -4px rgba(21, 59, 80, 0.06)`.
- **Frosted Surfaces:** Teleconsultation floating HUDs and action pills utilize glassmorphism via `backdrop-filter: blur(12px)` over `rgba(255, 255, 255, 0.85)` with a `1px` translucent edge of `rgba(255, 255, 255, 0.6)`.

## Shapes

The design system uses generous, organic curves that echo vitality and approachable pet care:

- **Base Radius (`rounded-md` / 8px):** Form controls, inputs, dropdown menus, and internal micro-elements.
- **Medium Radius (`rounded-lg` / 16px):** Metric panels, sub-cards, thumbnail preview containers, and media tiles.
- **Hero Radius (`rounded-xl` / 24px):** Primary viewport cards, doctor profile sheets, booking consultation modules, and hero containers.
- **Full Pill (`rounded-full` / 9999px):** Primary interaction action buttons, CRMV verified status badges, triage pills, and bottom navigation quick-dock indicators.

## Components

### Buttons
- **Primary Action:** Solid `#13A88A` background with crisp white typography (`label-lg`), pill-shaped (`rounded-full`), `space-md` horizontal padding, featuring subtle transitions with hover shift to `#0E886F`.
- **Secondary Action:** Ghost container with `#153B50` text, filled with translucent `#EAF5F8` or outlined with `1.5px solid rgba(21, 59, 80, 0.15)`.
- **Teleconsultation Video Trigger:** Pill-shaped, gradient or primary emerald fill with video camera icon prefix and directional arrow suffix.

### Badges & CRMV Verification Chips
- Badges are pill-shaped with `label-sm` or `label-md` weight.
- **Verified CRMV Badge:** Deep emerald text `#16A36A` on an ultra-light tint `#E6F7F0` surface, framed by an integrated checkmark icon.
- **Emergency / Urgent Triage:** `#DC4545` text on `#FDE8E8` surface.

### Cards
- Surfaces are constructed from `#FFFFFF` using `rounded-xl` (24px) or `rounded-lg` (16px) geometries.
- Outlined with subtle ghost borders (`rgba(21, 59, 80, 0.07)`).
- Card headers maintain explicit hierarchical separation: patient metadata (species, breed, age) alongside doctor status indicators with clean divider lines (`#E2E8F0`).

### Input Fields & Selectors
- Background: `#FFFFFF` or subtle `#F8FAFC`.
- Border: `1.5px solid #E2E8F0` with `rounded-md` (8px).
- Focus state: Rings with `#13A88A` at `2px` width and `0 0 0 3px rgba(19, 168, 138, 0.15)` aura.
- Labels are positioned exterior-top using `#183344` (`label-md`).

### Lists & Patient Rows
- Patient and consultation queues feature left-aligned pet avatars (rounded full or rounded-lg) with clear appointment timestamps.
- Separated by clean `#EDF2F7` hairline dividers, turning `#EAF5F8` on pointer hover with smooth easing.

### Teleconsultation HUD & Video Windows
- Dual-participant PIP (Picture-in-Picture) containers with `rounded-xl` overflows.
- Floating translucent bottom utility dock (mute, video toggle, prescription notes, end call) floating centered with backdrop blur.