# Customer App — Issues & Backlog

Captured from the user's review (this session). Items are grouped by area.
Tags: **[bug]** broken/wrong behaviour · **[feat]** new feature · **[design]** visual ·
**[backend]** needs a service/endpoint change. Status: ☐ todo · ◐ in progress · ☑ done.

---

## 1. Auth & onboarding
- ☑ **[feat][backend] Email set-up** — DONE (Email + OTP, mirrors phone+OTP). auth-service: `V3__email_auth.sql`
  (`users.email` unique + `phone` now nullable; `otp_codes.email` + nullable phone), `User`/`OtpCode` gain
  `email`, repo `findByEmail`/`existsByEmail` + email OTP finder. New **`POST /auth/register-email`** (409 if
  email exists) and **`POST /auth/login-email`** (404 if not) + `issueEmailOtp` (logs `[OTP-MOCK] email=…`);
  `/auth/verify-otp` now accepts **phone OR email**; `/auth/me` returns `email`. **Rebuild auth-service.**
  Customer app: register screen has a **Phone / Email toggle** (channel preserved across signup↔login via
  `ch` param), `authStore.registerEmail/loginEmail/verifyEmailOtp`, verify-otp handles email + seeds
  `profileStore.email`. Same 404/409 "sign up / log in instead" UX as phone. **Driver & vendor apps now have
  the same Phone/Email toggle too** — their authStores gained `registerEmail/loginEmail/verifyEmailOtp`
  (shared `applySession` helper) and their register/verify-otp screens handle the email channel (roles
  `DRIVER` / `RESTAURANT_OWNER`); onboarding is identity-agnostic (keys off the auth user id), so KYC/vendor
  create/approval all work with an email account.
- ☑ **[bug][backend] Login doesn't verify the number is registered.** FIXED: new **`POST /auth/login`**
  (phone-only) issues an OTP **only if the phone already has an account** — it never creates a user; an
  unknown number returns **404** ("No account found for this number. Please sign up."). `/register` remains
  the signup (upsert) path. Frontend: `authStore.login(phone)`; `register.tsx` login mode calls it and on
  404 shows a "No account found → Sign up" prompt. Enabled `server.error.include-message: always` in
  auth-service so the 404 message reaches the client. Contract `auth.yaml` updated (`/login` + `LoginRequest`).
  **Rebuild auth-service.**
- ☑ **[bug][backend] Sign-up with an existing number silently logged in (mirror case).** FIXED:
  `POST /auth/register` is now **sign-up only** — an existing phone returns **409** ("An account with
  this number already exists. Please log in."); it no longer upserts. Applied the **symmetric fix to all
  three apps** (customer/driver/vendor — driver & vendor login *also* went through `register`, so they had
  the same "login creates an account" bug): each authStore gained `login(phone)`, and each `register.tsx`
  now routes signup→`register` (handles 409 → "Log in") and login→`login` (handles 404 → "Sign up").
  Contract `auth.yaml` /register documents 409. **Rebuild auth-service.**
- ☑ **[bug][backend] Registered number couldn't log in (phone-format mismatch).** FIXED: auth-service now
  **normalizes Ghana numbers to E.164** (`normalizePhone` in `register`/`login`/`verifyOtp`), so `0201000001`,
  `233201000001`, and `+233201000001` all resolve to the **same account** (strips spaces/dashes too).
  Previously login with the local `0…` form 404'd against a `+233…`-stored account. **Rebuild auth-service.**
- ☑ **[bug] New account inherited the previous user's data** (old recent locations + auto-username "alex").
  ROOT CAUSE: `logout()` only cleared tokens — the persisted user-scoped stores survived, and `profileStore`
  shipped hardcoded defaults **name "Alex Mensah" / username "alex"** that `setProfile` never overwrote.
  FIXED (customer app): profileStore defaults now **empty** (no shared placeholder identity) + `reset()`;
  added `reset()` to `recentsStore`/`paymentStore`; new **`src/lib/session.ts` `clearUserData()`** wipes
  profile + recents + payment + cart; called on **logout** and before **every fresh verify-otp**. On
  **login** the real name is pulled from the backend (`authStore.fetchMe()` → `/auth/me`); on **sign-up**
  it's the entered name. Username is no longer auto-assigned (blank → shows "Passenger"; user sets it in the
  account editor). **Driver & vendor apps got the same fix** (`src/lib/session.ts clearUserData()` +
  store `reset()`s): driver clears `driverStore` (online/active-trip) + `driverSetupStore` (KYC draft);
  vendor clears `vendorStore` (selected business/open) + `vendorSetupStore` (business draft) — on logout and
  every fresh verify-otp, and logout now also nulls `name`/`status`.
- ☑ **[feat] Ask to set a username during sign-up** — DONE: the sign-up form now has an optional
  **Username** field (below Full name); it's passed through verify-otp and seeds `profileStore.username`
  (local mock, consistent with the account editor — no backend username for customers). Blank still shows
  "Passenger".

## 2. Brand / visual
- ☑ **[design] Glow side** — standardized all customer brand screens (welcome/register/verify-otp) to
  glow top-**right** (verify-otp was on the left).
- ☑ **[design] Parcel "stacked boxes"** — redesigned: Send/Receive segmented toggle, size is now a
  compact 3-up row (not stacked full-width cards), tighter sections. (See §6.)

## 3. Home / Ride
- ☑ **[bug] Recent locations on a new account** — fixed: `recentsStore` (persisted) starts empty and
  fills as the user picks places in search; home/search hide the Recent section when empty.
- ☑ **[feat] Ride-type selector** — Standard / **Luxe** (was "Premium") / Okada. **Now a pill button on the
  GoRide title line**: tap it to drop down the three option boxes; picking one collapses them and the pill
  label updates to the chosen type. **Luxe is a fixed fare (no bargaining)**; Standard/Okada show the
  editable fare stepper. (Backend ride-type key stays `PREMIUM`; "Luxe" is display-only.)
- ☑ **[feat][backend] Bargaining (inDrive-style):** rider posts a fare → **`live.tsx` polls driver
  offers** (`GET /rides/requests/{id}/bids`) and shows them ("Drivers are offering") → rider taps
  **Accept** (`POST …/bids/{bidId}/accept`) → trip created at that fare. Drivers send offers via the
  existing feed Counter action. **Rebuild ride-service.** (Per-type "no counter on Premium" is
  frontend-only for now — backend has no ride-type field.)
- ☑ **[feat] "Now" pill → schedule a ride** — the search-bar pill is now tappable → `(rider)/schedule.tsx`
  (presets: now / +1h / +3h / tomorrow AM/PM). Scheduled rides carry `scheduledAt`, skip live tracking,
  and land in Your rides as **Upcoming**; the driver feed hides future-scheduled requests until their time.
- ☑ **[feat][backend] Rides history** — `GET /rides/trips/mine` + `(rider)/rides.tsx` (Profile → **Your
  rides**): **Upcoming & active** (scheduled/open/in-progress, tap → live map) and **Past** (completed/
  cancelled) with fare, status, and time. **Rebuild ride-service** (scheduled_at migration + endpoint).

## 4. Shop (GoShop / GoBite) browse
- ☑ **[design] Type pills moved beneath the search bar** (All / Food / Pharmacy / Grocery).
- ☑ **[design] Food category selection moved into the Filter page** (now in `shopFilter.category`;
  the filter badge counts it).
- ☑ **[bug] Fix Favourite & Search buttons on the menu page + favourite filter.** DONE: new persisted
  **`favouritesStore`** (favourite vendor ids, user-scoped — cleared on logout/login, hydrated in `_layout`).
  The menu-page **heart** now toggles a real, persisted favourite (was a throwaway `useState`), and the
  **Search** button opens a working **in-page item search** overlay (filters this vendor's items by
  name/description, tap → item). The shop-browse card hearts now use the same store (were an un-persisted
  local `Set`), so favourites persist and stay in sync. Added **`favouritesOnly`** to `shopFilter` + a
  **"Favourites only"** toggle on the Filter page (counts toward the filter badge), applied in the browse
  list (with a tailored empty state when you have no favourites yet).
- ☑ **[feat][backend] Promo cards — admin-controlled & clickable.** Backend `promos` table + `PromoService`/
  `PromoController` (`GET /food/promos` public; create/toggle/delete admin-only). Customer carousel now
  loads real promos and **taps through** to the promoted vendor's menu (or filters by promoted category).
  Admin web has a **Promos** page (create with colour/preview, activate/hide, delete). Remaining:
  **vendor self-serve "apply to promote" (paid)** — currently admins create promos directly.
- ☑ **[feat][backend] Pricing → server-authoritative + surge.** DONE: new **`POST /rides/quote`**
  (ride-service) computes `(base + perKm × haversine) × ride-type multiplier × surge`, floored at minFare,
  with a **time-based surge** (peak commute hours 07–09 / 17–19) and a `ruleVersion` stamp; all pricing
  knobs are env-overridable (`app.pricing.*`). Customer `home.tsx` fetches server quotes for all ride types
  on route change (each type card + the fare anchor use the server fare) and shows a **"Peak-time pricing"**
  note when surge is active; falls back to the local `pricing.ts` if the call fails/offline. **Rebuild
  ride-service.** Remaining (optional): applying quote to the parcel composer.
- ☑ **[feat][backend] Admin-controlled platform fees (service + delivery).** DONE: vendors set their food
  prices; GoZone adds a **service fee** (% of subtotal) and a **distance-based delivery fee**
  (`base + per-km × haversine(vendor→customer)`), both **admin-controlled, platform-level** (not per-vendor).
  food-service: `platform_settings` table (`V5`) + `PlatformSettings` entity/repo; `Order.serviceFee`;
  `PlaceOrderRequest` gains delivery coords; `placeOrder` computes both fees; **`GET /food/platform-fees`**
  (public) + **`PATCH /food/platform-fees`** (admin) + `OrderResponse.serviceFee`; contract updated. Customer
  checkout shows the live breakdown (subtotal + service + delivery = total, delivery from vendor coords via
  `listRestaurants`) and sends delivery coords; order screen shows the real breakdown. **Admin web** has a
  **Fees** page (edit service % + delivery base + per-km, with a live example). **Rebuild food-service** (V5).
- ☑ **[feat] GoShop location → "Choose on map"** — added; opens the shared map picker (`target=shop`).

## 5. Search page (location picker)
- ☑ **[bug] Fix Home / Work / + buttons.** DONE: new persisted **`savedPlacesStore`** (home/work/custom,
  user-scoped — cleared on logout/login via `lib/session.ts`, hydrated in `_layout`). Home/Work pills read
  the store: if set → fills the current field; if **not set → opens the map picker to set it** (and fills
  the field so you continue in one flow), then it's a one-tap shortcut after. **+** opens the new
  **Saved places** screen. Custom saved places show as extra pills. Same wiring added to the **GoShop
  address** picker. Retired the hardcoded `HOME_PLACE`/`WORK_PLACE` (added `ACCRA_CENTER` default for
  pickers). map-picker gained `home`/`work`/`saved` targets (+ `field`/`from` to fill-and-continue).
- ☑ **[feat] "Choose on map"** — opens the shared **`app/map-picker.tsx`** (tap landmarks or drop a pin;
  no native-map dep so it works on web + Expo Go). Reused by ride search (origin/dest), GoShop, parcel.
- ☑ **[bug] Recent search locations & recommendations** — recents are real now (`recentsStore`, empty for
  new accounts); typing gives **live map-backed suggestions** via Nominatim (`lib/geocode.ts`,
  debounced, merged with built-in places). Wired into ride search **and** GoShop address.

## 6. Parcel
- ☑ **[design] Redesign** (see §2 — no longer stacked boxes).
- ☑ **[feat] Send vs Receive** — segmented toggle; labels switch Recipient↔Sender. (Backend still
  treats both as a courier request; deeper send/receive semantics can come with a parcel backend.)

## 7. Wallet & payments
- ◐ **[feat][backend] "Send money" removed** (wallet is in-app only). **"Add money"** kept but still a
  stub — real top-up needs the PSP (Paystack) backend.
- ☑ **[design] Renamed "MTN Mobile Money" → "Mobile Money".** (Real charges via PSP/Paystack still TODO.)
- ☑ **[feat] Add a credit/debit card** payment method — DONE: **Payment → "Add debit / credit card"** opens
  a form (card number, expiry MM/YY, name) → derives the brand (Visa/Mastercard/Amex) + last-4 and adds a
  **real, persisted, selectable** method via `paymentStore.cards` (user-scoped — cleared on logout/login).
  Cards are removable (trash icon). Local mock only — **not charged** (no PSP). "Add money" wallet top-up
  stays stubbed (needs Paystack).
- ☑ **[feat][backend] Payment step at the end of a trip/order (RIDE + ORDER DONE):** the complete screen
  has a real payment section driven by the chosen method — **Mobile Money** (enter number → prompt),
  **Card** (auto-charge with consent), **Wallet** (pay from balance), **Cash** (customer pays in person →
  the driver/vendor **confirms in-app** → reflects PAID on the customer).
  - Ride: `trips.payment_status/method` + `POST /rides/trips/{id}/pay`, `…/confirm-cash`, `GET /rides/trips/{id}`;
    driver confirms cash on the trip screen.
  - Order: `orders.payment_status/method` + `POST /food/orders/{id}/pay`, `…/confirm-cash`,
    `GET /food/restaurants/{id}/awaiting-cash`; vendor confirms cash via an **"Awaiting cash"** section on
    the orders board (covers pickup/walk-in; delivery cash is also confirmable there).
  **PSP is MOCKED** (Paystack TBD) — wallet/card/momo settle immediately; only cash waits for confirmation.
  **Rebuild ride-service + food-service.** Remaining: real PSP.
  - ☑ **Courier-side delivery-cash confirm — DONE.** New **`POST /food/deliveries/{id}/confirm-cash`**
    (courier-authenticated; verifies the courier owns the delivery and the order is cash → sets order PAID).
    `DeliveryResponse` now carries `paymentMethod`/`paymentStatus`. Driver app: `deliveryApi.confirmCash` +
    a **"Confirm cash received"** action on the active delivery card — a cash delivery stays active after
    DELIVERED until the courier confirms collection, then settles to PAID (customer's order screen reflects
    it via polling). Vendor's "Awaiting cash" board still works as a fallback. **Rebuild food-service.**

## 8. Profile & content
- ☑ **[feat] Fix Saved places** — DONE: **Profile → Saved places** opens the new **`app/saved-places.tsx`**
  management screen (set/change/remove **Home** & **Work**, add/remove **custom** places). Real & persisted
  via `savedPlacesStore` (§5), shared with the search + GoShop pickers. **Custom places can now be renamed**
  (pencil → modal → `savedPlacesStore.renameCustom`).
- ☑ **[feat] Fix Help & support.** DONE: **Profile → Help & support** now opens a real **`app/help.tsx`**
  screen (was a one-line Alert) — contact card (Email / Call / WhatsApp via `Linking`), an expandable
  **FAQ** accordion (rides, bargaining, tracking, payments, saved places, becoming a driver/vendor), a
  **Report a problem** mailto button, and support hours. Route registered in `_layout`.
- ☑ **[feat] Terms of Service & Privacy Policy** — DONE: new in-app **`app/terms.tsx`** and
  **`app/privacy.tsx`** (shared `src/components/legal.tsx` layout, GoZone-specific demo content). Wired the
  previously-inert **About → Terms / Privacy** links, and added a **"By continuing you agree to Terms &
  Privacy"** consent line on the sign-up screen (tappable). About's **Website** link already opens
  `gozone.app` via `Linking`. (A full external marketing website for GoZone Inc. is out of the app repo's
  scope — deferred.)

---

## Maps stack (decided)
**Real maps via Leaflet in a WebView (native) / iframe (web) — no native build, no API key.**
- `src/components/LeafletMap.tsx` — reusable: `mode="picker"` (Uber-style centre pin, reports the
  centre coord) and `mode="view"` (static markers + a live `driver` marker + optional `route`).
- Tiles: **Carto** basemaps over OSM — `voyager` (light) / `dark_all` (dark), free, attribution only.
- Reverse-geocoding: **Nominatim** (free) in the picker to turn the pin into a real address.
- Dependency: **`react-native-webview`** (Expo Go-supported). Upgrade path: swap tile URL + add a
  MapTiler/Google key when scaling; add OSRM/GraphHopper for real routing lines later.

- ☑ **Shared map picker** — `app/map-picker.tsx` now uses `LeafletMap` (real tiles, pan-to-pin,
  reverse-geocoded address). Reused by ride search (§5), GoShop (§4), parcel.
- ☑ **Live ride-tracking page** — `app/(rider)/live.tsx`: full-screen `LeafletMap mode="view"` with
  pickup/dest markers + a live **driver** marker fed by the WebSocket stream; bottom sheet shows
  searching → driver card (call/SOS) → complete + rating. Home now hands off to it after Request ride
  (home is just the composer again; trip lifecycle lives in `live.tsx`).

## Notes on sequencing (suggested)
1. Quick wins / bugs: glow side (§2), recents-on-new-account (§3), parcel redesign (§2/§6),
   shop pill reorg (§4), search Home/Work/+ (§5), wallet Add/Send + Mobile Money rename (§7).
2. Backend-touching: login-verifies-registration (§1), ride types + bargaining + history (§3),
   scheduling (§3), promo system (§4), pricing (§4), real payments/Paystack (§7).
3. Shared **map picker** → unlocks choose-on-map (§4/§5/§6) and the live ride map.
4. Email auth (§1), company website + ToS/Privacy (§8).
