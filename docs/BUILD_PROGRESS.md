# GoZone — Build Progress

Last updated: 2026-06-25

## Milestone Status

| Milestone | Status | Notes |
|-----------|--------|-------|
| M1 — Skeleton + Infrastructure | ✅ DONE | Monorepo, docker-compose, 5 skeleton services, all Flyway schemas |
| M2 — Auth + Gateway + Contracts | ✅ DONE | Full auth service, JWT filter in all services, 4 OpenAPI contracts |
| M3 — Ride Happy Path | ✅ DONE | Full ride service: request → bid → trip state machine + pooling + WebSocket + ratings + SOS stub |
| M4 — Food Happy Path | ✅ DONE | Restaurants, menu, orders (all 3 modes), delivery tracking, walk-in queue, ratings |
| M5 — Wallet + Notifications | ✅ DONE | Mock ledger, commission splits, REAL Expo push + SMS stub fallback |
| M6 — Integration + Differentiators | ✅ DONE | Ride→Wallet and Food→Wallet REST calls wired; wallet settlement live |
| M7 — Freeze + Demo Path | 🔲 IN PROGRESS | Seed data done; app screens and admin TBD |

## M1 — Done ✅

**What's built:**
- Monorepo structure per Section 13 of playbook: `contracts/`, `services/`, `app/`, `seed/`, `docs/`
- `git init` + `.gitignore` (Java/Spring + Node/Expo + Postgres)
- `docker-compose.yml`: one `postgis/postgis:16-3.4-alpine` Postgres (4 logical DBs), 5 service containers
- `postgres-init/init.sql`: creates `auth_db`, `ride_db` (PostGIS), `food_db`, `wallet_db`
- All 5 Dockerfiles (multi-stage Maven + JRE-alpine)
- All 5 `pom.xml` (Spring Boot 3.2.5, Java 21)
- All 5 `Application.java` main classes
- Stub controllers for ride, food, wallet (`/ping` protected endpoint each)
- Flyway `V1__baseline.sql` for all 4 services (full production schema)
- `app/` Expo skeleton: `package.json`, `tsconfig.json`, `app.json`
- `app/src/api/client.ts`: Axios client + refresh interceptor
- `app/src/store/authStore.ts`: Zustand auth store
- `app/src/realtime/wsClient.ts`: STOMP WebSocket client with stale indicator

## M2 — Done ✅

**What's built:**
- Spring Cloud Gateway: routes `/auth/**`, `/rides/**`, `/food/**`, `/wallet/**`, `/notify`
  - `/notify` rewritten to `/wallet/notify`
  - `JwtAuthFilter.java` (GlobalFilter): validates JWT, forwards X-User-Id + X-User-Role headers
  - Public paths: `/auth/register`, `/auth/verify-otp`, `/auth/refresh`, any `*/actuator/*`
- Auth service — full implementation:
  - `User`, `OtpCode`, `RefreshToken`, `DriverKyc` entities + Flyway migration
  - `JwtService`: issues access tokens, validates claims
    (as built: 24h, HS256 shared secret — now 1h and RS256; see README §11)
  - `AuthService`: register+OTP (logged to console), verify OTP, refresh rotation, me, KYC submit/review
  - `AuthController`: `POST /register`, `POST /verify-otp`, `POST /refresh`, `GET /me`, `POST /driver/kyc`, `PATCH /driver/kyc/{id}`
  - `SecurityConfig`: stateless, JWT filter, permits `/register` + `/verify-otp` + `/refresh` + `/actuator/**`
- Shared JWT validation in ride, food, wallet (each has `JwtProperties` + `SecurityConfig` with `OncePerRequestFilter`)
- OpenAPI contracts published in `contracts/`: `auth.yaml`, `ride.yaml`, `food.yaml`, `wallet.yaml`

## M3 — Done ✅

**What's built (ride-service):**
- Models: `RideRequest`, `Bid`, `Trip`, `TripPassenger` (composite PK + locked_fare/rule_version), `DriverLocation`, `RideRating`
- Repositories: PostGIS native query `ST_DWithin` for nearby feed; `ON CONFLICT DO UPDATE` upsert for driver locations
- `RideService`: createRequest, nearbyRequests, placeBid (ACCEPT→match/COUNTER→pending), updateTripStatus (MATCHED→ENROUTE→STARTED→COMPLETED), pushLocation (upsert + WebSocket broadcast), poolCandidates (corridor match), poolJoin (haversine fair-share, locked_fare immutable, rule_version v1), rateTrip, sos stub
- `RideController`: 9 endpoints (`/requests`, `/requests/nearby`, `/requests/{id}/bid`, `/trips/{id}/status`, `/trips/{id}/pool-candidates`, `/trips/{id}/pool-join`, `/locations`, `/trips/{id}/rate`, `/trips/{id}/sos`)
- `WebSocketConfig`: STOMP over SockJS, `/topic/trip/{id}/location` for live ride tracking
- DTOs: `CreateRideRequestDto`, `RideRequestResponse`, `BidRequestDto`, `BidResponse`, `TripStatusUpdateDto`, `TripResponse`, `LocationUpdateDto`, `RatingRequestDto`, `PoolJoinRequest`, `PoolJoinResponse`

## M4 — Done ✅

**What's built (food-service):**
- Models: `Restaurant`, `MenuItem`, `Order` (DELIVERY/PICKUP/WALKIN), `OrderItem`, `Delivery` (ASSIGNED→PICKED_UP→ENROUTE→DELIVERED), `QueueEntry` (WAITING→CALLED→SERVED), `FoodRating`
- Repositories: standard JPA derivation queries
- `FoodService`: listOpenRestaurants, getMenu, placeOrder (auto-enqueue walk-in), advanceStatus (validates state machine, creates Delivery on READY for delivery orders), updateDeliveryLocation (WebSocket broadcast on /topic/delivery/{id}/location), advanceDeliveryStatus, getQueue, myQueuePosition, callNext, serveQueueEntry, rateOrder
- `FoodController`: 15 endpoints covering all 3 order modes, restaurant dashboard, delivery, queue, ratings
- `WebSocketConfig`: STOMP — /topic/delivery/{id}/location (courier tracking), /topic/queue/{restaurantId} (queue updates)
- Auto-broadcasts queue position updates on every status change for walk-in orders

## M5 — Done ✅

**What's built (wallet-service):**
- Models: `Wallet`, `LedgerEntry`, `CommissionConfig` (seeded RIDE=18%, FOOD=12%), `PushToken`, `Notification`
- `WalletService`: ensureWallet (get-or-create), getBalance, getLedger, settleRide (credit driver net, commission to platform), settleOrder (credit restaurant net, commission to platform), payoutCourier (mock payout)
- `NotificationService`: registerPushToken, send (REAL Expo Push via WebClient, fallback to SMS stub logged to console), getNotifications — channel recorded in DB
- `WalletController`: `/balance`, `/ledger`, `/commission` (internal ride settlement), `/settle/{orderId}` (food settlement), `/push-token` (register/deregister), `/notifications`
- `NotifyController`: full `SendNotificationRequest` → `notificationService.send()`

## M6 — Done ✅

**What's wired:**
- `WalletClient` in ride-service: `POST /wallet/commission` on trip COMPLETED
- `WalletClient` in food-service: `POST /wallet/settle/{orderId}` on order COMPLETED (or delivery DELIVERED)
- Both use WebClient (spring-boot-starter-webflux added to ride and food pom.xml)
- Architecture note: sync REST for demo; outbox/saga pattern documented in architecture.md as production answer

## M7 — In Progress 🔲

**Seed data done:**
- `seed/01_auth_seed.sql`: 7 demo users (rider, 2 drivers, restaurant owner, courier, admin, rider2) + KYC pre-approved
- `seed/02_food_seed.sql`: 2 restaurants + 8 menu items (Accra, Ghana lat/lng)
- `seed/03_wallet_seed.sql`: platform wallet (GH₵10,000 float), driver/rider/restaurant wallets
- `seed/04_gps_stream.sql`: initial driver location at Kotoka Airport
- `seed/run_gps_demo.sh`: scripted GPS playback (Airport → Osu) via REST API calls

**Still needed:**
- App screens: Rider home, Driver feed, Food browse, Restaurant dashboard, Wallet screen
- Admin screen: KYC approve, counts, incident list stub
- FR coverage matrix (`docs/fr-coverage.md`)
- Full demo script run-through verification

## M2 Gate check (run after `docker compose up`)

```bash
# 1. Register
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"+233501234567","role":"RIDER"}'

# 2. Check auth service logs for OTP
docker logs gozone-auth 2>&1 | grep OTP-MOCK

# 3. Verify OTP
TOKEN=$(curl -s -X POST http://localhost:8080/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+233501234567","code":"<OTP>"}' | jq -r .accessToken)

# 4. Hit stub on every service through the gateway
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/rides/ping
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/food/ping
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/wallet/ping
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/auth/me
```

## M3 Gate check

```bash
# Driver fetches nearby requests (PostGIS radius, no auth for demo convenience)
curl -H "Authorization: Bearer $DRIVER_TOKEN" \
  "http://localhost:8080/rides/requests/nearby?lat=5.6052&lng=-0.1674&radiusKm=5"

# Rider creates request
curl -X POST http://localhost:8080/rides/requests \
  -H "Authorization: Bearer $RIDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"originLat":5.6052,"originLng":-0.1674,"destLat":5.6120,"destLng":-0.1950,"proposedFare":30.00}'

# Driver bids (ACCEPT)
curl -X POST "http://localhost:8080/rides/requests/{id}/bid" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"ACCEPT","amount":30.00}'
```

## M4 Gate check

```bash
# List open restaurants
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/food/restaurants

# Place delivery order
curl -X POST http://localhost:8080/food/orders \
  -H "Authorization: Bearer $RIDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"restaurantId":"bbbbbbbb-0000-0000-0000-000000000001","mode":"DELIVERY","deliveryAddr":"15 Oxford Street, Osu","items":[{"menuItemId":"<uuid>","qty":2}]}'

# Place walk-in order (auto-enqueued)
curl -X POST http://localhost:8080/food/orders \
  -H "Authorization: Bearer $RIDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"restaurantId":"bbbbbbbb-0000-0000-0000-000000000001","mode":"WALKIN","items":[{"menuItemId":"<uuid>","qty":1}]}'

# Check queue position
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/food/orders/{orderId}/queue-position
```

## Stubbed vs Built

| Feature | State |
|---------|-------|
| OTP send | STUBBED — printed to logs |
| SMS send | STUBBED — logged to console, channel recorded |
| Payments | MOCK LEDGER — entries always succeed |
| KYC verification | STUBBED — admin toggle |
| GPS | SCRIPTED — seed/run_gps_demo.sh + REST push |
| Push notifications | REAL — Expo Push API via WebClient (M5) |
| Ride tracking WebSocket | BUILT — /topic/trip/{id}/location (M3) |
| Delivery tracking WebSocket | BUILT — /topic/delivery/{id}/location (M4, reuses ride primitive) |
| Queue WebSocket | BUILT — /topic/queue/{restaurantId} (M4) |
| Ride→Wallet settlement | BUILT — sync REST POST /wallet/commission (M6) |
| Food→Wallet settlement | BUILT — sync REST POST /wallet/settle/{orderId} (M6) |
| Simplified pooling | BUILT — corridor match + haversine fair-share + locked_fare (M3) |
