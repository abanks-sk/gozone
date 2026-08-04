# GoZone Demo Script

> Complete run-through of the happy path. ~15 minutes. Follows the demo flow from the playbook.

## Pre-flight

```bash
# 1. Start everything
docker compose up --build

# 2. Load seed data (in a second terminal, after all services show HEALTHY)
docker exec -i gozone-db psql -U gozone < seed/01_auth_seed.sql
docker exec -i gozone-db psql -U gozone < seed/02_food_seed.sql
docker exec -i gozone-db psql -U gozone < seed/03_wallet_seed.sql
docker exec -i gozone-db psql -U gozone < seed/04_gps_stream.sql

# 3. Verify all services healthy
curl http://localhost:8080/auth/actuator/health
curl http://localhost:8080/rides/actuator/health
curl http://localhost:8080/food/actuator/health
curl http://localhost:8080/wallet/actuator/health
```

---

## Step 1 — Rider registers

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"+233501234567","role":"RIDER"}'

# Check logs for OTP
docker logs gozone-auth 2>&1 | grep OTP-MOCK | tail -1
# e.g.: [OTP-MOCK] phone=+233501234567 code=847291

RIDER_TOKEN=$(curl -s -X POST http://localhost:8080/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+233501234567","code":"847291"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

echo "Rider token: ${RIDER_TOKEN:0:40}..."
```

## Step 2 — Driver registers and goes live

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"+233509876543","role":"DRIVER"}'

docker logs gozone-auth 2>&1 | grep OTP-MOCK | tail -1

DRIVER_TOKEN=$(curl -s -X POST http://localhost:8080/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+233509876543","code":"<OTP>"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# Driver submits KYC
curl -X POST http://localhost:8080/auth/driver/kyc \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"licenceNo":"GH-TEST-001","vehicleReg":"GR-9999-24","docUrl":"https://placeholder.example/kyc/test.pdf"}'
```

## Step 3 — Admin approves KYC

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"+233500000001","role":"ADMIN"}'

# Get OTP → verify → get admin token
ADMIN_TOKEN="..."

# List pending KYC
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:8080/auth/driver/kyc?status=PENDING

# Approve (use ID from above response)
curl -X PATCH "http://localhost:8080/auth/driver/kyc/<kyc-id>" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"VERIFIED"}'
```

## Step 4 — GoRide happy path

```bash
# Rider requests a ride
REQUEST=$(curl -s -X POST http://localhost:8080/rides/requests \
  -H "Authorization: Bearer $RIDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "originLat": 5.6052, "originLng": -0.1674,
    "destLat": 5.6120, "destLng": -0.1950,
    "proposedFare": 30.00
  }')

REQUEST_ID=$(echo $REQUEST | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Request ID: $REQUEST_ID"

# Driver sees nearby requests
curl -H "Authorization: Bearer $DRIVER_TOKEN" \
  "http://localhost:8080/rides/requests/nearby?lat=5.6052&lng=-0.1674&radiusKm=5"

# Driver accepts
BID=$(curl -s -X POST "http://localhost:8080/rides/requests/$REQUEST_ID/bid" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"ACCEPT","amount":30.00}')

TRIP_ID=$(echo $BID | python3 -c "import sys,json; print(json.load(sys.stdin)['tripId'])")
echo "Trip ID: $TRIP_ID"

# Driver advances status: MATCHED → ENROUTE → STARTED → COMPLETED
curl -X PATCH "http://localhost:8080/rides/trips/$TRIP_ID/status" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"ENROUTE"}'

# Start GPS demo stream (in background)
JWT=$DRIVER_TOKEN ./seed/run_gps_demo.sh &

curl -X PATCH "http://localhost:8080/rides/trips/$TRIP_ID/status" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"STARTED"}'

curl -X PATCH "http://localhost:8080/rides/trips/$TRIP_ID/status" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"COMPLETED"}'

# Check wallet (driver earned 82% of GH₵30 = GH₵24.60)
curl -H "Authorization: Bearer $DRIVER_TOKEN" \
  "http://localhost:8080/wallet/balance?ownerType=DRIVER"
```

## Step 5 — GoBite delivery order

```bash
# Rider browses restaurants
curl -H "Authorization: Bearer $RIDER_TOKEN" http://localhost:8080/food/restaurants

# Get menu (use restaurantId from seed: bbbbbbbb-0000-0000-0000-000000000001)
curl -H "Authorization: Bearer $RIDER_TOKEN" \
  http://localhost:8080/food/restaurants/bbbbbbbb-0000-0000-0000-000000000001/menu

# Place delivery order (use a menuItemId from the menu response)
ORDER=$(curl -s -X POST http://localhost:8080/food/orders \
  -H "Authorization: Bearer $RIDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "restaurantId": "bbbbbbbb-0000-0000-0000-000000000001",
    "mode": "DELIVERY",
    "deliveryAddr": "15 Oxford Street, Osu",
    "items": [{"menuItemId": "<menu-item-id>", "qty": 2}]
  }')

ORDER_ID=$(echo $ORDER | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Order ID: $ORDER_ID, Total: $(echo $ORDER | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")"
```

## Step 6 — Restaurant dashboard advances order

```bash
# Register as restaurant owner (or use seed ADMIN token)
# Advance: PLACED → CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY → COMPLETED
for STATUS in CONFIRMED PREPARING READY OUT_FOR_DELIVERY COMPLETED; do
  curl -X PATCH "http://localhost:8080/food/orders/$ORDER_ID/status" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"status\":\"$STATUS\"}"
  sleep 1
done

# Check restaurant wallet (earned 88% = GH₵31.68 on a ~GH₵36 order)
curl -H "Authorization: Bearer $OWNER_TOKEN" \
  "http://localhost:8080/wallet/balance?ownerType=RESTAURANT"
```

## Step 7 — Walk-in queue (GoBite WALKIN)

```bash
ORDER=$(curl -s -X POST http://localhost:8080/food/orders \
  -H "Authorization: Bearer $RIDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "restaurantId": "bbbbbbbb-0000-0000-0000-000000000001",
    "mode": "WALKIN",
    "items": [{"menuItemId": "<menu-item-id>", "qty": 1}]
  }')

ORDER_ID=$(echo $ORDER | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Check queue position
curl -H "Authorization: Bearer $RIDER_TOKEN" \
  "http://localhost:8080/food/orders/$ORDER_ID/queue-position"

# Restaurant calls next
curl -X POST "http://localhost:8080/food/restaurants/bbbbbbbb-0000-0000-0000-000000000001/queue/call-next" \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

## Step 8 — Ride sharing

Both passengers must have asked to share (`"shared": true`, Standard rides only — anything else
is refused with a 400). The first one's ride must already be on the road.

```bash
# The second rider is OFFERED rides going their way, already priced.
# Empty unless the corridor, detour and bearing gates all pass.
curl "http://localhost:8080/rides/requests/$REQ2_ID/pool-offers" \
  -H "Authorization: Bearer $RIDER2_TOKEN"
# [{"tripId":"...","yourFare":15.00,"yourSoloFare":20.00,
#   "currentFare":30.00,"newFare":22.50,"savingPct":25,"detourKm":0.039, ...}]

# They take it.
curl -X POST "http://localhost:8080/rides/trips/$TRIP_ID/pool-join" \
  -H "Authorization: Bearer $RIDER2_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"requestId\": \"$REQ2_ID\"}"
# {"tripId":"...","lockedFare":15.00,"soloFare":20.00,"passengerCount":2,"ruleVersion":"v1"}
```

**The point to make out loud:** passenger 1 booked at 30 and now pays **22.50**; passenger 2 pays
**15** instead of 20; and the driver's fare goes from 30 to **37.50**. Everybody is better off —
the discount comes out of the extra passenger, not the driver.

```bash
# The driver's two pickups and two fares to collect
curl "http://localhost:8080/rides/trips/$TRIP_ID/passengers" -H "Authorization: Bearer $DRIVER_TOKEN"
# Each passenger pays their OWN share; the driver is settled once, when both have.
```

## Step 9 — SOS stub

```bash
curl -X POST "http://localhost:8080/rides/trips/$TRIP_ID/sos" \
  -H "Authorization: Bearer $RIDER_TOKEN"
# Returns: {"status":"logged","message":"SOS recorded"}
# Check ride-service logs: docker logs gozone-ride | grep SOS-STUB
```

## Step 10 — Two-way ratings

```bash
# Rider rates driver (rateeId = driver's userId)
curl -X POST "http://localhost:8080/rides/trips/$TRIP_ID/rate" \
  -H "Authorization: Bearer $RIDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rateeId":"<driver-user-id>","score":5,"comment":"Smooth ride, on time!"}'

# Driver rates rider
curl -X POST "http://localhost:8080/rides/trips/$TRIP_ID/rate" \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rateeId":"<rider-user-id>","score":5}'

# Rate food order
curl -X POST "http://localhost:8080/food/orders/$ORDER_ID/rate" \
  -H "Authorization: Bearer $RIDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"score":4,"comment":"Jollof was perfect"}'
```

---

## What to show in the Expo app

1. Open app on device/emulator → Registration screen
2. Register as RIDER → OTP from logs → Home screen
3. Request a ride → show "Looking for driver…"
4. Switch to driver login → Refresh feed → Accept request → Active trip screen
5. Advance status to ENROUTE → GPS stream starts broadcasting
6. Show rider home: driver location updating (live dot moving)
7. COMPLETED → wallet screen shows GH₵24.60 credited
8. Switch to food tab → browse Kofi Kitchen → add Jollof × 2 → DELIVERY → place
9. Switch to restaurant owner login → dashboard shows order → advance through statuses
10. Rider order screen: status badge updating → OUT_FOR_DELIVERY → courier dot appears
11. Walk-in: place WALKIN order → queue position #1 → restaurant calls next → CALLED badge
12. Admin screen: pending KYC list → approve → driver can now accept rides
