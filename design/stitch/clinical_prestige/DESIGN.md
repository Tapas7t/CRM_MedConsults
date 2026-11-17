---
name: Clinical Prestige
colors:
  surface: '#f7fafd'
  surface-dim: '#d7dadd'
  surface-bright: '#f7fafd'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f4f7'
  surface-container: '#ebeef1'
  surface-container-high: '#e5e8eb'
  surface-container-highest: '#e0e3e6'
  on-surface: '#181c1e'
  on-surface-variant: '#44474d'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eef1f4'
  outline: '#75777e'
  outline-variant: '#c4c6ce'
  surface-tint: '#4d5f7d'
  primary: '#000615'
  on-primary: '#ffffff'
  primary-container: '#0b1f3a'
  on-primary-container: '#7587a7'
  inverse-primary: '#b5c7ea'
  secondary: '#006972'
  on-secondary: '#ffffff'
  secondary-container: '#96eef9'
  on-secondary-container: '#006d77'
  tertiary: '#000420'
  on-tertiary: '#ffffff'
  tertiary-container: '#00175b'
  on-tertiary-container: '#5b7dff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#b5c7ea'
  on-primary-fixed: '#071c36'
  on-primary-fixed-variant: '#364764'
  secondary-fixed: '#98f0fb'
  secondary-fixed-dim: '#7cd4df'
  on-secondary-fixed: '#001f23'
  on-secondary-fixed-variant: '#004f56'
  tertiary-fixed: '#dde1ff'
  tertiary-fixed-dim: '#b7c4ff'
  on-tertiary-fixed: '#001453'
  on-tertiary-fixed-variant: '#0037b8'
  background: '#f7fafd'
  on-background: '#181c1e'
  surface-variant: '#e0e3e6'
typography:
  display-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 56px
    fontWeight: '700'
    lineHeight: 64px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.025em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  editorial-accent:
    fontFamily: Newsreader
    fontSize: 22px
    fontWeight: '400'
    lineHeight: 32px
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.03em
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
  margin: 3rem
  margin-mobile: 1.25rem
  space-xs: 0.375rem
  space-sm: 0.75rem
  space-md: 1.25rem
  space-lg: 2rem
  space-xl: 3.5rem
---

## Brand & Style

This design system establishes an aura of clinical authority, quiet luxury, and effortless clarity. Built for modern, high-tier healthcare consultations, the aesthetic synthesizes editorial restraint with technical precision. The visual style employs a hybrid tonal strategy: dramatic, commanding deep navy for structural framing (navigation headers, focal heroes, impact modules, and footers), contrasted against expansive, luminous alabaster-slate fields for clinical interaction, schedules, and practitioner dossiers.

The target audience spans discerning patients seeking frictionless specialist care and top-tier clinicians expecting an interface of matching caliber. The emotional register is reassuring, deeply competent, and modern. Visual treatments avoid sterile hospital clichés; instead, they draw from contemporary editorial craft and polished consumer software, utilizing pristine elevated cards, delicate refractive borders, and disciplined visual cadence.

## Colors

The palette balances authoritative density against clinical purity:

- **Primary Base (`#0B1F3A`):** Deep Obsidian Navy. Anchors navigation bars, hero canvases, dense footer sections, and serves as the baseline for high-hierarchy typography.
- **Secondary Accent (`#0E7C86`):** Deep Clinical Teal. Used for interactive markers, metadata tags, specialized badges, and iconography.
- **Tertiary Gradient Drivers (`#0050FF` to `#00D6FF`):** Linear blue-to-cyan transition applied selectively to high-intent primary CTAs, active telemetry indicators, and conversion highlights.
- **Neutral Canvas (`#F4F7FA`):** Crisp, cool porcelain-gray foundation for operational surfaces, scheduling panels, and body areas.
- **Card Core (`#FFFFFF`):** Pure optical white for modular containers, modals, and content surfaces.
- **Semantic Success (`#10B981`):** Soft, saturated emerald denoting live physician availability, verified credentialing, and booking confirmations.
- **Typographic Neutral Tint:** Primary headings use solid `#0B1F3A`; body typography resolves to `#3B4D66` (Navy at 70% optical density) to maintain relaxed readability while meeting strict WCAG AA contrast thresholds.
- **Structural Outlines:** `#E2E8F0` on light canvases; translucent white `rgba(255, 255, 255, 0.1)` on dark navy zones.

## Typography

The typographic hierarchy prioritizes strict legibility and tight editorial geometry. Headings leverage Plus Jakarta Sans, set with dense tracking (`-0.02em` to `-0.03em`) and solid leading to project confidence and modern polish. 

Body and interface layers employ Inter for neutral, systematic clarity across dense data matrices and appointment forms. An auxiliary editorial voice (Newsreader Italic) is deployed selectively—confined to brand phrases, testimonial quotes, and qualitative doctor philosophy callouts—to introduce warmth and clinical distinction without compromising systematic rigor.

## Layout & Spacing

The system runs on a 12-column fluid grid capped at a max-width container of 1280px to preserve editorial balance. Spacing follows generous, deliberate increments that prevent clinical information density from overwhelming users.

- **Desktop (>=1024px):** 12 columns, `1.5rem` (24px) gutters, and `3rem` (48px) margins.
- **Tablet (768px - 1023px):** 8 columns, `1.25rem` (20px) gutters, and `2rem` (32px) margins. Split modules (e.g., doctor profile + booking agenda) stack into coordinated vertical blocks.
- **Mobile (<768px):** 4 columns, `1rem` (16px) gutters, and `1.25rem` (20px) margins. Fixed bottom action anchors emerge for booking flow progression.

Internal component padding uses the scale rigorously: micro indicators apply `space-xs`, form elements leverage `space-sm` to `space-md`, and primary content cards rely on `space-lg` to create open, restful zones.

## Elevation & Depth

Visual depth is achieved through glassmorphic luminosity and low-slung, tinted ambient shadows rather than stark elevation planes.

- **Surface Base:** Light mode relies on pure white cards resting upon the `#F4F7FA` neutral background, delineated with a hairline `1px` border of `#E2E8F0`.
- **Card Float (Level 1):** Interactive cards utilize a dual shadow: `0 4px 6px -1px rgba(11, 31, 58, 0.03), 0 12px 24px -4px rgba(11, 31, 58, 0.06)`. This soft navy tint grounds the component without appearing artificially elevated.
- **Hover & Active Flyouts (Level 2):** On focus or hover states, cards transition to: `0 8px 12px -2px rgba(11, 31, 58, 0.04), 0 24px 36px -6px rgba(11, 31, 58, 0.08)`.
- **Glassmorphic Hero Modules:** Deep navy sections incorporate frosted glass overlays (`rgba(255, 255, 255, 0.06)` backdrop blur of `16px`, bordered with `rgba(255, 255, 255, 0.12)`) to hold search filters, doctor stat ribbons, and active consultation states.

## Shapes

The design system embraces an expansive, soft-rectangular form language. Primary cards and modal viewports use generous radii (`1.25rem` to `1.5rem`, or 20–24px), providing an inviting, tactile finish that tempers the serious subject matter.

Buttons, search inputs, and interactive chips use calibrated radii from standard `0.5rem` up to soft capsules (`rounded-lg` and `rounded-xl`). Selection tokens for scheduling time slots preserve clean rectangular curvature to balance visual rhythm across structured calendars.

## Components

### Buttons
- **Primary Action:** Linear gradient background (`#0050FF` to `#00D6FF`), crisp white text, zero border, subtle glow shadow (`0 4px 14px rgba(0, 80, 255, 0.25)`). Hover state shifts brightness slightly upward with a gentle scale transform (`1.01`).
- **Secondary (Teal Accent):** Flat `#0E7C86` fill with white text, or pure white surface with `#0E7C86` border and label.
- **Tertiary / Ghost:** Transparent background, `#0B1F3A` text, light slate border (`#E2E8F0`) with subtle `#F4F7FA` fill on hover.

### Chips & Badges
- **Availability Chip:** Emerald `#10B981` background at 10% opacity, paired with solid `#10B981` text and an animated glowing pulse dot indicator.
- **Specialty Filter Chips:** White background, `#3B4D66` text, `1px` solid `#E2E8F0` outline. Active state switches to `#0B1F3A` fill with white typography.

### Input Fields & Search Bars
- **Hero Master Search:** Deep navy backdrop housing a glassmorphic container with inputs for specialty, location, and date. Separated by hairline dividers (`rgba(255, 255, 255, 0.1)`).
- **Form Controls:** Pure white fill, `1px` border in `#E2E8F0`, interior padding of `14px 18px`. Active focus state triggers an outline border transition to `#0050FF` backed by a `0 0 0 3px rgba(0, 80, 255, 0.15)` focus ring.

### Checkboxes & Radios
- Rounded squircle checkboxes (`0.25rem` radius) and circular radio points. Default `#CBD5E1` border; selected state fills with `#0050FF` displaying an optical-center check or dot in white.

### Doctor Profile & Booking Cards
- Solid white core, `24px` radius, hairline border `#E2E8F0`.
- Upper section features practitioner photography, verification badging, and specialty markers.
- Mid section contains availability matrices rendered as concise pill-shaped time-slot selectors.
- Lower action layer provides pricing transparency alongside the gradient appointment button.

### Appointment Timeline & Steppers
- Clean vertical and horizontal progressive nodes connected via muted `#E2E8F0` tracks. Confirmed nodes illuminate in `#10B981`, current stages glow with `#0050FF`, and pending steps remain soft neutral `#CBD5E1`.