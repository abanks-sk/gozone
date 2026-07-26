# GoZone

A Ghana-focused super-app platform combining **ride-hailing**, **multi-vendor commerce**
(food, pharmacy, grocery), and **parcel courier** delivery, plus the operator tooling that
runs it — built as a Spring Boot microservice backend with four separate client apps.

This document is the single entry point for a developer new to the project. It explains what
the system does, how it is put together, where every piece lives, why each decision was made,
and how to run, extend and debug it.

---

## Table of contents

1. [What GoZone is](#1-what-gozone-is)
2. [Quick start](#2-quick-start)
3. [Technology stack and why](#3-technology-stack-and-why)
4. [System architecture](#4-system-architecture)
5. [Repository layout](#5-repository-layout)
6. [The four client apps](#6-the-four-client-apps)
7. [The backend services in detail](#7-the-backend-services-in-detail)
8. [Data model](#8-data-model)
9. [Core flows end to end](#9-core-flows-end-to-end)
10. [State machines](#10-state-machines)
11. [Authentication and authorisation](#11-authentication-and-authorisation)
12. [Real-time layer](#12-real-time-layer)
13. [Money: pricing, fees, commission, settlement](#13-money-pricing-fees-commission-settlement)
14. [Third-party integrations](#14-third-party-integrations)
15. [Security posture](#15-security-posture)
16. [Deliberate simplifications and trade-offs](#16-deliberate-simplifications-and-trade-offs)
17. [Development workflows](#17-development-workflows)
18. [Testing](#18-testing)
19. [Troubleshooting](#19-troubleshooting)
20. [Demo accounts and script](#20-demo-accounts-and-script)
21. [Roadmap](#21-roadmap)

---

## 1. What GoZone is

GoZone is one platform serving three sides of a marketplace across three verticals.

**The three verticals**

| Vertical     | Brand             | What it does                                                                          |
| ------------ | ----------------- | ------------------------------------------------------------------------------------- |
| Ride-hailing | **GoRide**        | Passenger requests a ride, drivers bid, passenger picks, live tracking to destination |
| Commerce     | **GoShop**        | Order from restaurants, pharmacies, groceries — delivery, pickup, or walk-in queue    |
| Courier      | **GoZone Parcel** | Send or receive a parcel; couriers bid the same way drivers do                        |

**The four applications**

| App           | Directory       | Who uses it                            | Platform                 |
| ------------- | --------------- | -------------------------------------- | ------------------------ |
| GoZone        | `customer-app/` | Passengers / shoppers / senders        | Expo (Android, iOS, web) |
| GoZone Driver | `driver-app/`   | Drivers and couriers                   | Expo (Android, iOS, web) |
| GoZone Vendor | `vendor-app/`   | Restaurant / pharmacy / grocery owners | Expo (Android, iOS, web) |
| GoZone Admin  | `admin-web/`    | Platform operators and super admins    | Vite + React (browser)   |

**The five backend services** — one API gateway plus four domain services, each owning its
own database. See [System architecture](#4-system-architecture).

A key design idea worth understanding early: **a parcel is a ride.** A courier carrying a box
is the same primitive as a driver carrying a person — same request table, same bidding, same
live-tracking topic. This avoided building a second matching and tracking system. Likewise the
commerce vertical generalises "restaurant" into **vendor** with a `vendor_type`, so a pharmacy
rides exactly the same order, queue and delivery rails as a restaurant.

---

## 2. Quick start

### Prerequisites

- Docker Desktop (the backend runs entirely in containers)
- Node.js 18+ and npm (for the four client apps)
- A phone with **Expo Go** installed, on the same Wi-Fi as your computer (optional — the apps
  also run in a browser)

### Start the backend

```bash
cd GoZone
cp .env.example .env          # then set JWT_SECRET and INTERNAL_KEY — compose refuses to start without them
docker compose up -d
```

Six containers come up: `gozone-postgres`, `gozone-auth`, `gozone-ride`, `gozone-food`,
`gozone-wallet`, `gozone-gateway`. Flyway applies all database migrations automatically on
each service's first start. Verify:

```bash
docker ps
curl http://localhost:8080/rides/ping      # 401 without a token = gateway is enforcing auth correctly
```

### Seed demo data (first run only)

```bash
docker exec -i gozone-postgres psql -U gozone -d auth_db   < seed/01_auth_seed.sql
docker exec -i gozone-postgres psql -U gozone -d food_db   < seed/02_food_seed.sql
docker exec -i gozone-postgres psql -U gozone -d wallet_db < seed/03_wallet_seed.sql
docker exec -i gozone-postgres psql -U gozone -d ride_db   < seed/04_gps_stream.sql   # optional: scripted GPS
```

**Each seed targets its own service's database** — they are separate. `01` writes `users` and
`driver_kyc` to `auth_db`, `02` writes vendors and catalogue to `food_db`, `03` writes wallets
to `wallet_db`, `04` writes a scripted GPS track to `ride_db`. Running one against
`gozone_main` (the container's default database) will fail with "relation does not exist".

All seed scripts are idempotent — re-running them will not duplicate data.

### Run the client apps

Each app is self-contained and needs its own install. Metro ports are pinned because the
backend occupies 8080–8084.

```bash
cd customer-app && npm install && npm start -- --clear     # port 8090
cd driver-app   && npm install && npm start -- --clear     # port 8091
cd vendor-app   && npm install && npm start -- --clear     # port 8092
cd admin-web    && npm install && npm run dev              # port 5173
```

Press `w` in a Metro terminal to open that app in a browser, or scan the QR code with Expo Go.

> Use `npm start`, **not** `npx expo start` — only the npm script applies the pinned port.

The apps discover the backend automatically: `src/lib/host.ts` derives the API base URL from
the Expo dev-server host, so nothing needs editing when your IP changes. On Windows you may
need to allow inbound TCP on ports 8080 and 8090–8092 through the firewall once.

### Log in

Every demo account signs in with **phone + OTP**. In development the code is printed to the
auth-service log rather than sent by SMS:

```bash
docker logs gozone-auth --tail 30 | grep OTP-DEV
```

Accounts are listed in [section 20](#20-demo-accounts-and-script).

---

## 3. Technology stack and why

### Backend

| Technology                  | Version   | Role                 | Why this choice                                                 |
| --------------------------- | --------- | -------------------- | --------------------------------------------------------------- |
| Java                        | 21        | Language             | LTS; virtual threads and modern language features available     |
| Spring Boot                 | 3.2.5     | Service framework    | Batteries-included web, security, data, validation, actuator    |
| Spring Cloud Gateway        | (BOM)     | API gateway          | Reactive, non-blocking edge routing with filter chain support   |
| Spring Security             | (starter) | AuthN/AuthZ          | Method-level `@PreAuthorize` guards on every sensitive endpoint |
| Spring Data JPA / Hibernate | (starter) | Persistence          | Entity mapping, repository derivation, transaction management   |
| Hibernate Spatial + JTS     | —         | Geospatial types     | Maps PostGIS `geography` columns to Java geometry objects       |
| PostgreSQL                  | 16        | Database             | Mature, transactional, excellent JSON and extension support     |
| PostGIS                     | 3.4       | Geospatial extension | Radius search in metres (`ST_DWithin`) for driver matching      |
| Flyway                      | (core)    | Schema migrations    | Versioned, repeatable, runs automatically at service start      |
| JJWT                        | —         | JWT signing/parsing  | HS512 access tokens validated independently by each service     |
| Spring WebSocket + STOMP    | (starter) | Real-time            | Live driver/courier location and queue updates                  |
| Spring WebFlux              | (starter) | HTTP client          | `WebClient` for service-to-service and third-party calls        |
| Docker Compose              | v3.9      | Orchestration        | One command brings the whole backend up reproducibly            |

### Client apps

| Technology                     | Version  | Role                                                      |
| ------------------------------ | -------- | --------------------------------------------------------- |
| React Native                   | 0.81.5   | Cross-platform UI runtime                                 |
| React                          | 19.1.0   | Component model                                           |
| Expo SDK                       | 54       | Native toolchain, OTA dev workflow, device APIs           |
| expo-router                    | 6        | File-system routing (directory structure = navigation)    |
| TypeScript                     | 5.x      | Static typing across all four apps                        |
| Zustand                        | 4.5      | Client state (auth, cart, drafts, preferences)            |
| Axios                          | 1.7      | HTTP client with interceptors for the bearer token        |
| @stomp/stompjs + sockjs-client | 7 / 1.6  | WebSocket/STOMP client                                    |
| react-native-maps              | 1.20     | Google Maps on device                                     |
| Leaflet (in WebView/iframe)    | —        | Map fallback on web, where react-native-maps has no build |
| react-native-svg               | 15.12    | Vector brand assets and charts                            |
| expo-secure-store              | 15       | Encrypted token storage on device                         |
| expo-location                  | 19       | GPS                                                       |
| Vite + React 18                | 5 / 18.3 | Admin web app (not Expo — it is a desktop browser tool)   |

**Why three separate Expo apps rather than one app with role switching?** The same reason Uber
ships separate rider and driver apps: the three audiences have disjoint navigation, permissions
and update cadences. Bundling them would ship driver code to every passenger, complicate the
permission model, and make the first screen a role chooser. Each app has its own bundle
identifier, icon and store listing.

**Why is the admin app not Expo?** Administration is a desktop, data-dense, multi-column task —
tables, filters and bulk review. A browser app with Vite gives a faster build and a UI idiom
suited to that, with no mobile compromise.

---

## 4. System architecture

```
                       ┌──────────────────────────────────────────┐
   customer-app  ──┐   │            API GATEWAY  :8080            │
   driver-app    ──┼──▶│      Spring Cloud Gateway (reactive)     │
   vendor-app    ──┤   │  · routes by path prefix                 │
   admin-web     ──┘   │  · validates JWT at the edge             │
                       │  · blocks internal-only paths (404)      │
                       │  · answers CORS preflight                │
                       └───────┬───────┬───────┬───────┬──────────┘
                       /auth/**│/rides/│/food/ │/wallet│
                               ▼       ▼       ▼       ▼
                    ┌──────────┐ ┌────────┐ ┌───────┐ ┌──────────┐
                    │  auth    │ │  ride  │ │ food  │ │  wallet  │
                    │  :8081   │ │ :8082  │ │ :8083 │ │  :8084   │
                    └────┬─────┘ └───┬────┘ └───┬───┘ └────┬─────┘
                         │           │          │          │
                    ┌────▼────┐ ┌────▼────┐ ┌───▼───┐ ┌────▼─────┐
                    │ auth_db │ │ ride_db │ │food_db│ │wallet_db │
                    └─────────┘ └─────────┘ └───────┘ └──────────┘
                                     └──────────┴──────────┘
                                    internal REST (X-Internal-Key)
                                    ride/food → wallet on settlement
```

### The rules this architecture follows

1. **The gateway (8080) is the only public entry point.** No client ever calls a service
   directly. Services are reachable on 8081–8084 for local debugging only.
2. **Each service validates JWTs independently.** No service calls auth-service to check a
   token — the shared `JWT_SECRET` allows local verification, so auth is not a runtime
   bottleneck or single point of failure for reads.
3. **No service reads another service's database.** Cross-service communication is API-only.
   The four logical databases live in one Postgres container for convenience, but each service
   holds credentials for exactly one of them.
4. **Services address each other by Docker Compose service name** (`http://wallet-service:8084`),
   never `localhost`.
5. **Money movement is synchronous REST** from ride/food into wallet on completion, protected
   by a shared internal key and made idempotent by reference id. The production answer
   (transactional outbox / saga) is documented but deliberately not built — see
   [trade-offs](#16-deliberate-simplifications-and-trade-offs).

### Why microservices at all?

The verticals have genuinely different scaling and change profiles: ride matching is
write-heavy and latency-sensitive, commerce is read-heavy and catalogue-driven, wallet is
low-volume but correctness-critical. Splitting them lets each be deployed, scaled and reasoned
about independently, and it enforces a clean domain boundary that a single codebase tends to
erode. The cost — network hops, distributed transactions, more moving parts — is acknowledged
in the trade-offs section.

---

## 5. Repository layout

```
GoZone/
├── docker-compose.yml           # brings up postgres + 5 services
├── .env / .env.example          # secrets and integration keys (.env is gitignored)
├── README.md                    # this file
├── HANDOFF.md                   # running change log across development sessions
│
├── contracts/                   # OpenAPI specs — the source of truth for every endpoint
│   ├── auth.yaml  ride.yaml  food.yaml  wallet.yaml
│
├── services/
│   ├── gateway/                 # Spring Cloud Gateway (routing, edge JWT, CORS)
│   ├── auth-service/            # identity, OTP, roles, approvals, KYC   → auth_db
│   ├── ride-service/            # requests, bids, trips, GPS, SOS, maps  → ride_db
│   ├── food-service/            # vendors, catalogue, orders, queue,     → food_db
│   │                            #   deliveries, promos, platform fees
│   └── wallet-service/          # wallets, ledger, commission, Paystack, → wallet_db
│                                #   notifications, push tokens
│
├── customer-app/                # GoZone — passenger / shopper / sender  (Expo)
├── driver-app/                  # GoZone Driver — driver + courier        (Expo)
├── vendor-app/                  # GoZone Vendor — multi-type vendor mgmt  (Expo)
├── admin-web/                   # GoZone Admin — operator console     (Vite + React)
│
├── scripts/
│   └── e2e.sh                   # end-to-end test suite — 103 assertions, see section 18
│
├── postgres-init/               # creates the four logical databases on first boot
├── seed/                        # demo data + maintenance scripts
│   ├── 01_auth_seed.sql         #   users, driver KYC
│   ├── 02_food_seed.sql         #   4 vendors + catalogue (idempotent)
│   ├── 03_wallet_seed.sql       #   wallets, commission config
│   ├── 04_gps_stream.sql        #   scripted GPS track for demos
│   ├── 98_dedupe_menu_items.sql #   repairs catalogues duplicated by old seeds
│   └── 99_clear_stale_demo_data.sql  # resets boards before a presentation (reversible)
│
└── docs/
    ├── architecture.md          # deeper architectural notes
    ├── demo-script.md           # step-by-step presentation walkthrough
    ├── fr-coverage.md           # functional-requirement coverage matrix
    ├── MANUAL.md                # end-user manual
    ├── BUILD_PROGRESS.md        # build history
    └── CUSTOMER_APP_BACKLOG.md  # the customer-app issue list and its resolution
```

### Inside a Spring Boot service

Every service follows the same package structure under `src/main/java/com/gozone/<service>/`:

| Package       | Responsibility                       | Rule                               |
| ------------- | ------------------------------------ | ---------------------------------- |
| `controller/` | Receives HTTP requests, returns DTOs | **No business logic**              |
| `service/`    | All business logic and transactions  | The only place rules live          |
| `repository/` | Spring Data JPA interfaces, queries  | **No business logic**              |
| `model/`      | JPA entities mapping to tables       | Never returned directly to clients |
| `dto/`        | Request and response shapes          | What controllers actually return   |
| `config/`     | Security, WebSocket, beans           |                                    |

Migrations live in `src/main/resources/db/migration/` as `V<n>__description.sql`.
Configuration lives in `src/main/resources/application.yml`.

### Inside an Expo app

```
<app>/
├── app/                    # expo-router: file structure IS the navigation
│   ├── _layout.tsx         # root stack, theme provider, store hydration
│   ├── index.tsx           # splash + redirect based on session
│   └── (group)/            # a route group = a navigation stack or tab set
├── src/
│   ├── api/                # typed HTTP clients, one per backend service
│   ├── components/         # ui.tsx (design system) + brand.tsx (brand kit)
│   ├── store/              # Zustand stores (auth, cart, drafts, preferences)
│   ├── realtime/           # STOMP WebSocket client
│   ├── theme/              # design tokens + light/dark provider
│   ├── lib/                # storage, geocoding, location, session, helpers
│   └── data/               # static catalogue metadata and place fixtures
├── assets/                 # icons, splash, logo
├── app.json                # Expo config: name, icon, splash, bundle ids
└── app.config.js           # injects the Maps key from .env at build time
```

---

## 6. The four client apps

### 6.1 customer-app — GoZone

The consumer app. Three surfaces reachable from circular buttons on every home screen
(Ride / Shop / Parcel), which switch with `router.replace` so the stack never grows.

| Route group | Screens                                                                                                                  | Purpose                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `(rider)/`  | `home`, `live`, `rides`, `schedule`                                                                                      | Compose a ride, live tracking, history, scheduling |
| `(shop)/`   | `restaurants`, `menu`, `item`, `checkout`, `order`, `orders`, `address`, `filter`                                        | Browse vendors, cart, checkout, order tracking     |
| `(parcel)/` | `index`, `details`, `live`                                                                                               | Three-step parcel flow                             |
| top level   | `search`, `map-picker`, `profile`, `account`, `wallet`, `saved-places`, `help`, `about`, `terms`, `privacy`, `add-email`, `add-phone` | Shared utilities                      |

Notable behaviour:

- **Ride flow is layered**: compose on `home` → hand off to `live`, a full-screen map with a
  bottom sheet that moves through searching → driver offers → chosen driver → payment → rating.
- **Parcel mirrors it**: `index` (direction + route) → `details` (size, contents, recipient) →
  `live` (offers → tracking → payment → rating). Every string is direction-aware — "send" and
  "receive" produce different copy throughout.
- **Map phases**: while the driver is coming to you the map shows _driver → pickup_; once the
  trip starts it switches to _pickup → destination_.
- **Maps**: Google Maps on device, Leaflet in a WebView/iframe on web, chosen by platform file
  (`GoogleMap.native.tsx` / `LeafletMap.tsx`).

### 6.2 driver-app — GoZone Driver

| Route                                   | Purpose                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `(driver)/feed`                         | Online/offline toggle, live incoming requests with countdown, Accept / Decline / Counter            |
| `(driver)/trip`                         | Active trip or delivery: staged map, status timeline, GPS push, call customer, cash confirm, rating |
| `(driver)/deliveries`                   | Food-delivery courier feed (Okada class only)                                                       |
| `(driver)/wallet`                       | Earnings: period selector, 7-day chart, ledger                                                      |
| `onboarding`                            | Gated setup — resumable KYC, then "awaiting approval" polling                                       |
| `vehicle`, `profile`, `account`, `add-email`, `add-phone`, `help` | Driver settings                                                           |

The feed polls every 5 seconds and filters server-side by the driver's **vehicle class** and
**service mode**, so a driver only ever sees work they can legally take.

### 6.3 vendor-app — GoZone Vendor

| Route                                                | Purpose                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `(vendor)/orders`                                    | Live order board with vendor switcher, open/closed toggle, status advance, awaiting-cash section |
| `(vendor)/queue`                                     | Walk-in queue: now-calling hero, call-next, live waiting list                                    |
| `(vendor)/menu`                                      | Catalogue: create/edit/delete items with add-on builder (title adapts: Menu ↔ Catalogue)         |
| `(vendor)/earnings`                                  | Revenue dashboard with period selector and 7-day chart                                           |
| `promote`                                            | Apply for a promotion (admin approves by activating it)                                          |
| `onboarding`, `business`, `hours`, `profile`, `account`, `add-email`, `add-phone`, `help` | Setup and settings. `business`/`hours` are the shop; `account` is the owner's own sign-in details |

### 6.4 admin-web — GoZone Admin

Vite + React, no router (simple page-state switch), axios against the same gateway.

| Page        | Purpose                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `Dashboard` | Counts: pending KYC, verified drivers, vendors by type, awaiting approval                                                            |
| `Approvals` | Approve/reject pending drivers and vendors; assign vehicle class                                                                     |
| `Kyc`       | Filter and review driver KYC submissions                                                                                             |
| `Incidents` | SOS alerts raised from trips; mark handled                                                                                           |
| `Promos`    | Create promos (kind, discount terms, target, background image, live preview), activate (= approve vendor applications), hide, delete |
| `Fees`      | Platform service fee % and delivery base/per-km                                                                                      |
| `Payouts`   | Cash-out board: what's owed, mark paid, or mark failed (which refunds the earner)                                                    |
| `Admins`    | Super-admin only: create admin accounts                                                                                              |

Admin login is **username + password, then OTP** to the phone on file — two factors, and no
self-signup: the super admin creates admin accounts.

---

## 7. The backend services in detail

### 7.1 gateway (port 8080)

Spring Cloud Gateway. Routes by path prefix to the four services, and runs a single global
filter (`JwtAuthFilter`, order `-100`) that:

- returns **404** for internal-only paths (`/wallet/commission`, `/wallet/settle`,
  `/wallet/pay/verify`, `/notify`, `/auth/delivery-riders`) — hiding their existence rather
  than confirming it with a 403;
- lets configured public paths through (`app.gateway.public-paths` — all pre-login routes);
- otherwise requires a valid `Authorization: Bearer` JWT, and forwards the decoded subject and
  role as `X-User-Id` / `X-User-Role` headers;
- answers CORS preflight itself so downstream security never sees an `OPTIONS`.

### 7.2 auth-service (port 8081) → `auth_db`

Owns identity for every actor on the platform.

**Endpoints** (`/auth/...`): `register`, `login`, `register-email`, `login-email`,
`login-email-password`, `verify-otp`, `refresh`, `me` (GET profile / PATCH name + username),
`google`, `me/phone`, `me/phone/verify`, `me/email`, `me/email/verify`, `admin/login`,
`admins`, `users`, `users/{id}/status`, `users/{id}/class`, `me/service-mode`, `driver/kyc`
(submit / mine / list / review), `delivery-riders/availability` (internal only).

**Responsibilities**: OTP issuance and verification (with a 5-attempt cap), Ghana phone
normalisation to E.164, password hashing (BCrypt), JWT minting with `role` and `status`
claims, the account profile (name and unique username, plus verified changes of phone and
email), role and account-status management, the driver/vendor approval workflow, vehicle-class
assignment, and driver KYC.

### 7.3 ride-service (port 8082) → `ride_db`

Owns rides **and parcels** — they share one request table.

**Endpoints** (`/rides/...`): `quote`, `requests`, `requests/nearby`, `requests/{id}/status`,
`requests/{id}/bid`, `requests/{id}/bids`, `requests/{id}/bids/{bidId}/accept`, `bids/{id}`,
`trips/mine`, `trips/{id}`, `trips/{id}/status`, `trips/{id}/pay`, `trips/{id}/confirm-cash`,
`trips/{id}/rate`, `trips/{id}/sos`, `trips/{id}/pool-candidates`, `trips/{id}/pool-join`,
`locations`, `sos`, `sos/{id}/handle`, and the Google Maps proxy under `maps/`.

**Key logic**:

- **Nearby matching** — a PostGIS `ST_DWithin` query over `geography` columns (metres), then a
  Java-side `canServe()` filter applying vehicle-class and service-mode rules.
- **Request expiry** — immediate requests expire after 90 seconds, both lazily when polled and
  via a scheduled sweep every 30 seconds, so a passenger is told "no drivers available" rather
  than searching forever.
- **Maps proxy** — holds the billable Google server key so it never reaches a client. Reverse
  geocoding prefers Places "nearby" (real POI names) and filters out plus-codes.
- **Pricing** — see [section 13](#13-money-pricing-fees-commission-settlement).

### 7.4 food-service (port 8083) → `food_db`

Owns the commerce vertical. The service, package (`com.gozone.food`), database and route keep
the "food" name as internal plumbing; the domain entity is **`Vendor`** and the customer-facing
brand is **GoShop**.

**Endpoints** (`/food/...`): `restaurants`, `restaurants/{id}/menu`,
`restaurants/{id}/catalogue`, menu item create/update/delete, `vendors`, `vendors/mine`,
`orders`, `orders/{id}`, `orders/mine`, `orders/{id}/pay`, `orders/{id}/confirm-cash`,
`orders/{id}/status`, `orders/{id}/rate`, `restaurants/{id}/orders`,
`restaurants/{id}/awaiting-cash`, `platform-fees` (get/patch), `deliveries/available`,
`deliveries/mine`, `deliveries/{id}/accept`, `deliveries/{id}/status`,
`deliveries/{id}/confirm-cash`, `deliveries/location`, queue endpoints, and `promos/...`.

**Key logic**: three fulfilment modes (delivery, pickup, walk-in queue) on one order table;
courier delivery records created when an order is marked READY; distance-based delivery fee and
percentage service fee computed at order time; a delivery gate that rejects DELIVERY orders
with a friendly 409 when no active Okada courier exists.

### 7.5 wallet-service (port 8084) → `wallet_db`

Owns money and notifications.

**Endpoints**: `/wallet/balance`, `/wallet/ledger`, `/wallet/topup/initialize`,
`/wallet/topup/verify`, `/wallet/pay/initialize`, `/wallet/pay/verify`, `/wallet/withdrawals`
(request / own history), `/wallet/withdrawals/all` + `/wallet/withdrawals/{id}` (admin payout
board), `/wallet/commission`, `/wallet/settle/{orderId}`, `/wallet/push-token`,
`/wallet/notifications`, `/notify`.

**Key logic**: a double-entry-style ledger, per-pillar commission configuration, Paystack
money-in (initialise, verify) and money-out (transfers) with a manual payout queue as the
fallback, Expo push delivery with an SMS-stub fallback, and idempotent settlement keyed on
reference id so a retry can never double-credit.

---

## 8. Data model

### auth_db

| Table            | Contents                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `users`          | id, phone, email, name, username, password_hash, role, status, vehicle_class, service_mode |
| `otp_codes`      | phone or email, code, expiry, attempt counter                                              |
| `refresh_tokens` | long-lived session tokens                                                                  |
| `driver_kyc`     | licence and vehicle documents, review status                                               |

### ride_db (PostGIS enabled)

| Table              | Contents                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ride_requests`    | rider, origin/dest `geography(POINT)`, seats, proposed fare, status, kind (RIDE\|PARCEL), ride_type, parcel_size, parcel_desc, scheduled_at, rider_phone |
| `bids`             | request, driver, amount, type (ACCEPT\|COUNTER), status, driver name/phone/vehicle/plate/position                                                        |
| `trips`            | request, driver, agreed fare, status, timestamps, payment status/method                                                                                  |
| `trip_passengers`  | locked fare and pickup order per passenger (pooling)                                                                                                     |
| `driver_locations` | latest position per driver (`geography`, upserted)                                                                                                       |
| `ride_ratings`     | two-way ratings                                                                                                                                          |
| `sos_incidents`    | trip, user, position, NEW / HANDLED                                                                                                                      |

### food_db

| Table                               | Contents                                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `restaurants`                       | vendor entity: owner, name, position, status, prep minutes, `vendor_type`                                                                     |
| `menu_items`                        | name, description, **category**, price, availability                                                                                          |
| `addon_groups` / `addon_options`    | option groups (single/multi, required) and priced options                                                                                     |
| `orders`                            | customer, vendor, mode, status, totals, service fee, **discount + promo snapshot**, delivery address/coords, payment status/method            |
| `order_items` / `order_item_addons` | line items and their chosen add-ons                                                                                                           |
| `deliveries`                        | order, courier, status, position                                                                                                              |
| `queue_entries`                     | walk-in position and status                                                                                                                   |
| `promos`                            | promotions: kind (DISCOUNT/BOGO/OTHER), discount type + value, scope (vendor/category/item), image, colour; inactive = pending admin approval |
| `platform_settings`                 | service fee %, delivery base fee, delivery per-km                                                                                             |
| `food_ratings`                      | order ratings                                                                                                                                 |

### wallet_db

| Table               | Contents                                                                              |
| ------------------- | ------------------------------------------------------------------------------------- |
| `wallets`           | balance per owner (user id + owner type)                                              |
| `ledger_entries`    | FARE_CREDIT, COMMISSION_DEBIT, PAYOUT, TOP_UP, REFUND — with `ref_id` for idempotency |
| `commission_config` | rate per pillar — RIDE 18%, FOOD 12%                                                  |
| `withdrawals`       | cash outs: amount, MOMO/BANK destination, PENDING → PROCESSING → PAID / FAILED        |
| `notifications`     | title, body, sent flag                                                                |
| `push_tokens`       | Expo push tokens per user                                                             |

Migration counts: auth **V1–V5**, ride **V1–V7**, food **V1–V8**, wallet **V1–V2**.

---

## 9. Core flows end to end

### 9.1 Ride (and parcel — identical mechanics)

```
Passenger                    ride-service                  Driver
    │                             │                           │
    ├── POST /rides/requests ────▶│  status OPEN, TTL 90s      │
    │                             │◀── GET /requests/nearby ───┤  (polls 5s, filtered by
    │                             │      returns the request   │   vehicle class + mode)
    │                             │◀── POST /requests/{id}/bid ┤  ACCEPT or COUNTER
    │                             │    bid stays PENDING       │
    │◀─ GET /requests/{id}/bids ──┤    name, vehicle, plate,   │
    │   (polls 3s)                │    distance from pickup    │
    ├── POST .../bids/{id}/accept▶│  creates TRIP, request     │
    │                             │  → MATCHED, other bids     │
    │                             │  → REJECTED                │
    │                             │◀── GET /rides/bids/{id} ───┤  sees ACCEPTED + tripId
    │◀═══ WebSocket: driver position ═══════════════════════════┤  POST /rides/locations
    │                             │◀── PATCH /trips/{id}/status┤  ENROUTE → STARTED → COMPLETED
    ├── POST /trips/{id}/pay ────▶│  cash → AWAITING           │
    │                             │◀── POST .../confirm-cash ──┤
    │                             │  → PAID, settle to wallet  │
    ├── POST /trips/{id}/rate ───▶│                            │
```

**Why bids are offers, not instant matches.** A driver pressing Accept does _not_ create a
trip. It creates a pending offer. Multiple drivers can accept the same fare, and the passenger
chooses between them by **distance, vehicle and price** — the inDrive model, and the reason the
offer carries the driver's identity and position. `ACCEPT` is always bound to the passenger's
proposed fare server-side; a driver who wants a different price must `COUNTER`.

### 9.2 Food order with delivery

```
Customer            food-service            Vendor              Courier
   ├── POST /orders ──▶│  PLACED             │                    │
   │                   │◀── PATCH status ────┤ CONFIRMED          │
   │                   │◀── PATCH status ────┤ PREPARING          │
   │                   │◀── PATCH status ────┤ READY → creates delivery record
   │                   │◀── PATCH status ────┤ OUT_FOR_DELIVERY   │
   │                   │◀────────── GET /deliveries/available ────┤
   │                   │◀────────── POST /deliveries/{id}/accept ─┤
   │◀══ WebSocket: courier position ═════════════════════════════─┤
   │                   │◀── PATCH /deliveries/{id}/status ────────┤ PICKED_UP → ENROUTE → DELIVERED
   │                   │  order auto-completes on DELIVERED       │
   ├── POST /orders/{id}/pay ─▶│ cash → AWAITING                  │
   │                   │◀── POST /deliveries/{id}/confirm-cash ───┤
   │                   │  → PAID, settle to vendor's owner wallet │
```

### 9.3 Walk-in queue

Customer places a `WALKIN` order → a `queue_entries` row is created with the next position →
the customer polls their position and receives live updates over WebSocket → the vendor presses
**Call next** (`WAITING → CALLED`) → **Serve** (`→ SERVED`). Cancelling a walk-in order clears
its queue entry automatically.

---

## 10. State machines

```
Trip / parcel run
   MATCHED ──▶ ENROUTE ──▶ STARTED ──▶ COMPLETED
      └──────────┴──────────┴────────▶ CANCELLED

Ride request
   OPEN ──▶ MATCHED
     ├──▶ EXPIRED     (90s with no accepted offer)
     └──▶ CANCELLED

Order
   PLACED ─▶ CONFIRMED ─▶ PREPARING ─▶ READY ─▶ OUT_FOR_DELIVERY ─▶ COMPLETED
      └──────────┴───────────┴──────────┴──────────────┴──────────▶ CANCELLED
   (PICKUP and WALKIN skip OUT_FOR_DELIVERY)

Delivery            ASSIGNED ─▶ PICKED_UP ─▶ ENROUTE ─▶ DELIVERED
Queue entry         WAITING ─▶ CALLED ─▶ SERVED
Driver KYC          PENDING ─▶ VERIFIED | REJECTED
Account status      PENDING ─▶ ACTIVE | REJECTED | SUSPENDED
Payment             UNPAID ─▶ AWAITING (cash) ─▶ PAID
Bid                 PENDING ─▶ ACCEPTED | REJECTED | WITHDRAWN
```

Transitions are validated server-side; an invalid jump is rejected rather than silently applied.

---

## 11. Authentication and authorisation

### Identity methods

| Method                    | Who                       | Flow                                                                               |
| ------------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| Phone + OTP               | Everyone                  | `register`/`login` issues a 6-digit code → `verify-otp` returns tokens             |
| Email + password          | Anyone who added an email | `login-email-password` — no OTP, password verified with BCrypt                     |
| Email + OTP               | Alternate identity        | `register-email` / `login-email` → `verify-otp`                                    |
| Google Sign-In            | Consumers                 | Backend verifies the ID token server-side; **frontend button pending a dev build** |
| Username + password + OTP | Admins only               | `admin/login` checks credentials, then sends an OTP to the phone on file (2FA)     |

Ghana phone numbers are normalised to E.164 (`0201000001`, `233201000001` and `+233201000001`
all resolve to one account), validated client-side and server-side.

### The account profile

`GET /auth/me` is the source of truth for account details; `PATCH /auth/me` edits the two
free-text fields, **name** and **username** (lower-cased, `[a-z0-9._]`, 3–30 characters, unique
across all accounts — 409 if taken). An admin's username is their console login handle, so it
stays super-admin managed and the endpoint refuses to change it.

Phone and email are deliberately **not** editable there — they are login credentials, so each
changes through its own verify-by-code flow, and the new value is only attached once the code
checks out:

| Change | Step 1                                | Step 2                        |
| ------ | ------------------------------------- | ----------------------------- |
| Phone  | `POST /auth/me/phone` → SMS a code    | `POST /auth/me/phone/verify`  |
| Email  | `POST /auth/me/email` (+ password)    | `POST /auth/me/email/verify`  |

Both reject a value already in use on another account (409). The apps keep a persisted
`profileStore` cache of this profile so the greeting, avatar and phone render instantly on
launch, but every write goes to the API first and the account screen re-reads `/auth/me` on
focus. The cache is user-scoped and wiped by `lib/session.ts` on logout and on every fresh
login, so no identity leaks between accounts.

### Roles and the status gate

Roles: `RIDER`, `DRIVER`, `COURIER`, `RESTAURANT_OWNER`, `ADMIN`, `SUPER_ADMIN`.

The access JWT carries both `role` and `status` claims. Each service's JWT filter converts them
into Spring Security authorities: `ROLE_<role>` and `STATUS_<status>`. That makes two
independent checks expressible on any endpoint:

```java
@PreAuthorize("hasAnyRole('DRIVER','COURIER') and hasAuthority('STATUS_ACTIVE')")
```

So a driver who has signed up but is **not yet approved** can obtain a token (they need one to
reach the onboarding screen) but cannot see the request feed or place a bid. `SUSPENDED` and
`REJECTED` accounts are refused a token outright.

### The approval workflow

Consumers are `ACTIVE` immediately. Drivers and vendors start `PENDING`:

```
sign up ──▶ PENDING ──▶ resumable in-app setup ──▶ submit ──▶ admin reviews ──▶ ACTIVE
   (driver: licence + vehicle + documents · vendor: business name, type, location)
```

Both apps poll `/auth/me` from an "awaiting approval" screen and advance automatically the
moment an admin approves. Admins additionally assign a **vehicle class** to car drivers at
approval time (Okada and Truck are inferred automatically at signup).

### Vehicle-class routing

| Class      | Rides                 | Parcels    | Food delivery |
| ---------- | --------------------- | ---------- | ------------- |
| `OKADA`    | Okada rides           | Small      | Yes           |
| `STANDARD` | Standard rides        | Medium     | No            |
| `LUXE`     | Standard + Luxe rides | Medium     | No            |
| `CARGO`    | None                  | Large only | No            |

Combined with a **service mode** (Rides / Deliveries / Both), this determines exactly what
appears in a driver's feed. Enforced server-side in `RideService.canServe()`.

---

## 12. Real-time layer

One shared WebSocket/STOMP layer serves three purposes:

| Topic                                | Publisher            | Subscriber              |
| ------------------------------------ | -------------------- | ----------------------- |
| `/topic/trip/{tripId}/location`      | Driver GPS push      | Passenger's live screen |
| `/topic/delivery/{orderId}/location` | Courier GPS push     | Customer's order screen |
| `/topic/queue/{restaurantId}`        | Vendor queue actions | Waiting customers       |

Security: a STOMP `ChannelInterceptor` validates the JWT on **CONNECT** and rejects
unauthenticated sockets. Location topics additionally check on **SUBSCRIBE** that the caller is
a participant of that trip or delivery (or an admin). Queue topics require authentication but
no participant check — they carry counts only.

Clients show a **stale indicator** if no position arrives within ~6 seconds, and the flows also
poll REST endpoints, so a dropped socket degrades rather than breaks the experience.

---

## 13. Money: pricing, fees, commission, settlement

### Ride pricing (server-authoritative)

`POST /rides/quote` computes:

```
fare = max(minFare, (base + perKm × haversineKm) × typeMultiplier × surge)
```

| Knob         | Default                         | Env override               |
| ------------ | ------------------------------- | -------------------------- |
| base         | 5.00                            | `app.pricing.base`         |
| per km       | 2.20                            | `app.pricing.per-km`       |
| minimum fare | 5.00                            | `app.pricing.min-fare`     |
| surge        | 1.00                            | `app.pricing.surge`        |
| peak surge   | 1.25 (07:00–09:00, 17:00–19:00) | `app.pricing.peak-surge`   |
| rule version | `p1`                            | `app.pricing.rule-version` |

Every quote is stamped with its `ruleVersion`, so a fare can always be explained after the
fact. The apps display the server quote and fall back to a local formula only if the call
fails. Parcels use the same engine: small → Okada rate, medium/large → Standard, plus a
size fee.

### Commerce fees

Vendors set item prices. The platform adds, at order time:

- a **service fee** — a percentage of the goods **after any discount** (default 5%);
- a **delivery fee** — `base + perKm × haversine(vendor → customer)` (default 2.00 + 1.50/km).

Both are admin-controlled from the Fees page and stored in `platform_settings`. The customer
sees a live breakdown at checkout.

### Promotions and discounts

A promotion is either **money the platform takes off**, or **an offer the vendor honours** —
the distinction decides whether any arithmetic runs.

| Kind       | Who settles it                | Effect on the total                                      |
| ---------- | ----------------------------- | -------------------------------------------------------- |
| `DISCOUNT` | **The platform**, at checkout | Reduces the order total                                  |
| `BOGO`     | The vendor, in person         | None — recorded on the order so both sides see the terms |
| `OTHER`    | The vendor, in person         | None — same, with free-text terms                        |

Every promo has a **scope**, which decides both what a discount covers and where tapping the
card takes the customer:

| Scope      | Covers                              | Card links to                       |
| ---------- | ----------------------------------- | ----------------------------------- |
| `VENDOR`   | The vendor's whole menu / catalogue | That vendor's menu                  |
| `CATEGORY` | One `menu_items.category` within it | The menu, scrolled to that category |
| `ITEM`     | One specific dish or product        | That item's page                    |

This works for **every vendor type** — a pharmacy or grocery runs promotions exactly like a
restaurant.

**The discount calculation** (`FoodService.applyPromos`):

```
eligible = Σ line totals the promo's scope covers   (add-ons included, as charged)
amount   = PERCENT ? eligible × value / 100
                   : min(fixed value, eligible)
discount = min(best amount across promos, subtotal)
total    = (subtotal − discount) + serviceFee + deliveryFee
```

Deliberate rules, each defensible:

- **The single best discount wins — they never stack.** Overlapping campaigns would otherwise
  drive a total toward zero, and one reduction is explainable to a customer.
- **A fixed amount never exceeds what it applies to**, and the total discount never exceeds
  the subtotal — an order can't go negative.
- **A percentage is capped at 90%** at creation time.
- **The service fee is charged on the discounted goods**, so a promotion genuinely costs the
  platform its cut too rather than being funded entirely by the vendor.
- **Terms are snapshotted onto the order** (`promo_label`, `promo_notes`), so history stays
  truthful after a promo is edited, deactivated or deleted.

**Who can create one.** An admin creates promos directly (live immediately) from the Promos
page, choosing a background image, colour, target and terms. A vendor applies from
**Profile → Promote my business**, and their promo is created **inactive** — an admin
activating it _is_ the approval, so a vendor can never put their own discount live.

The customer app previews the discount at checkout using `src/lib/promos.ts`, which mirrors the
server's rules; the server recomputes authoritatively when the order is actually placed.

### Commission and settlement

Commission is configured per pillar in `commission_config`: **rides 18%**, **food 12%**.

Settlement is gated on `status == COMPLETED && paymentStatus == PAID` — a driver or vendor
cannot trigger a payout by advancing status without the customer having paid. It runs from both
the completion point and the payment point, and is **idempotent on reference id**, so
double-triggering is safe. The wallet endpoints that move money require the shared
`X-Internal-Key` header and are blocked at the gateway edge, so no client can call them.

### Payment methods

| Method              | Behaviour                                                                           |
| ------------------- | ----------------------------------------------------------------------------------- |
| Wallet              | Debited immediately                                                                 |
| Card / Mobile Money | Paystack checkout → server verifies the reference before marking paid               |
| Cash                | Status `AWAITING` until the driver, courier or vendor confirms receipt in their app |

An unverified Paystack reference is **rejected** — a client cannot fake a payment by claiming
one.

### Cash out (money leaving GoZone)

Drivers, couriers and vendors move earned money out from the Earnings tab. `POST
/wallet/withdrawals` **debits the wallet immediately**, so the same balance can never be cashed
out twice while a payout is in flight, and one open cash out per wallet is allowed at a time.
The floor is `app.payout.min-amount` (default GH¢10) and the caller's id comes from the token,
never the body.

The service then tries to send the money through Paystack Transfers:

| Outcome                            | Status       | What happens next                                      |
| ---------------------------------- | ------------ | ------------------------------------------------------ |
| Provider accepts the transfer      | `PROCESSING` | Money is on its way; the transfer code is recorded     |
| No provider, or it refuses         | `PENDING`    | Sits on the **admin Payouts board** with the reason    |
| Admin marks paid                   | `PAID`       | Terminal; the debit stands                             |
| Admin marks failed                 | `FAILED`     | Held amount is **refunded** (once) and the earner told |

Every step is a ledger entry (`PAYOUT` on request, `REFUND` on failure, both tagged
`refType=WITHDRAWAL`), so a balance can always be reconstructed from the ledger. Account
numbers are returned masked to their last 4 digits.

Two honest limits: automatic transfers need a **registered** Paystack business (a starter
account is refused, and that refusal is passed through verbatim to the payout board), and
**bank** payouts are queued for manual sending because Paystack needs a bank code rather than
the free-text bank name the app collects — mobile money uses real network codes (MTN / VOD /
ATL) and takes the automatic path.

---

## 14. Third-party integrations

All credentials live in the gitignored `GoZone/.env`. **Every integration fails soft**: if a
key is missing or a provider errors, the previous mock behaviour takes over, so a demo never
breaks because of a third party.

| Key                                   | Used by           | Behaviour when blank                           |
| ------------------------------------- | ----------------- | ---------------------------------------------- |
| `JWT_SECRET`, `INTERNAL_KEY`          | all services      | **Required** — compose refuses to start        |
| `SUPERADMIN_PASSWORD`                 | auth              | A random password is generated and logged once |
| `PAYSTACK_SECRET_KEY`                 | wallet            | `mock` serves a local sandbox checkout page    |
| `GOOGLE_MAPS_SERVER_KEY`              | ride (maps proxy) | Straight-line routes, no place search          |
| `MAIL_USERNAME` / `MAIL_APP_PASSWORD` | auth              | Email codes are logged instead of sent         |
| `SMS_PROVIDER` + `AT_*` / `TWILIO_*`  | auth              | OTP is logged instead of sent                  |
| `GOOGLE_CLIENT_IDS`                   | auth              | Audience check skipped — **development only**  |
| `OTP_LOG_CODES`                       | auth              | Default `true`; **set `false` in production**  |
| `EXPO_ACCESS_TOKEN`                   | wallet            | Push falls back to the logged SMS stub         |

App-side keys are separate: `customer-app/.env` and `driver-app/.env` hold
`GOOGLE_MAPS_API_KEY` for map _rendering_ only, injected by `app.config.js` so the key is never
committed in `app.json`. The billable server key stays behind the ride-service proxy.

---

## 15. Security posture

Two rounds of security review were completed; the fixes are in place.

**Authentication and secrets**

- No secret has a committed default. `JWT_SECRET` and `INTERNAL_KEY` are required environment
  variables and Docker Compose refuses to start without them.
- Tokens are HS512, validated locally by each service; the gateway validates at the edge as well.
  Every verifier **requires the `iss` and `aud` claims**, so a token minted elsewhere is refused
  even if it is well-formed.
- **Access tokens live 1 hour** — they cannot be revoked, so a short life is what ends them.
  Refresh tokens live 7 days, are stored only as hashes, are **single-use** (rotated on every
  refresh, so a captured one dies as soon as the real client refreshes), and are **revocable**:
  `POST /auth/logout` revokes the presented token, or every session with `allDevices`. All four
  clients call it on sign-out, and all four silently refresh on a 401 so the short TTL is
  invisible to users.
- OTP codes are capped at 5 wrong attempts before being consumed.
- The seeded super admin gets a random password unless one is supplied.

**Authorisation**

- Role and account-status guards on every sensitive endpoint (`@PreAuthorize`).
- Ownership checks in service methods: only a trip's participants can read it, only a vendor's
  owner can manage its orders and catalogue, only the assigned courier can advance a delivery.
- The driver feed and all delivery endpoints are role-gated, so a customer cannot enumerate
  other passengers' pickup coordinates or claim deliveries.

**Money**

- Wallet settlement requires the internal key, is idempotent per reference, and only fires when
  an order or trip is both completed and paid.
- `ACCEPT` binds the passenger's fare server-side; a driver cannot accept at an arbitrary price.
- Paystack references are verified server-side before anything is marked paid.

**Edge**

- Internal-only paths return 404 at the gateway.
- WebSocket CONNECT is authenticated; location topics enforce participation on SUBSCRIBE.
- **Rate limiting** ahead of the JWT check: 40 requests/minute per IP on sign-in and OTP
  endpoints, 600/minute otherwise, answered with `429` and `Retry-After`. The limits are sized
  to absorb carrier NAT (many Ghanaian subscribers share one address, so a per-person limit
  would lock out a whole network); guessing one account's code is bounded far more tightly by
  the 5-attempt OTP cap. Counting is in-memory per gateway instance — running more than one
  instance means moving to the Redis-backed limiter.

**Known remaining items** (documented, not hidden): **RS256** — signing is still HS512 with one
shared secret, so every service holds what it would need to mint tokens, not just verify them;
tighter CORS and TLS termination; a dependency (SCA) scan; and distributed rate limiting for a
multi-instance gateway. Login returns 404 for an unknown identifier — an intentional UX choice
("no account found — sign up") accepted as a minor enumeration trade-off.
See **`docs/DEPLOYMENT.md`** for the full pre-launch checklist.

---

## 16. Deliberate simplifications and trade-offs

These are conscious engineering decisions, not gaps in the implementation. Being able to
explain _why_ each one was made is more valuable than pretending they do not exist.

| Simplification                 | What was built instead                                                                                            | Why                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pooling**                    | Corridor + bearing match with a haversine fair-share split, a flat distance threshold, and a `rule_version` stamp | True en-route pooling needs route geometry, detour tolerance and ETA caps — a system in its own right. An existing passenger's locked fare is never recomputed. |
| **Cross-service transactions** | Synchronous REST from ride/food to wallet, made idempotent by reference id                                        | The production answer is a transactional outbox or saga. Documented as the next step; building it would not change what the demo shows.                         |
| **OTP / SMS**                  | Real provider integration that logs the code when no key is set                                                   | Lets the system be demonstrated without spending on SMS, while proving the real path works.                                                                     |
| **KYC verification**           | Placeholder document URLs plus an admin approve/reject toggle                                                     | Real identity verification requires a third-party vendor and legal agreements. The workflow around it is complete and real.                                     |
| **Payments**                   | Real Paystack integration, with a mock checkout when the key is `mock`                                            | Full PSP behaviour including server-side verification, demonstrable without live funds.                                                                         |
| **GPS in demos**               | Scripted waypoint streams alongside real device GPS                                                               | A phone sitting on a desk does not move; the scripted stream makes tracking demonstrable indoors.                                                               |
| **Profile cache**              | `PATCH /auth/me` writes through to auth-service, with a persisted local cache in front of it                       | The cache exists for instant first paint and offline reads, not as the record — the server answer always wins and the cache is cleared between accounts.        |
| **Push notifications**         | Real Expo Push, falling back to a logged SMS stub, recording which channel was used                               | The one genuinely real external integration in the original scope.                                                                                              |

**Things intentionally not built** (documented rather than implemented): station-fill and queue
priority passes, WhatsApp as a channel, Twi localisation beyond string externalisation,
featured listings and premium placement, and a real payment service provider beyond Paystack.

---

## 17. Development workflows

### Contract-first

The OpenAPI specs in `contracts/` are the source of truth. **Update the contract in the same
change as the endpoint** — code and contract must never drift. If the backend endpoint does not
exist yet, mock it on the frontend rather than blocking.

### Adding an endpoint

1. Update `contracts/<service>.yaml`.
2. Add the DTOs in `dto/`.
3. Add the business logic in `service/` — including any ownership or role check.
4. Add the controller method in `controller/`, with `@PreAuthorize` if it is sensitive.
5. Add the typed client method in each app's `src/api/`.
6. Rebuild that service and test.

### Adding a database column

**Schema changes go through Flyway only** — never `ddl-auto` and never manual SQL against a
running database.

1. Create `V<next>__description.sql` in that service's `db/migration/`.
2. Add the field to the JPA entity (`ddl-auto: validate` will fail the service on a mismatch —
   this is intentional and catches drift at boot).
3. Expose it in the DTO if clients need it, and update the contract.
4. Rebuild — Flyway applies the migration on start.

### Rebuilding after a backend change

```bash
docker compose build <service-name>
docker compose up -d <service-name>
```

If a parallel build is flaky, build services one at a time. After a frontend dependency or
asset change, restart Metro with `npm start -- --clear`.

### Conventions

- Constructor injection, never field injection.
- Controllers return DTOs, never entities.
- Every service exposes `GET /{base}/actuator/health`.
- Environment-specific values come from environment variables, never hardcoded.
- Java classes `PascalCase`; database tables `snake_case`; endpoints lowercase-with-hyphens.

### Definition of done

Code written · contract updated · runs under `docker compose up` · tested via the e2e script or
a device · committed with a clear message.

---

## 18. Testing

### Automated end-to-end suite

```bash
docker compose up -d          # the stack must be healthy first
bash scripts/e2e.sh
```

`scripts/e2e.sh` exercises the entire platform against a running stack and prints pass/fail for
every assertion, finishing with a summary. Requires `docker` (it reads OTP codes from the
auth-service log), `curl` and `python`. Override the target with
`GOZONE_GATEWAY=http://host:8080 bash scripts/e2e.sh`.

It covers, in order: container and health checks · authentication for all six demo accounts
with role, vehicle-class and status assertions · the server pricing quote · the **full ride
lifecycle** (request → pending offer → offer details → passenger picks → trip → GPS → status
advance → cash payment → **verified wallet settlement** → rating → history) · vehicle-class
routing (an Okada courier sees a small parcel, a Standard driver does not) · the **full food
lifecycle** (order with fees → vendor advances → courier accepts, delivers → auto-complete →
cash → **verified vendor settlement**) · walk-in queue · promos, the **discount engine** (scopes, best-wins,
fee-after-discount, guard rails) and the vendor apply/admin-approve loop · SOS to the admin board · admin console endpoints · six security
spot-checks.

Latest run: **103 assertions, all passing.**

**What it leaves behind:** one completed ride and one completed food order, plus the wallet
credits they generate. Both are terminal, so they do not clutter the driver feed or vendor
board. Everything else it creates is cancelled, handled or deleted before it exits.

> ⚠️ The queue test calls "call next", which serves whoever is at the **front of that vendor's
> queue** — not necessarily the script's own entry. If you have staged a walk-in customer for a
> demo, run the suite _before_ staging, or re-stage afterwards.

### Type checking

```bash
cd customer-app && npx tsc --noEmit     # repeat for driver-app, vendor-app, admin-web
cd admin-web && npm run build           # production build
```

### Manual device testing

Register a phone in each app, take the OTP from `docker logs gozone-auth | grep OTP-DEV`, and
walk the demo script in `docs/demo-script.md`.

---

## 19. Troubleshooting

| Symptom                              | Cause and fix                                                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every call returns 500               | A downstream service is down. `docker ps` — if `gozone-auth` exited, the gateway 500s. Restart it.                                                                      |
| Compose refuses to start             | `JWT_SECRET` or `INTERNAL_KEY` is unset. Copy `.env.example` to `.env` and set both.                                                                                    |
| Cannot log in                        | Check the gateway's `app.gateway.public-paths` includes the pre-login route you are calling.                                                                            |
| Driver sees no requests              | The driver must be **ACTIVE** (approved), **online**, within the search radius, and of a class that can serve that request type. Requests also expire after 90 seconds. |
| "No account found" on login          | Correct behaviour — `/auth/login` never creates a user. Sign up first.                                                                                                  |
| Routes or place search stop working  | The Google server key is IP-restricted and home IPs rotate. Check `docker logs gozone-ride \| grep MAPS`; restrict to a `/24` range rather than a single IP.            |
| A vendor's earnings look empty       | Vendor wallets are keyed by the **owner's user id**, not the vendor entity id.                                                                                          |
| Menu items appear two or three times | An old non-idempotent seed. Run `seed/98_dedupe_menu_items.sql`. Current seeds cannot cause this.                                                                       |
| Vendor board full of old orders      | Run `seed/99_clear_stale_demo_data.sql` against `food_db` and `ride_db` (reversible — statuses are backed up).                                                          |
| Phone cannot reach the backend       | Same Wi-Fi, and Windows Firewall needs inbound TCP on 8080 and the Metro port.                                                                                          |

---

## 20. Demo accounts and script

All accounts sign in with **phone + OTP**; read the code from
`docker logs gozone-auth --tail 30 | grep OTP-DEV`.

| App      | Role                | Phone                                                                      | Name         |
| -------- | ------------------- | -------------------------------------------------------------------------- | ------------ |
| Customer | RIDER               | `+233201000001`                                                            | Ama Mensah   |
| Customer | RIDER               | `+233201000007`                                                            | Kojo Rider   |
| Driver   | DRIVER (Standard)   | `+233201000002`                                                            | Kwame Driver |
| Driver   | DRIVER (Standard)   | `+233201000003`                                                            | Yaw Driver   |
| Driver   | COURIER (**Okada**) | `+233201000005`                                                            | Kofi Courier |
| Vendor   | RESTAURANT_OWNER    | `+233201000004`                                                            | Adwoa Vendor |
| Admin    | ADMIN               | `+233201000006`                                                            | GoZone Admin |
| Admin    | SUPER_ADMIN         | username `superadmin` + `SUPERADMIN_PASSWORD`, then OTP to `+233201000000` | Super Admin  |

> The seeded UUIDs are referenced by food and wallet data — **do not delete these users.**
> Kofi Courier being Okada class is what keeps food delivery working.

### Suggested demo order

1. **Ride** — passenger requests; driver (online first) sees it and accepts; passenger compares
   offers by distance and picks; live map; complete; cash; settle; rate.
2. **Shop** — browse vendor types, order with add-ons, vendor advances the board, courier
   delivers with live tracking, pay, vendor earnings update.
3. **Parcel** — send and receive, showing the direction-aware flow and class routing.
4. **Walk-in queue** — place, call next, serve.
5. **Admin** — approvals with vehicle-class assignment, KYC, promos, fees, SOS incidents.

Timing note: an unaccepted request expires after 90 seconds, so bring the driver online before
the passenger requests.

---

## 21. Roadmap

**Blocked on external setup**

- Google Sign-In frontend — needs OAuth client IDs and a development build (it cannot run in
  Expo Go, which does not accept the `exp://` redirect).
- Native app icons and splash are prepared in each app's `assets/` and wired into `app.json`;
  they take effect in a development or store build.

**Before any production deployment**

- Set `OTP_LOG_CODES=false`, populate `GOOGLE_CLIENT_IDS`, restrict the Maps SDK keys to
  Android/iOS app signatures, and rotate every credential in `.env`.
- Move to RS256 (issuer and audience validation, short access tokens with refresh-token
  revocation, and gateway rate limiting are already in place — see `docs/DEPLOYMENT.md`).

**Product backlog**

- A dedicated parcel backend (parcels currently reuse `/rides/requests`).
- Replacing synchronous settlement with a transactional outbox.
- Renaming `RIDER` to `PASSENGER` across the backend — deliberately deferred because it is a
  destructive migration touching four services for a cosmetic gain.

---

## Further reading

| Document               | Contents                                                   |
| ---------------------- | ---------------------------------------------------------- |
| `docs/architecture.md` | Deeper architectural notes and diagrams                    |
| `docs/DEPLOYMENT.md`   | Pre-launch checklist: credentials, TLS, keys, known gaps    |
| `docs/demo-script.md`  | Step-by-step presentation walkthrough                      |
| `docs/fr-coverage.md`  | Functional-requirement coverage matrix                     |
| `docs/MANUAL.md`       | End-user manual                                            |
| `HANDOFF.md`           | Chronological change log — the "why" behind specific fixes |
| `contracts/*.yaml`     | Authoritative API specifications                           |
