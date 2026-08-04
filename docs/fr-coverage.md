# GoZone — FR Coverage Matrix

> Status key: ✅ BUILT | ⚡ STUBBED | 🚫 CUT (documented only)

## Authentication & Identity

| FR | Description | Status | Notes |
|----|-------------|--------|-------|
| FR-01 | Phone + OTP registration | ✅ | OTP logged to console (mock) |
| FR-02 | JWT access token (1h) + refresh token (7d, revocable) | ✅ | RS256: auth signs, services verify with the public key |
| FR-03 | RBAC: RIDER / DRIVER / RESTAURANT_OWNER / COURIER / ADMIN | ✅ | Spring @PreAuthorize + JWT role claim |
| FR-04 | Driver KYC submission (licence, vehicle, doc URL) | ✅ | |
| FR-05 | KYC admin review (VERIFIED / REJECTED) | ✅ | Admin screen + PATCH /driver/kyc/{id} |
| FR-06 | Token refresh rotation | ✅ | SHA-256 hashed, single-use |

## GoRide (Ride Hailing)

| FR | Description | Status | Notes |
|----|-------------|--------|-------|
| FR-10 | Rider creates ride request (origin/dest/fare) | ✅ | |
| FR-11 | Driver nearby feed (PostGIS ST_DWithin radius) | ✅ | Default 5km radius |
| FR-12 | Driver places bid (ACCEPT → match, COUNTER → pending) | ✅ | |
| FR-13 | Trip state machine: MATCHED→ENROUTE→STARTED→COMPLETED | ✅ | Validated transitions |
| FR-14 | Live driver location tracking via WebSocket/STOMP | ✅ | /topic/trip/{id}/location, 4s stale indicator |
| FR-15 | Long-poll fallback on WebSocket disconnect | ⚡ | Client shows stale indicator; polling not built |
| FR-16 | Simplified en-route pooling (corridor + haversine fair-share) | ✅ | Reachable from both apps. Three gates: destination corridor radius, pickup detour from the road still to be driven, and bearing agreement. `rule_version=v1`. **Locked fare is no longer immutable** — it tracks occupancy from each passenger's own solo fare, capped at it (a ceiling, not a ratchet, so a joiner leaving does not leave the driver short) |
| FR-17 | Pool join: fair-share quote | ✅ | Each passenger pays their own solo fare × an occupancy discount (25% per extra passenger, floored). Two at 75% pays the driver 150% of one fare, so the discount comes out of the extra passenger rather than the driver. Payment, cash confirmation and history are per passenger; the wallet settles once, when everyone has paid |
| FR-18 | Two-way ratings (rider rates driver, driver rates rider) | ✅ | 1–5 score + comment |
| FR-19 | SOS button (toast + log) | ⚡ | Logs [SOS-STUB] to server; no real alerting |
| FR-20 | Trip share (log only) | 🚫 | CUT per de-scope ladder |

## GoBite (Food Delivery)

| FR | Description | Status | Notes |
|----|-------------|--------|-------|
| FR-30 | Browse open restaurants | ✅ | |
| FR-31 | View menu (available items only) | ✅ | |
| FR-32 | Place delivery order | ✅ | +GH₵2 base fee |
| FR-33 | Place pickup order | ✅ | No delivery fee |
| FR-34 | Place walk-in order (auto-enqueued) | ✅ | |
| FR-35 | Restaurant dashboard: view and advance order status | ✅ | In-app (no web version) |
| FR-36 | Order state machine: PLACED→CONFIRMED→PREPARING→READY→[OUT_FOR_DELIVERY|COMPLETED] | ✅ | |
| FR-37 | Push notification on READY / OUT_FOR_DELIVERY | ✅ | Real Expo Push; SMS stub fallback |
| FR-38 | Delivery courier assignment | ⚡ | Delivery record created; courier assignment is manual (demo: driver ID set in seed) |
| FR-39 | Delivery state machine: ASSIGNED→PICKED_UP→ENROUTE→DELIVERED | ✅ | PATCH /food/deliveries/{id}/status |
| FR-40 | Live courier tracking via WebSocket | ✅ | /topic/delivery/{id}/location — reuses ride primitive |
| FR-41 | Walk-in queue position (WAITING→CALLED→SERVED) | ✅ | Position counter, call-next, serve |
| FR-42 | Queue WebSocket broadcast | ✅ | /topic/queue/{restaurantId} on every status change |
| FR-43 | Food order rating (1–5) | ✅ | One rating per completed order |
| FR-44 | Pickup scheduling / queue priority pass | 🚫 | CUT |

## Wallet & Notifications

| FR | Description | Status | Notes |
|----|-------------|--------|-------|
| FR-50 | Mock wallet ledger (always succeeds) | ✅ | |
| FR-51 | Ride commission split: 18% to platform, 82% to driver | ✅ | Seeded in commission_config |
| FR-52 | Food commission split: 12% to platform, 88% to restaurant | ✅ | |
| FR-53 | Courier payout (mocked ledger) | ✅ | POST /wallet/payout endpoint |
| FR-54 | Balance query | ✅ | GET /wallet/balance?ownerType=DRIVER|RIDER|RESTAURANT |
| FR-55 | Ledger history | ✅ | GET /wallet/ledger |
| FR-56 | Expo push notifications (REAL integration) | ✅ | WebClient → https://exp.host/--/api/v2/push/send |
| FR-57 | SMS fallback (stub — logged to console) | ✅ | Fallback when push fails or no token |
| FR-58 | Push token registration / deregistration | ✅ | POST/DELETE /wallet/push-token |
| FR-59 | Real PSP (Paystack / MTN MoMo) | 🚫 | CUT |

## Admin

| FR | Description | Status | Notes |
|----|-------------|--------|-------|
| FR-60 | Admin KYC review queue | ✅ | Screen + PATCH endpoint |
| FR-61 | Aggregate counts (pending KYC, active trips) | ⚡ | Counts shown; counts endpoint stubbed |
| FR-62 | Incident list (SOS events) | ⚡ | Shown as "check server logs" stub |
| FR-63 | Analytics dashboard | 🚫 | CUT per playbook |

## Architecture

| FR | Description | Status | Notes |
|----|-------------|--------|-------|
| FR-70 | Gateway as sole public entry point | ✅ | Port 8080 only |
| FR-71 | Each service validates JWT independently | ✅ | No Auth service call-back |
| FR-72 | No cross-DB reads | ✅ | API-only cross-service communication |
| FR-73 | Ride→Wallet sync REST on completion | ✅ | POST /wallet/commission |
| FR-74 | Food→Wallet sync REST on completion | ✅ | POST /wallet/settle/{orderId} |
| FR-75 | Outbox/saga for Ride↔Wallet in production | ⚡ | Documented in architecture.md; not built |
| FR-76 | GPS: scripted streams for demo | ✅ | seed/run_gps_demo.sh |
| FR-77 | All services run under docker compose up | ✅ | |

## Summary

| Category | Built | Stubbed | Cut |
|----------|-------|---------|-----|
| Auth | 6 | 0 | 0 |
| Ride | 9 | 2 | 1 |
| Food | 13 | 2 | 1 |
| Wallet/Notify | 9 | 0 | 1 |
| Admin | 2 | 2 | 1 |
| Architecture | 6 | 1 | 0 |
| **Total** | **45** | **7** | **4** |
