# GoZone — Architecture

## Overview

GoZone is a microservices ride-hailing + food delivery + walk-in-queue platform.
Four owned services behind a single API Gateway, each with its own database.

```
Client (React Native + Expo)
        │
        ▼
 ┌──────────────┐  :8080
 │  API Gateway │  Spring Cloud Gateway — only public entry point
 └──────┬───────┘
        │  routes by path prefix
   ┌────┼────┬────┐
   ▼    ▼    ▼    ▼
auth  ride  food  wallet
:8081 :8082 :8083 :8084
  │     │     │     │
auth_db │   food_db wallet_db
     ride_db
    (PostGIS)
```

## Services

| Service | Port | DB | Notes |
|---------|------|----|-------|
| API Gateway | 8080 | — | Spring Cloud Gateway; edge JWT check; forwards X-User-Id, X-User-Role |
| Auth / Identity | 8081 | auth_db | OTP (logged), JWT 24h / refresh 7d, RBAC, driver KYC |
| Ride (GoRide) | 8082 | ride_db | Requests, bids, trips, pooling (simplified), PostGIS geo, WebSocket tracking |
| Food (GoBite) | 8083 | food_db | Restaurants, menus, orders (3 modes), virtual queue, delivery, WebSocket tracking |
| Wallet + Notif | 8084 | wallet_db | Mock ledger, commission splits, payouts, Expo Push (real), SMS stub |

## Key Architectural Decisions

### JWT validation (defence in depth)
Auth service issues JWTs signed with HS256 (shared `JWT_SECRET`). The gateway validates
at the edge and adds `X-User-Id` / `X-User-Role` forwarding headers. Each downstream
service also validates the JWT independently — this means services are safe if ever
exposed directly (e.g., for testing), and they do not need to call Auth to check a token.

### No service reads another's database
Cross-service communication is REST-only. Ride calls Wallet's `/wallet/commission` on
trip completion; Food calls `/wallet/settle/{orderId}` on order completion. Docker Compose
service names are used (never `localhost`).

### Sync REST now, Saga/Outbox documented as production design
Ride→Wallet and Food→Wallet calls on completion are synchronous REST. If the Wallet
service is down, the completion call fails. For production: use the **Outbox Pattern**
(write an event to a local outbox table in the same transaction as the state change) +
a **Saga** for the two-phase commit. Not built here — documented as the correct answer.

### Simplified pooling (stated explicitly)
Real en-route pooling requires route geometry, detour tolerance, and ETA caps — out of
scope. Built instead: match on same destination corridor + bearing (computed from
haversine), compute the joining rider's fair-share from distance × occupancy, reject
candidates beyond `app.pooling.max-distance-km`, stamp every quote with `rule_version`.
Existing passengers' `locked_fare` is never recomputed after they join.

### Delivery tracking = the ride primitive reused
A courier is a driver carrying a parcel. `/food/deliveries/{id}/track` reuses the same
WebSocket STOMP layer as `/rides/trips/{id}/track`. The location push flow is identical;
only the destination topic differs (`/topic/delivery/{id}/location` vs
`/topic/trip/{id}/location`).

### What is mocked
| System | Mock approach |
|--------|--------------|
| OTP / SMS | Logged to console (`[OTP-MOCK]`) — never sent |
| Payments | Ledger entries only; always succeed |
| KYC verification | Placeholder doc URLs + admin toggle |
| GPS | Scripted streams seeded in `seed/` for demo |
| Push notifications | **REAL** — Expo Push API (free tier) |

### WebSocket / STOMP auth
WebSocket upgrade carries the JWT as a query parameter (`?token=<JWT>`). The service
validates it during the STOMP CONNECT frame. This is the standard approach for
STOMP-over-WebSocket when cookies are unavailable.

## State Machines

```
Trip:     MATCHED → ENROUTE → STARTED → COMPLETED (or CANCELLED)
Order:    PLACED → CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY → COMPLETED (or CANCELLED)
Delivery: ASSIGNED → PICKED_UP → ENROUTE → DELIVERED
Queue:    WAITING → CALLED → SERVED
KYC:      PENDING → VERIFIED / REJECTED
```

## FR Coverage

See `docs/fr-coverage.md` (created in M7).
