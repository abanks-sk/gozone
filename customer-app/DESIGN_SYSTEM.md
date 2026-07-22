# GoZone — Design System

The single source of truth for the GoZone app UI. Every screen is built from these
tokens and components. When something isn't covered here, follow the spirit: clean,
confident, modern; premium dark "glow" for brand moments, bright utility for the work.

## 1. Identity

- **Logo:** a **squircle** (superellipse-style rounded square, corner radius ≈ 30% of size)
  in brand blue with **"Go"** centered in white, weight 800. Never a bare "G".
- **Wordmark:** "GoZone", weight 800, letter-spacing −1. "Go" + "Zone" are one word.
- **Tagline:** "Your city, in motion."
- **Voice:** sentence case everywhere. Confident, short, friendly. No exclamation marks in system copy.

## 2. The two-surface principle

GoZone has two visual registers. Use the right one for the moment:

- **Brand surface (always dark + glow):** splash, welcome/auth, and hero/celebration
  moments (trip complete, big confirmations). Deep navy-black background, an off-center
  blue **glow orb**, big white type, pill buttons. Inspired by the premium dark apps.
- **Utility surface (light, dark-mode aware):** every functional screen — home, lists,
  menus, dashboards, wallet, profile. Bright, calm, bold typography, generous spacing.
  Follows the user's light/dark system setting.

Brand surfaces do **not** follow the theme toggle — they're always dark. Utility surfaces do.

## 3. Color

### Brand blue (constant in both modes)
- `primary` **#2563EB** — primary actions, logo, active states
- `primaryBright` **#3B82F6** — accents on dark, focus
- `glow` **#2F6DF5** — the orb / glow color

### Brand (dark) surface palette
- `bg` **#070B18** · `bgElevated` **#0E1526**
- `text` **#FFFFFF** · `textMuted` **#8A97B2**
- `border` **#222B44** · `borderSoft` **#1E2740**

### Utility — light
- `bg` #F5F7FB · `surface` #FFFFFF · `surfaceAlt` #EEF2F8
- `text` #0F172A · `textMuted` #64748B · `border` #E3E9F2

### Utility — dark
- `bg` #0A0F1C · `surface` #141B2D · `surfaceAlt` #1C2740
- `text` #E8EDF6 · `textMuted` #94A3B8 · `border` #273248

### Semantic
- success #16A34A (dark #22C55E) · danger #DC2626 (dark #F87171) · warning #D97706 (dark #FBBF24)

Text on the blue fill is always white. Soft blue chips use `primary` text on a `primary @ 12%` fill.

## 4. The glow orb

The signature element. Rules:
- **Off-center, never dead-center** on multi-element screens — e.g. top-right on Welcome —
  so the composition doesn't read as a rigid vertical stack. Centered is allowed only on
  the pure splash.
- Radial falloff from `glow` to transparent. (Implemented as stacked translucent circles
  via the `GlowOrb` component so it works on web + iOS + Android with no extra deps.)
- One orb per screen. It's atmosphere, not a focal UI element — keep it behind content.

## 5. Typography

Scale (px): display 32 · h1 28 · h2 22 · h3 18 · body 15 · small 13 · tiny 11 (min).
Weights: 800 brand/wordmark, 700 headings & buttons, 600 emphasis, 400 body.
Headings letter-spacing −0.5 to −1. Line-height 1.1 for big headings, 1.5 for body.

## 6. Spacing & shape

- Spacing scale: 4 · 8 · 12 · 16 · 24 · 32. Screen horizontal padding 16–24.
- Radius: control 12 · card 16–18 · sheet 22 · **pill 999** · squircle = size × 0.30.
- Buttons are **pill-shaped** (999) on brand surfaces; 12–14 radius on dense utility surfaces.

## 7. Components

- **PillButton** — filled (blue/white), outline (hairline border), ghost. 999 radius,
  ~15px vertical padding, weight 700, optional leading icon. One filled per view.
- **Card** — surface fill, 16–18 radius, hairline border, soft shadow. No heavy borders.
- **Input** — 12 radius, hairline border that turns `primary` on focus; label above in
  uppercase 11px muted. Dark variant on brand surfaces.
- **Tab bar** — surface bg, hairline top border, icon + 11px label, active = primary.
- **Quick-action tile** — square-ish, soft surface, centered icon (blue) + label. Grid of 3.
- **Header** — big bold title + optional subtitle, optional right slot + theme toggle.
- **Badge / pill** — status (success/warning/danger/neutral), soft tinted fill + matching text.
- **Search bar** — soft `surfaceAlt` fill, 16 radius, leading search icon, trailing chip ("Now").

## 8. Iconography

Use **`@expo/vector-icons`** (Ionicons), bundled with Expo — no install. Outline style,
18–22px inline, color inherits or `primary`. No emoji in shipped UI.

## 9. Motion

Subtle and quick (150–250ms). Fade between stacks, gentle press scale (0.97) on buttons.
The glow may breathe slowly (optional, low priority). Never bouncy or gimmicky.

## 10. Apps, accounts & roles

GoZone is split into **separate apps** (like Uber's rider vs. driver apps), all talking to
the same backend gateway:

- **`customer-app/` — the Passenger app** (this one): rides + shop (GoShop) + parcel. The consumer.
- **`driver-app/` — Driver & Courier app**: accept ride requests and deliveries.
- **`vendor-app/` — Vendor management app**: catalogue, incoming orders, walk-in queue
  (restaurants, pharmacies, groceries — any `vendor_type`).
- **Admin** (KYC review, analytics) is a **web app**, not mobile — to be built separately.
  The old React-Native admin screen is kept under `admin-web/` only as a reference.

Terminology note: internally the consumer role is still `RIDER` in the backend/JWT, but the
**user-facing term is "Passenger"**. In Ghana a "rider" usually means a courier, so we never
call the consumer a rider in the UI. (A full backend rename to `PASSENGER` can happen later.)

- **One account** identified by phone or email; sign-up does not ask for a role.
- Each app defaults new sign-ups to its own role (Passenger app → RIDER, Driver app → DRIVER).
- A future "switch app/role" can re-issue the JWT with a different active role.

## 11. Onboarding flow (target)

Splash → Welcome (continue with phone / email / Google) → phone OTP **or** email+password →
(first time) brief "what do you want to do" is **skipped** — land as Passenger; add Driver/
Restaurant later from Profile → Home.

## 12. Screen inventory & build status

Built bit by bit. Status updated as we go.
- Splash · Welcome · Phone entry · OTP — **in progress (this build)**
- Email sign-in / sign-up — pending (needs backend email auth)
- Rider home · search · wallet — pending redesign
- Food: browse · menu · order tracking — pending
- Driver: feed · trip · earnings — pending
- Restaurant dashboard · Admin KYC — pending
- Profile / mode switch — pending
