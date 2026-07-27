#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# GoZone — end-to-end test suite
#
# Exercises the whole platform against a running stack and reports pass/fail for
# every assertion. Run it after any backend change to confirm nothing broke.
#
#   docker compose up -d          # stack must be healthy first
#   bash scripts/e2e.sh
#
# Requirements: docker (to read OTP codes from the auth-service log), curl,
# python. Override the gateway with:  GOZONE_GATEWAY=http://host:8080 bash scripts/e2e.sh
#
# It signs in as the seeded demo accounts, so seed/01–03 must have been applied.
#
# What it leaves behind: one COMPLETED ride and one COMPLETED food order (plus
# the wallet credits they generate). Both are terminal, so they do NOT clutter
# the driver feed or the vendor board. Every other object it creates (parcel run,
# walk-in order, SOS incident, test promo) is cancelled, handled or deleted
# before the script exits.
#
# ⚠️ ONE SIDE EFFECT: the walk-in queue test calls "call next", which serves
# whoever is at the FRONT of that vendor's queue — not necessarily this script's
# own entry. If you have staged a walk-in customer for a demo, running this will
# consume them. Re-stage the queue after running, or run the suite before you
# stage your demo data.
# ─────────────────────────────────────────────────────────────────────────────
GW=${GOZONE_GATEWAY:-http://localhost:8080}
PASS=0; FAIL=0; FAILED_LIST=""

ok()  { echo "   ok   $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL  $1  << $2"; FAIL=$((FAIL+1)); FAILED_LIST="$FAILED_LIST\n  - $1 ($2)"; }
eq()  { if [ "$2" == "$3" ]; then ok "$1"; else bad "$1" "got '$2' expected '$3'"; fi; }
neq() { if [ "$2" != "$3" ]; then ok "$1"; else bad "$1" "unexpectedly '$2'"; fi; }
jq_() { python -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

login() { # $1 = phone -> echoes token
  curl -s -X POST $GW/auth/login -H 'Content-Type: application/json' -d "{\"phone\":\"$1\"}" >/dev/null
  sleep 1.2
  local code=$(docker logs gozone-auth --tail 40 2>&1 | grep "phone=$1 " | grep -oP 'code=\K\d+' | tail -1)
  curl -s -X POST $GW/auth/verify-otp -H 'Content-Type: application/json' \
    -d "{\"phone\":\"$1\",\"code\":\"$code\"}" | jq_ "d.get('accessToken','')"
}
GET()   { curl -s -H "Authorization: Bearer $2" "$GW$1"; }
CODE()  { curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $2" "$GW$1"; }
POST()  { curl -s -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $2" -d "$3" "$GW$1"; }
PATCH_(){ curl -s -X PATCH -H 'Content-Type: application/json' -H "Authorization: Bearer $2" -d "$3" "$GW$1"; }

echo "=============================================="
echo " 1. INFRASTRUCTURE"
echo "=============================================="
for cnt in gozone-postgres gozone-auth gozone-ride gozone-food gozone-wallet gozone-gateway; do
  st=$(docker inspect -f '{{.State.Status}}' $cnt 2>/dev/null)
  eq "container $cnt running" "$st" "running"
done
for p in "8081 auth" "8082 rides" "8083 food" "8084 wallet"; do
  set -- $p
  s=$(curl -s http://localhost:$1/$2/actuator/health | jq_ "d['status']")
  eq "$2-service health" "$s" "UP"
done
eq "gateway reachable" "$(curl -s -o /dev/null -w '%{http_code}' $GW/rides/ping)" "401"

echo
echo "=============================================="
echo " 2. AUTH — all demo accounts"
echo "=============================================="
RIDER=$(login "+233201000001");   neq "rider login (+…001)"    "$RIDER" ""
DRIVER=$(login "+233201000002");  neq "driver login (+…002)"   "$DRIVER" ""
COURIER=$(login "+233201000005"); neq "courier login (+…005)"  "$COURIER" ""
VENDOR=$(login "+233201000004");  neq "vendor login (+…004)"   "$VENDOR" ""
ADMIN=$(login "+233201000006");   neq "admin login (+…006)"    "$ADMIN" ""

# Tokens must be RS256, not a shared-secret algorithm: only auth-service should be able to
# mint one. A regression to HS* would silently give every service minting power again.
eq "access token is RS256"   "$(python -c "
import base64,json,sys
h='$RIDER'.split('.')[0]; h+='='*(-len(h)%4)
print(json.loads(base64.urlsafe_b64decode(h))['alg'])")" "RS256"

# ...and the private key must live in exactly one container.
eq "only auth-service holds the signing key"   "$(for c in gozone-gateway gozone-auth gozone-ride gozone-food gozone-wallet; do
       docker exec $c env 2>/dev/null | grep -q '^JWT_PRIVATE_KEY=' && echo $c;
     done | tr '
' ' ' | sed 's/ $//')" "gozone-auth"

# The JWKS is what lets a key be rotated by restarting auth-service alone. Three things have
# to hold for that: the document is published, the token names its key, and the name matches a
# key in the document. If the kid ever stops matching, every verifier silently falls back to
# its statically configured key and rotation quietly stops working.
eq "JWKS publishes an RS256 signing key" "$(curl -s $GW/auth/.well-known/jwks.json | python -c "
import sys,json
k=json.load(sys.stdin)['keys'][0]
print(k['kty']+k['alg']+('kid' if k.get('kid') else ''))")" "RSARS256kid"

eq "token kid matches a published key" "$(python -c "
import base64,json,sys,urllib.request
h='$RIDER'.split('.')[0]; h+='='*(-len(h)%4)
kid=json.loads(base64.urlsafe_b64decode(h)).get('kid')
ks=json.load(urllib.request.urlopen('$GW/auth/.well-known/jwks.json'))['keys']
print('yes' if kid and any(k['kid']==kid for k in ks) else 'no')")" "yes"

# Every verifier must actually be fetching the set, not quietly living on its configured key —
# otherwise a rotation would need all five services redeployed again, which is the whole point.
eq "all four verifiers loaded the JWKS" "$(for c in gozone-gateway gozone-ride gozone-food gozone-wallet; do
       docker logs $c 2>&1 | grep -q 'JWKS loaded' && echo ok;
     done | wc -l | tr -d ' ')" "4"

eq "rider role"    "$(GET /auth/me $RIDER   | jq_ "d['role']")" "RIDER"
eq "driver role"   "$(GET /auth/me $DRIVER  | jq_ "d['role']")" "DRIVER"
eq "driver class"  "$(GET /auth/me $DRIVER  | jq_ "d['vehicleClass']")" "STANDARD"
eq "driver active" "$(GET /auth/me $DRIVER  | jq_ "d['status']")" "ACTIVE"
eq "courier class" "$(GET /auth/me $COURIER | jq_ "d['vehicleClass']")" "OKADA"
eq "vendor role"   "$(GET /auth/me $VENDOR  | jq_ "d['role']")" "RESTAURANT_OWNER"
eq "admin role"    "$(GET /auth/me $ADMIN   | jq_ "d['role']")" "ADMIN"
eq "unknown phone rejected" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST $GW/auth/login -H 'Content-Type: application/json' -d '{"phone":"+233209999999"}')" "404"

echo
echo "=============================================="
echo " 3. PRICING — server quote"
echo "=============================================="
Q=$(POST /rides/quote "$RIDER" '{"originLat":5.6037,"originLng":-0.1870,"destLat":5.6500,"destLng":-0.1960,"rideType":"STANDARD"}')
QF=$(echo "$Q" | jq_ "d['fare']")
neq "quote returns a fare" "$QF" ""
echo "        (standard fare GH¢ $QF, surge=$(echo "$Q" | jq_ "d.get('surge')"), rule=$(echo "$Q" | jq_ "d.get('ruleVersion')"))"
QO=$(POST /rides/quote "$RIDER" '{"originLat":5.6037,"originLng":-0.1870,"destLat":5.6500,"destLng":-0.1960,"rideType":"OKADA"}' | jq_ "d['fare']")
echo "        (okada fare GH¢ $QO)"

echo
echo "=============================================="
echo " 4. RIDE — request → offers → pick → trip → pay → settle"
echo "=============================================="
BAL0=$(GET "/wallet/balance?ownerType=DRIVER" $DRIVER | jq_ "d['balance']")
REQ=$(POST /rides/requests "$RIDER" '{"originLat":5.6037,"originLng":-0.1870,"destLat":5.6500,"destLng":-0.1960,"proposedFare":25,"kind":"RIDE","rideType":"STANDARD","riderPhone":"+233201000001"}')
RID=$(echo "$REQ" | jq_ "d['id']")
eq "rider creates request" "$(echo "$REQ" | jq_ "d['status']")" "OPEN"

NEAR=$(GET "/rides/requests/nearby?lat=5.6037&lng=-0.1870&radiusKm=50&vehicleClass=STANDARD&serviceMode=BOTH" $DRIVER)
eq "driver sees it in the feed" "$(echo "$NEAR" | python -c "import sys,json;print(any(r['id']=='$RID' for r in json.load(sys.stdin)))")" "True"
eq "feed hides rider phone" "$(echo "$NEAR" | grep -c riderPhone)" "0"

BID=$(POST "/rides/requests/$RID/bid" "$DRIVER" '{"type":"ACCEPT","amount":25,"driverName":"Kwame Driver","driverPhone":"+233201000002","vehicle":"Toyota Vitz (silver)","plate":"GR-2244-22","lat":5.6100,"lng":-0.1880}')
BIDID=$(echo "$BID" | jq_ "d['bidId']")
eq "driver ACCEPT = pending offer (no auto-trip)" "$(echo "$BID" | jq_ "d['status']")" "PENDING"
eq "  …and no trip yet"                            "$(echo "$BID" | jq_ "str(d.get('tripId'))")" "None"

OFFERS=$(GET "/rides/requests/$RID/bids" $RIDER)
eq "rider sees 1 offer"        "$(echo "$OFFERS" | jq_ "len(d)")" "1"
eq "offer carries driver name" "$(echo "$OFFERS" | jq_ "d[0]['driverName']")" "Kwame Driver"
eq "offer carries vehicle"     "$(echo "$OFFERS" | jq_ "d[0]['vehicle']")" "Toyota Vitz (silver)"
eq "offer carries plate"       "$(echo "$OFFERS" | jq_ "d[0]['plate']")" "GR-2244-22"
neq "offer carries distance"   "$(echo "$OFFERS" | jq_ "str(d[0]['distanceKm'])")" "None"
echo "        (driver is $(echo "$OFFERS" | jq_ "d[0]['distanceKm']") km from pickup)"

TRIP=$(POST "/rides/requests/$RID/bids/$BIDID/accept" "$RIDER" '{}')
TID=$(echo "$TRIP" | jq_ "d['id']")
eq "rider picks the driver → trip" "$(echo "$TRIP" | jq_ "d['status']")" "MATCHED"
eq "driver polls own bid → ACCEPTED" "$(GET "/rides/bids/$BIDID" $DRIVER | jq_ "d['status']")" "ACCEPTED"
eq "driver gets rider phone on trip" "$(GET "/rides/trips/$TID" $DRIVER | jq_ "d['riderPhone']")" "+233201000001"
eq "rider status poll shows driver card" "$(GET "/rides/requests/$RID/status" $RIDER | jq_ "d['driver']['driverName']")" "Kwame Driver"

eq "GPS push accepted" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $DRIVER" -d '{"lat":5.6050,"lng":-0.1875}' $GW/rides/locations)" "204"
eq "advance → ENROUTE"   "$(PATCH_ "/rides/trips/$TID/status" "$DRIVER" '{"status":"ENROUTE"}' | jq_ "d['status']")" "ENROUTE"
eq "advance → STARTED"   "$(PATCH_ "/rides/trips/$TID/status" "$DRIVER" '{"status":"STARTED"}' | jq_ "d['status']")" "STARTED"
eq "advance → COMPLETED" "$(PATCH_ "/rides/trips/$TID/status" "$DRIVER" '{"status":"COMPLETED"}' | jq_ "d['status']")" "COMPLETED"

eq "rider pays cash → AWAITING"  "$(POST "/rides/trips/$TID/pay" "$RIDER" '{"method":"cash"}' | jq_ "d['paymentStatus']")" "AWAITING"
eq "driver confirms cash → PAID" "$(POST "/rides/trips/$TID/confirm-cash" "$DRIVER" '{}' | jq_ "d['paymentStatus']")" "PAID"
sleep 1
BAL1=$(GET "/wallet/balance?ownerType=DRIVER" $DRIVER | jq_ "d['balance']")
neq "driver wallet credited (settlement)" "$BAL1" "$BAL0"
echo "        (driver wallet $BAL0 → $BAL1 on a GH¢25 fare)"
eq "rider rates driver" "$(POST "/rides/trips/$TID/rate" "$RIDER" "{\"rateeId\":\"$(GET /auth/me $DRIVER | jq_ "d['id']")\",\"score\":5}" | jq_ "d['status']")" "rated"
eq "trip in rider history" "$(GET /rides/trips/mine $RIDER | python -c "import sys,json;print(any(t.get('tripId')=='$TID' for t in json.load(sys.stdin)))")" "True"

echo
echo "=============================================="
echo " 5. PARCEL — vehicle-class routing"
echo "=============================================="
P1=$(POST /rides/requests "$RIDER" '{"originLat":5.6037,"originLng":-0.1870,"destLat":5.6300,"destLng":-0.1900,"proposedFare":15,"kind":"PARCEL","parcelSize":"SMALL","parcelDesc":"A4 documents","direction":"SEND","partyName":"Yaa Recipient","partyPhone":"+233241234567","riderPhone":"+233201000001"}')
PID=$(echo "$P1" | jq_ "d['id']")
eq "small parcel created" "$(echo "$P1" | jq_ "d['parcelSize']")" "SMALL"

# A parcel needs someone at the other end, or the courier arrives to nobody.
eq "parcel without handover details rejected"   "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $RIDER" -d '{"originLat":5.6037,"originLng":-0.1870,"destLat":5.6300,"destLng":-0.1900,"proposedFare":15,"kind":"PARCEL","parcelSize":"SMALL","parcelDesc":"No recipient"}' $GW/rides/requests)" "400"

# The open feed must not leak a third party's phone number to every driver in range.
eq "handover contact hidden in the open feed"   "$(GET "/rides/requests/nearby?lat=5.6037&lng=-0.1870&radiusKm=50&vehicleClass=OKADA&serviceMode=BOTH" $COURIER | python -c "import sys,json;print(next((r['partyPhone'] for r in json.load(sys.stdin) if r['id']=='$PID'), 'missing'))")" "None"

# ...but the owner gets their own back, so a reload doesn't lose it.
eq "owner sees their own handover contact"   "$(GET "/rides/requests/$PID/status" $RIDER | jq_ "d['request']['partyName']")" "Yaa Recipient"
eq "OKADA courier sees small parcel" \
  "$(GET "/rides/requests/nearby?lat=5.6037&lng=-0.1870&radiusKm=50&vehicleClass=OKADA&serviceMode=BOTH" $COURIER | python -c "import sys,json;print(any(r['id']=='$PID' for r in json.load(sys.stdin)))")" "True"
eq "STANDARD driver does NOT see small parcel" \
  "$(GET "/rides/requests/nearby?lat=5.6037&lng=-0.1870&radiusKm=50&vehicleClass=STANDARD&serviceMode=BOTH" $DRIVER | python -c "import sys,json;print(any(r['id']=='$PID' for r in json.load(sys.stdin)))")" "False"
PB=$(POST "/rides/requests/$PID/bid" "$COURIER" '{"type":"ACCEPT","amount":15,"driverName":"Kofi Courier","driverPhone":"+233201000005","vehicle":"Yamaha (red)","plate":"M-4471-23","lat":5.6060,"lng":-0.1860}' | jq_ "d['bidId']")
PT=$(POST "/rides/requests/$PID/bids/$PB/accept" "$RIDER" '{}' | jq_ "d['id']")
eq "courier picked → parcel run created" "$(GET "/rides/trips/$PT" $COURIER | jq_ "d['status']")" "MATCHED"
PATCH_ "/rides/trips/$PT/status" "$COURIER" '{"status":"CANCELLED"}' >/dev/null
eq "parcel run cleaned up" "$(GET "/rides/trips/$PT" $COURIER | jq_ "d['status']")" "CANCELLED"

echo
echo "=============================================="
echo " 6. FOOD — order → vendor → courier → pay → settle"
echo "=============================================="
VLIST=$(GET /food/restaurants $RIDER)
eq "vendors listed" "$(echo "$VLIST" | python -c "import sys,json;print(len(json.load(sys.stdin))>=2)")" "True"
echo "        (types: $(echo "$VLIST" | python -c "import sys,json;print(', '.join(sorted({v.get('vendorType','?') for v in json.load(sys.stdin)})))"))"
VID=$(echo "$VLIST" | jq_ "d[0]['id']")
MENU=$(GET "/food/restaurants/$VID/menu" $RIDER)
MI=$(echo "$MENU" | jq_ "d[0]['id']")
neq "menu has items" "$MI" ""
FEES=$(GET /food/platform-fees $RIDER)
echo "        (fees: service $(echo "$FEES" | jq_ "d['serviceFeePct']*100")%, delivery base $(echo "$FEES" | jq_ "d['deliveryBaseFee']") + $(echo "$FEES" | jq_ "d['deliveryPerKm']")/km)"

VBAL0=$(GET "/wallet/balance?ownerType=RESTAURANT" $VENDOR | jq_ "d['balance']")
ORD=$(POST /food/orders "$RIDER" "{\"restaurantId\":\"$VID\",\"mode\":\"DELIVERY\",\"deliveryAddr\":\"Osu, Accra\",\"deliveryLat\":5.5570,\"deliveryLng\":-0.1820,\"items\":[{\"menuItemId\":\"$MI\",\"qty\":2}]}")
OID=$(echo "$ORD" | jq_ "d['id']")
eq "order placed" "$(echo "$ORD" | jq_ "d['status']")" "PLACED"
echo "        (total GH¢ $(echo "$ORD" | jq_ "d['total']"), service fee $(echo "$ORD" | jq_ "d.get('serviceFee')"))"
eq "vendor sees the order" "$(GET "/food/restaurants/$VID/orders" $VENDOR | python -c "import sys,json;print(any(o['id']=='$OID' for o in json.load(sys.stdin)))")" "True"

# The kitchen cooks; the courier delivers. The vendor's authority ends at READY.
for s in CONFIRMED PREPARING READY; do
  eq "vendor advance → $s" "$(PATCH_ "/food/orders/$OID/status" "$VENDOR" "{\"status\":\"$s\"}" | jq_ "d['status']")" "$s"
done
eq "vendor CANNOT send it out for delivery"   "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH -H 'Content-Type: application/json' -H "Authorization: Bearer $VENDOR" -d '{"status":"OUT_FOR_DELIVERY"}' $GW/food/orders/$OID/status)" "403"
eq "vendor CANNOT mark it delivered"   "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH -H 'Content-Type: application/json' -H "Authorization: Bearer $VENDOR" -d '{"status":"COMPLETED"}' $GW/food/orders/$OID/status)" "403"

DEL=$(GET /food/deliveries/available $COURIER)
DID=$(echo "$DEL" | python -c "import sys,json;d=json.load(sys.stdin);print(next((x['id'] for x in d if x['orderId']=='$OID'),''))")
neq "delivery offered to courier" "$DID" ""
eq "courier accepts delivery" "$(POST "/food/deliveries/$DID/accept" "$COURIER" '{}' | jq_ "d['status']")" "ASSIGNED"
eq "courier pickup drives the order" "$(PATCH_ "/food/deliveries/$DID/status" "$COURIER" '{"status":"PICKED_UP"}' | jq_ "d['status']")" "updated"
eq "  …order now OUT_FOR_DELIVERY" "$(GET "/food/orders/$OID" $RIDER | jq_ "d['status']")" "OUT_FOR_DELIVERY"
for s in ENROUTE DELIVERED; do
  eq "courier advance → $s" "$(PATCH_ "/food/deliveries/$DID/status" "$COURIER" "{\"status\":\"$s\"}" | jq_ "d['status']")" "updated"
done
eq "order completed by the courier's delivery" "$(GET "/food/orders/$OID" $RIDER | jq_ "d['status']")" "COMPLETED"
eq "customer pays cash → AWAITING"  "$(POST "/food/orders/$OID/pay" "$RIDER" '{"method":"cash"}' | jq_ "d['paymentStatus']")" "AWAITING"
eq "courier confirms cash → PAID"   "$(POST "/food/deliveries/$DID/confirm-cash" "$COURIER" '{}' | jq_ "d['paymentStatus']")" "PAID"
sleep 1
VBAL1=$(GET "/wallet/balance?ownerType=RESTAURANT" $VENDOR | jq_ "d['balance']")
neq "vendor wallet credited (settlement)" "$VBAL1" "$VBAL0"
echo "        (vendor wallet $VBAL0 → $VBAL1)"

# The customer's total splits three ways. Every part of it must land somewhere, or GoZone is
# either inventing money or losing it.
eq "order splits exactly between vendor, courier and platform"   "$(docker exec gozone-postgres psql -U gozone -d wallet_db -t -A -c       "SELECT COALESCE(SUM(amount),0) FROM ledger_entries WHERE ref_id='$OID' AND amount > 0;")"   "$(GET "/food/orders/$OID" $RIDER | jq_ "d['total']")"
eq "courier earned the delivery fee"   "$(docker exec gozone-postgres psql -U gozone -d wallet_db -t -A -c       "SELECT COALESCE(SUM(amount),0) FROM ledger_entries WHERE ref_id='$OID' AND type='DELIVERY_FEE';")"   "$(GET "/food/orders/$OID" $RIDER | jq_ "d['deliveryFee']")"
# Cash: the courier walked off with the customer's money, so they owe GoZone that much.
eq "courier owes the cash they collected"   "$(docker exec gozone-postgres psql -U gozone -d wallet_db -t -A -c       "SELECT COALESCE(SUM(-amount),0) FROM ledger_entries WHERE ref_id='$OID' AND type='CASH_COLLECTED';")"   "$(GET "/food/orders/$OID" $RIDER | jq_ "d['total']")"

echo
echo "=============================================="
echo " 6b. WALLET PAYMENTS MUST MOVE MONEY"
echo "=============================================="
# An empty wallet used to pay for anything: the order was stamped PAID and the vendor credited,
# with nothing debited. Guard both halves — the refusal, and that a real payment is deducted.
BROKE_PHONE="+233244000222"
curl -s -o /dev/null -X POST $GW/auth/register -H 'Content-Type: application/json'   -d "{\"phone\":\"$BROKE_PHONE\",\"role\":\"RIDER\",\"name\":\"Empty Wallet\",\"username\":\"empty.wallet\"}"
sleep 1
BROKE=$(login "$BROKE_PHONE")
eq "new customer starts with an empty wallet" "$(GET "/wallet/balance?ownerType=RIDER" $BROKE | jq_ "d['balance']")" "0"
BORD=$(POST /food/orders "$BROKE" "{\"restaurantId\":\"$VID\",\"mode\":\"PICKUP\",\"items\":[{\"menuItemId\":\"$MI\",\"qty\":1}]}")
BOID=$(echo "$BORD" | jq_ "d['id']")
eq "empty wallet cannot pay"   "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $BROKE" -d '{"method":"wallet"}' $GW/food/orders/$BOID/pay)" "402"
eq "  …and the order stays unpaid" "$(GET "/food/orders/$BOID" $BROKE | jq_ "d['paymentStatus']")" "UNPAID"

# A funded wallet pays and is actually debited by the order total.
RBAL0=$(GET "/wallet/balance?ownerType=RIDER" $RIDER | jq_ "d['balance']")
WORD=$(POST /food/orders "$RIDER" "{\"restaurantId\":\"$VID\",\"mode\":\"PICKUP\",\"items\":[{\"menuItemId\":\"$MI\",\"qty\":1}]}")
WOID=$(echo "$WORD" | jq_ "d['id']")
WTOT=$(echo "$WORD" | jq_ "d['total']")
eq "funded wallet pays" "$(POST "/food/orders/$WOID/pay" "$RIDER" '{"method":"wallet"}' | jq_ "d['paymentStatus']")" "PAID"
RBAL1=$(GET "/wallet/balance?ownerType=RIDER" $RIDER | jq_ "d['balance']")
eq "  …customer was debited the order total"   "$(python -c "print(round(float('$RBAL0') - float('$RBAL1'), 2))")" "$(python -c "print(round(float('$WTOT'), 2))")"

echo
echo "=============================================="
echo " 7. WALK-IN QUEUE"
echo "=============================================="
WORD=$(POST /food/orders "$RIDER" "{\"restaurantId\":\"$VID\",\"mode\":\"WALKIN\",\"items\":[{\"menuItemId\":\"$MI\",\"qty\":1}]}")
WID=$(echo "$WORD" | jq_ "d['id']")
eq "walk-in order placed" "$(echo "$WORD" | jq_ "d['mode']")" "WALKIN"
neq "customer has a queue position" "$(GET "/food/orders/$WID/queue-position" $RIDER | jq_ "str(d.get('position'))")" "None"
eq "vendor sees queue" "$(GET "/food/restaurants/$VID/queue" $VENDOR | python -c "import sys,json;print(len(json.load(sys.stdin))>=1)")" "True"
CN=$(POST "/food/restaurants/$VID/queue/call-next" "$VENDOR" '{}')
eq "call next → CALLED" "$(echo "$CN" | jq_ "d['status']")" "CALLED"
EID=$(echo "$CN" | jq_ "d['entryId']")
eq "serve entry" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $VENDOR" $GW/food/queue/$EID/serve)" "200"
PATCH_ "/food/orders/$WID/status" "$VENDOR" '{"status":"CANCELLED"}' >/dev/null

echo
echo "=============================================="
echo " 8. PROMOS / VENDOR SELF-SERVE"
echo "=============================================="
eq "public promos load" "$(GET /food/promos $RIDER | python -c "import sys,json;print(len(json.load(sys.stdin))>0)")" "True"
MYV=$(GET /food/vendors/mine $VENDOR | jq_ "d[0]['id']")
# A discount application must carry its terms; scope defaults to the whole catalogue.
AP=$(POST /food/promos/apply "$VENDOR" "{\"vendorId\":\"$MYV\",\"title\":\"E2E test promo\",\"promoKind\":\"DISCOUNT\",\"discountType\":\"PERCENT\",\"discountValue\":15,\"scope\":\"VENDOR\"}")
APID=$(echo "$AP" | jq_ "d['id']")
eq "vendor applies → inactive (pending)" "$(echo "$AP" | jq_ "d['active']")" "False"
eq "  …with its discount terms recorded"  "$(echo "$AP" | jq_ "d['discountType']+' '+str(int(d['discountValue']))")" "PERCENT 15"
eq "vendor sees own application" "$(GET "/food/promos/mine?vendorId=$MYV" $VENDOR | python -c "import sys,json;print(any(p['id']=='$APID' for p in json.load(sys.stdin)))")" "True"
eq "admin activates (= approve)" "$(PATCH_ "/food/promos/$APID" "$ADMIN" '{"active":true}' | jq_ "d['active']")" "True"
curl -s -X DELETE -H "Authorization: Bearer $ADMIN" $GW/food/promos/$APID >/dev/null
eq "test promo removed" "$(GET /food/promos/all $ADMIN | python -c "import sys,json;print(any(p['id']=='$APID' for p in json.load(sys.stdin)))")" "False"

echo
echo "=============================================="
echo " 8b. DISCOUNT ENGINE — promos that change the total"
echo "=============================================="
# Baseline for one item, so the expected discounts are exact.
UNIT=$(echo "$MENU" | jq_ "d[0]['price']")
ord1() { POST /food/orders "$RIDER" "{\"restaurantId\":\"$VID\",\"mode\":\"PICKUP\",\"items\":[{\"menuItemId\":\"$MI\",\"qty\":2}]}"; }
SUB=$(python -c "print(round($UNIT*2,2))")
BASE=$(ord1); BID_=$(echo "$BASE" | jq_ "d['id']")
eq "no promo → no discount" "$(echo "$BASE" | jq_ "float(d['discount'])")" "0.0"
PATCH_ "/food/orders/$BID_/status" "$VENDOR" '{"status":"CANCELLED"}' >/dev/null

# Vendor-wide 10% off.
D1=$(POST /food/promos "$ADMIN" "{\"title\":\"E2E 10 off\",\"vendorId\":\"$VID\",\"scope\":\"VENDOR\",\"promoKind\":\"DISCOUNT\",\"discountType\":\"PERCENT\",\"discountValue\":10}" | jq_ "d['id']")
O1=$(ord1)
eq "vendor-wide 10% applied" "$(echo "$O1" | jq_ "float(d['discount'])")" "$(python -c "print(round($SUB*0.10,2))")"
eq "  service fee charged after discount" \
  "$(echo "$O1" | jq_ "float(d['serviceFee'])")" \
  "$(python -c "print(round(($SUB-round($SUB*0.10,2))*0.05,2))")"
PATCH_ "/food/orders/$(echo "$O1" | jq_ "d['id']")/status" "$VENDOR" '{"status":"CANCELLED"}' >/dev/null

# A bigger fixed-amount promo must win over the percentage one — no stacking.
D2=$(POST /food/promos "$ADMIN" "{\"title\":\"E2E big off\",\"vendorId\":\"$VID\",\"scope\":\"VENDOR\",\"promoKind\":\"DISCOUNT\",\"discountType\":\"AMOUNT\",\"discountValue\":9}" | jq_ "d['id']")
O2=$(ord1)
eq "best discount wins, no stacking" "$(echo "$O2" | jq_ "float(d['discount'])")" "9.0"
PATCH_ "/food/orders/$(echo "$O2" | jq_ "d['id']")/status" "$VENDOR" '{"status":"CANCELLED"}' >/dev/null
curl -s -X DELETE -H "Authorization: Bearer $ADMIN" $GW/food/promos/$D1 >/dev/null
curl -s -X DELETE -H "Authorization: Bearer $ADMIN" $GW/food/promos/$D2 >/dev/null

# Vendor-fulfilled promo: recorded, but no money moves.
D3=$(POST /food/promos "$ADMIN" "{\"title\":\"E2E BOGO\",\"description\":\"Dine-in only\",\"vendorId\":\"$VID\",\"scope\":\"VENDOR\",\"promoKind\":\"BOGO\"}" | jq_ "d['id']")
O3=$(ord1)
eq "vendor-fulfilled promo takes no money" "$(echo "$O3" | jq_ "float(d['discount'])")" "0.0"
eq "  …but is recorded on the order"       "$(echo "$O3" | jq_ "'E2E BOGO' in (d['promoNotes'] or '')")" "True"
PATCH_ "/food/orders/$(echo "$O3" | jq_ "d['id']")/status" "$VENDOR" '{"status":"CANCELLED"}' >/dev/null
curl -s -X DELETE -H "Authorization: Bearer $ADMIN" $GW/food/promos/$D3 >/dev/null

# Guard rails.
eq "discount without terms rejected" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $ADMIN" -d "{\"title\":\"bad\",\"vendorId\":\"$VID\",\"promoKind\":\"DISCOUNT\"}" $GW/food/promos)" "400"
eq "percentage over 90 rejected" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $ADMIN" -d "{\"title\":\"bad\",\"vendorId\":\"$VID\",\"promoKind\":\"DISCOUNT\",\"discountType\":\"PERCENT\",\"discountValue\":95}" $GW/food/promos)" "400"
eq "customer cannot create a promo" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $RIDER" -d "{\"title\":\"nope\",\"vendorId\":\"$VID\",\"promoKind\":\"BOGO\"}" $GW/food/promos)" "403"

echo
echo "=============================================="
echo " 9. SOS → ADMIN INCIDENT BOARD"
echo "=============================================="
SREQ=$(POST /rides/requests "$RIDER" '{"originLat":5.6037,"originLng":-0.1870,"destLat":5.6500,"destLng":-0.1960,"proposedFare":20,"kind":"RIDE","rideType":"STANDARD"}' | jq_ "d['id']")
SB=$(POST "/rides/requests/$SREQ/bid" "$DRIVER" '{"type":"ACCEPT","amount":20,"driverName":"Kwame Driver","lat":5.61,"lng":-0.188}' | jq_ "d['bidId']")
STID=$(POST "/rides/requests/$SREQ/bids/$SB/accept" "$RIDER" '{}' | jq_ "d['id']")
SOS=$(POST "/rides/trips/$STID/sos" "$RIDER" '{"lat":5.6100,"lng":-0.1880}')
SOSID=$(echo "$SOS" | jq_ "d['id']")
eq "rider raises SOS" "$(echo "$SOS" | jq_ "d['status']")" "NEW"
eq "admin sees the incident" "$(GET /rides/sos $ADMIN | python -c "import sys,json;print(any(i['id']=='$SOSID' for i in json.load(sys.stdin)))")" "True"
eq "non-admin blocked from board" "$(CODE /rides/sos $RIDER)" "403"
eq "admin marks handled" "$(PATCH_ "/rides/sos/$SOSID/handle" "$ADMIN" '{}' | jq_ "d['status']")" "HANDLED"
PATCH_ "/rides/trips/$STID/status" "$DRIVER" '{"status":"CANCELLED"}' >/dev/null

echo
echo "=============================================="
echo "10. ADMIN CONSOLE DATA"
echo "=============================================="
eq "KYC list (admin)"      "$(CODE '/auth/driver/kyc' $ADMIN)" "200"
eq "users list (admin)"    "$(CODE '/auth/users?status=PENDING' $ADMIN)" "200"
eq "promos/all (admin)"    "$(CODE '/food/promos/all' $ADMIN)" "200"

echo
echo "=============================================="
echo "11. SECURITY SPOT-CHECKS"
echo "=============================================="
eq "customer blocked from driver feed"   "$(CODE '/rides/requests/nearby?lat=5.6&lng=-0.18&radiusKm=10' $RIDER)" "403"
eq "customer blocked from deliveries"    "$(CODE '/food/deliveries/available' $RIDER)" "403"
eq "non-admin blocked from KYC list"     "$(CODE '/auth/driver/kyc' $RIDER)" "403"
eq "outsider blocked from others' trip"  "$(CODE "/rides/trips/$TID" $VENDOR)" "403"
# 404 (not 403) is deliberate: the gateway hides internal-only paths rather than
# confirming they exist. See JwtAuthFilter.INTERNAL_ONLY_PATHS.
eq "wallet settle hidden at the edge"    "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $RIDER" -d '{}' $GW/wallet/commission)" "404"
eq "no token → 401"                      "$(curl -s -o /dev/null -w '%{http_code}' $GW/rides/trips/mine)" "401"

echo
echo "=============================================="
# ── Leave the demo world as we found it ──────────────────────────────────────
# The cash-order test deliberately puts the courier in debt (that is the model). Left behind, it
# would block them from taking cash orders in a later demo, so undo this run's entries.
docker exec gozone-postgres psql -U gozone -d wallet_db -q -c "
BEGIN;
DELETE FROM ledger_entries WHERE ref_id = '$OID' AND type IN ('CASH_COLLECTED','DELIVERY_FEE');
UPDATE wallets w SET balance = COALESCE((SELECT SUM(l.amount) FROM ledger_entries l WHERE l.wallet_id = w.id), 0)
WHERE w.owner_type = 'DRIVER' AND w.owner_id = 'aaaaaaaa-0000-0000-0000-000000000005';
COMMIT;" >/dev/null 2>&1 || true
echo "        (courier's test cash debt cleared)"

printf " RESULT:  %s passed, %s failed\n" "$PASS" "$FAIL"
[ $FAIL -gt 0 ] && printf " Failures:%b\n" "$FAILED_LIST"
echo "=============================================="
