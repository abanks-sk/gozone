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
Auth service issues JWTs signed with RS256 (private key, auth-service only; every other
service verifies with the public key and cannot mint). The gateway validates
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
scope. Built instead: three gates on flat-projection geometry, all of which must pass —
destination within `app.pooling.max-distance-km` of where the car is already going, pickup
within `max-detour-km` of the road **still to be driven** (car → pickup → dest before the
first passenger is aboard, car → dest after), and a bearing within `max-bearing-deg` of the
car's. Distance alone would seat somebody heading to the same suburb from the opposite side
of the city, and a dual carriageway puts both directions within metres of each other.

The rider pulls (`/rides/requests/{id}/pool-offers`) rather than the driver pushing: only a
passenger who chose to share can be seated, and only they can accept the price. Every quote
is stamped with `rule_version`.

**Fares are per passenger, not per trip.** `trips.agreed_fare` is the sum of everyone's
share — what the driver earns and what commission comes off — while
`trip_passengers.locked_fare` is what one person owes. Payment, cash confirmation and ride
history are all per passenger; the wallet settles once, when everyone has paid, because
`settleRide` is idempotent per trip and could only ever fire at a single amount.

A locked fare **is** recomputed as the car fills and empties — a deliberate departure from
the original "never recomputed" rule — always from that passenger's own `solo_fare` rather
than the already-discounted number, so discounts cannot compound.

The guarantee is a **ceiling, not a ratchet**: the fare follows occupancy in both directions
but can never climb past what the passenger agreed at booking. "Downward only" reads kinder
and is worse — when a joiner leaves (`/trips/{id}/leave-pool`) it would strand the remaining
passenger's discount and leave the driver carrying them for less than the job they accepted,
so a stranger's change of mind would come out of the driver's pocket. A discount unwinding
back to the accepted price is not a surprise; being charged more than you accepted would be.

Each passenger pays the same fraction of their own quote, so two at 75% hands the driver
150% of a single fare: the discount comes out of the extra passenger, not the driver.

**Leaving is not cancelling.** A shared ride belongs to whoever booked it; only they may
cancel it, and a joiner leaving must not end a journey the other passenger is halfway
through. The two are separate operations because they have different victims. The leaver's
request is CANCELLED rather than re-opened — an immediate request expires on `created_at`,
so one that has sat in a car for ten minutes is already past its TTL and would be swept away
moments after appearing to work.

**The exit closes at the car door.** `trip_passengers.picked_up_at` is the only thing that
distinguishes a passenger waiting at the kerb from one already sitting in the car, and
without it somebody could be driven the whole way and then leave rather than pay — the fare
is collected at the end, so leaving late is indistinguishable from a free ride. The
passenger who booked is stamped when the trip goes STARTED, which is what that transition
already means; a joiner boards minutes later on a trip that is *already* STARTED, which is
precisely why a trip-level status cannot speak for them. The driver confirms them
explicitly, and it is their own protection: before it the passenger owes nothing, after it
the fare is owed. Restricted to ENROUTE/STARTED so nobody can be marked aboard a car that
has not moved, and reversible for a short window (`app.pooling.pickup-undo-seconds`)
so a mis-tap does not trap somebody in a fare they do not owe. The window is the
point: an open-ended undo would let a driver revoke "aboard and owes the fare" at
any moment in the journey, which is the protection itself. The passenger is told when it happens and can
object (`/trips/{id}/dispute-pickup`). A dispute deliberately does **not** un-board them —
that would be the free-ride hole entered from the other side — but it is recorded, the
driver is told, and while it is open the driver may undo at any time rather than only
inside the window. `GET /rides/pickup-disputes` is the admin backstop, with a page in admin-web:
uphold takes the passenger off the ride, refusing keeps them on it and requires a
reason they will read. Resolving records the outcome rather than clearing the
dispute — a settled argument about money should still say what was claimed and
who was found to be right.

Disputes live in their own table, not on the passenger row, because leaving a
shared ride deletes that row: a complaint stored on the seat died with the person
who raised it, and a driver who repeatedly marks people aboard who are not in the
car is a pattern nobody could see. Each round of the same argument is a separate
row, so settling one never overwrites the last decision.

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
