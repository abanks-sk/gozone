# Issues from device testing — round 2, triaged

The user's raw notes are at the bottom of `docs/TAP_THROUGH.md` (the free-text block and the one
marked `**NOTE**`). This file is those notes turned into something a session can work from:
ordered, numbered, with a first diagnosis and a place to look, because the diagnosis is the
expensive part.

**Read the constraints first — they change what "done" means:**

- **The deadline is hours away** (stated 2026-08-04). Order matters more than volume. §A is money
  moving incorrectly; nothing in §C is worth touching before §A is clear.
- **The user cannot test much of this.** No dev build, limited devices, three apps at once. They are
  explicit: *"I'm relying heavily on you to make sure that everything is done right."* Blank
  checkboxes in `TAP_THROUGH.md` mean **untested**, not passing.
- **"Nothing should be mocked; everything has to actually work else we'll be penalised."** Two
  standing requirements fall out of this and are not built: **dev builds for all three Expo apps**,
  and **the backend hosted** rather than on localhost. See §D.
- The user is in **Kumasi**. Seed data is almost entirely Accra, which makes the shop list useless
  to them.

---

## ⚠️ Before anything: the phantom orders were probably me

The user reports orders they never placed appearing and disappearing on the vendor board, with a
matching food delivery flickering in the driver app — *"this was happening whilst you were working
on the other features."*

**That is almost certainly `scripts/e2e.sh`.** It was run more than a dozen times on 2026-08-04
while ride sharing was being built. §6 of the suite places a real food order, walks it through the
vendor board, assigns a courier and completes it. Against the same stack the user's phone was
pointed at, that is exactly what they describe: an order that appears, moves, and vanishes.

So: **confirm, do not assume a bug.** Check for stray non-terminal orders and deliveries, and only
go looking for a code fault if something is still live with nobody having created it:

```bash
docker exec gozone-postgres psql -U gozone -d food_db -c "SELECT id, status, mode, created_at FROM orders WHERE status NOT IN ('COMPLETED','CANCELLED') ORDER BY created_at DESC;"
docker exec gozone-postgres psql -U gozone -d food_db -c "SELECT id, status, courier_id FROM deliveries WHERE status <> 'DELIVERED';"
```

**Do not run the e2e suite while the user is testing on a device.** It is not read-only.

---

## A. Money is moving wrongly — do these first

### A1. A customer can leave the payment screen without paying, and cannot get back
*Their words: "the user is able to click done and leave the payment screen without making payment…
the user can't go back… The driver is never credited."* Reproduced by switching the method from
wallet to cash at the payment step, then tapping **Done**.

- `customer-app/app/(rider)/live.tsx` — on the completed screen the final button renders
  `{paid ? 'Book another ride' : 'Done'}` and calls `router.replace('/(rider)/home')` either way.
  Nothing stops an unpaid exit, and nothing routes back in.
- Two halves, and **both** are needed. Stop the silent exit (an unpaid trip should not offer a
  neutral "Done"), and give a way back — `app/(rider)/rides.tsx` lists trips, so an unpaid
  COMPLETED one should be tappable straight back to the payment step.
- Check the food and parcel completion screens for the same shape before assuming it is ride-only.
- The driver side is already correct and is good evidence of the intended behaviour: `driver-app`
  `trip.tsx finish()` deliberately keeps the trip when the fare is unsettled.

### A2. A driver exited a trip before confirming cash, and now nobody can settle it
*"the driver mistakenly exited the trip without confirming that the cash had been received… the
driver can't do that on the app because the trip no longer exists."* It happened on a **parcel**
delivery.

- `driver-app/app/(driver)/trip.tsx finish()` guards this for rides — it keeps `activeTrip` while
  `pay.status !== 'PAID'`. The parcel/courier path evidently does not, or the trip was cleared
  another way. Start there and at `driver-app/app/(driver)/deliveries.tsx`.
- Relates to **B3** (driver trip history): with history, an escaped trip is recoverable by design
  rather than by luck.

### A3. Ratings are wrong — a driver rated 4 once shows 4.9
- **4.9 and 4.8 are old hardcoded literals that were never all removed.** A real average endpoint
  exists (`GET /rides/ratings/{userId}`, `RideService.ratingFor`), but at least one screen still
  prints a constant — `driver-app/app/(driver)/trip.tsx` shows `4.8 · {seats} seat` on the passenger
  card. Grep every app for `4.9` and `4.8` near "rating" before anything else.
- ⚠️ **The user has overruled the current "New" behaviour**: *"when the driver is new and has never
  had a trip or has never been rated, the rating should just be zero. There shouldn't be that new
  text."* Today `ratingFor` returns `average: null` below `MIN_RATINGS_TO_AVERAGE` (3) and the apps
  print "New". That was a deliberate choice — one bad night otherwise puts a new driver on 1.0 —
  but it is their product call. **Show 0.** If you change the threshold, change it in
  `RideService.MIN_RATINGS_TO_AVERAGE` and in every app that renders "New".

### A4. Vendors are asked to confirm cash on delivery orders
*"the vendor is automatically credited whichever way payment is made. So that shouldn't show up on
their page."*

- This was supposedly fixed: `FoodService.awaitingCashOrders` filters out DELIVERY and
  `confirmOrderCash` refuses an owner on a delivery order. Either food-service is not running the
  current build, or a path was missed. **Verify against the running stack before rewriting it.**

### A5. Driver debt should come out of the wallet automatically
*"debts should be deducted directly from the driver's wallet if there is enough money in it. If the
money in it isn't enough, it will show the 'You owe GoZone' banner and will be paid with either
Momo or card."* Currently the debt sits as a banner regardless. `wallet-service` + the driver
Earnings screen.

---

## B. Identity and session

### B1. Recent searches vanish on re-login
*"when I logged in again, the recent searches were cleared."*

- **This is a deliberate fix biting back.** `customer-app/src/lib/session.ts clearUserData()` wipes
  profile + recents + payment + cart on logout **and on every fresh verify-otp** — added because a
  new account was inheriting the previous user's recents.
- The fix is to **scope the stores by user id** rather than clearing them wholesale, so signing back
  into the *same* account keeps its own history and a *different* account never sees it.

### B2. Re-login needed after every rebuild; "looks logged in but nothing works"
- The session survives in `storage` but the app comes up unauthenticated-in-practice: a stale access
  token that never refreshes on cold start. Look at `customer-app/src/store/authStore.ts` bootstrap
  and `src/api/client.ts` — the 401/403 refresh path exists but may not run before the first screens
  fire their requests. The symptom "logged in but nothing works" is exactly a stale token being sent
  and every call failing.

### B3. Drivers and couriers have no trip history
Customers have `GET /rides/trips/mine` and `app/(rider)/rides.tsx`. Drivers have nothing equivalent
— add the driver side. Also the recovery route for **A2**.

---

## C. Product and polish

### C1. Names are missing where identity matters
- The customer's name never reaches the driver/courier app for food, product or parcel jobs, so
  couriers cannot verify who they are handing to. *"Even if just their first name."*
- Parcels show the recipient but **not the sender** — add sender details too.
- The customer's name should also be on vendor orders and deliveries.

### C2. Parcel completion says "Send another parcel" — should just say Done

### C3. Star rating still locks on the first star touched
A drag-across `StarRating` was built (`src/components/ui.tsx` in customer + driver). The user still
reports locking, so either the shared component is not used on the screen they hit, or the drag
handler is not firing on device. Check every rating screen actually imports it.

### C4. Admin approvals show too little
*"It only shows the person's name and whether they are a driver or a vendor."* An approvals rework
was built (applicant detail, business name, KYC merged into account approval, `GET /auth/users/{id}`)
— **verify what is actually deployed before rebuilding it.** If it is there and the user did not see
it, that is a discoverability bug, not a missing feature.

### C5. Vendor cannot add a second shop
Also reportedly built (`/onboarding?add=1` from the switcher). Same instruction: verify first.

### C6. Vendor app gaps
- A **"Your Details"** section under Account on the profile screen — the identity moved to the
  banner at the top and the details have nowhere to live now.
- **Menu/catalogue items must be editable**: add images to items that had none at setup, and change
  item contents. Note the current rule that menu edits need the shop CLOSED (409 while OPEN) —
  except `available`. That is deliberate; keep it unless the user says otherwise.

### C7. Order and delivery timeouts
- An order the vendor has not confirmed after **5 minutes** should auto-cancel, leave live orders,
  and tell the customer the vendor is busy.
- A delivery with no courier after **2 minutes** should offer the customer pickup or cancel.
- Cancelled deliveries must stop appearing in the driver app.

### C8. SOS should carry who is involved
Names of the driver and the customer, not just coordinates. The user also wants **live** location for
both, tracked for the duration.

### C9. Map and location
- The **route does not draw on the GoRide screen map**.
- Selecting "use this address" while the picker is still loading sets the location to "Pinned
  location". Disable confirmation until the reverse-geocode resolves.
- **GoShop should open on the customer's current location** on first sign-up *and* on every login.

### C10. Payment copy is too heavy
Drop the repeated "confirmed by Paystack" on the payment screen — one line saying cards and mobile
money are charged securely by Paystack is enough. The save-your-card copy is confusing because there
is no card entry in the payment methods.

### C11. Google sign-in and forgotten password
Neither exists. Google needs OAuth client IDs, `GOOGLE_CLIENT_IDS` set, and **a dev build** — it
cannot work in Expo Go, so it is gated behind §D.

---

## D. The two standing requirements behind everything

### D1. Dev builds for all three Expo apps
Expo Go is why push banners, real camera behaviour and Google sign-in cannot be tested. The user
names this as a requirement, not a nice-to-have.

### D2. The backend must be hosted
*"we also have to host the back end because now it's a requirement."* Everything currently assumes
`localhost:8080` with IP auto-detection on the LAN. See `docs/DEPLOYMENT.md`.

### D3. Fresh, realistic, local data
- **Clear the databases** so the system feels new — the user specifically calls out stale delivery
  requests in the driver app.
- Seeds must be **realistic**: mixed (not all Ghanaian) names for users, drivers, couriers and
  vendors; real catalogue items and images; known food chains are explicitly welcomed.
- **Shops must be filtered to the customer's region.** The user is in **Kumasi** and nearly every
  seeded vendor is in Accra, so the shop list is empty of anything usable. This is both a seeding
  job and a query change.

---

## What changed on 2026-08-04 that you need to know

Ride sharing was built end to end (ride migrations **V9–V13**). The two things most likely to trip
you up:

1. **A fare belongs to a passenger, not a trip.** `trips.agreed_fare` is the sum of everyone's share
   — what the driver earns and what commission comes off. `trip_passengers.locked_fare` is what one
   person owes. **Anything quoting a price to a passenger must read `myFare` on `TripResponse`,
   never `agreedFare`.** Payment, cash confirmation and history are all per passenger; the wallet
   settles once, when everyone has paid. This is directly relevant to **A1**.
2. **`scripts/e2e.sh` writes to shared demo state**, and a section that does must undo it — §4b
   deletes the ratings it creates because otherwise it broke an unrelated assertion in §2c three
   runs later. Run the suite **twice in a row** to prove a change is repeatable; one green run does
   not.

Suite is **311/311**. Rebuild after backend changes:

```bash
docker compose build ride-service && docker compose up -d ride-service
```
