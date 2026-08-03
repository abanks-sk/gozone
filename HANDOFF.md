# GoZone — Session Handoff

A complete context dump so a new session can continue seamlessly. Read this top to bottom.

> **Start with `README.md` in the repo root** — it is the maintained, structured documentation of
> the whole system (architecture, stack, layout, flows, security, trade-offs, runbook). This file is
> the *chronological* record of how the system got here and why specific fixes were made; the two
> complement each other. Where they disagree, the README is current.

---

## 1. What GoZone is

A Ghana-based super-app platform: **ride-hailing + food delivery + parcel courier**, plus
operator tools. Backend is **Spring Boot (Java 21) microservices + PostgreSQL/PostGIS**,
run via **Docker Compose**. Frontend is **React Native + Expo (SDK 54) + TypeScript**.

The full original spec is in `gozone_build_playbook.html` and `CLAUDE.md` (repo root).
The backend (services M1–M7) was built in earlier sessions and largely works.

---

## 2. Big architectural decisions made THIS session

1. **The app was split into separate Expo apps** (like Uber's rider vs. driver apps):
   - `customer-app/` — **GoZone** (the consumer app: rides + shop + parcel). *Fully redesigned.*
   - `driver-app/` — **GoZone Driver** (driver + courier). *Scaffolded; screens still old design.*
   - `vendor-app/` — **GoZone Vendor** (multi-type vendor mgmt). *Scaffolded; old design.* (Renamed
     from `restaurant-app/`; route group `(vendor)`.)
   - `admin-web/` — **Admin will be a WEB app** (not mobile). The old RN admin screen is parked
     in `admin-web/admin-rn-reference/` only as reference. Not built yet.
2. **Terminology:** the consumer is called **"Passenger"** in the UI (backend role still `RIDER`).
   The "food" vertical is generalized into a **vending system** — branded **GoShop** on the customer
   side (route group `(shop)`), with a `vendor_type` (`RESTAURANT/PHARMACY/GROCERY/CONVENIENCE/OTHER`)
   so pharmacies, groceries, etc. ride the same order/queue/delivery rails. Backend entity renamed
   `Restaurant → Vendor`; the service/package/DB/route (`food-service`, `com.gozone.food`, `food_db`,
   `/food`) and the role `RESTAURANT_OWNER` keep their names (additive, not renamed — cosmetic mismatch).
3. Each new app is **self-contained** (its own copied toolchain + shared code under `src/`).
   Each needs its own `npm install`.

---

## 3. Backend (services/) — state & fixes made this session

Services + ports: gateway **8080** (only public entry), auth **8081**, ride **8082**,
food **8083**, wallet **8084**, postgres (postgis) **5432**. DBs: `auth_db`, `ride_db`,
`food_db`, `wallet_db` (created by `postgres-init/`). Container names: `gozone-gateway`,
`gozone-auth`, `gozone-ride`, `gozone-food`, `gozone-wallet`, `gozone-postgres`.

Fixes applied this session:
- **Dockerfiles** (all 5 services) are two-stage with a Maven cache mount:
  `RUN --mount=type=cache,id=gozone-m2,target=/root/.m2 mvn package -DskipTests`. If a parallel
  `docker compose up --build` is flaky, build services **one at a time**:
  `docker compose build auth-service` … then `docker compose up`.
- Removed the non-existent `flyway-database-postgresql` dep from all 4 service poms.
- **wallet-service `V1__baseline.sql` was rewritten** to match the JPA entities
  (notifications had `title/body/sent`, wallets needed `created_at`, dropped mismatched CHECK
  constraints). If you change wallet entities, keep the migration in sync (`ddl-auto: validate`).
- **gateway `application.yml`** got `globalcors.add-to-simple-url-handler-mapping: true`
  (that gateway container wasn't rebuilt; CORS works anyway because auth-service has its own
  CorsFilter and `allowedOrigins: "*"`).
- **`seed/01_auth_seed.sql`** fixed: `driver_kyc` uses `roadworthy_url` + `id_selfie_url`
  (not `doc_url`), and no `reviewed_at` column.
- **NEW endpoint `GET /rides/requests/{id}/status`** (latest session): rider polls their own request
  → returns `{ request, trip }` (trip null until a driver accepts). Added `RideStatusResponse` DTO +
  `RideService.getRequestStatus()` + controller route + `contracts/ride.yaml`. **Rebuild ride-service
  to expose it:** `docker compose build ride-service && docker compose up -d ride-service`.
- **food-service vendorization** (latest session): entity `Restaurant → Vendor` (file/class/type +
  `VendorRepository`, `VendorResponse`; **table `restaurants`, columns, `restaurant_id` FKs, Spring
  Data method names, package, service, `/food` route all KEPT** — additive). Added `vendor_type`
  (`RESTAURANT/PHARMACY/GROCERY/CONVENIENCE/OTHER`) via **`V2__vendor_type.sql`** + exposed in DTO +
  `contracts/food.yaml` (`VendorResponse`). `seed/02_food_seed.sql` classifies the 2 restaurants and
  adds **MedPlus Pharmacy** + **FreshMart Grocery** with items. **Rebuild + reseed:**
  `docker compose build food-service && docker compose up -d food-service` then
  `docker exec -i gozone-postgres psql -U gozone -d food_db < seed/02_food_seed.sql`.
- **Food-delivery courier flow (NEW):** couriers (driver app) can now fulfill delivery orders.
  Added `GET /food/deliveries/available`, `GET /food/deliveries/mine`, `POST /food/deliveries/{id}/accept`
  (+ `DeliveryResponse` DTO, repo `findByCourierIdIsNull…`/`findByCourierId…`, service methods, contract).
  **WS fix:** `updateDeliveryLocation` now broadcasts on the **order id** (`/topic/delivery/{orderId}/location`)
  instead of the delivery id — the customer subscribes by order id, so live courier location now actually
  reaches them. Flow: vendor READY (creates delivery) → courier accepts in driver app → advances
  PICKED_UP→ENROUTE→DELIVERED with scripted GPS → DELIVERED auto-completes the order. **Rebuild food-service.**
- **Vendor earnings fix (polish pass):** `FoodService.onOrderCompleted` now settles to the vendor's
  **owner user id** (`order.getRestaurant().getOwnerId()`), not the vendor entity id — so the vendor
  app's Earnings (queried by the signed-in user's id, like RIDER/DRIVER wallets) actually shows
  revenue. **Rebuild food-service.** Driver wallet (`DRIVER`, by driver user id) was already correct.
- **NEW endpoint `GET /auth/driver/kyc?status=` (ADMIN)** for the admin web app: lists KYC
  submissions (optional status filter). Added `findByStatusOrderByCreatedAtDesc` +
  `AuthService.listKyc()` + controller route + `contracts/auth.yaml`. The PATCH review endpoint
  already existed. **Rebuild auth-service** to expose it. Seeded ADMIN: phone `+233201000006`.

### Running the backend
```bash
docker compose up            # from repo root; or: docker compose build <svc> one at a time
# seed (note container name + db):
docker exec -i gozone-postgres psql -U gozone -d auth_db < seed/01_auth_seed.sql
docker exec -i gozone-postgres psql -U gozone -d food_db < seed/02_food_seed.sql
docker exec -i gozone-postgres psql -U gozone -d wallet_db < seed/03_wallet_seed.sql
docker exec -i gozone-postgres psql -U gozone -d ride_db < seed/04_gps_stream.sql
```
**Gotcha:** if all calls return 500, check `gozone-auth` is actually **Up** (`docker ps`).
It exited once and the gateway 500s when any downstream is down.

### Auth / OTP (phone-only is the only real auth)
Phone + OTP. The OTP is **mocked to the logs**:
```bash
docker logs gozone-auth --tail 50 2>&1 | grep OTP-MOCK
# [OTP-MOCK] phone=+233... code=482915 expires_in=5m
```
Seeded users: phones `+233201000001`..`007`; restaurant id `bbbbbbbb-0000-0000-0000-000000000001`
(Kofi Kitchen) & `...002` (Accra Grill House); platform wallet `00000000-...-000000000001`.

---

## 4. Running the apps

Each app: `cd <app> && npm install && npx expo start` (separate Metro instance/port).
- **Web**: press `w`. Web uses `http://localhost:8080`. (`Alert.alert` now works on web via the
  `src/lib/webAlert.ts` shim — see §5.)
- **Phone (Expo Go SDK 54)**: phone + PC on the **same Wi-Fi**. The API base URL **auto-detects
  the PC's IP** from the Expo dev-server host (see `src/api/client.ts` → `resolveBaseUrl()`), so
  no manual IP editing is needed. Windows Firewall may need an inbound rule for the gateway:
  `New-NetFirewallRule -DisplayName "GoZone Gateway" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080` (run as admin).
- A project **`.npmrc`** sets `legacy-peer-deps=true` (needed for installs on SDK 54).

All three apps were confirmed **running** by the user at handoff time.

---

## 5. Expo SDK 54 — pitfalls already solved (don't reintroduce)

- Needs **`babel.config.js`** (`babel-preset-expo`) and **`metro.config.js`** (expo metro-config).
- **zustand** ESM uses `import.meta` → breaks web. Fixed in `metro.config.js` by forcing zustand's
  CommonJS build (`resolveRequest` with `unstable_enablePackageExports: false` for zustand only).
- **expo-notifications** removed entirely (push doesn't work in Expo Go SDK 53+; it crashed startup).
- **Navigation**: root `_layout.tsx` only renders `<Stack>`; routing is declarative via
  `customer-app/app/index.tsx` `<Redirect>` (imperative nav before mount throws in expo-router v6).
- **White flash on screen transitions** (ugly in dark mode): the real cause is React Navigation's
  **container theme**, which follows the *OS* color scheme (not our in-app theme), so it paints
  white during transitions when the phone is in light mode but the app is dark. Fix in root
  `_layout.tsx`: wrap the `<Stack>` in `@react-navigation/native`'s `ThemeProvider` with
  `colors.background`/`card` set to `c.bg`, wrap in a `View` with `bg`, and (web) sync
  `document.body.style.backgroundColor`. Also keep `contentStyle: { backgroundColor: c.bg }` on
  every Stack (root + `(food)` + `(parcel)` + `(rider)`).
- **Dark mode on phone:** `app.json` `userInterfaceStyle` must be **`automatic`** (was `light`,
  which locked the native app to light so `useColorScheme()` always returned `light` on device —
  "System" appeared white even on a dark phone; web was unaffected). Keep it `automatic`. Under
  SDK 54 edge-to-edge the Android gesture/nav bar is transparent, so the bottom area takes the root
  `View` background — no separate nav-bar color needed (a dev/standalone build would also want
  `expo-system-ui` installed for `userInterfaceStyle` to take effect; Expo Go handles it natively).
- **Maps = Leaflet in a WebView (native) / iframe (web)** — `customer-app/src/components/LeafletMap.tsx`,
  dep `react-native-webview` (Expo Go-supported). NO `react-native-maps`/`expo-maps` (those need a dev
  build, not Expo Go, and have no web support). Carto/OSM tiles (no key), Nominatim reverse-geocode.
  `mode="picker"` (centre pin) powers `app/map-picker.tsx`; `mode="view"` + live `driver` marker is for
  the (next) live ride-tracking page. Don't replace this with a native map unless moving to dev builds.
- **`Alert.alert` is a no-op on RN Web** → "coming soon"/confirm buttons looked dead in the browser.
  Fixed by `src/lib/webAlert.ts` (imported for its side-effect in each app's root `_layout.tsx`), which
  patches `Alert.alert` on web to use `window.alert`/`window.confirm`. Native is untouched, and **no
  call sites changed**. Present in all three Expo apps.
- **expo-secure-store** throws on web. Use the shim `src/lib/storage.ts` (SecureStore on native,
  `localStorage` on web) — used by `authStore` and `api/client`. Never call SecureStore directly.
- Deps added: `react-native-svg`, and `@expo/vector-icons` (Ionicons) is bundled with Expo.

---

## 6. Design system (the look)

Spec: **`customer-app/DESIGN_SYSTEM.md`**. Key points:
- **Two surfaces:** *Brand* (always dark + blue glow — splash, welcome, onboarding) and
  *Utility* (light/dark, theme-aware — every functional screen).
- **Blue is an accent, not everywhere.** Primary `#2563EB`. Deep gradient heroes go **dim blue →
  near-black** (not flat neon). Slate neutrals.
- **Logo:** squircle with "Go". Splash uses a glowing **orb/ball** (`BrandOrb`) + "GoZone" wordmark.
- **Buttons are pill-shaped** (radius 999). Cards radius ~22. Rounded, premium, fewer boxes.
- Light/dark via **Profile → Appearance** (System/Light/Dark). Icons = **Ionicons**.

### Key shared files (in each app's `src/`)
- `src/theme/tokens.ts` — light/dark `Palette`, `brand` (dark palette), radius/space/font.
- `src/theme/ThemeProvider.tsx` — `useTheme()` → `{ colors, scheme, mode, setMode, toggle }`.
- `src/components/ui.tsx` — `Btn, Card, Input, Row, Badge, Section, Empty, Divider, Avatar,
  SearchBar, QuickActionTile, ListRow, Screen, AppHeader, ThemeToggle` (all theme-aware).
  Also exports a static `Colors` (light fallback) used by not-yet-migrated screens.
- `src/components/brand.tsx` — `GlowOrb`, `BrandOrb` (solid lit sphere + halo), `Logo`,
  `BrandScreen`, `PillButton`, `BrandInput` (the dark onboarding kit). Uses `react-native-svg`.
- `src/lib/storage.ts`, `src/lib/routes.ts` (`roleHome()` — per app), `src/api/*` (auth via
  client.ts, ride.ts, food.ts, wallet.ts), `src/store/authStore.ts`.
- `src/store/profileStore.ts` (local mock profile: name/username/email/phone, persisted; `initial()`
  helper for avatars) and `src/store/paymentStore.ts` (selected payment method + `PAY_METHODS`,
  persisted). Both hydrated in root `_layout.tsx`. **Customer app only** (added this session).

---

## 7. Customer app (`customer-app/`) — DONE & polished

Route groups under `customer-app/app/`:
- `index.tsx` splash+redirect, `welcome.tsx`, `auth/register.tsx` (phone, defaults role RIDER),
  `auth/verify-otp.tsx`, `profile.tsx`, `search.tsx` (From/To picker; `?field=origin|dest`).
- Top-level (added this session): `account.tsx` (edit name/username/email/phone → `profileStore`),
  `about.tsx` (brand + version + links), `wallet.tsx` (**"Payment"** — balance + selectable payment
  method + transactions/notifications). Profile links to all three.
- **`(rider)/`** — **NO bottom tab bar** (converted Tabs→Stack this session). Only `home.tsx` (rides).
  The old `(rider)/wallet.tsx` was removed (moved to top-level `wallet.tsx`).
- **`(shop)/`** stack (renamed from `(food)/`): `restaurants.tsx` (browse), `menu.tsx`,
  `item.tsx` (add-ons), `checkout.tsx`, `order.tsx` (tracking; **auto-polls status every 4s**),
  `orders.tsx`, `filter.tsx`, `address.tsx`. (Branded **GoShop**; the round button is now **"Shop"**
  with a `storefront` icon. Endpoint paths are still `/food/...` — backend route unchanged.)
- **`(parcel)/`** stack: `index.tsx` (compose — **redesigned to mirror the ride home**: gradient hero
  + the same Ride/Shop/Parcel circles), `track.tsx` (live courier tracking).

**Cross-surface nav:** the three round buttons (Ride/Shop/Parcel) on home, restaurants, and parcel
use `router.replace` between the three top surfaces so switching feels seamless (no stack growth).

Highlights of what's built (all in the new design):
- **Onboarding**: splash (glow orb) → welcome (**Create account** / **Log in** + google STUB) →
  `auth/register?mode=signup|login` → OTP → home. **Sign-up collects a name** (sent to
  `/auth/register`); on verify it seeds `profileStore`. Login is phone+OTP only. (Google STUBBED.)
- **Ride home**: deep gradient hero, elevated search → `/search`, Ride/Shop/Parcel circles,
  GoRide card (From/To + swap + editable fare stepper), recents. Avatar → Profile. **Live trip flow
  now completes end-to-end** (this session): after Request ride it **polls
  `rideApi.requestStatus(requestId)` every 3s** → Driver matched → en route → on trip (live driver
  location over WS + stale badge) → Trip complete → **star rating** → Book another. Greeting + avatar
  initial come from `profileStore`.
- **Shop (GoShop, was GoBite)**: browse is now **vendor-type-aware** (Phase 3 done): a row of type
  tabs (All / Food / Pharmacy / Grocery / … — only types present in the data are shown) filters by
  `restaurant.vendorType`; food-only UI (deals carousel + cuisine chips) shows only for All/Food;
  non-food cards get a type badge (e.g. "Pharmacy"). Plus tappable location → `/(shop)/address`,
  search + **filter screen**, image-rich vendor cards w/ promo/heart/rating/distance, Orders button →
  `orders.tsx`. Menu (cover banner + overlaid buttons, circle
  logo, "Busy now"/delivery chips, **sticky category pills that scroll to sections**, food images).
  Item detail (hero image, description, availability chips, **add-on groups** single/multi, qty,
  add to cart). Checkout (Delivery/Pickup/Walk-in **constrained by item availability**, address →
  search, cart lines, place order). Order tracking (status hero + **segmented progress** + courier
  card + walk-in queue + star rating).
- **Parcel**: compose (gradient hero + Ride/Food/Parcel circles, pickup→drop-off via `/search`,
  size S/M/L, recipient, **fare estimate**) → "Find a courier" → track. **Reuses the ride request
  backend** (`rideApi.createRequest`), so a parcel shows up in the **Driver app feed**. Track now
  **polls the same `requestStatus` endpoint** → courier assigned → in transit → delivered (live loc).
- **Payment** (`wallet.tsx`, reached via Profile → Payment): blue gradient balance card
  (Add money/Send STILL STUBBED), **selectable payment method** (Wallet/Cash/MoMo/Visa via
  `paymentStore`, persisted; "Add payment method" stubbed), transactions, notifications.
- **Profile**: identity card → `/account` editor; Appearance (theme); **Payment** → `wallet.tsx`;
  Saved places/Help (STUBBED); **About** → `/about`; Log out.

Shop data/stores (in `customer-app/src/`, renamed food→shop this session): `data/shopCatalog.ts`
(vendor + item metadata: images, descriptions, add-on groups, categories, delivery fees, promos,
`distanceKm`; still exports `restaurantMeta`/`RESTAURANT_META` helper names), `store/shopCart.ts`
(`useShopCart`; cart line items with options; `cartCount/cartTotal/lineTotal`; `deliveryPlace`),
`store/shopFilter.ts` (`useShopFilter`; sort/openNow/freeDelivery), `data/places.ts` (Accra `Place`s),
`store/rideDraft.ts` (origin/dest, reused by parcel). API client: `src/api/shop.ts` (`shopApi`,
`Restaurant`/`VendorType` types; endpoints still `/food/...`).

### Stubs / known limitations (consumer app)
- Email & Google sign-in (phone+OTP only is real).
- Add money / Send, "Add payment method", Saved places, Add shortcut, "Choose on map" — "coming soon".
- **Account edits + payment-method choice are local mock** (`profileStore`/`paymentStore`, persisted) —
  there is **no backend profile API**. RIDER→PASSENGER rename still deferred.
  *(Superseded — see "Backend profile API" at the end of this file: `PATCH /auth/me` is real now and
  `profileStore` is only a cache. Payment-method choice is still local.)*
- **Add-on prices are frontend-only**; the backend order total uses base menu prices (backend has
  no add-on concept).
- Shop/banner **images load from loremflickr.com** (remote; slow on first load).
- **Live flows now work** (this session): ride + parcel poll `GET /rides/requests/{id}/status`
  (new endpoint) and food order auto-polls — all three complete end-to-end. **Requires the new
  ride-service endpoint — rebuild ride-service** (`docker compose build ride-service`).

---

## 8. Driver app (`driver-app/`) — REDESIGNED & complete

- Identity: `gozone-driver`, app name "GoZone Driver", scheme `gozonedriver`. Foundation now matches
  customer: `userInterfaceStyle: automatic`, dark splash, and root `_layout.tsx` has the
  **NavThemeProvider white-flash fix**.
- **`src/store/driverStore.ts`** (new): `online` (persisted), `activeTrip` (set on accept so the Trip
  screen picks it up — no more pasting an id), `acceptedToday`. Hydrated in root `_layout.tsx`.
- **`(driver)/_layout.tsx`**: themed Tabs (Ionicons) — Home / Trip / Earnings.
- **`feed.tsx` REDESIGNED**: gradient hero with a big **online/offline toggle** (hero turns green when
  online), stats strip (wallet/trips/rating), active-trip banner, and **live incoming-request cards**
  (auto-poll every 5s) with a **countdown bar (auto-declines at 0)**, fare + "after fees", pickup
  distance + trip distance (haversine), and **Accept / Decline / inline Counter stepper** (replaces the
  old iOS-only `Alert.prompt`).
- **`trip.tsx` REDESIGNED (functional)**: reads `activeTrip` from the store; status **timeline**
  (Matched→Enroute→Started→Completed), one big advance button, pushes demo GPS waypoints while
  ENROUTE/STARTED, complete → settles → clears trip. Full nav/map-style polish still TODO.
- **`wallet.tsx` (Earnings) REDESIGNED**: green "money" gradient hero (earned this period + wallet
  balance + Cash out stub), **Today/Week/All-time** period selector, stat cards (trips, avg/trip), a
  **7-day earnings bar chart** (computed from the ledger), and themed transaction list.
- **`trip.tsx` enriched**: passenger card (call/message stubs) + route card (pickup→dropoff coords +
  trip km) + **rate-your-passenger** on completion (`rideApi.rateTrip` with the rider UUID — the
  accepted `RideRequest` is kept in `driverStore.activeReq`).
- **`profile.tsx`**: driver-flavored — stats card (rating/trips/acceptance), Vehicle + Documents rows.
  `welcome.tsx` is already on-brand ("Drive. Earn.").
- **`deliveries.tsx` + Deliveries tab (NEW):** courier feed of available food deliveries → Accept →
  status timeline (Picked up → On the way → Delivered) with scripted GPS push to the customer. Uses
  `deliveryApi` in `src/api/food.ts`. This closes the food-delivery courier gap (customer order screen
  now gets live courier location once the vendor marks the order OUT_FOR_DELIVERY).
- **Only optional remainder**: a real map view on the trip screen needs `react-native-maps` (not
  installed; coords-based route card stands in). Everything else is done.

## 9. Vendor app (`vendor-app/`) — REDESIGNED & complete

- Renamed from `restaurant-app/`. Identity: `gozone-vendor`, "GoZone Vendor", scheme `gozonevendor`.
  Foundation matches the others (automatic dark mode, dark splash, NavThemeProvider white-flash fix).
  Role still defaults **RESTAURANT_OWNER** (backend unchanged); `roleHome()` → `/(vendor)/orders`.
- **`src/store/vendorStore.ts`** (new): selected `vendor` (Restaurant) + `open` (accepting orders) —
  both persisted, hydrated in root `_layout.tsx`. `src/api/food.ts` now carries `vendorType`.
- **`(vendor)/_layout.tsx`**: themed Tabs — **Orders / Queue / Catalogue / Earnings**.
- **`orders.tsx`** (centerpiece): header with a **vendor switcher** (a modal listing all seeded
  vendors — restaurant/pharmacy/grocery — so the demo can manage any type under the one owner), an
  **Open/Closed** toggle, New/Preparing/Ready stat cards, and **live order cards** (auto-poll 5s) with
  friendly advance actions (Confirm → Start preparing → Mark ready → Out for delivery → Complete).
- **`queue.tsx`**: "Now calling" hero, Call-next, live waiting list (WS + poll).
- **`menu.tsx`** (Catalogue): vendor-type-aware title (Menu↔Catalogue), item list with availability
  switches (**local-only** — no catalogue-write API yet) + "Add item" stub.
- **`earnings.tsx`**: blue revenue gradient hero (period selector), orders/fees stats, 7-day chart,
  activity list. Uses `walletApi.*('RESTAURANT')`.
- **`profile.tsx`**: vendor-flavored (business name/avatar, Business details, Opening hours).
  `welcome.tsx` already on-brand ("Run your business.").
- Old `dashboard.tsx` removed. Vendor wallet uses `ownerType='RESTAURANT'`, keyed by the **owner's
  user id** — see the food-service fix in §3 so the Earnings screen isn't empty.

---

## 9b. Admin web app (`admin-web/`) — BUILT (Vite + React + TS, not Expo)

- **Stack:** Vite 5 + React 18 + TypeScript, **no router** (simple page-state switch), axios. Minimal
  deps. `cd admin-web && npm install && npm run dev` → http://localhost:5173. Calls the gateway at
  `:8080` (override via `VITE_API_BASE_URL`). Already `npm install`ed; `tsc` + `vite build` pass.
- **Auth:** phone+OTP, **ADMIN-gated** (`Login.tsx` → `/auth/register` then `/auth/verify-otp`;
  rejects non-ADMIN). Token in `localStorage`; `src/lib/auth.ts` + a `gozone-auth-changed` event drive
  re-render. Seeded admin: **`+233201000006`** (OTP from `docker logs gozone-auth | grep OTP-MOCK`).
- **Files:** `src/App.tsx` (auth gate + page switch), `components/Layout.tsx` (sidebar), `api/client.ts`,
  `pages/Login.tsx`, `pages/Dashboard.tsx` (counts: pending KYC / verified drivers / vendors-by-type +
  incidents note), `pages/Kyc.tsx` (filter PENDING/VERIFIED/REJECTED + approve/reject), `index.css`
  (dark GoZone theme via CSS vars). Old RN reference still parked in `admin-web/admin-rn-reference/`.
- **Needs `auth-service` rebuilt** for the new KYC list endpoint (see §3). Analytics are "raw counts"
  per the STUB scope — no aggregation service; trips/orders live counts are not shown (no endpoints).

---

## 10. WHAT'S NEXT (the user's priorities)

1. **Driver app redesign — DONE** (see §8): foundation, `driverStore`, themed tabs, feed (online toggle
   + live request cards), trip (passenger/route cards, status timeline, GPS, rate passenger), earnings
   (period selector + 7-day chart), profile. Only optional: real map view (needs `react-native-maps`).
2. **Vendor app redesign — DONE** (see §9): tabs Orders/Queue/Catalogue/Earnings, vendor switcher
   (multi-type), open toggle, live orders, queue call-next, catalogue, revenue dashboard, profile.
   Remaining (optional/backend): catalogue-write API for real availability edits; confirm vendor
   wallet `ownerType`; a "my vendors by owner" endpoint instead of listing all.
3. ~~Customer Phase 3 — generalize the shop browse + menu/item copy~~ **DONE**: `(shop)/restaurants.tsx`
   has vendor-type tabs (filter by `restaurant.vendorType`), food-only deals/cuisine chips, and type
   badges on cards. `menu.tsx` takes a `vendorType` param → title "Menu"↔"Products", "Busy now"↔"Open
   now"; `order.tsx` copy is now vendor-neutral ("Your order is being prepared", "Thanks for your
   order!"). `item.tsx` was already generic. Remaining (low priority): catalog **item images** for
   non-food vendors still fall back to food stock images (frontend `shopCatalog` metadata).
4. **Admin web app — BUILT** (see §9b): Vite + React + TS, login (ADMIN), dashboard counts, KYC
   review (approve/reject). Remaining (optional): vendor approval flow; live trip/order counts (need
   aggregation endpoints); richer analytics/charts.
5. Optional/deferred: real **email authentication** backend; ~~a dedicated parcel backend~~
   (**decided against** — parcels stay on `/rides/requests`; see "Parcel handover" at the end of
   this file for the reasoning); real **Add money / Send** wallet ops; ~~backend profile API~~
   (**DONE** — `PATCH /auth/me`, see the entry at the end of this file); full **RIDER → PASSENGER**
   backend rename; deeper infra rename
   (`food-service`/`com.gozone.food`/`food_db`/`/food` → shop/vendor) — kept as-is for now since it's
   destructive (DB recreate, full rebuild) and can't be compile-checked locally.
   (Note: ride/parcel **match polling is now DONE** via the new `GET /rides/requests/{id}/status`.)

### How to verify a flow end-to-end (demo)
Passenger app: register a phone → OTP from `docker logs gozone-auth` → request a ride / order food /
send a parcel. Driver app: register a driver phone → OTP → the feed shows nearby requests (ride &
parcel are the same `/rides/requests`) → accept → advance status. Restaurant app: register a
restaurant-owner phone → dashboard shows orders for the seeded restaurant → advance through statuses
(this is what moves the customer's order-tracking screen).

---

## 11. Working style notes (for the assistant)
- The user reviews after **every change** and iterates on visuals heavily — go **bit by bit**, keep
  each turn reviewable, don't do giant risky refactors in one shot (a pager refactor was reverted).
- The user is on **Windows**, Docker Desktop, Expo Go on phone (hotspot Wi-Fi). They prefer the GUI
  but can run terminal commands. **cmd.exe, not bash** — never put `#` inline comments in commands
  you give them (cmd treats `#` as an argument; it broke a `docker compose up` and a `vite` run). The
  Bash tool can curl the local gateway directly to test the backend; `docker logs` for OTP/diagnosis.
- Keep the blue **as an accent**, deep gradients dim (not neon), rounded/pill, fewer boxes,
  real images where it adds life.
- **Don't over-claim "done."** The apps are styled & wired, but real product behavior is still missing
  (see §12). When summarizing, be honest about what's stubbed vs working.

---

## 12. Onboarding & auth overhaul (IN PROGRESS) + real backlog

The user pushed back that we're NOT done — lots is stubbed/missing. Current initiative: a proper
**sign-up / auth system**. Agreed design:
- **Customer / Driver / Vendor** sign up with **details up front**; **Driver & Vendor start PENDING**
  and can't operate until an **admin approves** (they see an "awaiting approval" state).
- **Admin** has two levels: **`SUPER_ADMIN`** and **`ADMIN`**. No self-signup — the super admin
  **creates** admin accounts. Admin login = **username + password, then OTP** to the phone on file (2FA;
  the system already has their number, so they don't type it).
- Driver signup details → `driver_kyc` (licence/vehicle). Vendor signup details → business name/type/
  location (needs a food-service vendor-create endpoint, since restaurants live in `food_db`).

**Phasing:**
- **Phase 1 — DONE (this session):** backend foundation + customer sign-up.
  - auth `V2__profiles_and_approval.sql`: `users` gets `name`, `username` (unique), `password_hash`;
    role enum + `SUPER_ADMIN`; status enum + `PENDING`/`REJECTED`. **Rebuild auth-service.**
  - `User` entity + `RegisterRequest.name` (optional) + `register()` sets name and **PENDING status for
    DRIVER/COURIER/RESTAURANT_OWNER**, ACTIVE for RIDER. `/auth/me` (`UserResponse`) now returns `name`.
  - Customer app: welcome → **Create account / Log in**; `auth/register?mode=signup|login` (signup adds
    a **name** field); verify-otp seeds `profileStore`. `authStore.register(phone, role, name?)`.
- **Phase 2 — DONE (this session):** Admin auth + approval.
  - Backend: `POST /auth/admin/login` (username+password → BCrypt check → OTP to phone on file, returns
    phone; public route) then existing `/verify-otp`; `POST /auth/admins` (SUPER_ADMIN only, bcrypt);
    `GET /auth/users?status=` + `PATCH /auth/users/{id}/status` (approve→ACTIVE / reject→REJECTED, both
    admin levels); KYC review widened to `hasAnyRole('ADMIN','SUPER_ADMIN')`. `SeedRunner` creates a
    super admin on startup: **username `superadmin` / password `super123` / phone `+233201000000`**.
    OTP issuance refactored into `issueOtp()`. **Rebuild auth-service.**
  - Admin web: login is now **username+password → OTP** (`Login.tsx`); new **Approvals** page (pending
    drivers/vendors, approve/reject), **Admins** page (super-admin-only: create admin), Dashboard shows
    an "awaiting approval" count + shortcut. `App.tsx` allows ADMIN & SUPER_ADMIN; super-only nav gating.
- **Phase 3a — DONE (driver, this session):** driver signs up with **name** (welcome → Create
  account / Log in; `register?mode=`), lands on a gated **`onboarding.tsx`** that fetches `/auth/me`:
  ACTIVE → `/(driver)/feed`; REJECTED → rejected screen; PENDING → a **resumable KYC setup** (licence,
  vehicle, doc "uploads" — draft persisted in `driverSetupStore`) → **Submit** (`POST /auth/driver/kyc`)
  → **awaiting-approval** screen that **polls `/auth/me`** and auto-advances when an admin approves.
  Backend: new `GET /auth/driver/kyc/mine` (returns the driver's latest KYC or null). `authStore` gained
  `register(…,name)` + `fetchMe()`; `roleHome` → `/onboarding`. **Rebuild auth-service.**
- **Phase 3b — DONE (vendor, this session):** vendor signs up with **name** → gated **`onboarding.tsx`**:
  ACTIVE → `/(vendor)/orders`; REJECTED → rejected; PENDING → **resumable setup** (business name, **type
  chips**, location label — draft in `vendorSetupStore`) → **Submit** → **awaiting-approval** (polls
  `/auth/me`). Backend (food-service): new **`POST /food/vendors`** (creates the restaurant row,
  owner=auth user) + **`GET /food/vendors/mine`**; vendor orders switcher now uses `myVendors` (own
  businesses only). `authStore` gained `register(…,name)`+`fetchMe()`; `roleHome`→`/onboarding`.
  **Rebuild food-service** (vendor endpoints) **and auth-service** (already needed). Default vendor
  coords are Accra (real "choose on map" is backlog).
- **Onboarding overhaul COMPLETE** (Phases 1–3). Remaining backlog (live ride map, choose-on-map) in §10/§12.
- **Phase 3 — original (revised) plan:** Driver & Vendor sign up with just **name + a few details**, then a
  **resumable in-app setup wizard** (driver: licence/vehicle/docs; vendor: business name/type/location)
  they can pause and come back to (e.g. while gathering documents). When they finish the setup they
  **submit for approval** → status PENDING → admin approves → ACTIVE → they can work. App shows the
  current stage (setup-incomplete → submitted/awaiting-approval → approved), gated via `/auth/me` +
  the saved setup progress. (Changed from "full details up front" — the user preferred resumable setup.)

**📋 Full customer-app issue list:** see **`docs/CUSTOMER_APP_BACKLOG.md`** — the user's complete review
(auth/email, login-must-verify-registration, glow side, ride types + bargaining, scheduling, ride history,
shop pill reorg, promo system, pricing, choose-on-map ×3, parcel redesign, wallet/payments/Paystack,
saved places, company website + ToS/Privacy, etc.). Work through it from there.

**Broader backlog the user explicitly named (not yet built):**
- **Live ride tracking page**: after match, a dedicated screen with a **live map** of the driver moving
  to you + driver info/vehicle (today it's coords + a hardcoded "Kwame A." card; no map — would need
  `react-native-maps`).
- **"Choose on map"**: currently a dead stub — must work in the **ride search** page AND be added to the
  **GoShop location** picker.
- (Plus the optional/deferred items listed in §10.)

---

## 13. Maps, ride features & payments (latest batch — all type-check clean)

Big customer-app + backend push after the onboarding overhaul. Granular status is tracked in
**`docs/CUSTOMER_APP_BACKLOG.md`** (kept current); this is the architectural summary.

### Maps (real, free, no key) — `customer-app/src/components/LeafletMap.tsx`
- **Leaflet in a WebView (native) / `<iframe>` (web)** — runs in Expo Go AND web. Dep:
  **`react-native-webview`** (customer-app only). Carto/OSM tiles (`voyager` light / `dark_all` dark),
  **Nominatim** geocoding (`src/lib/geocode.ts`: `forwardSearch` + `reverseGeocode`, Ghana-biased).
  **Do NOT switch to `react-native-maps`/`expo-maps`** (need a dev build; no web).
- `mode="picker"` (Uber-style centre pin → reports centre) powers **`app/map-picker.tsx`**, reached from
  ride search, GoShop address, and parcel (via search) — `?target=origin|dest|shop`.
- `mode="view"` + a live `driver` marker powers the live ride map.
- **Search autocomplete**: ride search + GoShop address merge built-in places with debounced Nominatim
  results. New accounts have empty recents (`src/store/recentsStore.ts`, persisted).

### Ride experience (customer)
- **Live tracking page** `app/(rider)/live.tsx`: full-screen map (pickup/dest markers + live driver),
  bottom sheet: searching → driver card (call/SOS) → **payment** → rating. `home.tsx` is just the
  composer now and hands off here after Request ride.
- **Ride types** Standard/Premium/Okada (fare estimate × multiplier; **Premium = fixed, no bargaining**).
  Pricing centralised in `src/lib/pricing.ts`.
- **Bargaining (inDrive-style)**: `live.tsx` polls `GET /rides/requests/{id}/bids`; rider taps Accept
  (`POST …/bids/{bidId}/accept`) → trip at that fare. Drivers offer via the feed's Counter action.
- **Scheduling**: the search-bar "Now" pill → `app/(rider)/schedule.tsx` (presets). Scheduled rides carry
  `scheduledAt`, skip live tracking, show under **Your rides → Upcoming**; driver feed hides
  future-scheduled requests (`findNearby` excludes `scheduled_at > NOW()`).
- **Ride history**: `GET /rides/trips/mine` + `app/(rider)/rides.tsx` (Profile → **Your rides**), Upcoming
  & active (tap → live map) vs Past.

### Promos — admin-controlled, clickable
- food-service `promos` table + `PromoService`/`PromoController`: `GET /food/promos` (public),
  create/toggle/delete + `GET /food/promos/all` (**ADMIN/SUPER_ADMIN** only). Seeded 3 defaults.
- Customer shop carousel loads real promos, taps through to the promoted vendor's menu / category filter.
- Admin web **Promos** page (create w/ colour+preview, activate/hide, delete).

### Payments (mock PSP — Paystack TBD; the logic/structure is real, drops a provider into `payTrip`/`payOrder`)
Payment step on the **complete** screen for both rides and orders, driven by the method in Payment settings:
- **momo** (enter number → prompt) / **card** (auto-charge w/ consent) / **wallet** → settle immediately.
- **cash** → status AWAITING; the person handing over confirms in-app → customer sees PAID (polls).
- **Ride**: `trips.payment_status/method`; `POST /rides/trips/{id}/pay`, `…/confirm-cash`,
  `GET /rides/trips/{id}`. Driver confirms cash on the trip screen.
- **Order**: `orders.payment_status/method`; `POST /food/orders/{id}/pay`, `…/confirm-cash`,
  `GET /food/restaurants/{id}/awaiting-cash`. Vendor confirms via an **"Awaiting cash"** section on the
  orders board (pickup/walk-in; delivery cash also confirmable there — courier-side confirm is a TODO).
- Wallet UI: **"Send money" removed** (in-app only); **"MTN Mobile Money" → "Mobile Money"**.

### Migrations added this batch (Flyway auto-applies on rebuild)
- ride-service: `V2__scheduling.sql` (scheduled_at), `V3__payments.sql` (trip payment).
- food-service: `V2__vendor_type.sql`, `V3__promos.sql`, `V4__order_payments.sql`.
- auth-service: `V2__profiles_and_approval.sql` (name/username/password_hash + PENDING/SUPER_ADMIN).

### ⚠️ Rebuild everything backend-touched before a full demo
```
docker compose build auth-service ride-service food-service
docker compose up -d auth-service ride-service food-service
docker exec -i gozone-postgres psql -U gozone -d food_db < seed/02_food_seed.sql
```
Then `cd customer-app && npm install` (react-native-webview was added) and restart Metro for all apps.
Seeded super admin: **superadmin / super123** (OTP from `docker logs gozone-auth`).

### Login-verifies-registration fix (latest)
Auth bug fixed: **`POST /auth/login`** (phone-only) issues an OTP **only if the phone already has an
account** — never creates a user; unknown number → **404** ("No account found… Please sign up").
`/register` stays the signup (upsert) path. Added `LoginRequest` DTO + `AuthService.login()` +
controller route + SecurityConfig permit + `server.error.include-message: always` (so the 404 message
reaches the client) + `contracts/auth.yaml`. Customer app: `authStore.login()` + `register.tsx` login
mode calls it and on 404 prompts "Sign up". **Rebuild auth-service** (`docker compose build auth-service
&& docker compose up -d auth-service`).

**Mirror case also fixed:** `POST /auth/register` is now **sign-up only** — an existing phone returns
**409** ("account already exists, log in") instead of upserting/logging in. The **driver & vendor apps had
the same bug** (their *login* mode also called `register`), so the fix is symmetric across all three apps:
each `authStore` gained `login(phone)` and each `register.tsx` routes signup→`register` (409 → "Log in")
and login→`login` (404 → "Sign up"). `contracts/auth.yaml` /register documents 409. All three apps
type-check clean. No re-register flow exists in onboarding (resume is via `/auth/me` + KYC/vendor submit),
so making register reject existing phones is safe. **Rebuild auth-service.**

**Follow-up bugs from user testing (fixed):**
- **Registered number couldn't log in** — phone-format mismatch. auth-service now **normalizes Ghana numbers
  to E.164** (`normalizePhone` in register/login/verifyOtp): `0201000001` / `233201000001` / `+233201000001`
  all map to one account. **Rebuild auth-service.**
- **New account inherited the previous user's data** (old recents + auto-username "alex"). `logout()` only
  cleared tokens; persisted stores survived and `profileStore` had hardcoded `Alex Mensah`/`alex` defaults.
  Fixed (customer app): profileStore defaults now empty + `reset()`; `reset()` added to recents/payment;
  new `src/lib/session.ts clearUserData()` wipes profile+recents+payment+cart, called on logout and every
  fresh verify-otp; login pulls the real name via `fetchMe()`→`/auth/me`; username no longer auto-set.
  **Driver & vendor apps got the same treatment:** each has `src/lib/session.ts clearUserData()` +
  store `reset()`s — driver clears `driverStore` (online/active-trip) + `driverSetupStore` (KYC draft);
  vendor clears `vendorStore` (selected business/open) + `vendorSetupStore` (business draft), on logout and
  every fresh verify-otp; both logouts also null `name`/`status`. All three apps type-check clean.

### Saved places / Home-Work (latest, customer app)
DONE. New persisted **`savedPlacesStore`** (home/work/custom; user-scoped — hydrated in `_layout`, cleared
via `lib/session.ts clearUserData()`). **Profile → Saved places** → new **`app/saved-places.tsx`** manager
(set/change/remove Home & Work, add/remove custom). Search + GoShop address pills read the store: set →
fills field; unset → map picker to set it (+ fills the field to continue), then one-tap after. **+** opens
the manager; custom places show as extra pills. map-picker gained `home`/`work`/`saved` targets (+
`field`/`from` params to fill-and-continue). Retired hardcoded `HOME_PLACE`/`WORK_PLACE` (added
`ACCRA_CENTER`). Local mock (no backend profile API). Customer app type-checks clean.

### Menu Favourite & Search + favourites filter (latest, customer app)
DONE. New persisted **`favouritesStore`** (favourite vendor ids; user-scoped — hydrated in `_layout`,
cleared via `lib/session.ts`). Menu-page **heart** persists (was throwaway state); **Search** opens a real
in-page item search overlay (name/description). Shop-browse card hearts share the same store (were an
un-persisted `Set`). Added `favouritesOnly` to `shopFilter` + a **"Favourites only"** toggle on the Filter
page (counts in the badge), applied in browse with a tailored empty state. Customer app type-checks clean.

### Help & support (latest, customer app)
DONE. **Profile → Help & support** → new **`app/help.tsx`** (was a stub Alert): contact card (Email/Call/
WhatsApp via `Linking`), expandable **FAQ** accordion, **Report a problem** mailto, support hours. Route
registered in `_layout`. Customer app type-checks clean.

### Courier-side delivery-cash confirm (latest)
DONE. New **`POST /food/deliveries/{id}/confirm-cash`** (courier-authenticated; checks the courier owns the
delivery + order is cash → order PAID). `DeliveryResponse` now carries `paymentMethod`/`paymentStatus`.
Driver app: `deliveryApi.confirmCash` + a **"Confirm cash received"** button on the active delivery card;
a cash delivery stays active after DELIVERED until the courier confirms, then settles PAID (customer order
screen reflects it via its existing poll). Vendor "Awaiting cash" board remains a fallback. Contract
`food.yaml` updated. **Rebuild food-service.** Driver app type-checks clean.

### Dynamic pricing (latest)
DONE. New **`POST /rides/quote`** (ride-service): `(base + perKm × haversine) × type mult × surge`, floored
at minFare, **time-based surge** (peak hours 07–09 / 17–19), `ruleVersion` stamp; all knobs env-overridable
(`app.pricing.*`). `QuoteRequestDto`/`QuoteResponse` DTOs + contract `ride.yaml`. Customer `home.tsx` fetches
server quotes for all ride types on route change (type cards + fare anchor use server fares) with a
**"Peak-time pricing"** note; falls back to local `pricing.ts` on failure. **Rebuild ride-service.** Both
sides type-check clean. Optional follow-ups: per-vendor delivery-fee rules; apply quote to parcel composer.

### Email + OTP auth (latest)
DONE (customer app). Email is now an alternate identity (email-only accounts), mirroring phone+OTP.
auth-service: **`V3__email_auth.sql`** (`users.email` unique + `phone` nullable; `otp_codes.email` +
nullable phone), `User`/`OtpCode` gain `email`, repo email finders. New **`POST /auth/register-email`**
(409 on existing) + **`POST /auth/login-email`** (404 on unknown); `issueEmailOtp` logs `[OTP-MOCK] email=…`;
`/auth/verify-otp` accepts **phone OR email**; `/auth/me` (`UserResponse`) returns `email`; contract
`auth.yaml` updated. **Rebuild auth-service** (Flyway V3 auto-applies). Customer app: register screen has a
**Phone / Email toggle** (channel kept across signup↔login via `ch` param), `authStore.registerEmail/
loginEmail/verifyEmailOtp`, verify-otp handles email + seeds `profileStore.email`; same 404/409 UX as phone.
Seeded users remain phone accounts. Driver/vendor stay phone-only (shared endpoints if adopted later).
Customer app type-checks clean.

### Final backlog batch (latest, customer app — no backend)
DONE (frontend-only, customer app type-checks clean):
- **Username on sign-up** — optional Username field on the sign-up form → seeds `profileStore.username`
  (local mock; no backend username for customers).
- **Add debit/credit card** — Payment → "Add debit / credit card" modal (number/expiry/name → brand+last4);
  persisted, selectable, removable via `paymentStore.cards` (user-scoped, cleared on logout/login). Local
  mock, not charged (no PSP). "Add money" top-up still stubbed (needs Paystack).
- **Terms & Privacy** — `app/terms.tsx` + `app/privacy.tsx` (shared `src/components/legal.tsx`); wired the
  inert About links + a consent line on sign-up. External marketing site deferred (out of app-repo scope).

**Customer-app backlog is now complete except PSP-dependent items.**

### Email auth in driver + vendor apps (latest)
DONE. Both apps now have the same **Phone / Email toggle** as the customer app. Their authStores gained
`registerEmail/loginEmail/verifyEmailOtp` (+ shared `applySession` helper), and register/verify-otp screens
handle the email channel (roles `DRIVER` / `RESTAURANT_OWNER`, with the same 404/409 UX). Onboarding is
identity-agnostic (keys off the auth user id) so KYC submit, vendor-create, and approval polling all work
with an email account. Backend unchanged (endpoints already shared). Driver + vendor type-check clean.
**No new rebuild** beyond the already-required auth-service (email endpoints).

### GoRide ride-type button + Luxe, rename saved places, admin fees (latest)
- **GoRide ride-type selector is now a pill button** on the "GoRide" title line (was always-visible boxes +
  a static badge). Tap the pill → the 3 option boxes drop down; pick one → boxes collapse, pill label
  updates. **"Premium" renamed to "Luxe"** (display only; backend rideType stays `PREMIUM`). Customer app.
- **Rename a custom saved place** — pencil → modal → `savedPlacesStore.renameCustom`. Customer app.
- **Admin-controlled platform fees (service + delivery)** — vendors set food prices; GoZone adds a service
  fee (% of subtotal) + distance-based delivery fee (`base + per-km × haversine(vendor→customer)`), both
  admin/platform-level. food-service: `platform_settings` (`V5`) + entity/repo, `Order.serviceFee`,
  `PlaceOrderRequest` delivery coords, fee computation in `placeOrder`, `GET /food/platform-fees` (public) +
  `PATCH` (admin), `OrderResponse.serviceFee`. Customer checkout shows a live breakdown + sends coords;
  order screen shows the real breakdown. **Admin web Fees page** (edit service % / delivery base / per-km).
  **Rebuild food-service** (V5 migration). All apps type-check clean.

### Ride scheduling, current location, driver/vendor audit (latest)
All frontend; customer + driver + vendor apps type-check clean.
- **Schedule page** (`(rider)/schedule.tsx`) rebuilt: range note (**30 min – 90 days**), 90-day **date**
  scroller + 15-min **time** slots (today filtered to ≥30 min ahead), **scheduling T&Cs**, confirm. "Ride
  now" still clears the schedule.
- **Current location** — new **`src/lib/location.ts`** (`getCurrentLocation`: web `navigator.geolocation`,
  native lazy-loads **expo-location**). Ride search + GoShop address got a **"Use current location"** row
  (GPS → reverse-geocode → fills the field). Map picker got a **"locate me"** button + a blue **user-location
  marker**; `LeafletMap` gained `userLocation` + `flyTo` props (`window.flyTo`/`setUser`).
  **⚠️ Added dep `expo-location` — run `cd customer-app && npx expo install expo-location` (or `npm install`)
  and restart Metro.** (Web works without it.)
- **Driver/Vendor stub audit fixes** (parity with the customer-app cleanup):
  - **Help & support** real screens for both (`driver-app/app/help.tsx`, `vendor-app/app/help.tsx`) + wired
    profile rows (were Alert stubs).
  - **Driver Vehicle** editor (`vehicle.tsx` + `vehicleStore`, persisted) replaces the hardcoded stub.
  - **Vendor Business details + Opening hours** editors (`business.tsx`, `hours.tsx` + `businessStore`)
    replace the "coming soon" stubs.
  - **Vendor catalogue** (`(vendor)/menu.tsx`): availability toggles now **persist** + **"Add item"** works
    (local `catalogStore`, per-vendor, removable). Real backend catalogue-write is still the production path.
  - New stores hydrated in each `_layout` + cleared in each `lib/session.ts`.
  - **Left as acceptable demo stubs:** social sign-in, driver trip call/message, mocked cash-out/payout.
    *(Cash-out/payout is real now — see "Cash out / withdrawals" at the end of this file.)*

### Real vendor catalogue → customer + driver account (latest, Pass 1 of catalogue integration)
Makes vendor-added items actually appear on the customer app, with descriptions. Backend can't be
compile-checked locally — **rebuild food-service**.
- **food-service:** `MenuItem.description` (**V6** migration) + in `MenuItemResponse`. New **owner-authorised**
  catalogue endpoints: `POST /food/restaurants/{id}/menu` (create), `PATCH /food/menu-items/{id}` (edit),
  `DELETE /food/menu-items/{id}`, `GET /food/restaurants/{id}/catalogue` (full list incl. sold-out).
  `requireOwner()` guards by `vendor.ownerId`. Repo `findByRestaurantIdOrderByName`. Contract updated.
- **Vendor app:** `menu.tsx` now uses the **backend** (create item w/ **description**, toggle availability →
  PATCH, delete) instead of the local `catalogStore` (**deleted**). `foodApi` gained create/update/delete/
  getCatalogue. So new items + edits show up for customers immediately (customer menu already reads the
  backend).
- **Customer app:** `MenuItem.description` on the type; `menu.tsx`/`item.tsx` show the **backend description**
  (fallback to `shopCatalog` metadata for the seeded items). Search matches backend descriptions too.
- **Driver app: account is now clickable** — profile identity card → new **`account.tsx`** editor
  (name/username/email/phone) backed by a persisted, user-scoped **`profileStore`** (mirrors the customer
  app); shows the real name, seeded from sign-up name / `fetchMe` on verify; hydrated + cleared on logout.
- **Confirmed** the login-verifies-registration + session-isolation fixes are already on driver & vendor
  (`clearUserData` in each `logout`, `login`/`register` 404/409 split, email auth).
- **Pass 2 (next): add-ons end-to-end** — vendor defines add-on groups/options; customer selects them; order
  total includes them (needs cart→order pricing rework + addon schema). Deferred to keep the backend change
  reviewable/compilable.

### Driver location + "no requests" fix (latest)
Root cause of "driver never gets a request": the feed **hardcoded its position to Kotoka Airport** and
searched only **10 km** — Accra spans ~25 km, so many pickups fell outside. (Also: a freshly signed-up
driver is **PENDING** and stuck on `onboarding.tsx` awaiting-approval — must be **approved in the admin web**
or use the seeded ACTIVE driver `+233201000002`.) Fix (driver-app): added `expo-location` + `lib/location.ts`
+ `lib/geocode.ts`; `feed.tsx` now uses the **device's real GPS** (fallback Accra centre), **shows the
place name** in the hero (tap to refresh), and widened the nearby radius to **50 km**. **Run
`cd driver-app && npx expo install expo-location`.** Type-checks clean.
**Still to build — driver/courier + vehicle-class routing (big, backend):** signup selects Driver/Courier;
admin assigns vehicle class (Okada/Standard/Luxe/Cargo) at KYC; ride requests carry a type; matching filters
by class (Luxe sees Standard+Luxe; Standard only Standard; Okada only Okada + food; Cargo parcels only);
parcel size → class (S→Okada, M→Standard/Luxe, L→Cargo). Design pending user confirmation.

### Driver/vehicle-class routing system (latest) — REBUILD auth-service + ride-service
Everyone signs up as a **Driver** and picks a vehicle: **Okada / Car / Truck**. Okada→class OKADA (auto),
Truck→CARGO (auto), Car→null until an **admin assigns Standard/Luxe**. Each driver has a **service mode**
(Rides / Deliveries / Both). Requests are routed by class + mode:
- Okada → Okada rides + food + **small** parcels · Standard → Standard rides + **medium** parcels ·
  Luxe → Standard+Luxe rides + medium parcels · Cargo → **large** parcels only, no rides.
- **auth-service:** `users.vehicle_class` + `service_mode` (**V4** migration; seeded drivers→STANDARD,
  couriers→OKADA); `RegisterRequest`/`EmailRegisterRequest.vehicleClass`; `/auth/me` (`UserResponse`)
  returns class+mode; **`PATCH /auth/users/{id}/class`** (admin) + **`PATCH /auth/me/service-mode`** (driver).
- **ride-service:** `ride_requests.kind`/`ride_type`/`parcel_size`/`parcel_desc` (**V4** migration);
  `createRequest` sets them; **`GET /rides/requests/nearby`** gains `vehicleClass`+`serviceMode` params →
  `canServe()` filters rides/parcels by the rules above (in Java). `RideRequestResponse` exposes the fields.
  (Confirmed origin/dest are `geography` so the PostGIS radius query is correct — the "no requests" was the
  10km hardcode, now 50km + real GPS.)
- **Driver app:** signup **vehicle selector** (Okada/Car/Truck); `authStore` carries `vehicleClass`+
  `serviceMode` (from `fetchMe`); feed passes them to `nearby` + shows a **ride-type / parcel-size chip** +
  parcel description; **profile** shows the class ("Awaiting admin" for cars) + a **service-mode** picker;
  **Deliveries tab gated to Okada** (food deliveries).
- **Customer app:** ride `createRequest` sends `rideType` (premium→LUXE); **parcel composer** sends
  `kind=PARCEL`+`parcelSize`+`parcelDesc`, with **size descriptions** + a required **"what are you sending?"**
  field.
- **Admin web:** Approvals page gets a **vehicle-class picker** per driver/courier → `PATCH …/class`.
- Contracts `auth.yaml` + `ride.yaml` updated. All apps type-check clean; **backend not compile-checked —
  watch the rebuild.** **Rebuild auth-service + ride-service** (V4 migrations auto-apply).

### Menu add-ons end-to-end + "could not add item" cause (latest) — REBUILD food-service
- **"Could not add item"** root cause: **food-service wasn't rebuilt** — the create endpoint + `description`
  column (V6) are new, so the old container 404'd the POST while the catalogue list fell back to the old GET.
  **Rebuild food-service** (V6 + V7 migrations) and it works.
- **Add-ons (V7 migration):** `addon_groups`, `addon_options`, `order_item_addons` + entities
  (`AddonGroup`/`AddonOption`/`OrderItemAddon`, `MenuItem.groups`, `OrderItem.addons`). `MenuItemResponse`
  now returns `groups[{id,name,multi,required,options[{id,label,price}]}]`. **Create-item** accepts `groups`
  and persists them. **Order pricing:** `PlaceOrderRequest` line gains `addonOptionIds`; `placeOrder`
  resolves the options from the item, adds their price to the line unit price, and stores them
  (`OrderResponse` line has `addons[]`). Contract `food.yaml` updated.
- **Vendor app:** the Add-item modal now has an **add-on builder** — add groups (name, pick-one/pick-many,
  required) each with options (label + price); sent to the backend.
- **Customer app:** item screen **fetches the vendor's real add-on groups** from the backend (falls back to
  `shopCatalog` metadata for seeded items); selections carry the backend `optionId`; checkout sends each
  cart line with its `addonOptionIds` so the **order total includes add-ons**. `CartOption.optionId` added.
- All apps type-check clean; **backend not compile-checked** — watch the food-service build.

### Security remediation (latest) — REBUILD ALL SERVICES + set JWT_SECRET
Fixed the audit's CRITICAL fraud chain + most HIGH/MEDIUM findings. **Backend not compile-checked locally.**
**Before running:** `cp .env.example .env` and set a strong `JWT_SECRET` (compose now fails without it).
- **C-1 JWT secret:** removed the committed default from all 5 `application.yml` + `docker-compose.yml`
  (`${JWT_SECRET}` required; compose uses `:?`). Added `.env.example` (gitignored `.env`). Rotate the leaked key.
- **C-3 wallet settlement:** `/wallet/commission` + `/settle` now require an **`X-Internal-Key`** header
  (services send it; end users can't) and are **idempotent** on refId (`existsByRefIdAndType`). `INTERNAL_KEY`
  env (default `gozone-internal-dev-key`) shared by ride/food/wallet.
- **C-2/C-4 ride:** `updateTripStatus` (driver advances / driver+rider cancel), `placeBid`
  (`@PreAuthorize DRIVER/COURIER` + can't bid on own request), `getTrip`/`poolCandidates`/`poolJoin`/`rateTrip`
  now assert participant/owner.
- **H-1..H-5 food:** `getOrder` (customer/owner/courier), `restaurantOrders`/`awaitingCash`/`callNext`/
  `serveEntry` (owner via `requireOwner`), `advanceStatus` (owner), `confirmOrderCash` (owner/courier),
  `advanceDeliveryStatus`/`updateDeliveryLocation` (assigned courier), `rateOrder` (customer), `createVendor`
  (`@PreAuthorize RESTAURANT_OWNER`). **No URL/response changes → frontends unaffected.**
- **H-6 OTP:** attempt cap — code consumed after 5 wrong guesses (`otp_codes.attempts`, V5).
- **H-7 seed admin:** no more `super123`/plaintext log — password from `SUPERADMIN_PASSWORD`, else a random
  one printed once with a "CHANGE IT" warning.
- **M-1 notify:** `/notify` now internal-key-guarded (was spoofable by any user).
- **Migrations added:** auth `V4__vehicle_class` + `V5__otp_attempts`; ride `V4__request_kind_type`; food
  `V6__menu_item_description` + `V7__addons`. All auto-apply on rebuild.
- **Still recommended (not done):** server-side account-STATUS gate (JWT has no status; PENDING can still get
  a token — role gates added but not status); rate limiting at the gateway (H-6/L-4); RS256 + iss/aud; shorter
  access TTL + logout/revocation (L-1); tighten CORS/TLS (L-2/L-3); bump Spring Boot + SCA scan (L-5).
  Login 404-enumeration (M-6) is an **intentional UX choice** (the "no account → sign up" flow) — left as-is.

### Security review — CRITICAL + HIGH fixes (latest)
First audit (CRITICALs) already fixed: JWT secret default removed (require env), wallet settlement locked
behind `X-Internal-Key` + idempotent (`existsByRefIdAndType`), ride/food ownership+role checks, OTP 5-guess
cap, random seeded super-admin, notify internal-only.
Second audit HIGH fixes (this pass):
- **H1 — real secrets:** generated strong random `JWT_SECRET` (64ch) + `INTERNAL_KEY` (44ch) into `.env`
  (gitignored, no BOM). Placeholders gone. Regenerate for any new environment.
- **H3 — login unbroken at the gateway (was blocking `/auth/login`, `/register-email`, `/login-email`,
  `/admin/login`):** `JwtAuthFilter` now reads **`app.gateway.public-paths`** (comma-separated in
  `gateway/application.yml`) instead of a hardcoded 3-path list, and that list includes all pre-login routes.
  **This was the cause of earlier "can't log in" symptoms.** Rebuild gateway.
- **H2 — internal endpoints fail-closed:** removed the known `gozone-internal-dev-key` code default
  everywhere (`@Value("${app.internal.key}")`, no default) + `INTERNAL_KEY` required in compose (`:?`);
  `requireInternal` rejects a missing/blank configured key.
**Rebuild all backend services** (`docker compose build && docker compose up -d`) after `copy .env.example .env`
(already done) — compose now refuses to start without JWT_SECRET/INTERNAL_KEY. Remaining review items
(MEDIUM: status/KYC gate detail, ACCEPT-fare bind, settle-only-when-PAID, nearby/courier role gates, WS auth;
LOW: verbose errors, OTP request rate-limit, Spring bump) are tracked for a follow-up pass.

### Security review — MEDIUM money/gate fixes (latest)
- **M2 — ACCEPT binds the rider's fare:** `RideService.placeBid` ACCEPT now uses `req.getProposedFare()`
  for the trip's agreed/locked fare (was the driver's `dto.amount`). A driver who wants a different price
  must COUNTER; only COUNTER carries the driver's amount.
- **M3 — settle only when completed AND paid:** new `settleIfPaid(trip)` / `settleOrderIfPaid(order)` gate
  the wallet call on `status==COMPLETED && paymentStatus==PAID`. Called from completion **and** from the
  payment points (`payTrip`/`confirmCash`; `payOrder`/`confirmOrderCash`/`confirmDeliveryCash`). Wallet
  settlement is idempotent so double-triggering is safe. A vendor/driver can no longer force a payout by
  advancing status without the customer paying.
- **M1 — account status enforced:** the access JWT now carries a **`status`** claim; ride/food JWT filters
  add a `STATUS_<status>` authority. `verifyOtp` **refuses SUSPENDED/REJECTED** accounts a token (PENDING may
  still log in to reach onboarding). `placeBid` now requires `hasAuthority('STATUS_ACTIVE')` — a PENDING/
  unapproved driver can't take rides. (`createVendor` already role-gated.)
Remaining review items (M4 role-gate nearby/courier endpoints, M5 WebSocket auth interceptor; LOW: verbose
errors, OTP request rate-limit, Spring Boot bump, dedupe rateOrder double-load) are tracked for a next pass.
**Rebuild auth + ride + food + wallet.**

### Security review — M4 + M5 (cross-role data exposure, closeout)
- **M4 — role-gated the un-scoped endpoints:** `GET /rides/requests/nearby` now requires
  `DRIVER/COURIER + STATUS_ACTIVE`; all `/food/deliveries/*` courier endpoints require `DRIVER/COURIER`
  (available/mine/accept also `STATUS_ACTIVE`). A customer can no longer enumerate riders' pickup coords or
  list/claim deliveries. (Delivery service methods already verify the caller owns the delivery.)
- **M5 — WebSocket auth:** ride + food `WebSocketConfig` now add a STOMP **`ChannelInterceptor`** that
  validates the JWT on **CONNECT** (from an `Authorization: Bearer` / `token` native header) and rejects
  unauthenticated sockets. The three app `wsClient.ts` now send `connectHeaders: { Authorization }`.
  (Per-topic participation checks — only the trip's rider/driver may subscribe to that trip's topic — are a
  further hardening left as a follow-up; CONNECT is now authenticated, which was the open door.)
All apps type-check clean. **Rebuild ride + food** (+ auth/wallet from the M1–M3 pass). Whole review is now
addressed except the LOW polish (generic errors, OTP request rate-limit, Spring Boot bump, per-topic WS authz).

---

## Integrations + auth overhaul (LATEST — read this first)

Everything below is **built and verified against the running stack**. All third-party credentials live in
the gitignored `GoZone/.env` (never in the apps). Every integration **fails soft**: if a key is missing or a
provider errors, the old mock/log behaviour takes over so the demo never breaks.

### `.env` keys (all in `GoZone/.env`, gitignored; templates in `.env.example`)
| Key | Used by | Blank behaviour |
|---|---|---|
| `JWT_SECRET`, `INTERNAL_KEY` | all services | **required** — compose refuses to start |
| `SUPERADMIN_PASSWORD` | auth | random password generated + logged once |
| `PAYSTACK_SECRET_KEY` | wallet | `mock` → local sandbox checkout page |
| `GOOGLE_MAPS_SERVER_KEY` | ride (maps proxy) | proxy returns empty → straight-line route, no search |
| `MAIL_USERNAME` / `MAIL_APP_PASSWORD` | auth (Gmail SMTP) | email code is logged instead |
| `SMS_PROVIDER` + `AT_*` / `TWILIO_*` | auth (SMS OTP) | OTP is logged instead |
| `GOOGLE_CLIENT_IDS` | auth (Google Sign-In) | ⚠️ audience check **skipped** (dev only) |
| `OTP_LOG_CODES` (default `true`) | auth | ⚠️ **set `false` in production** — logs OTPs after a real send |

App-side keys are separate: `customer-app/.env` + `driver-app/.env` hold `GOOGLE_MAPS_API_KEY` (map
rendering only), injected by each app's `app.config.js` — never hardcoded in `app.json`.

### Demo accounts (the entire user DB — junk test accounts were purged)
All log in by **phone + OTP** (code appears in `docker logs gozone-auth | grep OTP-DEV`).

| App | Role | Phone | Name |
|---|---|---|---|
| Customer | RIDER | `+233201000001` | Ama Mensah |
| Customer | RIDER | `+233201000007` | Kojo Rider |
| Driver | DRIVER (STANDARD) | `+233201000002` | Kwame Driver |
| Driver | DRIVER (STANDARD) | `+233201000003` | Yaw Driver |
| Driver | COURIER (**OKADA**) | `+233201000005` | Kofi Courier |
| Vendor | RESTAURANT_OWNER | `+233201000004` | Adwoa Vendor |
| Admin web | ADMIN | `+233201000006` | GoZone Admin |
| Admin web | SUPER_ADMIN | user `superadmin` + `SUPERADMIN_PASSWORD` (then OTP to `+233201000000`) | Super Admin |

⚠️ The seed UUIDs (`aaaaaaaa-…001…007`) are referenced by food/wallet data — **don't delete these users**.
Kofi Courier being **OKADA** is what keeps food delivery working (see the delivery gate below).

### Running the apps (Expo)
Metro ports are pinned because the backend occupies 8080–8084:
**customer 8090 · driver 8091 · vendor 8092**. Always launch with:
```
npm start -- --clear        # NOT `npx expo start` — that ignores the pinned port
```
Open the matching port in Windows Firewall once (inbound TCP), plus **8080** for the gateway.
API/WS URLs resolve from the laptop's *current* IP at runtime (`src/lib/host.ts`) — nothing to edit when the
network changes.

### Auth system (matches the agreed design)
- **Sign-up = phone only**: name + **username (required, unique)** + Ghanaian phone → **real SMS OTP**.
- **Add email later** (Settings → "Add an email"): email + password → **real Gmail code** → verified →
  becomes a login method. Endpoints `POST /auth/me/email`, `/auth/me/email/verify`.
- **Login**: phone+OTP, or **email+password** (`POST /auth/login-email-password`).
- **Google Sign-In (backend done)**: `POST /auth/google` verifies the ID token **server-side** (tokeninfo +
  `aud` check + `email_verified`), logs in or creates the account, and returns **`needsPhone`**; the app then
  calls `POST /auth/me/phone` + `/me/phone/verify` to attach a verified phone. Google sign-up can never mint
  ADMIN/SUPER_ADMIN. **Frontend button still to do — it cannot run in Expo Go** (Google rejects `exp://`
  redirects; the Expo auth proxy is discontinued) → needs a **dev build** + OAuth client IDs.
- Username / phone / email uniqueness enforced; Ghanaian phone validation retained.
- All three apps have the add-email screen + email login (`app/add-email.tsx`).

### Payments — Paystack (real, tested)
- **Wallet top-up**: `POST /wallet/topup/initialize` → open checkout → `POST /wallet/topup/verify` credits the
  wallet. **Idempotent** per reference (double-tap can't double-credit).
- **Non-cash ride/food payments**: a `reference` on the pay call means Paystack. ride/food verify it through
  wallet-service (`/wallet/pay/verify`, internal-key + edge-blocked) *before* marking paid — an unverified
  reference is **rejected**, so a client can't fake a payment. Wallet/cash behave as before.
- Mock mode (`PAYSTACK_SECRET_KEY=mock`) serves a local sandbox checkout at `/wallet/mock-checkout`.

### Maps — Google (customer + driver)
- `react-native-maps` + `PROVIDER_GOOGLE` on device; **web keeps Leaflet** (react-native-maps has no web
  build) via platform files (`LeafletMap.native.tsx` / `GoogleMap.native.tsx`).
- Maps appear on: customer live-ride + address picker, driver active-trip + active-delivery.
- Driver marker is a **top-down car SVG that rotates to its heading**.
- **Backend maps proxy** in ride-service (`/rides/maps/*`) holds the billable **server key** — directions,
  places search, place details, reverse geocode. The app never sees that key.
- Reverse geocode asks **Places "nearby" first** (gives real POI names like a hostel), falling back to
  Geocoding with **plus-code filtering** (`MC4R+72C` style results are skipped/stripped).
- Place search uses Places `searchText` (name + address + coords in one call); Nominatim/OSM is the fallback.
- ⚠️ **Server key is IP-restricted.** Home/mobile IPs rotate — if routes/search suddenly stop working, that's
  why. Restrict to a **`/24` range** rather than a single IP. Google's reason is now logged
  (`docker logs gozone-ride | grep MAPS`).

### Other fixes worth knowing
- **Settlement was silently broken**: ride/food `WalletClient` read `app.wallet-url` but the yml defines
  `app.services.wallet-url`, so calls went to `localhost:8084` (themselves) and vendors/drivers were never
  credited. Fixed — verified a completed+paid order credits the vendor net-of-commission.
- **All error messages were being swallowed**: the JWT filters skipped Spring's internal ERROR dispatch, so
  every thrown exception became an empty `403`. Fixed in all four services (`shouldNotFilterErrorDispatch`)
  + `include-message: always`, so real statuses/messages now reach the apps.
- **Ride requests expire** (`app.ride.request-ttl-seconds`, 90s) — lazily on poll + a scheduled sweep; the
  rider sees "No drivers available right now" after 60s instead of searching forever. Needed Flyway
  `V5__request_expired_status.sql` (a CHECK constraint blocked the new `EXPIRED` value).
- **Delivery gate**: a `DELIVERY` order is rejected (409, friendly message) when no **ACTIVE OKADA** delivery
  rider exists — food-service asks auth-service (`/auth/delivery-riders/availability`, internal-only).
- **Schedule screen** rebuilt: pop-up calendar + manual time entry (30 min → 90 days still enforced).
- Internal-only paths are blocked at the gateway edge: `/wallet/commission`, `/wallet/settle`,
  `/wallet/pay/verify`, `/notify`, `/auth/delivery-riders`.

### Rebuild
```
docker compose build && docker compose up -d      # after any backend change
npm start -- --clear                              # in each app dir
```

### CRITICAL FIX — driver feed was dead (fixed, verified live)
**`GET /rides/requests/nearby` 500'd on every call** — the driver could NEVER see any request. Root
cause: the native queries' PostGIS `::geography` casts were mangled by Hibernate's named-parameter
parser (`::` reached PostgreSQL as a single `:` → `syntax error at or near ":"`). Fixed by switching
to `CAST(… AS geography)` in `RideRequestRepository.findNearby` and
`DriverLocationRepository.upsertLocation` (same bug — GPS upsert also broke). **ride-service rebuilt**
and the whole loop verified against the running stack with curl: rider creates request → driver
`nearby` returns it (200) → `POST …/bid` ACCEPT creates trip → rider status poll shows MATCHED →
`POST /rides/locations` 204. The pool-candidates query shares `findNearby`, so it's fixed too.
Also: the driver feed no longer swallows poll errors (`feed.tsx` shows a "Can't load requests" banner
with the server message instead of spinning forever — this is what hid the 500 for weeks).
Note: requests expire after 90s (TTL) — during a demo, accept promptly or the request goes EXPIRED.

### Ride-flow overhaul: accept-as-offer, driver card, map phases, tel: call, SOS→admin (latest, verified live)
Rebuilt per user direction the night before evaluation. **Rebuild ride-service** (V6 migration). All curl-verified.
- **Accept no longer auto-starts the trip.** Driver ACCEPT (pinned to the rider's fare) and COUNTER both
  become **PENDING offers**; several drivers can offer and the rider **chooses** (sees name, vehicle, plate,
  price, and **distance to pickup**). `bids` table gained driver_name/phone/vehicle/plate/lat/lng (V6);
  offers are upserted per driver; `acceptBid` **rejects all other pending bids**; requests with live offers
  are exempt from the 90s TTL expiry. New driver-side endpoints: `GET /rides/bids/{id}` (poll: PENDING →
  ACCEPTED+tripId / REJECTED, + requestStatus) and `DELETE /rides/bids/{id}` (withdraw).
  `GET /rides/requests/{id}/status` now also returns `driver` (the accepted BidOffer) for the driver card.
- **Driver app:** feed sends driver name (authStore), phone (profileStore), vehicle+plate (vehicleStore) and
  GPS with every offer; after offering it shows an "Offer sent — waiting" card **polling the bid** (accepted →
  trip screen; rejected/expired → back to feed with a notice; Withdraw button). `driverStore` gained
  `pendingOffer` + `myPos`. Trip screen: scripted GPS now walks **myPos→pickup while ENROUTE** and
  **pickup→dest while STARTED** along real Directions routes (densified straight-line fallback); the map shows
  the pickup leg before pickup and the journey after. Passenger-card call/message stubs **removed**.
- **Customer app:** offer cards show driver avatar/name/vehicle/plate/distance/price ("Choose driver");
  driver card after matching shows real details incl. **plate chip** (from `status.driver`, survives reload);
  **Call → `tel:` link** with the driver's number (no in-app call system; messaging dropped by decision);
  live map shows **driver→pickup** route while MATCHED/ENROUTE (directions fetched from the first live
  driver location) and switches to **pickup→dest** once STARTED. Web LeafletMap can now **update the route
  live** (`setRoute` push — native map was already declarative).
- **SOS → admin:** `POST /rides/trips/{id}/sos` now records a **sos_incidents** row (V6) with coords;
  customer SOS sends the driver's last location (fallback pickup) and shows "reached the GoZone safety
  team". Admin web got an **Incidents** page (auto-poll 10s, unhandled-count banner, Google-Maps location
  link, Mark handled via `PATCH /rides/sos/{id}/handle`; `GET /rides/sos` is ADMIN/SUPER_ADMIN).
  Decision: SOS routes to admins for triage, NOT directly to emergency services.
- Contract `ride.yaml` updated. customer/driver/admin all type-check clean. Verified live: two drivers
  accept → rider sees both with distances → picks one → loser's bid REJECTED (his app returns to feed) →
  trip MATCHED; SOS → admin lists → handled.

### Parcel flow layered into 3 pages + system-wide copy sweep (latest — frontend only, no rebuild)
- **Parcel now mirrors the ride flow in pages:** `(parcel)/index.tsx` (step 1 — Send/Receive toggle,
  direction explainer, route + swap, "How it works" card, Continue) → **new `(parcel)/details.tsx`**
  (step 2 — size, contents, recipient/sender name+phone, fare estimate, Find a courier) → **new
  `(parcel)/live.tsx`** (step 3 — full-screen map like the ride: searching → **courier offers with
  name/vehicle/plate/distance ("Choose courier")** → courier card + `tel:` call + SOS → phased map
  (courier→pickup, then pickup→drop-off) → delivered → **payment (Paystack/wallet/cash) + rate courier**).
  Old `track.tsx` **deleted** (it predated accept-as-offer, so parcels could never match, and it had no
  payment step — couriers were left waiting forever). `_layout` routes updated.
- **Direction-aware copy everywhere:** hero "Send/Receive a parcel", route labels ("Pickup — your
  location" vs "Pickup — sender's location"), "What are you sending?/receiving?", Recipient vs Sender
  fields + helper lines, live-phase texts ("Courier coming to you" vs "Courier heading to the sender"),
  delivered text ("Handed to X" vs "Your parcel has arrived").
- **Copy sweep across the system:** removed the fake "Kwame A." courier card + dead Call/Message stubs
  from the shop order screen (now an honest "Your courier is on the way" card — no backend courier
  identity exists for food deliveries yet); ride live "In the demo…" line replaced; driver feed says
  "Delivery fare" for parcels and "customer" (not "passenger") in offer-wait texts; driver trip screen is
  fully **kind-aware** (Active delivery, parcel card with size+description, "Picked up — start delivery",
  "Delivered — complete", rate-the-customer, cash/payment texts).
- Customer + driver type-check clean. Backend untouched.

### Vendor app + auth-copy sweep (latest — frontend only)
- **Vendor app audited** for the same copy issues: it was already mostly clean (Menu↔Catalogue titles,
  neutral order-status wording; social-sign-in stays a demo stub, and the payout stub is now real —
  see "Cash out / withdrawals" at the end of this file). Fixed: the
  **Catalogue tab** now follows the business type ("Menu" + fast-food icon for restaurants, "Catalogue" +
  pricetags icon for pharmacy/grocery/etc. — reads `vendorStore`), and the menu empty state matches.
- **"Check the auth-service logs for the demo code" removed from all three apps' verify-otp screens**
  (now "We sent a 6-digit code to {target}…") and the customer register footnote no longer says OTP is
  mocked ("We'll send you a one-time code…") — OTP is real SMS/email now; the log line was dev-speak
  shown to users. (Demo OTPs still appear in `docker logs gozone-auth` — that's unchanged.)
- All three apps type-check clean.

### Company logo integrated — REAL asset (latest — frontend only)
The first pass recreated the logo as an SVG; the user rejected it and supplied the real file at
**`CodeQuest/GoZoneLogo.png`** (source, keep). ⚠️ That PNG has a **fake checkerboard baked in** (no real
alpha) plus stray speckles — it was **cleaned with Pillow** (light pixels → transparent with a soft
ramp, isolated speckles removed via a neighbourhood-density filter, cropped to the mark; script:
scratchpad `clean_logo.py`) and saved as **`assets/gz-logo.png`** in customer/driver/vendor apps +
**`admin-web/src/assets/gz-logo.png`**. Cleaned size 985×681 (aspect 681/985). The road's white
centreline dashes became transparent, so the surface shows through them.
- **`GzMark` in each app's `brand.tsx` now renders the real PNG** (`Image` + `tintColor` prop — works
  on native AND react-native-web): `color` tints it (white on dark), omit for original navy. Same API
  as before (`dash` accepted/unused) so `GzHero` (glow + white mark, used on all 3 **splashes** and
  driver/vendor onboarding) and `Logo` (white mark in the blue squircle, welcome screens) unchanged.
- **Admin web** `GzMark.tsx`: `<img>` of the asset; `white` prop applies `brightness(0) invert(1)`.
  Used in Layout sidebar + Login. Added missing `src/vite-env.d.ts` for the PNG import type.
- All four apps type-check clean. Native app icons / `app.json` splash (need square padded PNG + dev
  build; Expo Go ignores them) still pending — source PNG is available now if wanted.

### Backlog clear-out (latest) — REBUILT ride + food, all verified
The "take note, we'll come back" list was worked through:
1. **App icons + native splash prepared** (dev build itself deferred by the user): generated
   `assets/icon.png` (white logo on brand blue, 1024²), `adaptive-icon.png` (Android foreground),
   `splash-icon.png` (white logo, dark bg), `favicon.png` in all 3 Expo apps (script: scratchpad
   `make_icons.py`); wired into each `app.json` (icon/splash/adaptiveIcon/favicon). **Fixed duplicate
   bundle ids**: driver → `com.gozone.driver`, vendor → `com.gozone.vendor` (all three previously
   `com.gozone.app` — would have collided as installed builds). Expo Go ignores these; dev builds use them.
2. **Ghana phone helper** (`src/lib/phone.ts`) copied into driver + vendor apps; both register screens
   validate + canonicalise to +233… before calling the API (same UX as customer).
3. **Parcel composer uses the server quote**: `(parcel)/details.tsx` calls `POST /rides/quote`
   (Small→OKADA, Medium/Large→STANDARD) + the size fee on top, with a "Peak-time pricing" note when
   surge; local formula only as fallback.
4. **Driver can call the customer**: ride-service **V7** adds `ride_requests.rider_phone`;
   `CreateRideRequestDto`/customer ride+parcel senders pass the profile phone; **`TripResponse.riderPhone`**
   (participant-guarded — verified NOT exposed in the nearby feed) → driver trip screen fetches the trip
   and shows a call button (`tel:`). Contract updated.
5. **Vendor "apply to promote"**: food-service `POST /food/promos/apply` (RESTAURANT_OWNER, own-vendor
   check, creates the promo **inactive**) + `GET /food/promos/mine?vendorId=`; admin's existing Promos
   page activates (= approves). Vendor app: **Profile → "Promote my business"** → `app/promote.tsx`
   (pitch form + own applications with Live/Pending badges). Contract updated. Verified via curl.
6. **Queue WS topics**: subscriptions to any topic now require an authenticated principal
   (delivery-location topics were already participant-guarded; queue topics carry counts only).
**Still open (blocked, not forgotten):** Google Sign-In frontend (needs OAuth client IDs + the deferred
dev build); pre-deploy hardening (`OTP_LOG_CODES=false`, GOOGLE_CLIENT_IDS, key restrictions, credential
rotation — deploy-time); external GoZone website (out of repo scope); RIDER→PASSENGER backend rename
(destructive — only with explicit go-ahead).

### Map-picker fixes (latest — customer app only, frontend)
Two bugs the user hit while picking a location on the map:
1. **No live-location marker.** `userLoc` was only set when the "locate me" button was tapped, so the
   map opened with no indication of where you actually are. `map-picker.tsx` now fetches the position
   **on mount** (silently — no alert if permission is denied; the button still reports that) and shows
   the blue dot even while the pin sits somewhere else. Card hint mentions the dot when it's shown.
   Both map implementations already supported `userLocation` (web Leaflet `setUser`, native marker).
2. **Confirming on the map appeared to do nothing but add a "Recent".** It *did* fill the field, but
   `router.back()` returned to the **search / delivery-address list** that sits between the composer
   and the picker — where the only visible change was a new Recent row, so users tapped that to
   proceed. Now the picker raises a one-shot flag (**`src/lib/pickerSignal.ts`**) when it was opened
   from a list (`via=search|shop`), and that list closes itself via `useFocusEffect(consumePicked)` —
   landing the user back on the composer with the field filled. Cancelling (back arrow) sets no flag,
   so it still returns to the list as expected. Callers updated: `search.tsx` (choose-on-map + unset
   Home/Work pills) and `(shop)/address.tsx`; `saved-places.tsx` intentionally has no `via` (the user
   stays in the manager to keep editing).
   ⚠️ **Not `router.dismiss(2)`** — the shop address screen lives in the nested `(shop)` stack while
   the picker is a root route, so popping twice on one stack would have ejected the user from the whole
   shop flow. The flag is stack-agnostic.
Customer app type-checks clean; no backend change.

### Full pre-evaluation test run (latest) — 93/93 green
Ran a scripted end-to-end suite against the live stack (script kept at scratchpad `e2e.sh`; re-runnable).
Covered: infrastructure/health · auth for all 6 demo accounts + roles/classes · server pricing quote ·
**full ride flow** (request → driver offer stays PENDING → rider sees name/vehicle/plate/distance → picks →
trip → GPS → ENROUTE/STARTED/COMPLETED → cash pay → driver confirm → **wallet settlement verified**
(14.76 → 35.26) → rating → history) · **parcel class routing** (OKADA sees a SMALL parcel, STANDARD driver
does not) · **full food flow** (order w/ fees → vendor advances → courier accepts delivery → PICKED_UP →
DELIVERED → auto-complete → cash → **vendor settled** 16.63 → 58.54) · walk-in queue (position → call-next →
serve) · promos + vendor apply/admin-approve · SOS → admin board → handle · admin console endpoints ·
security spot-checks (customer blocked from driver feed/deliveries/KYC, outsider blocked from others' trips,
internal wallet paths hidden, no-token 401).
- The single initial "failure" was a **wrong test expectation**, not a bug: the gateway returns **404** (not
  403) for internal-only paths — deliberate, it hides their existence. Test corrected.
- Admin Fees page verified correct: stores the service fee as a fraction (0.05) and renders/saves it as 5%.
- **Bug found and fixed:** cancelling a **WALKIN** order left its queue entry `WAITING`, so the vendor kept
  seeing (and could "call next" on) a customer who had cancelled. `FoodService.advanceStatus` now clears the
  entry on CANCELLED. **food-service rebuilt**; verified live (queue 3 → 2, entry → SERVED).
- All 4 front-ends type-check clean; admin-web production build succeeds.

**Demo data reset (done, on the user's go-ahead).** Ran `seed/99_clear_stale_demo_data.sql` on both DBs:
16 stale orders + 2 queue entries + 2 half-finished trips moved to a terminal status (rows kept; previous
statuses saved in `*_status_backup` tables, undo statements at the bottom of the file). Then placed **2
fresh orders at Kofi Kitchen**, both left at PLACED so the vendor demos advancing them live:
- **Delivery** GH¢52.88 — Ama Mensah, Jollof ×2 + Iced Sobolo → Oxford Street, Osu
- **Walk-in** GH¢25.20 — Kojo Rider, Waakye + Kelewele (shows 1 customer in the Queue tab)

**Second bug found while doing it — duplicated catalogue.** Every vendor's menu was duplicated **×2–×3**
(42 rows for 17 items): `02_food_seed.sql` generated ids with `gen_random_uuid()`, so its
`ON CONFLICT (id) DO NOTHING` never fired and each re-run (the rebuild steps say to re-run it) added
another full copy — customers saw every dish two or three times. Fixed both ends:
- **Seed made idempotent** — now `INSERT … SELECT … WHERE NOT EXISTS` matched on (restaurant, name);
  vendor-added/edited items are untouched. Verified: two consecutive re-runs insert 0 rows.
- **Existing duplicates removed** via new **`seed/98_dedupe_menu_items.sql`** (keeps the copy referenced by
  orders, repoints order lines, backs deleted rows up to `menu_items_removed_backup`). 42 → 17 items.

### Backend profile API — account edits are real now (latest) — REBUILD auth-service
Account details were a **local mock** (`profileStore`) in every app: editing your name or username
changed nothing on the server, and the account screen's phone field was a free-text box that did
literally nothing. Now the server owns the profile.
- **auth-service:** **`PATCH /auth/me`** (`UpdateProfileRequest`: `name`, `username`; null = leave
  unchanged, blank = 400) + **`username` added to `UserResponse`** (it was never exposed). Username
  rules are now shared by sign-up and edit via `requireAvailableUsername()`: trimmed + lower-cased,
  3–30 chars, `[a-z0-9._]`, unique **excluding yourself** (409 if taken). An **admin's** username is
  their console login handle, so PATCH refuses to change it (403). **No migration** — the columns
  already existed. Contract `auth.yaml` updated (`UpdateProfileRequest` + the PATCH operation).
- **Phone/email stay credentials, not text fields.** They change only through their existing
  verify-by-code flows (`/auth/me/phone` → `/verify`, `/auth/me/email` → `/verify`), which were
  already built for Google sign-up but had **no UI outside add-email**. The account screen now shows
  each as a verified row with a Change action.
- **All three apps:** `authStore` gained `updateProfile()`, `startAddPhone()`, `verifyAddPhone()` and
  a widened `fetchMe()` returning a full `MeProfile` (name/username/email/phone[/status/class/mode]);
  `profileStore` is now documented as a **cache** of `/auth/me` with `setFromServer()`. `verify-otp`
  seeds it from the server for **both** sign-up and login (sign-up already posts the name to
  `/auth/register`), with the local values as an offline fallback. New **`app/add-phone.tsx`**
  (enter GH number → SMS code → verified swap) in all three apps.
- **Customer + driver `account.tsx`:** saves via the API (server error messages surfaced — e.g.
  "That username is already taken."), re-reads `/auth/me` on focus, Save disabled until something
  changes, and sends **only changed fields**. **Vendor app got a personal account screen for the
  first time** (`account.tsx` + `profileStore` + session clearing + `_layout` hydrate) reached from
  Profile → **Your details**; its identity card stays the *business*, and the profile rows now show
  the real name/email instead of a hardcoded "Add".
- **Verified live against the running stack** (not just type-checks): profile GET/PATCH, name-only
  edit, self-rename no-op, blank name 400, bad charset 400, short username 400, cross-account
  duplicate 409 (case-insensitive), unauthenticated 401, and the **full phone-change flow** (code →
  wrong code 400 → correct code swaps the number; taking another account's number 409). The seeded
  demo phone used for the test was restored and re-verified; seeded riders now have usernames
  (`ama.mensah`, `kojo.rider`) where they previously had none.
- All four front-ends type-check clean. **Rebuild auth-service** (`docker compose build auth-service
  && docker compose up -d auth-service`).

### Cash out / withdrawals — money can now leave GoZone (latest) — REBUILD wallet-service
"Cash out" (driver) and "Request payout" (vendor) were `Alert.alert('… land in a future build')`.
Earnings piled up in wallets with no way out. Now there's a real payout pipeline.
- **wallet-service:** **`withdrawals` table (V2 migration)** + `Withdrawal` entity/repo.
  **`POST /wallet/withdrawals`** (`DRIVER`/`COURIER`/`RESTAURANT_OWNER` + **`STATUS_ACTIVE`**)
  **debits the wallet immediately** — the money is held, so the same balance can't be cashed out
  twice — writes a `PAYOUT` ledger entry tagged `refType=WITHDRAWAL`, then asks Paystack to send it.
  Floor is `app.payout.min-amount` (default GH¢10); **one open cash out per wallet** (409 otherwise);
  owner id comes from the **token**, never the body. Plus `GET /wallet/withdrawals` (own history),
  **`GET /wallet/withdrawals/all?open=`** + **`PATCH /wallet/withdrawals/{id}`** (ADMIN/SUPER_ADMIN).
  Account numbers are **masked** to the last 4 in every response.
- **Statuses:** provider accepts → `PROCESSING` (transfer code stored); no/refusing provider →
  stays **`PENDING` on the admin payout board with the reason**; admin → `PAID` (debit stands) or
  `FAILED` (**refunds** the held amount once — ledger-guarded — and notifies the earner via the
  existing push/SMS-stub path). Re-reviewing a settled payout is a 409.
- **`PaystackService.transfer()`** (new): creates a transfer recipient then initiates the transfer.
  Mobile money maps to real Paystack network codes (**MTN→MTN, VODAFONE/TELECEL→VOD,
  AIRTELTIGO→ATL**) and takes the automatic path. **Bank payouts are deliberately queued** — Paystack
  needs a bank *code*, not the free-text bank name the app collects (a `/bank` lookup would be a
  separate feature), so no pointless API call is made. Paystack's own refusal message is passed
  through verbatim to the board (**this account is a "starter business", which Paystack refuses to
  let send money** — the code path is real, the account isn't upgraded).
- **wallet-service JWT filter now adds `STATUS_<status>`** (parity with ride/food) so the payout
  endpoint can require an approved account, not just a role.
- **Bug found while building it: `PaystackService` used a bare `new RestTemplate()`** — no connect
  or read timeout, exactly the trap that once hung sign-in on a stalled SMS gateway (commit
  `7523565`). Its fail-soft catches (initialize → 502, verify → false, transfer → queued) were
  unreachable by construction, and since these calls run inside a transaction an unresponsive
  Paystack would have held a DB transaction open too. Now bounded **4s connect / 8s read**.
  Money-in was re-checked after the change (top-up initialize still returns a real checkout URL).
- **Driver + vendor apps:** new **`CashOutSheet`** (amount with an "All" shortcut, Mobile money /
  Bank toggle, network chips or bank name, number + account name, GH¢ floor and balance shown, momo
  numbers validated with `lib/phone.ts`) + a **Cash outs / Payouts history list** with status pills
  and the queued/failed reason. The hero button becomes "Cash out pending" while one is open (no
  walking into a 409). New persisted, user-scoped **`payoutStore`** remembers the destination
  (cleared by `lib/session.ts` on logout/login); prefilled from the profile name/phone.
- **Admin web:** new **Payouts page** (`src/pages/Payouts.tsx`, sidebar 🏧) — To pay / Recent tabs,
  total owed, per-payout destination + requester, **Mark paid** (confirm dialog — it asserts the money
  really left) and **Mark failed** (prompts for a reason the earner sees, refunds them).
- **Verified live end-to-end:** floor/over-balance/bad-method 400s, valid request holds the money
  (198.44 → 148.44), second request 409, driver blocked from the admin board (403) and from reviewing
  their own payout (403), admin `FAILED` refunds (back to 198.44) + repeat review 409, admin `PAID`
  keeps the debit, ledger shows `PAYOUT`/`REFUND` as `WITHDRAWAL`, vendor **bank** payout from the
  `RESTAURANT` wallet, and both queue reasons (bank-by-hand vs Paystack's starter-business refusal).
  Contract `wallet.yaml` updated. All 3 front-ends type-check clean; admin-web builds.
  **Rebuild wallet-service** (V2 migration auto-applies).
  *Demo note: one GH¢15 MOMO payout is left **PENDING** on the board so the Payouts page has
  something live to show; driver Kwame's balance is held down by it.*

### Pre-deploy hardening — tokens, sessions, rate limiting (latest) — REBUILD ALL 5 SERVICES
⚠️ **Everyone must sign in again after this** — tokens issued before it lack `iss`/`aud` and are
now rejected (verified: an old token returns 401).
- **JWT `iss`/`aud` required everywhere.** auth-service stamps `iss=gozone-auth` /
  `aud=gozone-apps` (`JwtProperties`, env-overridable) and **all six verification points** now
  require them: gateway `JwtAuthFilter`, ride/food/wallet `SecurityConfig`, ride/food
  `WebSocketConfig`. A well-formed token minted with a different secret+claims is refused.
- **Access-token TTL 24h → 1h** (`JWT_EXPIRY_MS`). Safe because all three Expo clients already
  silently refresh on 401 — **admin-web did not**, so it would have bounced operators to the login
  screen every hour; it now stores the refresh token and has the same refresh-and-retry interceptor.
- **Real logout.** New **`POST /auth/logout`** revokes the refresh token (or every session with
  `allDevices: true`); presenting someone else's token does nothing (verified). All four clients
  call it on sign-out — previously they only dropped tokens locally, leaving a 7-day session
  resumable by anyone who captured the refresh token. Refresh was already single-use + rotated.
  - **Trap found:** Spring Security's built-in `LogoutFilter` owns `POST /logout` and answered
    with a **302**, silently shadowing our controller (the `/auth` context-path makes the servlet
    path exactly `/logout`). Fixed with `.logout(logout -> logout.disable())` — we're stateless.
- **Gateway rate limiting** (new `RateLimitFilter`, order -200, ahead of the JWT check): per-IP
  fixed-window counters, **40/min on sign-in + OTP paths**, **600/min otherwise**, `429` +
  `Retry-After`; actuator never throttled; `X-Forwarded-For` honoured. All knobs are env vars
  (`RATE_LIMIT_*`). **Deliberately not tiny:** Ghanaian carriers NAT many subscribers behind one
  IP, so a per-person limit would lock out a whole network — per-account abuse is bounded by the
  5-attempt OTP cap instead. (First draft was 12/min; that tripped on legitimate bursts, which is
  exactly the NAT failure mode in miniature.) In-memory = per instance; multi-instance needs the
  Redis limiter.
- **New `docs/DEPLOYMENT.md`** — the pre-launch checklist: rotate every credential (all of them
  have been in dev logs), `OTP_LOG_CODES=false`, `GOOGLE_CLIENT_IDS` (blank = Google audience
  check skipped), Paystack live key + registered business for payouts, Maps key restrictions,
  TLS + CORS, actuator, managed PostGIS, and a plainly-stated known-gaps list.
- **Verified:** old token 401 · fresh token carries `iss`/`aud` with a 60-min TTL and works across
  auth/ride/food/wallet · refresh rotates and the old one 403s · logout then refresh 403s · a
  driver can't revoke another user's session · limiter returns 429 + `Retry-After` · **the full
  `scripts/e2e.sh` suite passes 103/103** against the rebuilt stack.
- **Still open:** **RS256** (signing remains HS512 with one shared secret — every service holds
  what it would need to mint, not just verify; contained change: `JwtService.signingKey()` + the
  six verifier sites), tighter CORS/TLS, SCA scan, distributed rate limiting.
- *Housekeeping: the e2e suite's "call next" consumes a staged walk-in customer, so the demo
  walk-in was re-staged afterwards (Kojo Rider, Waakye + Kelewele, GH¢25.20, PLACED, 1 waiting).*

### Parcel handover details — decided AGAINST a separate parcel backend (latest) — REBUILD ride-service
The roadmap carried "a dedicated parcel backend" as a to-do. Investigated it on the user's
challenge and **dropped it deliberately** — but found three real bugs the shared model was hiding.

**Why no parcel service.** A courier carrying a box is the same primitive as a driver carrying a
person, so parcels already inherit matching, bidding, offer selection, live tracking, payments,
SOS and ratings for free. A second service would duplicate all of that and, worse, have two
services competing to assign the same driver pool. The honest trigger for splitting it out is
parcels growing a lifecycle rides don't share (multi-leg routing, warehouse custody, proof of
delivery, insurance) — nowhere near that yet. Recorded in README §16 so it stops resurfacing.

**The three real bugs (all fixed here, ~3 columns not a new service):**
1. **Recipient details were collected, required, then thrown away.** `(parcel)/details.tsx`
   validated name+phone, then sent neither — they were passed as **navigation params only**. The
   courier had no idea who to hand the parcel to or what number to ring, and the details vanished
   on reload. This is why a courier couldn't actually complete a handover.
2. **Direction (send vs receive) wasn't persisted** — on a RECEIVE the customer is at the
   *drop-off* and a stranger is at the pickup, so `riderPhone` was the wrong number at collection.
3. **Pooling didn't filter `kind`** — `poolCandidates`/`poolJoin` would happily offer a parcel as
   a pool "passenger". Latent (no screen calls pooling) but exactly the leak a shared table invites.

**Backend (ride-service, `V8__parcel_handover.sql`):** `direction` (SEND|RECEIVE), `party_name`,
`party_phone` on `ride_requests` + entity/DTO/create-path. Named **party** not recipient because on
a RECEIVE that person is the *sender*. `createRequest` **rejects a parcel without them (400)**.
Pooling now requires `kind=RIDE` on both the candidate and the trip.
- **Privacy boundary matters here:** `RideRequestResponse` now has **two factories** — `from()` for
  the open nearby feed (contact fields nulled) and `forOwner()` for the ownership-checked status
  endpoint. Same reasoning that kept `riderPhone` out of the feed: a driver browsing nearby work
  must not harvest phone numbers, least of all of third parties who never signed up. The courier
  gets the handover contact from **`TripResponse`** after matching (participant-guarded), exactly
  like `riderPhone`.
- **Apps:** customer sends direction/party and the live screen now **reads them back from the
  server** (survives reload, was nav-params-only). Driver parcel card shows "Hand to X" /
  "Collect from X", and the call button rings **whoever is at the end you're driving to** —
  SEND: customer before pickup, party after; RECEIVE: the reverse.
- **e2e suite updated** (parcels now need handover details) + 3 new assertions: rejection without
  them, contact hidden in the open feed, owner sees their own. **106/106 passing.**
- Contract `ride.yaml` updated. Customer + driver type-check clean. **Rebuild ride-service** (V8).

### RS256 — signing power separated from verification (latest) — REBUILD ALL 5 + NEW .env KEYS
⚠️ **`JWT_SECRET` is gone.** `.env` now needs **`JWT_PRIVATE_KEY`** + **`JWT_PUBLIC_KEY`**; compose
refuses to start without them, and everyone signs in again (old HS512 tokens are rejected).
- **The problem it fixes:** HS512 is symmetric — the one key that *verifies* also *signs*. All five
  services held `JWT_SECRET` because all five verify, so a break in ride/food/wallet/gateway (leaked
  env, log dump, bad dependency, stolen image) handed over the ability to mint
  `role=SUPER_ADMIN, status=ACTIVE` for any user id. Now **auth-service alone holds the private key**;
  the rest hold only the public key, which verifies but cannot sign.
- **Implementation:** `JwtService` signs with `Jwts.SIG.RS256`; new `RsaKeys` helper (copied into each
  service, as they're self-contained) decodes keys; each `JwtProperties` caches the parsed key and
  exposes `verificationKey()` (auth also `signingKey()`); gateway decodes its own public key in
  `JwtAuthFilter`. Keys are **single-line base64 of DER** (PKCS#8 private / X.509 public), **not PEM** —
  multi-line values don't survive `.env` + Compose interpolation. `.env.example` documents generation.
- **⚠️ Gotcha that cost a restart:** `openssl genpkey -algorithm RSA -outform DER` emits **PKCS#1**,
  which Java's `KeyFactory` rejects ("algid parse error, not a sequence"). Must convert:
  `openssl pkcs8 -topk8 -nocrypt -inform DER -in priv.der -outform DER -out priv_pk8.der`. The
  command in `.env.example` + DEPLOYMENT.md includes this step.
- **compose:** every service gets `JWT_PUBLIC_KEY`; **only auth-service** gets `JWT_PRIVATE_KEY` —
  the asymmetry is visible in the file, with a comment saying why.
- **Verified, including the threat itself:** generated a *second* RSA key pair, hand-crafted a
  `SUPER_ADMIN` token with it (openssl-signed JWT) → **rejected 401 by all four services**. Old HS512
  tokens → 401. Fresh token shows `alg: RS256`, correct `iss`/`aud`, 60-min TTL, and works across
  auth/ride/food/wallet. `docker exec … env` confirms only `gozone-auth` has a private key.
- **Two new permanent e2e assertions** so this can't silently regress: "access token is RS256" and
  "only auth-service holds the signing key". **Suite now 108/108.**
- Docs swept for the old model (README §3/§4/§11/§14/§15/§19/§21, DEPLOYMENT §1/§3, architecture.md,
  MANUAL.md, fr-coverage.md; BUILD_PROGRESS annotated as historical).
- **Remaining in this story:** rotating keys still means redeploying every service, because the public
  key is configuration. A **JWKS endpoint** the verifiers fetch and cache is the fix — logged in
  DEPLOYMENT.md and the README roadmap.

### Post-evaluation fixes: wallet actually charges, courier owns delivery, real splits (latest)
### — REBUILD wallet + food + ride + gateway
Three things the evaluation caught, all confirmed in code and two worse than reported.
1. **"Pay with wallet" never touched a wallet.** Not for orders, not for rides — `payOrder`/
   `payTrip` just stamped `PAID`. An empty wallet paid fine **and the vendor/driver was credited
   anyway**, so the money came out of nothing. Fixed: new internal **`POST /wallet/charge`**
   (idempotent on trip/order id, **402** when short) is called *before* anything is marked paid.
   Verified: empty wallet → 402 + order stays UNPAID; funded wallet → debited by exactly the total.
2. **The vendor could deliver its own food.** `advanceStatus` let them run
   `READY → OUT_FOR_DELIVERY → COMPLETED` and bypass the courier entirely. Now a **DELIVERY**
   order is the vendor's only up to **READY** (403 beyond it, with a message saying the courier
   takes it from there); the **courier's `PICKED_UP` sets `OUT_FOR_DELIVERY`** and their
   `DELIVERED` completes the order — so customer and vendor both see the true state. Pickup and
   walk-in are unchanged (there the vendor really does hand it over). Vendor board now shows
   "Waiting for a courier to collect" / "Courier is on the way" instead of a dead button.
3. **The vendor was pocketing the delivery fee.** Settlement credited them `order.total`, which
   includes the service fee *and* the courier's delivery fee, and the courier got nothing.
   Settlement is now a **three-way split**: vendor = goods − 12% commission · courier = delivery
   fee · platform = commission + service fee. The suite asserts the three credits **sum to exactly
   the customer's total** on every run.
4. **Cash (researched — DoorDash "Cash on Delivery" + Bolt Food Ghana).** The courier collects and
   **keeps** the cash; the platform deducts what's owed from their earnings and they clear it by
   in-app transfer, blocked from cash work until they do. Implemented exactly that: vendor +
   courier fee credited as normal, then the courier is **debited everything they collected**
   (`CASH_COLLECTED`), so their balance goes negative by what they owe. **Prepaid work stays open
   to them** (earn your way out); **new cash jobs 409** and **cash out is blocked** while negative.
   They pay in via Paystack from Earnings (top-up now accepts `ownerType=DRIVER`), with a red
   "You owe GoZone GH₵ X" banner + pay-in sheet.
- New wallet endpoints: `/wallet/charge`, `/wallet/internal/balance` — both **internal-key guarded
  and 404'd at the gateway edge** like the other internal paths. Ledger gained `PAYMENT`,
  `DELIVERY_FEE`, `CASH_COLLECTED` types (labelled in all three apps' transaction lists).
- **e2e suite: 118/118**, up from 108 — new assertions for the empty-wallet refusal, the real
  debit, the vendor's 403s, courier-pickup driving the order, the split summing to the total, the
  courier's delivery fee, and the cash debt. The suite now also **cleans up the cash debt it
  creates**, so a demo after a test run isn't blocked.
- ⚠️ **Demo note:** a test run leaves the seeded courier at 0 (cleanup does this); the walk-in
  demo customer still needs re-staging after a run, as before.

### Maps fixes: current-location hang, straight-line routes, live driver route (latest)
### — REBUILD ride-service
1. **"Use current location" spun forever** (worst on iOS). Two unbounded waits: `getCurrentPositionAsync`
   has no timeout and blocks until a GPS fix — cold receiver or indoors, that's effectively never —
   and then the screen *waited on a reverse-geocode* before navigating. Fixed in
   `src/lib/location.ts`: try `getLastKnownPositionAsync` first (instant, accurate enough to drop a
   pin), then a **bounded** fresh fix (8s), with a web-side belt-and-braces timeout for browsers
   that fire neither geolocation callback. `lib/geocode.ts` lookups are bounded (5s) too. And the
   screens now **fill the field and navigate back the moment coordinates exist** — the street name
   is decoration, not a gate. Applies to ride search + GoShop address.
2. **Straight lines instead of routes — root cause found:** the Google **server key is IP-restricted**
   and the machine's IP had changed, so every Directions call returned `REQUEST_DENIED` ("This IP …
   is not authorized") and the apps drew their straight-line fallback. Two responses: (a) told the
   user how to re-restrict the key; (b) **added a keyless OSRM fallback** in `MapsService.directions`
   (`router.project-osrm.org`, no key/allowlist) so a blocked or rotated key degrades to *a real road
   route* rather than a line through buildings. Verified: 240-point route, 6.7 km, 11 min for
   Accra→Osu with Google still refusing. Place search + reverse geocode still fall back to Nominatim
   as before (they return empty from Google while restricted).
3. **Live driver/courier route.** The pickup-leg route was fetched **once** (`if (… || pickupRoute.length) return`)
   so it never shrank — only the car marker slid along a stale line. Now it **re-routes as they move**,
   throttled to once they've covered **120 m** (re-routing on every 3s GPS ping would be a request per
   ping per rider). Cleared when they pick you up so the map switches to the journey. Also the
   customer's **own position now shows on the live map** (`userLocation` — both map implementations
   already supported the blue dot, it just wasn't passed), so the map means something while you're
   still waiting for someone to accept. Applied to **both** `(rider)/live.tsx` and `(parcel)/live.tsx`.
- e2e 118/118; all three apps type-check clean. **Rebuild ride-service** (OSRM fallback).
- ⚠️ **Not device-verified** — 1 and 3 are phone-side behaviours; the root causes are fixed and the
  logic type-checks, but they want a real tap-through on iOS before the presentation.

### Vehicle pins on the live map — why they seemed missing (latest) — REBUILD ride-service
The car/bike marker code was there and correct (rotating top-down car SVG on device, glyph
marker on web) — but **the marker only ever got a position from the WebSocket GPS stream**, so
until the driver's app pushed its first ping there was *no vehicle on the map at all*, just the
pickup/destination dots. If the driver app wasn't pushing location, it never appeared.
- **Seeded from the offer:** `BidOffer` now carries the driver's `lat`/`lng` (the `bids` table has
  stored them since V6 — they just weren't in the DTO). Both live screens place the vehicle the
  moment you match, then the WS takes over. Verified end-to-end: offer → `lat 5.598 lng -0.191`,
  and the matched `status.driver` carries position + vehicle.
- **Vehicle-aware shape:** new `vehicleKindOf()` maps the driver's free-text vehicle onto
  car/bike/truck. Native gets a new **top-down `BikeMarker` SVG** (rotates to heading like the
  car); web swaps the glyph, and can change it after load (`setVehicleKind`) since the vehicle is
  only known once an offer is accepted. An okada courier no longer shows up as a saloon car.
- Applied to `(rider)/live.tsx` and `(parcel)/live.tsx`. e2e 118/118, all apps type-check clean.
- ⚠️ **Self-inflicted incident worth remembering:** a Python rewrite of `LeafletMap.tsx` containing
  emoji **truncated the file to 0 bytes** (UnicodeEncodeError *after* opening in `w` mode, on
  Windows cp1252). Recovered with `git checkout --`; the lesson is to use the Edit tool for files
  with non-ASCII content rather than Python read/modify/write.

### Cross-app audit of recent work — driver app had missed three map fixes (latest)
Checked every recent change against all four front-ends, because the apps are **separate copies**
and a fix in `customer-app/src` does not reach `driver-app/src`.
- **Already consistent everywhere** (verified, not assumed): logout revoking server-side,
  `updateProfile`/backend profile, add-phone flow, `session.ts` clearing the profile cache, the new
  ledger labels (PAYMENT/DELIVERY_FEE/CASH_COLLECTED) — all three Expo apps; admin-web has the
  refresh-on-401, the payouts board and revoking sign-out.
- **Gaps found and closed in `driver-app`:** it still had the **unbounded** `location.ts` (no
  last-known-position shortcut, no timeout — the same iOS hang the customer app had, and the driver
  feed calls it on load and on tap) and the **unbounded** `geocode.ts` fetch. Both synced. Also
  ported the **vehicle-aware marker**: `mapTypes.ts` synced (`vehicleKindOf`), `BikeMarker` added to
  `GoogleMap.native.tsx`, and `trip.tsx`/`deliveries.tsx` pass `vehicleKind` from the driver's own
  `vehicleClass`, so an okada courier sees a motorbike for themselves, matching what the customer sees.
- **Routing fix needs no porting** — both apps call the same `/rides/maps/directions` proxy, so the
  OSRM fallback covers them together (verified both clients hit the same endpoint).
- **vendor-app has no maps at all** — deliberate: it has no tracking surface (orders, queue,
  catalogue, earnings). Nothing missing there.
- ⚠️ **Known gap, not fixed:** the driver app's **web** map is still a placeholder card
  ("Map is available on the mobile app") because `react-native-maps` has no web build and
  `react-native-webview` isn't installed in `driver-app`. On a phone the driver map is fine; on web
  the driver sees no map while the customer does. Porting the customer's Leaflet web map needs
  `npm install react-native-webview` in driver-app — flagged for the user's decision.
- All four front-ends type-check (admin-web builds); e2e 118/118.

### Driver app now has a real map on web (latest) — run `npm install` in driver-app
`driver-app/src/components/GoogleMap.tsx` was a placeholder card ("Map is available on the mobile
app") because `react-native-maps` has no web build — so in a browser the driver saw nothing while
the customer saw a live map.
- **Added dep `react-native-webview@13.15.0`** (`npx expo install`, same version as customer-app) —
  ⚠️ **anyone pulling this needs `npm install` in `driver-app`**.
- Ported the customer's proven Leaflet implementation into `GoogleMap.tsx`, adapted to the driver
  app's shared `MapProps` contract (its `.native.tsx` already used it) and re-exported as
  `GoogleMap`, so **no call site changed** — `trip.tsx` and `deliveries.tsx` just work.
- **Verified, not assumed:** `expo export --platform web` bundles clean (1.8 MB); the old
  placeholder string is **gone** from the bundle and `unpkg.com/leaflet`, the carto tiles and the
  vehicle `GLYPH` table are **present**; a diff against the customer's file shows the only
  differences are the type import, the export name and the header comment — the map logic is
  identical to the one already working on web. All apps type-check; e2e 118/118.
- *Attempted a full browser click-through of the driver trip screen; React Native Web touchables
  don't respond to synthetic DOM events and the preview pane wouldn't composite frames for real
  clicks, so the bundle-level verification above stands in. Worth a human glance in a browser.*

### Black dark mode + map on the GoRide home screen (latest — frontend only, no rebuild)
Both from the evaluation feedback.
1. **Dark mode is now true black** (`#000000`) instead of the deep navy `#0A0F1C` — the evaluator
   read the blue tint as a colour choice rather than "dark mode". Changed in `darkPalette` in **all
   three** Expo apps, so it propagates to every themed screen at once. Surfaces step up in neutral
   greys (`#0E0E11` / `#17171C`) so cards still separate on OLED black, and `border` warmed to
   `#26262D` to stay visible. The **brand surface** (splash / welcome / onboarding — always dark,
   ignores the toggle) went black too, keeping the blue glow, which reads better against black.
   Also blacked the map's own backdrop (`background:#0a0f1c` → `#000`) so there's no navy flash
   while tiles load.
2. **GoRide home now opens on a live map**, like the rest of the category. The deep-gradient hero
   is replaced by a `LeafletMap` filling the top ~34% of the screen (min 240pt), with the greeting
   and avatar floating over it behind a top scrim for legibility. Pickup/destination markers show
   on it, and the rider's own blue dot. Everything below (search bar, Ride/Shop/Parcel circles,
   composer) is unchanged.
   - **Pickup now defaults to where you are.** `rideDraft.origin` seeds to **Kotoka Airport** and is
     never null, so the map would have opened on the airport forever and the composer proposed it
     as everyone's pickup. On first location fix, if the origin is still the untouched default, it's
     replaced with the rider's current location. This is why the map centring is written against
     `dest` rather than `origin ? …` — origin always exists.
- All three apps type-check clean. **Not visually verified** — RN Web touchables resist synthetic
  clicks (see the earlier note), so the map hero and the black theme want a look on a device.

### Place names + search suggestions restored (latest) — REBUILD ride-service
User reported: current location shows as "Current location", a dropped pin shows as "Pinned
location", and search returns no suggestions. **Two causes stacked**, and both fallbacks were dead:
1. **Google is IP-blocked** (the key restriction found earlier) — `places/search` and
   `geocode/reverse` return empty.
2. **Nominatim refuses the apps.** Its usage policy requires an identifying `User-Agent`; a plain
   `fetch` from the app gets **`Access denied`** (verified with curl: with a UA it returns data,
   without one it's denied). So the OSM fallback the apps relied on had never been working on
   device — it only looked fine on web, where the browser sends a real UA.
**Fix — do the OSM lookup server-side**, where the header can be set (mirrors the OSRM routing
fallback): `MapsService` gained `osmSearch()` + `osmReverse()` with a configurable
`app.maps.osm-user-agent`, used whenever Google is unset or fails. Apps now talk only to our own
gateway for geocoding. Verified live: reverse of 5.6037,-0.187 → **"Patrice Lumumba Road"**
(was empty), search "Osu" → real suggestions.
- **Third symptom was mine:** when I made "use current location" return instantly, I dropped the
  name lookup entirely, so the label stayed "Current location" forever. Restored as a *background*
  refinement — navigate immediately, then upgrade the label in the store once the name arrives
  (writes to the store, not local state, since the screen has already closed). Applied to ride
  search and the GoShop address screen.
- **Driver app had the same latent bug** (its `geocode.ts` called Nominatim directly, so the feed's
  area name never resolved on device) — now routed through the backend too.
- Geocode timeout raised 5s → 9s to allow for the extra hop on a mobile network.
- e2e 118/118; all three apps type-check clean.

### JWKS — rotating a signing key no longer means redeploying everything (latest) — REBUILD ALL 5
The RS256 change left one thread hanging: the public key was still *configuration*, so replacing the
pair meant editing five services' environments and restarting all five together. Now auth-service
publishes its keys and the verifiers fetch them.
- **auth-service publishes `GET /auth/.well-known/jwks.json`** (public — a verification key cannot
  sign, which is the whole premise of RS256) and stamps every token with a **`kid`**. The kid is the
  key's **RFC 7638 thumbprint**, computed from the key material, so all five services derive the same
  name for the same key independently — there is no key *label* to keep in step, and two different
  keys can never collide under one name.
- **`JwkCache`** (copied into gateway/ride/food/wallet, like `RsaKeys`) fetches the document on a
  **background daemon thread** and caches it by kid; `Jwts.parser().keyLocator(...)` picks the key per
  token. Never fetches on the request path — the gateway is reactive and a blocking call there would
  stall the event loop. `JwtProperties` in the three verifiers lost its key handling entirely so
  there is one owner of the key, not two that can drift.
- **`JWT_PREVIOUS_PUBLIC_KEYS`** (auth only) keeps retired keys published and accepted, which is what
  makes rotation gapless. **Procedure is in `docs/DEPLOYMENT.md` §3** — two auth restarts, no verifier
  redeploy at any point.
- **Does not break the "never call auth to validate a token" rule** (`CLAUDE.md`): signatures are
  still checked locally against a cached key. What crosses the network is the key, once per refresh
  interval. `JWT_PUBLIC_KEY` stays configured as the fallback, so every service boots and keeps
  verifying with auth-service down — verified by watching a verifier start before auth was listening.
- **Verified live by actually rotating** (not just type-checks): generated a second RSA pair, pointed
  auth at it with the old key as previous, restarted **auth-service only** → JWKS served both kids →
  all four verifiers logged picking both up on their next refresh **without being restarted** → a
  token signed with the new key returned 200 from auth/ride/food/wallet. Then a third, never-published
  key to exercise the unknown-kid path. Original keys restored afterwards; JWKS back to the single
  original kid and all four services 200.
- ⚠️ **Bug found by doing it rather than assuming:** `JWT_PREVIOUS_PUBLIC_KEYS` was wired into
  `application.yml` and `.env.example` but **not into `docker-compose.yml`**, so the JWKS published
  only one key and the documented rotation would have silently failed at exactly the wrong moment.
  Fixed. Two other defects in the first draft, also found live: a fetch failure logged `failed: null`
  (connection exceptions have a null message — now logs the exception type), and a boot-time failure
  waited a full 5-minute interval before retrying (now 15s until the first success). A successful
  no-change refresh was silent, making "working" indistinguishable from "never ran" — now the first
  success logs.
- **Measured, not assumed:** the safety net for a *one-step* rotation is that an unrecognised kid
  triggers a background re-fetch, so the **first** request to reach each service fails and later ones
  succeed — per service, independently. Recorded in DEPLOYMENT.md as a backstop, not a plan.
- **e2e now 121/121** (was 118): JWKS publishes an RS256 key with a kid · the token's kid matches a
  published key · all four verifiers logged loading the JWKS. The middle one is the real guard — if
  the kid ever stops matching, every verifier silently falls back to its configured key and rotation
  quietly stops working with nothing else going red.
- Docs swept: README §14 + roadmap, DEPLOYMENT §3 (new rotation procedure) and its known-gaps list,
  `.env.example` (which was also missing the mandatory `openssl pkcs8 -topk8` step that DEPLOYMENT.md
  documents — the exact trap that cost a restart during the RS256 work).

### Arrival notification — and why NO notification ever worked (latest) — REBUILD ride-service
User asked for a real notification when the driver reaches the pickup. Building it uncovered that
**the notification pipeline had never delivered anything to anyone.**
- **Two dead links, both invisible:** (1) *no app ever registered a push token* — nothing called
  `POST /wallet/push-token`, so `findByUserId` was always empty and every notification the platform
  ever sent took the fallback path and died as an `[SMS-STUB]` log line; (2) **`NOTIFY_URL` was wrong
  in compose** — `http://wallet-service:8084/notify`, missing wallet-service's `/wallet` context path,
  so a dispatch would have 404'd anyway. Nothing caught it because **no service ever called notify**:
  ride-service had no notify client at all, and food-service references it only through config.
  Fixed both (`/wallet/notify` in compose + both ymls; `registerForPush()` in the customer app).
- **ride-service:** new `NotifyClient` (fail-soft — a notification outage must never fail the trip)
  and **`POST /rides/trips/{id}/arrived`** (driver-only, ENROUTE-only). Deliberately does **not**
  change trip status: arriving is not starting, and the driver still taps Start when the passenger
  is actually in, or the meter runs on someone still in their doorway. Parcel-aware wording.
- **Customer app:** new `src/lib/push.ts` — permission + Expo token + register, called after
  verify-otp and on app start for an already-signed-in device, plus a foreground handler so
  notifications show while the app is open. `expo-notifications` was already installed (the earlier
  note in this file claiming it was removed is stale); it is imported **lazily** because a top-level
  import has crashed Expo Go startup before. Entirely best-effort — a device that refuses permission
  still books rides, and the in-app notifications list fills from the same records either way.
- **Driver app:** an **"I've arrived"** button on the trip screen while ENROUTE (`announceArrival`).
- **Verified live:** refused while MATCHED · 200 while ENROUTE · another driver refused · the customer
  now has the notification record ("Your driver has arrived"). Channel reads `SMS_STUB` under curl
  because a test has no device token — on a phone it should read `PUSH`.
- ⚠️ **Not device-verified.** Expo Go on SDK 53+ cannot always mint a push token; if it refuses, the
  record still appears in the in-app list but no banner shows, and a dev build would be needed.

### Device-testing fixes: stale recents + blinking map markers (latest — frontend only, no rebuild)
Two bugs the user found tapping through on a real phone. Both are follow-on damage from the
"make current location instant" change, and both are ⚠️ **fixed but not device-verified by me** —
they need another tap-through.
1. **Recents were saved under the placeholder name.** "Use current location" deliberately files the
   place and navigates away *before* the reverse-geocode returns, then upgrades the label a second
   later. It upgraded `rideDraft`/`deliveryPlace` but **not the recents entry**, so the recents list
   filled with rows all called "Current location" pointing at different places — worthless as a
   shortcut, which is the only reason recents exist. New **`recentsStore.relabel(lat, lng, place)`**,
   called from the same background `.then()` in `search.tsx` and `(shop)/address.tsx`. Matched on
   **coordinates, not label** — the label is precisely what changed — and it collapses the pair if
   the resolved name is already in the list. `map-picker.tsx` does **not** have this bug (it resolves
   the name while you drag, before you confirm), so it was left alone.
2. **The blue "you are here" dot blinked constantly.** Not a location-update artefact:
   `react-native-maps` defaults **`tracksViewChanges` to true**, so it re-rasterises a marker's
   custom child view on *every* render of the map component. The map-picker re-renders on every
   frame of a pan, hence the profuse blinking — and it burns CPU redrawing views that never change.
   The stock advice ("just set it false") would freeze the vehicle marker on its first frame instead
   of letting it rotate to its heading, so: new **`useSettledTracking(signature)`** hook — track for
   800ms whenever the marker's content actually changes, then settle. Applied to all three marker
   groups (plain dots / vehicle / user dot). The static dots settle permanently; the vehicle still
   re-renders while it is moving, which it must.
   **Ported to `driver-app/src/components/GoogleMap.native.tsx` too** — separate copies, same bug.
   Web (Leaflet `circleMarker`) was never affected.
- Customer + driver type-check clean. **Splash screen feedback still to come from the user.**

### Demo data cleared, and why it kept piling up (2026-07-27, DB state only — no code)
The vendor orders board had **30 unfinished orders** on it. Cleared on the user's go-ahead; nothing
deleted, all 30 moved to `CANCELLED` with the previous status in `orders_status_backup`, so the undo
statements at the foot of `seed/99_clear_stale_demo_data.sql` still cover every one of them.
- `seed/99_clear_stale_demo_data.sql` handled 21 (run against **both** DBs — each half errors
  harmlessly in the database that lacks its tables; that's the documented `ON_ERROR_STOP off`
  behaviour, not a failure). The other **9 were today's e2e residue**, which the script deliberately
  spares (it only touches `created_at < CURRENT_DATE`, so a live demo is never broken) — cleared by
  hand, backed up the same way.
- ⚠️ **The script also cancels the curated demo delivery** (Ama Mensah, GH¢52.88, created 07-22):
  it is older than today, so it is indistinguishable from cruft. **Restore it after every run** or
  the vendor has no delivery order to advance —
  `UPDATE orders SET status='PLACED' WHERE id='983e6ed4-a7ad-4d22-9fb1-d34219704983';`
- ⚠️ **Root cause of the pile-up: re-staging created a new order each time.** There were **nine
  identical copies** of the Kojo Rider walk-in (Waakye + Kelewele, GH¢25.20), one per session that
  re-staged it after an e2e run consumed the queue entry. Kept the newest, cancelled the rest.
  **Re-stage by flipping the existing entry back, not by placing a fresh order:**
  `UPDATE queue_entries SET status='WAITING' WHERE order_id='7b223015-6710-4ac4-ac27-5db53843a9ff';`
- **Demo state now** (verified): Kofi Kitchen has exactly two PLACED orders — walk-in GH¢25.20
  (1 waiting in the Queue tab) and delivery GH¢52.88. `ride_db` has no unfinished trips or pending
  requests.

### Payments, notifications, shop fixes + design pass (latest session) — REBUILD food + wallet + ride
Driven by device testing. Backend changes are **verified against the running stack**, not just
type-checked. Front-end changes type-check; those needing a device are flagged.

**Payments**
- **Driver could never confirm a cash fare.** Backend was always right (curl-verified: cash → AWAITING,
  wallet untouched, credited only on confirm). The dead end was the app: "Back to Home" cleared
  `activeTrip`, the only handle on that trip, so when the customer then chose cash the Confirm button
  was unreachable and the customer waited forever. The trip is now kept until the fare settles and the
  feed banner leads back to it; a **COMPLETED trip no longer blocks the feed**, or holding it would
  take the driver off the road. (The courier delivery screen already did this correctly.)
- **Paystack could take money and never credit it.** The reference lived in React state and the browser
  hand-off reloads the JS context — the reload the user noticed *was* the bug. Nothing is banked until
  `/wallet/topup/verify` gets that string. Now persisted (`src/lib/pendingPayment.ts`) and redeemed on
  return; verify is idempotent per reference. Applied to **all four** Paystack payment points: wallet
  top-up, ride, food order and parcel.
- **Saved cards are real** (wallet V3 `payment_authorizations`). Paystack only issues a reusable
  authorization as the by-product of a successful charge, so a card saves itself after the first
  payment and every one after is a server-side tap. Stores an authorization code + brand/last4 —
  **no PAN, no CVV**, far less than the old local form held. `POST /wallet/cards/{id}/charge` returns a
  reference the *existing* verify paths confirm, so nothing gets a second trust path. **Momo lost its
  add-a-number form**: Paystack has no reusable momo authorization, so it is a standard method that
  goes to checkout. ⚠️ **Not exercised against real Paystack** (key is `mock`, where capture is
  skipped) — the first live card payment is the real test (`docker logs gozone-wallet | grep CARD`).
  ⚠️ One-tap is wired into the **ride** flow only; food checkout and top-up still redirect.

**Notifications — nothing had ever been delivered to anyone**
Two breaks hiding each other: no app ever called `/wallet/push-token`, so every notification fell to an
`[SMS-STUB]` log line; and `NOTIFY_URL` omitted wallet-service's `/wallet` context path, so a dispatch
would have 404'd anyway. Neither surfaced because **no service ever called notify**. Both fixed;
`NotifyClient` added to ride **and** food (fail-soft — a notification outage must never fail the
trip/order it rides on).
- **`POST /rides/trips/{id}/arrived`** (driver-only, ENROUTE-only) + an "I've arrived" button.
  Deliberately does **not** advance status — arriving is not starting, or the meter runs on someone
  still in their doorway.
- **Food ready**, worded by collection mode: pickup → "ready for collection"; walk-in → "head to the
  counter"; delivery → nothing at READY (noise; they have tracking) but notified when the **courier
  collects**, which is when the map starts meaning something.
- ⚠️ **`expo-notifications` throws at IMPORT time on Android in Expo Go (SDK 53+)** — a lazy
  `await import()` is still too late. `src/lib/push.ts` detects Expo Go via `expo-constants` and never
  touches the module. **Real push needs a dev build**; records still reach the in-app list.

**Shop fixes**
- **Courier never saw deliveries:** the driver app hard-coded `isOkada ? available() : []`, so anyone
  else got an empty feed indistinguishable from "no work" — and a **Car is class-null until an admin
  approves it**. The backend never filtered by class at all. Okada/car/luxe can now deliver; an
  unapproved vehicle is told exactly that.
- **Pickup/walk-in were pushed through delivery statuses:** `NEXT` was one flat map ending
  `READY → OUT_FOR_DELIVERY` for everything, so a pickup offered a button the backend refused. Now
  mode-aware: pickup/walk-in go `READY → COMPLETED` ("Handed to customer" / "Served — complete").
- **Walk-in "when to leave"** — `GET /food/orders/{id}/leave-time?lat=&lng=`. Location is a **query
  param, not stored**: what matters is where they are when they ask. Queue position is **recomputed**
  from who is still waiting, not read off the ticket number. Travel is haversine at 18 km/h (Accra
  traffic), deliberately not the Directions proxy — it is polled, and road-route precision is unusable
  against a 20-minute prep estimate. Customer card shows "Leave in N min" → "Time to set off", **plus a
  one-shot `Alert`** standing in for push until there is a dev build.
- **Prep time per dish** (food V9 `menu_items.prep_minutes`). An order's prep is the **slowest dish,
  not the sum** — kitchens cook in parallel; summing would send someone off an hour early. Small capped
  margin per extra dish. People ahead are still costed at the vendor's flat average (we cannot see
  their orders; inventing detail would fake precision). **Null = unset → vendor's flat figure**, so all
  17 existing items are unchanged. Settable when adding an item, and editable afterwards via a **prep
  chip** on each catalogue row (blank clears it back to the default rather than meaning zero).

**Design**
- Splash: glow **2.1× → 2.6×** (now a `glowScale` prop) — the GZ was overhanging its own halo; mark
  180→172; wordmark moved well down (marginTop 92, inDrive-style) and blue. Driver/vendor splashes say
  **GoZone Driver** / **GoZone Vendor**. Logos deliberately left alone.
- Ride greeting: **one colour in both themes** (`#0B1220`) at the user's direction — the map tiles are
  light whichever theme is on, and flipping to white in dark mode drew a hard white-on-black seam that
  read as two unrelated halves. A light scrim lifts the text off the tiles.
- Map markers stopped blinking: `react-native-maps` defaults `tracksViewChanges` **true**, redrawing
  custom marker children on every render (the picker re-renders every frame of a pan).
  `useSettledTracking` tracks ~800ms after a real change then settles — turning it off outright would
  freeze the rotating vehicle marker. Ported to driver-app.
- Recents kept the placeholder name — `relabel(lat,lng,place)` matches on **coordinates**, since the
  label is exactly what changed. Pickup label upgrades from "Current location" to the real street name.
- **Destination no longer seeded with Osu.** ⚠️ Uses an **empty-place sentinel (`NO_DEST`/`hasDest`)
  rather than `null`**, because ~8 files read `dest.lat`/`dest.label` directly; nullable is correct but
  ripples through all of them. **Converting it properly is outstanding.**

**Rebuild:** `docker compose build food-service wallet-service ride-service && docker compose up -d`

### Device-testing batch A (A4–A7) — REBUILT food + auth, e2e 132/132
The four remaining quick-correctness items from `docs/ISSUES_FROM_TESTING.md`. A1–A3 were done the
session before; section A is now closed. B (blocked flows) and C (product gaps) are still open.
- **A4 — the GZ mark "not appearing" was `tintColor`.** `GzMark` painted the navy PNG white with
  `Image` `tintColor`, which silently does nothing on some Android builds — and when it does
  nothing you get a **navy mark on a near-black brand background**, i.e. invisible. That is the
  reported symptom exactly. Now ships a **pre-whitened `assets/gz-logo-white.png`** (alpha kept,
  RGB forced white; script in scratchpad `make_white_logo.py`) chosen by the `color` prop, with
  `tintColor` removed outright. Same API, no call site changed, all three apps.
- **A5 — duplicate glow.** The rule the report was reaching for is "a screen that already shows a
  logo or hero must not also carry a corner orb". Five screens did both: `welcome.tsx` ×3 (orb
  beside the `Logo` squircle) and the awaiting-approval view of driver + vendor `onboarding.tsx`
  (orb on top of `GzHero`, which brings its own glow). Register / verify-OTP / onboarding-setup
  **keep** theirs — no logo there, which is why it was only *some* screens.
- **A6 — the estimate now counts down.** `readyInMinutes` ignored elapsed time, so it read the same
  at PLACED and ten minutes into PREPARING. New **`orders.preparing_at`** (food **V10**), stamped on
  first entry into PREPARING only. `created_at` is the wrong clock — an order sits at PLACED for
  however long the vendor takes to confirm, and nothing is cooking then; null means no subtraction,
  so pre-existing orders behave exactly as before. `walkInLeaveTime` → **`collectionLeaveTime`**,
  **widened to PICKUP** (a pickup customer travels too), delivery refused **409** — an explicit
  status because this service has **no exception handler**, so the bare `IllegalStateException` was
  surfacing as an opaque 500. Floors at 1 while cooking; only READY reports 0. Verified live:
  `15 → 15` at PLACED, then `15 → 10 → 3 → 0` as the kitchen works. Customer card now shows for
  pickup too and explains the frozen pre-cooking window ("The kitchen hasn't started yet…") instead
  of leaving an unmoving number unaccounted for.
- **A7 — drivers awaiting a vehicle class were invisible.** Approvals filters `status=PENDING`, but a
  car driver is class-null **and already ACTIVE**, so approving them removed them from the only
  screen that could grade them — while their app kept saying "Awaiting admin". New
  **`GET /auth/users/awaiting-class`** (ADMIN/SUPER_ADMIN; DRIVER/COURIER, `vehicle_class IS NULL`,
  REJECTED excluded, deliberately **not** status-filtered). Admin web: an **"Awaiting vehicle class"**
  section on Approvals (de-duplicated against the pending list so nobody gets two class pickers) plus
  a Dashboard count and a "Grade N vehicles" shortcut.
- **Contracts:** `food.yaml` gained `/orders/{id}/leave-time` + `LeaveTimeResponse` — it had **never
  been published**, a pre-existing drift against the contract-first rule, fixed now that its behaviour
  changed. `auth.yaml` gained `/users/awaiting-class`.
- **e2e 121 → 132.** New **"6c. COLLECTION ESTIMATE"** section: it winds `preparing_at` back ten
  minutes via psql rather than waiting, and asserts the figure actually drops — plus pickup gets an
  estimate, delivery 409s, and the walk-in one still works. A7 is tested by *creating* the state:
  null a spare seeded driver's class, assert they appear, grade them, assert they leave, with an
  unconditional restore afterwards. **Also fixed a suite hygiene bug found while in there:** §6b
  abandoned **two PICKUP orders at PLACED every single run** — one of the documented sources of the
  vendor-board pile-up — so the new block drives them terminal instead.
- ⚠️ **A4 and A5 are not device-verified** — they are phone-side appearance and only the device that
  failed can clear them. New checks added to `TAP_THROUGH.md` §2. A6/A7 are verified against the
  running stack, not just type-checked.
- ⚠️ The first food-service build failed after ~14 min on a Maven `DependencyResolutionException`
  (dependency download, not a compile error). A straight retry succeeded — treat that failure mode as
  network flakiness and just re-run.
- Housekeeping: the suite consumed the staged walk-in customer again (documented side effect);
  re-staged by flipping the existing entry, not by placing a new order.
- All four front-ends type-check; admin-web builds. **Rebuild food-service + auth-service.**

### Device-testing batch B (B1–B3) — REBUILT food-service, e2e 135/135
The three flows that stopped the tester. **Every one turned out to be a silent failure** — the app
doing nothing, or showing something indistinguishable from "nothing to show" — which is why they
read as dead ends rather than errors.
- **B1 — "can't add items" was never the API.** Verified live first: `POST /food/restaurants/{id}/menu`
  returns 200 with and without add-on groups. The bug was `submitItem`'s opening
  `if (!vendor) return;` — **no message at all**, so the button was simply inert. `vendor` was null
  because **only `orders.tsx` ever selected a business**; `menu.tsx` and `queue.tsx` read the store
  and bailed. Signing out clears the selection, so this was the state after **every fresh login** if
  you opened Catalogue first. Selection moved into **`(vendor)/_layout.tsx`** — it belongs to being
  signed in, not to one tab. Also killed the silent failures: the null case explains itself, and
  `load()`'s two bare `catch {}` blocks (which rendered a failed fetch as "no items yet", identical
  to an empty catalogue) now surface the server message with a retry.
- **B2 — the feed didn't just say nothing, it lied.** An unapproved driver saw a spinner reading
  "Looking for requests nearby…" **forever**, which looks exactly like a quiet night — so they waited
  instead of chasing the approval. A car is class-null until an admin grades it and the class filter
  then matches nothing. `feed.tsx` gained `blockedReason` (account not ACTIVE / no vehicle class)
  with a **Check again** button. The `nearby` poll is **skipped while blocked** — it requires
  `STATUS_ACTIVE`, so it would have stacked a 403 "Can't load requests" over the real reason. An
  *approved* driver with no work now gets "No requests right now" + the radius, not the same spinner.
- **B3 — three faults, only one of them reported.** (1) No map: the card printed **raw coordinates**.
  (2) Wrong start: it subscribed at `OUT_FOR_DELIVERY`, but the courier app pushes GPS from the moment
  they **accept** — while the order is still READY — so the whole run to the restaurant was discarded.
  (3) **The destination was never stored.** `deliveryLat/Lng` were sent at checkout, used once to
  price the delivery fee, and **thrown away** — the same collected-then-discarded bug as the parcel
  handover details. And because the courier app received only an address *string*, its demo GPS
  walked **six coordinates hardcoded into the app**: the same stretch of central Accra whichever
  restaurant the order came from, looping to the start every six pings. So the customer was watching
  a courier who was nowhere near their food.
  Fixed with **`orders.delivery_lat/lng` (V11)**, both endpoints on `OrderResponse` **and**
  `DeliveryResponse`, a real `LeafletMap` on the order screen subscribing from READY with phase-aware
  copy, and a courier path generated **between the real endpoints** — phase-aware and holding at the
  destination instead of wrapping.
- **Seeded `Tema Harbour Grill`** (`bbbbbbbb-…005`, ~20 km east) per the scope note. The note blamed
  vendor spacing for movement being unobservable; the real cause was the hardcoded path, but it was
  right that everything sits within ~2 km. It also exercises the distance-based delivery fee —
  **GH¢35.28** Tema→Osu, against central-Accra orders that always sat near the floor. Seed stays
  idempotent (re-running inserts 0 rows).
- **Contracts:** `food.yaml` — `OrderResponse` gained `deliveryLat/Lng` + `restaurantLat/Lng`,
  `DeliveryResponse` gained `vendorLat/Lng` + `dropoffLat/Lng`.
- **e2e 132 → 135:** the order keeps its destination, the order carries the vendor's position, and
  the courier gets both ends as coordinates. These are the fields a future refactor could quietly
  drop with nothing else going red.
- ⚠️ **Front-ends are type-checked, not device-verified** — B1's app path, B2's feed states and B3's
  map all need a phone. New checklists added to `TAP_THROUGH.md` §7 (courier map), §8 (adding items)
  and §9 (why there's no work).
- **Rebuild food-service.** Then re-run `seed/02_food_seed.sql` for the Tema vendor.

### Section C batch (C2/C3/C4/C6/C7) — REBUILT food-service, e2e 140/140, `npm install` in vendor-app
The grouped half of `docs/ISSUES_FROM_TESTING.md` §C. Only **C1** (unmock driver KYC) and **C5**
(Bolt-style scrollable map) remain — triage says both should be done alone.
- **C6 keyboard avoidance — global, and Android had *nothing* before.** `react-native-keyboard-controller`
  is out (native code, needs a dev build; everything here runs in Expo Go). The existing
  `KeyboardAvoidingView`s passed `behavior={ios ? 'padding' : undefined}`, and `undefined` on
  Android means *do nothing* — it defers to a window resize that never happens under SDK 54
  edge-to-edge. New **`src/components/KeyboardAvoider`** in all three apps wraps the Stack in each
  root `_layout`; it measures the real keyboard (`endCoordinates.screenY`) and the focused field
  and lifts by **exactly the overlap**, which is what makes one global instance safe — a field
  that already clears the keyboard yields zero, so a map with a top search bar never jumps. The
  four per-screen handlers were removed (they would double-shift). `Modal` is a separate view
  hierarchy the root cannot reach, so the vendor add-item sheet (which had **no** handling, with
  add-on fields at the very bottom) and both `CashOutSheet`s wrap themselves.
- **C2 vendor admitted before approval.** They were parked on a full-screen waiting page whose only
  control was Log out — unable to reach their profile precisely when they'd want to. New
  **`VendorGate`** on Orders/Queue/Catalogue/Earnings distinguishes checking / no-business /
  under-review / rejected; **Profile is not gated**. `roleHome()` → `/(vendor)/orders`, and the tab
  layout polls `/auth/me` so the app opens up by itself on approval. ⚠️ Caught mid-build: the only
  route to Profile was an avatar **inside** the orders board that the gate replaces, so every gated
  state now carries a Profile link — without it the whole change would have been self-defeating.
- **C3 vendor location.** Coordinates were hardcoded to Accra at sign-up with no editor anywhere,
  quietly breaking delivery pricing and courier routing. New **`app/pick-location.tsx`** —
  purpose-built, not a port of the customer `map-picker` (which is entangled with ride drafts,
  carts, recents and saved places). Uses the WebView/iframe Leaflet map **only**; deliberately not
  `react-native-maps`, which needs a dev build. Reachable from the storefront editor and from
  onboarding. ⚠️ **Adds `react-native-webview` + `expo-location` to vendor-app — `npm install` there.**
- **C4 storefront editing.** The page customers read had no editor and no columns behind it. **V12**
  adds `description`/`image_url`/`address` to `restaurants`; new **`PATCH /food/vendors/{id}`**
  (owner-guarded, partial, blank name rejected, coordinates only as a pair). Vendor
  **`app/storefront.tsx`** with a live cover preview; the customer menu prefers the vendor's own
  banner/address/description and falls back to bundled metadata, so seeded vendors are unchanged.
- **C7 one-tap saved cards** extended from ride-only to **food orders, parcels and top-up** — all
  charging server-side through the same verification path as a checkout payment. Parcel had the
  identical gap; the triage had only spotted two of the four payment points.
- **Two real bugs found while verifying C4, neither reported:**
  1. **`GET /food/restaurants` had no `ORDER BY`.** Postgres returned heap order, so *rewriting any
     vendor row reshuffled the customer's shop list*. Now ordered by name. This also silently broke
     the e2e suite, which picks `restaurants[0]` — it started testing a different vendor at a
     different distance the moment a row was updated.
  2. **e2e compared money as formatted strings.** psql renders `10.60`, JSON renders `10.6`, so
     three settlement assertions passed or failed on whether the cents ended in a zero. Added an
     `eqm` numeric comparator.
  3. Also: the suite **debited the demo rider ~GH¢37 every run and never restored it**, so
     "funded wallet pays" was always going to start failing for lack of funds rather than for a
     defect. It now tops the float up when low.
- **e2e 135 → 140** (storefront edit + customer visibility + three guards). All four front-ends
  type-check; customer and vendor apps `expo export --platform web` bundle clean.
- ⚠️ **Front-ends type-check but are not device-verified** — the keyboard lift, the vendor gate,
  the map picker and one-tap cards all need a phone. New `TAP_THROUGH.md` §11 covers them.
  One-tap cards additionally need a **real `PAYSTACK_SECRET_KEY`**; in `mock` no card is ever saved.

### C5 — pull-down map on the ride home (frontend only, no rebuild)
The map was a fixed band across the top: a third visible and no more, on the screen whose entire
job is showing you where you are. It is now **full-screen**, with search / Ride-Shop-Parcel /
composer / recents in a **sheet you can drag down**, leaving the search bar docked at the bottom.
- **PanResponder + Animated**, not a bottom-sheet library — reanimated and gesture-handler are not
  in this app and adding native modules would cost the Expo Go workflow. Drag lives on the handle
  and search row only, so it never fights the ScrollView beneath. A flick beats position on
  release, so throwing it down finishes the throw instead of springing back.
- **Sheet height is exactly `screenH - EXPANDED_Y`.** Taller and the inner ScrollView thinks part
  of its viewport is on screen when it is below the fold, making the last content unreachable —
  it believes there is nothing left to scroll. Worth remembering if the geometry is ever touched.
- `useNativeDriver` off on web (RNW has no native animated module and warns on every call), on
  everywhere else. `canCollapse` guards a viewport too short for the two positions to differ.
- **Verified in a browser, with measurements:** map fills all 812pt of a 375×812 viewport (it was
  a 276pt band), sheet sits at 276 with its bottom flush to the screen edge, and pressing the
  handle really does toggle state.
- ⚠️ **The slide itself was never observed.** The headless pane never composites, so
  `document.hidden` is true and the browser suspends `requestAnimationFrame` — which freezes every
  JS-driven animation, RN's included. I initially read that as "the sheet is broken on web" and
  was wrong; it is a harness limitation and says nothing either way. **The motion needs a device**
  — `TAP_THROUGH.md` §11.
- *Method note for future sessions: the ride home can be reached in a browser without tapping
  through login — mint a token with the e2e `login()` helper and write `accessToken` /
  `refreshToken` into `localStorage`, then load the web export. Measuring the DOM works even
  though screenshots and animation do not.*

### Next
1. **`docs/ISSUES_FROM_TESTING.md` C1** — the last one, to be done alone: unmock driver KYC (real
   driver photo, vehicle photo and licence). Needs the file-storage decision made up front
   (S3/Cloudinary vs a served volume), an upload endpoint, and admin review UI showing the images.
2. **Convert `dest` to a proper nullable type** (retire the `NO_DEST` sentinel). Still outstanding —
   it is the root cause behind A1, and ~8 files read `dest.lat`/`dest.label` directly.
3. **Google Sign-In frontend** — create OAuth client IDs (Web + Android `com.gozone.app` + SHA‑1), set
   `GOOGLE_CLIENT_IDS`, make a **dev build**, add the "Continue with Google" button + add-phone screen.
4. **Before any real deployment**: set `OTP_LOG_CODES=false`, set `GOOGLE_CLIENT_IDS`, tighten the Maps SDK
   key to Android/iOS app restrictions, and rotate every credential in `.env`.
5. Driver/vendor apps lack the client-side Ghana phone helper (`src/lib/phone.ts`) — backend still validates,
   so errors arrive after a round-trip.
6. Per-topic WebSocket authorisation is done for trip/delivery location topics; queue topics stay open (count
   only).
7. Older backlog: vendor self-serve "apply to promote"; ride quote in the parcel composer; external GoZone
   Inc. website; backend catalogue-write API for vendors; driver call via `tel:`; RIDER→PASSENGER backend
   rename (destructive — needs explicit go-ahead).
