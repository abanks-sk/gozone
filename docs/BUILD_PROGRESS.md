# GoZone — Build Progress

Last updated: 2026-06-25

## Milestone Status

| Milestone | Status | Notes |
|-----------|--------|-------|
| M1 — Skeleton + Infrastructure | ✅ DONE | Monorepo, docker-compose, 5 skeleton services, all Flyway schemas |
| M2 — Auth + Gateway + Contracts | ✅ DONE | Full auth service, JWT filter in all services, 4 OpenAPI contracts |
| M3 — Ride Happy Path | 🔲 TODO | ride request → bid → match → trip state machine |
| M4 — Food Happy Path | 🔲 TODO | restaurants, menu, orders (pickup + walkin), restaurant dashboard |
| M5 — Wallet + Notifications | 🔲 TODO | ledger, commission, Expo push, SMS stub |
| M6 — Integration + Differentiators | 🔲 TODO | pooling, live tracking, delivery courier, cross-service calls |
| M7 — Freeze + Demo Path | 🔲 TODO | full demo script, seed data, admin screen, FR matrix |

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
  - `JwtService`: issues 24h access tokens (HS256, shared secret), validates claims
  - `AuthService`: register+OTP (logged to console), verify OTP, refresh rotation, me, KYC submit/review
  - `AuthController`: `POST /register`, `POST /verify-otp`, `POST /refresh`, `GET /me`, `POST /driver/kyc`, `PATCH /driver/kyc/{id}`
  - `SecurityConfig`: stateless, JWT filter, permits `/register` + `/verify-otp` + `/refresh` + `/actuator/**`
- Shared JWT validation in ride, food, wallet (each has `JwtProperties` + `SecurityConfig` with `OncePerRequestFilter`)
- OpenAPI contracts published in `contracts/`: `auth.yaml`, `ride.yaml`, `food.yaml`, `wallet.yaml`

**M2 Gate check (run after `docker compose up`):**
```bash
# 1. Register
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"+233501234567","role":"RIDER"}'

# 2. Check auth service logs for OTP (e.g., 123456)
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

## Stubbed vs Built

| Feature | State |
|---------|-------|
| OTP send | STUBBED — printed to logs |
| SMS send | STUBBED — will be logged |
| Payments | STUBBED — ledger entries only |
| KYC verification | STUBBED — admin toggle |
| GPS | STUBBED — scripted streams for demo (M7) |
| Push notifications | NOT YET — Expo Push coming in M5 |
| Ride tracking WebSocket | NOT YET — coming in M6 |
| Pooling | NOT YET — coming in M6 |

## Next: M3 — Ride Happy Path

Build:
- Ride request POST endpoint (origin/dest/seats/proposedFare → OPEN)
- Driver nearby feed (PostGIS radius query)
- Bid flow (ACCEPT → trip created, COUNTER → rider can accept)
- Trip state machine: MATCHED → ENROUTE → STARTED → COMPLETED
- PostGIS driver location upsert
- Rider + driver screens in the app
