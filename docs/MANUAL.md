# GoZone — Owner's Manual

A practical, self-serve guide to the whole system: what each piece is, **where it lives**, how to run it,
and **how to change things yourself**. Paths are relative to the repo root (`GoZone/`).

> Companion docs: `HANDOFF.md` (chronological log of everything built + why), `CLAUDE.md` (condensed rules),
> `gozone_build_playbook.html` (original spec), `docs/architecture.md`, `docs/CUSTOMER_APP_BACKLOG.md`.

---

## 0. Table of contents
1. [The mental model](#1-the-mental-model)
2. [Repository map](#2-repository-map)
3. [How to run everything](#3-how-to-run-everything)
4. [Logins, OTP, and seeded data](#4-logins-otp-and-seeded-data)
5. [The backend, service by service](#5-the-backend-service-by-service)
6. [The apps, app by app](#6-the-apps-app-by-app)
7. [How the pieces talk (auth, routing, real-time, money)](#7-how-the-pieces-talk)
8. [Common "how do I change X" recipes](#8-common-how-do-i-change-x-recipes)
9. [Security model (what protects what)](#9-security-model)
10. [Rebuild cheat-sheet](#10-rebuild-cheat-sheet)
11. [Conventions & gotchas](#11-conventions--gotchas)

---

## 1. The mental model

GoZone is a Ghana "super-app": **rides + shop/food + parcels**, plus operator tools.

**4 client apps** (each is its own project, its own `npm install`):

| App | Folder | Who uses it | Stack |
|---|---|---|---|
| **Customer** ("GoZone") | `customer-app/` | Passengers (role `RIDER`) | Expo / React Native / TS |
| **Driver** ("GoZone Driver") | `driver-app/` | Drivers & couriers (`DRIVER`, `COURIER`) | Expo / React Native / TS |
| **Vendor** ("GoZone Vendor") | `vendor-app/` | Shops (`RESTAURANT_OWNER`) | Expo / React Native / TS |
| **Admin** | `admin-web/` | Admins (`ADMIN`, `SUPER_ADMIN`) | Vite + React (web, **not** Expo) |

**1 gateway + 4 backend services** (Spring Boot, Java 21), one shared PostGIS Postgres with 4 logical DBs:

| Service | Folder | Port | DB | Owns |
|---|---|---|---|---|
| **Gateway** | `services/gateway/` | 8080 | — | The only public entry; validates JWT at the edge, routes to services |
| **auth** | `services/auth-service/` | 8081 | `auth_db` | phone/email + OTP, JWT, KYC, admin, approvals, vehicle class |
| **ride** | `services/ride-service/` | 8082 | `ride_db` (PostGIS) | ride/parcel requests, bids, trips, pooling, ratings, ride payment, quotes |
| **food** | `services/food-service/` | 8083 | `food_db` | vendors, menus, add-ons, orders, deliveries, walk-in queue, promos, platform fees |
| **wallet** | `services/wallet-service/` | 8084 | `wallet_db` | ledger, commission split, payouts, notifications (real Expo Push) |

**Golden rules of the architecture** (from `CLAUDE.md`):
- Apps only ever call the **gateway** (`http://<host>:8080`), never a service directly.
- Each service **re-validates the JWT itself** (defence in depth) — services trust the token, not headers.
- No service reads another service's DB. Cross-service = REST (only wallet settlement + notify, via an
  internal key).

---

## 2. Repository map

```
GoZone/
├── docker-compose.yml        # brings up postgres + all 5 backend services
├── .env                      # YOUR real secrets (gitignored) — JWT_SECRET, INTERNAL_KEY
├── .env.example              # template; `copy .env.example .env` then fill in
├── build.bat / build-local.ps1  # Windows build helpers
├── HANDOFF.md                # full history of what was built + why (read this for context)
├── CLAUDE.md                 # condensed rules the AI follows
│
├── contracts/                # OpenAPI specs = source of truth for the API
│   ├── auth.yaml  ride.yaml  food.yaml  wallet.yaml
│
├── services/                 # ── BACKEND ──
│   ├── gateway/              # Spring Cloud Gateway (edge JWT + routing)
│   ├── auth-service/          # + Flyway migrations in src/main/resources/db/migration
│   ├── ride-service/          # + PostGIS
│   ├── food-service/
│   └── wallet-service/        # wallet + notifications
│
├── customer-app/             # ── PASSENGER APP ──
├── driver-app/               # ── DRIVER/COURIER APP ──
├── vendor-app/               # ── VENDOR APP ──
├── admin-web/                # ── ADMIN WEB (Vite) ──
│
├── postgres-init/            # creates the 4 logical DBs on first container boot
├── seed/                     # demo data SQL (run after `up`)
└── docs/                     # architecture.md, demo-script.md, this MANUAL.md, backlog, FR matrix
```

**Every Spring service has the same shape** (`services/<svc>/src/main/java/com/gozone/<svc>/`):
```
controller/   # HTTP endpoints — no business logic, returns DTOs
service/      # business logic lives here
repository/   # Spring Data JPA interfaces (DB access)
model/        # @Entity classes (map to DB tables)
dto/          # request/response records
config/       # SecurityConfig (JWT filter), WebSocketConfig, JwtProperties, etc.
```
Plus `src/main/resources/application.yml` (config) and `db/migration/V*.sql` (Flyway schema).

**Every Expo app has the same shape**:
```
app/                 # expo-router: file = route. `_layout.tsx` = the stack; folders (x) are route groups
src/api/             # axios clients (client.ts sets base URL + attaches token); ride.ts, shop.ts, wallet.ts
src/store/           # zustand state (authStore, cart, drafts, profile, …) — persisted via lib/storage
src/lib/             # helpers: storage, session (clearUserData), geocode, location, pricing, routes, webAlert
src/components/      # ui.tsx (design system), brand.tsx (dark onboarding kit), LeafletMap.tsx
src/theme/           # tokens.ts (colors/space), ThemeProvider.tsx (useTheme)
src/realtime/        # wsClient.ts (STOMP websocket)
```

---

## 3. How to run everything

### Prerequisites
- **Docker Desktop** (for the backend + DB)
- **Node.js 18+** and **npm** (for the apps)
- **Expo Go** on your phone (SDK 54) — or run the apps on web

### Step 1 — Backend (once per machine: create `.env`)
```
cd GoZone
copy .env.example .env
```
Open `.env` and set **real** values (they're already generated for you if I ran the secret step):
```
JWT_SECRET=<long random string>
INTERNAL_KEY=<random string>
```
Compose **refuses to start** without these (by design — no committed secrets). Then:
```
docker compose build
docker compose up -d
```
Seed demo data (note the container name + DB):
```
docker exec -i gozone-postgres psql -U gozone -d gozone_main < seed/01_auth_seed.sql
docker exec -i gozone-postgres psql -U gozone -d gozone_main < seed/02_food_seed.sql
docker exec -i gozone-postgres psql -U gozone -d gozone_main < seed/03_wallet_seed.sql
docker exec -i gozone-postgres psql -U gozone -d gozone_main < seed/04_gps_stream.sql
```
Check health: `docker ps` — all `gozone-*` containers should be **Up**. If every call 500s, `gozone-auth`
probably exited; restart it.

### Step 2 — An app
```
cd customer-app        # or driver-app / vendor-app
npm install            # first time only (a project .npmrc sets legacy-peer-deps)
npx expo start
```
- Press **`w`** for web (uses `http://localhost:8080`).
- **Phone:** scan the QR in Expo Go; phone + PC on the **same Wi-Fi**. The API base URL auto-detects the PC's
  IP (`src/api/client.ts → resolveBaseUrl()`), so no manual editing. Windows may need a firewall rule:
  `New-NetFirewallRule -DisplayName "GoZone Gateway" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080` (admin).
- **Current location** on a phone needs `npx expo install expo-location` in `customer-app/` + `driver-app/`.

### Step 3 — Admin web
```
cd admin-web
npm install
npm run dev            # http://localhost:5173
```

---

## 4. Logins, OTP, and seeded data

**OTP is mocked to the logs** — it is never texted/emailed. To get a code:
```
docker logs gozone-auth --tail 50 2>&1 | grep OTP-MOCK
# [OTP-MOCK] phone=+233201000001 code=482915 expires_in=5m
# [OTP-MOCK] email=you@example.com code=...
```

**Seeded users** (`seed/01_auth_seed.sql`), all phone `+2332010000XX`:

| Phone | Role |
|---|---|
| `+233201000001`, `…007` | RIDER (customer) |
| `+233201000002`, `…003` | DRIVER (already ACTIVE) |
| `+233201000004` | RESTAURANT_OWNER (owns the seeded vendors) |
| `+233201000005` | COURIER |
| `+233201000006` | ADMIN |

**Super admin** (created at auth-service startup by `SeedRunner`): username `superadmin`, a **random** password
printed to the auth-service logs on first boot, phone `+233201000000`. Admin login = username + password → OTP.

**Seeded vendors** (`seed/02_food_seed.sql`): Kofi Kitchen + Accra Grill House (both owned by `…004`), plus
MedPlus Pharmacy and FreshMart Grocery.

> **Approval gate:** a freshly signed-up **driver/vendor is `PENDING`** and lands on an "awaiting approval"
> screen — it never reaches the feed/dashboard. Approve it in **Admin web → Approvals**, or test with the
> seeded **ACTIVE** driver `+233201000002`.

---

## 5. The backend, service by service

General notes:
- **Config** for each service: `services/<svc>/src/main/resources/application.yml` (port, DB, JWT secret,
  internal key, service-specific `app.*` knobs like `app.pricing.*`, `app.delivery.*`).
- **Schema** is Flyway-only: add a `V<N>__name.sql` in `db/migration/`; it auto-applies on next boot.
  `ddl-auto: validate` means entities must match the DB exactly.
- **Auth in a service:** `config/SecurityConfig.java` runs a JWT filter that sets the Spring principal to the
  token's `sub` (user id) and adds `ROLE_<role>` + `STATUS_<status>` authorities. Endpoints read the caller
  via `@AuthenticationPrincipal String userId` and gate with `@PreAuthorize(...)`.

### auth-service (`:8081`, `auth_db`)
- **Endpoints** (`controller/AuthController.java`): `/register`, `/login`, `/register-email`, `/login-email`,
  `/verify-otp`, `/refresh`, `/me`, `/admin/login`, `/admins`, `/users?status=`, `/users/{id}/status`,
  `/users/{id}/class`, `/me/service-mode`, `/driver/kyc` (+ `/mine`, list, review).
- **Logic** (`service/AuthService.java`): OTP issue/verify (5-guess cap), phone E.164 normalization, register
  (409 if exists) vs login (404 if not), email variants, admin create/approve, **vehicle class** assignment,
  **service mode**. `service/JwtService.java` mints the HS256 token (claims: `sub`, `role`, `status`, `phone`).
- **Models** (`model/`): `User` (phone/email/username/passwordHash/role/status/**vehicleClass**/serviceMode),
  `OtpCode`, `RefreshToken`, `DriverKyc`.
- **Migrations:** V1 baseline → V2 profiles/approval → V3 email → V4 vehicle_class → V5 otp_attempts.

### ride-service (`:8082`, `ride_db` PostGIS)
- **Endpoints** (`controller/RideController.java`): `/quote` (server fare), `/requests` (create),
  `/requests/nearby` (driver feed — role-gated), `/requests/{id}/status`, `/requests/{id}/bid`,
  `/requests/{id}/bids` + `…/accept`, `/trips/{id}` + `/status` + `/pay` + `/confirm-cash`, `/trips/mine`,
  pooling, `/locations`, `/trips/{id}/rate`, `/trips/{id}/sos`.
- **Logic** (`service/RideService.java`): `quote()` = `(base + perKm×haversine) × type × surge`; `createRequest`
  (carries **kind** RIDE/PARCEL, **rideType**, **parcelSize/desc**); `placeBid` (ACCEPT binds the **rider's**
  proposed fare; blocks self-bidding); `nearbyRequests(lat,lng,r,class,mode)` filters by driver class/mode;
  `settleIfPaid` (only pays out when **COMPLETED && PAID**). `service/WalletClient.java` calls wallet with the
  internal key.
- **Models:** `RideRequest` (geo `origin`/`dest` as `geography`), `Bid`, `Trip`, `TripPassenger`,
  `DriverLocation`, `RideRating`.
- **Config knobs** (`application.yml`): `app.pricing.*` (base, per-km, min-fare, surge, peak-surge),
  `app.pooling.*`.

### food-service (`:8083`, `food_db`)
- **Endpoints** (`controller/FoodController.java` + `PromoController.java`): `/restaurants` (open list),
  `/restaurants/{id}/menu` (GET public / **POST create**), `/restaurants/{id}/catalogue` (owner, all items),
  `/menu-items/{id}` (PATCH/DELETE, owner), `/orders` (place), `/orders/{id}` + `/status` + `/pay` +
  `/confirm-cash`, `/restaurants/{id}/orders` + `/awaiting-cash`, `/deliveries/*` (courier, role-gated),
  queue endpoints, `/vendors` + `/vendors/mine`, `/platform-fees` (GET public / **PATCH admin**), `/promos`.
- **Logic** (`service/FoodService.java`): `placeOrder` (server-authoritative pricing — re-resolves menu +
  add-on prices from the DB, adds admin **service fee** + distance **delivery fee**), catalogue CRUD with
  `requireOwner`, **add-on groups/options**, deliveries, queue, `settleOrderIfPaid`. `PromoService`.
- **Models:** `Vendor`, `MenuItem` (+ `description`, `groups`), `AddonGroup`, `AddonOption`, `Order`,
  `OrderItem` (+ `addons`), `OrderItemAddon`, `Delivery`, `QueueEntry`, `FoodRating`, `Promo`,
  `PlatformSettings` (the admin fee config, single row id=1).
- **Migrations:** V1 → V2 vendor_type → V3 promos → V4 order_payments → V5 platform_fees → V6 menu_item_desc
  → V7 addons.

### wallet-service (`:8084`, `wallet_db`)
- **Endpoints** (`controller/WalletController.java`): `/balance?ownerType=`, `/ledger`, `/push-token`,
  `/notifications`, and **internal-only** `/commission` + `/settle/{orderId}` (guarded by `X-Internal-Key`).
  `controller/NotifyController.java`: internal `/notify`.
- **Logic** (`service/WalletService.java`): `settleRide`/`settleOrder` (commission split, **idempotent** via
  `existsByRefIdAndType`), `payoutCourier`. `service/NotificationService.java` sends real **Expo Push**.
- **Models:** `Wallet`, `LedgerEntry`, `CommissionConfig`, `Notification`, `PushToken`.

---

## 6. The apps, app by app

**Routing (all Expo apps use `expo-router`):** a file in `app/` **is** a route. `app/_layout.tsx` defines the
root `<Stack>` and hydrates the stores. Folders in `(parentheses)` are **route groups** with their own
`_layout.tsx`. `app/index.tsx` is the splash + redirect. Navigate with `router.push('/path')`.

**State:** `src/store/*.ts` (zustand). Anything persisted uses `src/lib/storage.ts` (SecureStore on native,
localStorage on web). On logout/login, `src/lib/session.ts → clearUserData()` wipes every user-scoped store
(so no data leaks between accounts).

**API:** `src/api/client.ts` (axios: base URL + attaches the bearer token + refresh-on-401). Feature clients:
`ride.ts`, `shop.ts`, `wallet.ts`.

**Theme:** `src/theme/tokens.ts` + `ThemeProvider.tsx`; call `const { colors: c } = useTheme()` and use
`c.text`, `c.primary`, `c.bg`, etc. Light/dark via Profile → Appearance.

### Customer app (`customer-app/`)
- **Route groups:** `(rider)/` (home, live tracking, schedule, rides history), `(shop)/` (restaurants, menu,
  item, checkout, order, orders, filter, address), `(parcel)/` (compose, track). Top-level: `welcome`,
  `auth/`, `profile`, `account`, `wallet` ("Payment"), `saved-places`, `help`, `about`, `terms`, `privacy`,
  `search`, `map-picker`.
- **Key stores:** `authStore` (phone+email login/register/verify), `profileStore` (name/username/email/phone),
  `paymentStore` (methods + saved cards), `savedPlacesStore` (home/work/custom), `favouritesStore`,
  `recentsStore`, `shopCart`, `shopFilter`, `rideDraft`.
- **Maps:** `src/components/LeafletMap.tsx` (Leaflet in a WebView/iframe — no native map, works on web + Expo
  Go). `src/lib/geocode.ts` (Nominatim) + `src/lib/location.ts` (GPS). Ride pricing in `src/lib/pricing.ts`.

### Driver app (`driver-app/`)
- `(driver)/` tabs: **feed** (online toggle, real-location + name, class-filtered incoming requests, bid/counter),
  **trip** (status timeline, GPS, rate passenger, confirm cash), **deliveries** (food courier feed), **wallet**
  (earnings). Top-level: `onboarding` (gated KYC + vehicle selection + awaiting-approval), `account`, `vehicle`,
  `profile`, `help`.
- **Stores:** `authStore`, `driverStore` (online/active trip), `driverSetupStore` (KYC draft), `vehicleStore`,
  `profileStore`.

### Vendor app (`vendor-app/`)
- `(vendor)/` tabs: **orders** (vendor switcher, open/closed, advance status, awaiting-cash), **queue**
  (call-next), **menu/catalogue** (backend-backed CRUD + **add-on builder**), **earnings**. Top-level:
  `onboarding` (business setup + awaiting-approval), `business`, `hours`, `profile`, `help`.
- **Stores:** `authStore`, `vendorStore` (selected business + open), `vendorSetupStore`, `businessStore`.

### Admin web (`admin-web/`) — Vite, not Expo
- `src/App.tsx` = auth gate + simple page switch (no router). `src/pages/`: `Login` (username+password→OTP),
  `Dashboard` (counts), `Approvals` (approve/reject drivers+vendors, **assign vehicle class**), `Kyc`,
  `Admins` (super-admin creates admins), `Promos`, `Fees` (edit service % + delivery base/per-km).
- `src/api/client.ts` calls the gateway `:8080`; token in `localStorage`.

---

## 7. How the pieces talk

- **Auth flow:** app → `POST /auth/login` (or register) → OTP printed to logs → `POST /auth/verify-otp` →
  `{ accessToken (24h), refreshToken (7d) }`. The app stores them (`lib/storage`) and `client.ts` attaches
  `Authorization: Bearer <token>` to every request; on 401 it silently refreshes.
- **Gateway edge check:** `services/gateway/.../filter/JwtAuthFilter.java` validates the token and forwards.
  **Public (pre-login) paths** are driven by `app.gateway.public-paths` in `gateway/application.yml` — add any
  new pre-login route there or it'll be 401'd at the edge.
- **Real-time (live GPS / queue):** STOMP over WebSocket. Server: `config/WebSocketConfig.java` in ride + food
  (auth interceptor validates the JWT on CONNECT). Client: `src/realtime/wsClient.ts` (subscribes to
  `/topic/trip/{id}/location`, `/topic/delivery/{orderId}/location`, `/topic/queue/{restaurantId}`).
- **Money:** ride/food compute totals server-side, then on **paid + completed** call wallet
  `/commission`/`/settle` with the `X-Internal-Key` header (`WalletClient.java`). Wallet settlement is
  idempotent. Commission rates live in the `commission_config` table (`wallet_db`).

---

## 8. Common "how do I change X" recipes

**Change ride pricing (base fare / per-km / surge):** edit `app.pricing.*` in
`services/ride-service/src/main/resources/application.yml` (or set env vars), rebuild ride-service. Logic in
`RideService.quote()`.

**Change platform fees (service % / delivery rates):** these are **admin-editable at runtime** — Admin web →
**Fees**. Defaults live in the `platform_settings` seed row / `V5__platform_fees.sql`. Applied in
`FoodService.placeOrder`.

**Change commission split:** the `commission_config` table in `wallet_db` (`RIDE`/`FOOD` rates), used by
`WalletService`.

**Add a field to a menu item (e.g. "spicy"):**
1. `food-service`: add a Flyway `V8__...sql` (`ALTER TABLE menu_items ADD COLUMN ...`).
2. Add the field + getter/setter to `model/MenuItem.java`.
3. Expose it in `dto/MenuItemResponse.java` (and `CreateMenuItemRequest` if vendors set it).
4. Rebuild food-service. Read it in the apps via `src/api/shop.ts` (`MenuItem` type) + the menu/item screens.

**Add a new API endpoint (general recipe):**
1. Update the OpenAPI spec in `contracts/<svc>.yaml` (source of truth).
2. Add the method to `controller/<Svc>Controller.java` (thin — delegate to the service).
3. Add the logic to `service/<Svc>Service.java`; add a `@PreAuthorize` / ownership check.
4. If it's pre-login, also add the path to the gateway's `app.gateway.public-paths`.
5. Rebuild that service; add a client method in the app's `src/api/*.ts`.

**Add a new screen to an app:** create `app/<name>.tsx` (or inside a `(group)/`). Register it in the app's
`app/_layout.tsx` `<Stack.Screen name="<name>" />`. Navigate with `router.push('/<name>')`.

**Add a persisted store (app state):** copy the pattern in `src/store/paymentStore.ts` (zustand + `storage` +
`reset()` + `hydrate()`), hydrate it in `app/_layout.tsx`, and add its `reset()` to `src/lib/session.ts`
`clearUserData()` so it clears on logout.

**Restrict an endpoint to a role/status:** add `@PreAuthorize("hasAnyRole('DRIVER','COURIER') and
hasAuthority('STATUS_ACTIVE')")` to the controller method (the JWT filter already provides `ROLE_*` and
`STATUS_*` authorities).

**Change what ride/parcel type goes to which driver:** the routing rules live in
`RideService.nearbyRequests(...)` (class/mode/type/size filtering). Vehicle classes are assigned in
Admin → Approvals and stored on `User.vehicleClass`.

**Change a color / spacing globally:** `src/theme/tokens.ts` in each app.

**Change seeded demo data:** edit `seed/*.sql`, then re-run that seed file (see §3). To wipe and reseed the DB,
`docker compose down -v` (destroys data) then `up` + re-seed.

---

## 9. Security model

- **JWT (HS256):** issued by auth on verify-otp; shared secret `JWT_SECRET` (env only, no code default).
  Carries `sub`, `role`, `status`. Verified at the gateway **and** re-verified in every service.
- **Account status:** SUSPENDED/REJECTED can't get a token; PENDING can log in (for onboarding) but privileged
  actions (`placeBid`, courier endpoints) require `STATUS_ACTIVE`.
- **Ownership:** trip/order/delivery/menu mutations assert the caller owns the resource (`requireOwner`,
  participant checks) — not just a valid token.
- **Money endpoints:** wallet settlement + notify are **internal-only** (`X-Internal-Key`, no code default) and
  **idempotent**; totals are always computed server-side (clients can't set prices).
- **OTP:** capped at 5 wrong guesses (then consumed). Real secrets live only in `.env` (gitignored).
- Full history of the fixes is in `HANDOFF.md` (search "Security review"). Remaining low-risk polish is listed
  there too (generic error copy, OTP request rate-limit, Spring Boot bump, per-topic WS authz).

---

## 10. Rebuild cheat-sheet

After a **backend** change, rebuild only the service you touched:
```
docker compose build <svc>-service && docker compose up -d <svc>-service
```
| You changed… | Rebuild |
|---|---|
| pricing, ride matching, bids, trips, quotes | `ride-service` |
| menu/catalogue, add-ons, orders, deliveries, fees, promos | `food-service` |
| login/OTP/JWT, KYC, approvals, vehicle class | `auth-service` |
| wallet, commission, settlement, notifications | `wallet-service` |
| gateway routes / public paths | `gateway` |

After a **contract** change (`contracts/*.yaml`): no rebuild needed by itself — it documents the API; update
the matching controller + app client.

After an **app** change: just save — Metro hot-reloads. New native deps (e.g. `expo-location`) need
`npx expo install <dep>` + a Metro restart. New env in `docker-compose.yml`/`.env` needs `up` again.

---

## 11. Conventions & gotchas

- **Windows / cmd:** use `copy` not `cp`; don't put `#` inline comments in commands (cmd treats `#` as an arg).
- **Contract-first:** update `contracts/*.yaml` in the same change as any endpoint change — don't let code and
  contract drift.
- **`ddl-auto: validate`:** if an entity and the DB disagree, the service **won't start**. Always change schema
  via a Flyway migration that matches the entity.
- **Secrets:** `.env` is gitignored and **required** — compose won't start without `JWT_SECRET` + `INTERNAL_KEY`.
  Never commit real secrets; regenerate per environment (`openssl rand -base64 48`).
- **Backend can't be compiled in this workspace** — changes are verified by review; watch the `docker compose
  build` output for the service you touched.
- **Expo Go quirks handled already** (don't reintroduce): zustand CommonJS in `metro.config.js`,
  `expo-notifications` removed, `Alert.alert` web shim (`lib/webAlert.ts`), SecureStore web shim
  (`lib/storage.ts`), `userInterfaceStyle: automatic` for dark mode. See `HANDOFF.md §5`.
- **Add-ons:** vendor-created items get real, server-priced add-ons; the seeded demo items keep frontend-only
  add-ons from `src/data/shopCatalog.ts` (no backend option ids).
- **"No driver requests?"** check: (1) driver is **ACTIVE/approved** (not stuck on PENDING), (2) online toggle
  on, (3) location resolved (feed shows the place name), (4) customer pickup within ~50 km.
```
