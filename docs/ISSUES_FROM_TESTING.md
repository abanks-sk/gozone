# Issues from device testing — triaged

Raised by the user during the first real tap-through (see `TAP_THROUGH.md` for the run itself,
where `[/]` means partly passing and `((notes))` are the user's own).

**Status: every issue from the device tap-through — A (A1–A7), B (B1–B3), C (C1–C7) — is fixed.** `dest` is still the `NO_DEST`
sentinel — converting it to a proper nullable type remains the right fix, and would have made A1 a
compile error rather than a bug report. Ordered by cost-to-fix so a session can clear the cheap
correctness bugs first and not stall on the feature work. Each entry says where to look, because
the diagnosis is the expensive part and it is already done here.

⚠️ **A4 and A5 are code-verified but not device-verified** — they are phone-side appearance, and
the failing device is the only thing that can clear them. Re-run `TAP_THROUGH.md` §2.

---

## A. Quick correctness bugs — do these first

**A1. A fare is quoted with no destination.** — ✅ FIXED
`(rider)/home.tsx` guards the *quote fetch* with `hasDest(dest)`, but `fare` is seeded from
`useState(() => rideFare(distance, 1))` and `distance` is computed against `NO_DEST` (0,0), so a
stale figure renders anyway. Guard the fare *display*, not just the fetch.
→ This is the `NO_DEST` sentinel leaking exactly where predicted. Converting `dest` to a proper
nullable type would have caught it at compile time; worth doing now rather than patching again.

**A2. Destination survives logout.** — ✅ FIXED
Empty on a fresh *account* but not a fresh *login*. `rideDraft` is not cleared by
`src/lib/session.ts clearUserData()` — add it alongside profile/recents/payment/cart. Same class of
bug as the "new account inherited the previous user's data" fix; the store was simply missed.

**A3. Splash wordmark colour.** — ✅ FIXED
Corrected requirement: the company name should be **white**, the motto **blue**. Both had ended up
blue. Name now `brand.text`, motto stays `brand.glow`, in all three apps.

**A4. GZ mark missing or malformed on some devices.** — ✅ FIXED (needs a device to confirm)
`GzMark` tinted the navy PNG white with `Image` `tintColor`. That tint silently does nothing on some
Android builds, and when it does nothing the mark renders **navy on a near-black brand background** —
invisible, which is exactly "the GZ doesn't appear". Replaced with a **pre-whitened asset**
(`assets/gz-logo-white.png`, alpha preserved, RGB forced to white) selected by the `color` prop;
`tintColor` is gone entirely, so there is nothing left to fail. All three apps. Same public API, so
no call site changed.

**A5. Glow orb appears in a top corner on some screens that already have the glow background.** — ✅ FIXED
The distinction was "screen already shows a logo or hero". Five screens did both: `welcome.tsx` in all
three apps (corner orb beside the `Logo` squircle) and the awaiting-approval view of driver + vendor
`onboarding.tsx` (corner orb on top of `GzHero`, which carries its own glow). Corner orb dropped on
those only. Register, verify-OTP and the onboarding setup form keep theirs — they have no logo, which
is why it was "only some screens".

**A6. Walk-in / pickup estimate does not count down as the vendor works.** — ✅ FIXED
`readyInMinutes` ignored elapsed time, so it returned the same number at PLACED and ten minutes into
PREPARING. New **`orders.preparing_at`** (food **V10**) stamped on first entry into PREPARING —
`created_at` is the wrong clock, because an order sits at PLACED for however long the vendor takes to
confirm it, and nothing is cooking then. `collectionLeaveTime` (renamed from `walkInLeaveTime`)
subtracts elapsed cooking time, flooring at 1 while still cooking so only READY reports 0.
Also **widened to PICKUP** — a pickup customer travels to the counter too — with delivery refused
**409** (explicit status: this service has no exception handler, so a bare `IllegalStateException`
became an opaque 500). Verified live: 15 → 15 at PLACED, then 15 → 10 → 3 → 0 as the kitchen works.
Frontend: the card now shows for pickup as well, and says *"The kitchen hasn't started yet — the
countdown begins when they do"* before PREPARING, rather than leaving a frozen number unexplained.

**A7. Vehicle class "Awaiting admin" never reaches the admin web.** — ✅ FIXED
Diagnosis was right: Approvals filters `status=PENDING`, but a car driver is class-null **and already
ACTIVE**, so approving them removed them from the only screen that could grade them. New
**`GET /auth/users/awaiting-class`** (ADMIN/SUPER_ADMIN; DRIVER/COURIER with `vehicle_class IS NULL`,
excluding REJECTED, deliberately *not* status-filtered). Admin web gained an **"Awaiting vehicle
class"** section on Approvals — de-duplicated against the pending list so one driver never shows two
class pickers — and an **"Awaiting vehicle class"** count plus a "Grade N vehicles" shortcut on the
Dashboard.

---

## B. Blocked flows — these stopped the tester — ✅ ALL FIXED

**B1. Cannot add dishes or items to the catalogue.** — ✅ FIXED
**The API was never broken.** Verified live: `POST /food/restaurants/{id}/menu` returns 200 and
creates the item, with or without add-on groups. The bug was in the app, and it was a *silent*
one: `submitItem` began `if (!vendor) return;` with no message, so tapping "Add to catalogue"
did nothing whatsoever — no error, no spinner.

`vendor` was null because **only `orders.tsx` ever selected a business** (it fetched `myVendors`
and defaulted to the first); `menu.tsx` and `queue.tsx` just read the store and bailed. Signing
out clears the stored selection, so after **every fresh login** going straight to Catalogue gave
an empty list and a dead Add button. Queue had the same latent bug.

Fixed by moving the selection into **`(vendor)/_layout.tsx`**, so it belongs to being signed in
rather than to whichever tab you happened to open. Also removed the silent failures: the null-vendor
case now explains itself, and `load()`'s two bare `catch {}` blocks — which rendered a failed fetch
as "no items yet", identical to an empty catalogue — now show the server's message with a retry.

**B2. Driver sees nothing explaining why there is no work.** — ✅ FIXED
Worse than "says nothing": it showed a spinner reading *"Looking for requests nearby…"* forever, so
an unapproved driver could not distinguish their own blocked account from a quiet night. A car is
class-null until an admin grades it, and the backend's class filter then matches nothing.
`feed.tsx` gained a `blockedReason` covering both causes (account not ACTIVE, or no vehicle class)
with a **Check again** button, mirroring the Deliveries tab. The `nearby` poll is skipped while
blocked — it requires `STATUS_ACTIVE`, so it would have stacked a 403 "Can't load requests" on top
of the real explanation. Separately, an *approved* driver with genuinely no work now sees **"No
requests right now"** plus the search radius, instead of the same eternal spinner.

**B3. Courier live location not showing during delivery.** — ✅ FIXED
Three separate faults, only the first of which was the reported one.
1. **No map.** The card printed raw coordinates (`Courier near 5.6037, -0.1870`), which tells a
   customer nothing. Replaced with a real `LeafletMap`.
2. **Wrong start.** It subscribed at `OUT_FOR_DELIVERY`, but the courier's app pushes GPS from the
   moment they *accept* — while the order is still READY — then drives to the restaurant and only
   then flips the order. The entire first leg was discarded. Now subscribes from READY, with copy
   that follows the phase ("Finding you a courier" → "Courier heading to the restaurant" → "Your
   courier is on the way").
3. **The map had nothing to point at, and the courier was in the wrong place.** `deliveryLat/Lng`
   were sent at checkout, used once to price the delivery fee, and **discarded** — the same
   collected-then-thrown-away bug as the parcel handover details. So the platform never knew where
   an order was going. Worse, because the courier app only received an *address string*, its demo
   GPS walked six coordinates hardcoded into the app: the same stretch of central Accra whichever
   restaurant the order came from, looping back to the start every six pings.
   Fixed with **`orders.delivery_lat/lng` (V11)**, both endpoints exposed on `OrderResponse` and
   `DeliveryResponse`, and a courier path generated **between the real endpoints** — phase-aware
   (to the vendor, then to the customer) and holding at the destination instead of wrapping.

⚠️ The scope note said to seed a distant vendor because movement was unobservable. The real cause
was the hardcoded path above, not the vendor spacing — but the note was right that everything sits
within ~2 km. Added **Tema Harbour Grill** (`…005`, ~20 km east) to `seed/02_food_seed.sql`, which
also exercises the distance-based delivery fee: GH¢35.28 on a Tema→Osu order, against a
central-Accra order that always sat near the floor.

---

## C. Product gaps — C2/C3/C4/C6/C7 DONE; C1 and C5 remain

**C6. Keyboard avoidance.** — ✅ FIXED (global)
`react-native-keyboard-controller` was not an option: it ships native code and needs a dev build,
and everything here must run in Expo Go. `KeyboardAvoidingView` was already in use on four auth
screens and still didn't work, because every call site passed
`behavior={Platform.OS === 'ios' ? 'padding' : undefined}` — and `undefined` on Android means *do
nothing*, deferring to a window resize that **never happens under SDK 54 edge-to-edge**. So the
platform the tester was using had no keyboard handling at all.
New **`src/components/KeyboardAvoider`** in all three apps, wrapping the Stack in each root
`_layout`. It measures the real keyboard (`endCoordinates.screenY`) and the real focused field,
then lifts by **exactly the overlap** — which is what makes it safe to apply globally: a field that
already clears the keyboard yields zero, so a map with a top search bar never jumps. The four
per-screen `KeyboardAvoidingView`s were removed to avoid double-shifting. Modals render in their
own hierarchy and cannot be reached from the root, so the vendor add-item sheet (which had none at
all, with add-on fields at the very bottom) and both `CashOutSheet`s wrap themselves.

**C2. Vendor app should admit unverified users.** — ✅ FIXED
`onboarding.tsx` parked them on a full-screen "awaiting approval" page whose only control was Log
out — they could not reach their profile, add an email or correct anything while waiting, which is
exactly when they'd want to. New **`VendorGate`** wraps Orders/Queue/Catalogue/Earnings and
distinguishes four states (checking / no business yet / under review / rejected); **Profile is
deliberately not gated**. `roleHome()` now returns `/(vendor)/orders`, and `_layout` polls
`/auth/me` so the app opens up by itself on approval.
⚠️ Caught while building it: the *only* route to Profile was an avatar inside the orders board,
which the gate replaces — so "restrict them to settings" would have left settings unreachable.
Every gated state now carries a **Profile & settings** link.

**C3. Vendor location via map picker.** — ✅ FIXED
Vendor coordinates were hardcoded to Accra at sign-up with no editor anywhere, which quietly
breaks delivery pricing, courier routing and "how far is this shop". Added
**`app/pick-location.tsx`** — purpose-built rather than a port of the customer's `map-picker`,
which is entangled with ride drafts, shop carts, recents and saved places. Uses the WebView/iframe
Leaflet map only (**not** `react-native-maps`, which needs a dev build). Reachable from the
storefront editor and from onboarding, so a new vendor is no longer born on the wrong pin.
⚠️ **Adds `react-native-webview` + `expo-location` to vendor-app — run `npm install` there.**

**C4. Vendor storefront editing.** — ✅ FIXED
The page customers read had no editor and no columns to store one, so every storefront was
whatever the seed said, over stock photography hardcoded in the customer app's bundled metadata.
**V12** adds `description`, `image_url`, `address` to `restaurants`; new **`PATCH /food/vendors/{id}`**
(owner-guarded, partial, blank-name rejected, coordinates accepted only as a pair). New vendor
**`app/storefront.tsx`** with a live cover preview; the customer menu screen now prefers the
vendor's own banner/address/description and falls back to bundled metadata, so seeded vendors look
exactly as before.
⚠️ Two real bugs found while verifying this: `GET /food/restaurants` had **no ORDER BY**, so
updating any vendor row reshuffled the customer's shop list (now ordered by name); and the e2e
money assertions compared *formatted strings*, so `10.60` vs `10.6` failed on equal amounts.

**C7. One-tap saved cards.** — ✅ FIXED
Ride-only before; food orders and top-up bounced a customer with a saved card out to Paystack
anyway. Both now charge server-side via `chargeCard`, through the same verification path as a
checkout payment. **Parcel had the identical gap** and was fixed too — the triage only spotted two
of the four payment points.

---

**C5. Bolt-style scrollable map on the customer home.** — ✅ FIXED
The map was a fixed band across the top: you could see a third of it and no more, on the screen
whose whole job is showing you where you are. It is now full-screen, with everything else (search,
Ride/Shop/Parcel, the GoRide composer, recents) in a sheet you can pull down — leaving the search
bar docked at the bottom.
Built on **PanResponder + Animated**, not a bottom-sheet library: reanimated and gesture-handler
are not in this app and adding native modules would cost the Expo Go workflow. The drag lives on
the handle and search row only, so it never fights the scrolling content underneath. A flick beats
position on release, so throwing it down finishes the throw instead of springing back.
Two things worth knowing about the implementation:
- The sheet's height is **exactly** `screenH - EXPANDED_Y`. Any taller and the inner ScrollView
  believes part of its viewport is on screen when it is actually below the fold, which makes the
  last of the content unreachable — it thinks there is nothing left to scroll.
- `useNativeDriver` is off on web (React Native Web has no native animated module and warns on
  every call) and on everywhere else, which is what keeps the drag smooth on a phone.

⚠️ **Verified in a browser as far as the environment allows.** Confirmed with real measurements:
the map now fills all 812pt of a 375×812 viewport (it was a 276pt band), the sheet sits at 276
with its bottom flush to the screen edge, and pressing the handle really does toggle the state
(the label changes). **The slide itself could not be observed** — the headless pane never
composites, so `document.hidden` is true and the browser suspends `requestAnimationFrame`, which
freezes every JS-driven animation including RN's. That is a limitation of the harness, not
evidence either way. **The pull-down still needs a real device.**

---

**C1. Unmock driver KYC.** — ✅ FIXED
Documents were a hardcoded `https://placeholder.example/kyc/roadworthy.pdf` the app set on tap.
Nothing was captured, nothing was sent, and the seed wrote the same placeholders — so an admin
pressing **Approve** was approving a string. Now real photographs: **driver, licence, vehicle**.

**Storage — a served folder** (the user's choice over object storage: no third-party account or
credentials needed). Files live on a **Docker named volume** (`kyc_uploads` → `/var/gozone/uploads`).
That is not incidental: auth-service is rebuilt constantly, and written into the container's own
filesystem every driver's documents would be destroyed by the next build. Verified by destroying
and recreating the container — the files survived.

**Three ways this could leak, all closed:**
1. **The filename** is generated server-side and never taken from the client — an uploaded name is
   attacker-controlled and `../../application.yml` is the first thing anyone tries.
2. **The content** is sniffed by magic bytes; the declared `Content-Type` is just a header. A PHP
   payload named `.png` and declared `image/png` is refused **415** (verified).
3. **The reader** is checked against the recorded owner. Owner **200**, admin **200**, another
   user **404**, no token **401** (all verified). 404 rather than 403 on purpose — a 403 confirms
   the document exists, which is itself something a stranger should not learn about someone's ID.

Backend: **V6** adds an `uploads` table (the row is the access-control list; the folder is only
bytes) plus `driver_kyc.licence_url` / `vehicle_photo_url`. `POST /auth/uploads` (multipart, 6 MB)
and `GET /auth/uploads/{id}`. Submission now **requires** the three photos and rejects any URL
that is not one of ours — otherwise a driver could point at an image whose contents change after
review. `KycResponse` gained the driver's name and phone, because the admin list showed a
truncated UUID and you cannot verify an identity against an id fragment.

Driver app: `expo-image-picker` (lazily imported — a top-level Expo native import has crashed
Expo Go startup before), camera or library, compressed to 60% on device. Each row shows the
photo you just took; on a resumed session a tick stands in, because the served copy needs an auth
header that `<Image>` cannot send on web. Admin web: the images render in the review page via an
authenticated blob fetch, click to enlarge.

⚠️ **Adds `expo-image-picker` to driver-app — run `npm install` there.**
⚠️ **Not device-verified**: the camera, the picker and the upload from a real phone all need a
tap-through. The API is verified end to end with curl.

---

## C. Remaining

Nothing. Every item raised in the tap-through is implemented.

What is *not* done is **device verification** — most of these are phone-side and only the handset
can clear them. `TAP_THROUGH.md` is the list, and the sections added for A4/A5, B1–B3 and C1–C7
each say what the old broken behaviour was, so a real fix can be told apart from a coincidence.

---

## Suggested order

1. ~~**A1–A7** — one session, all small, all correctness.~~ **DONE.** Converting `dest` to a proper
   nullable type was *not* done and is still outstanding — it is the root cause behind A1.
2. ~~**B1–B3**; B1 unblocks the prep-time tests that could not run.~~ **DONE** — so §8 of
   `TAP_THROUGH.md` (prep time, leave time) is now testable and should be run.
3. ~~**C6, C2, C3, C4, C7** — grouped; C6 first since it touches every form.~~ **DONE**, and
   **C5** with them (the pull-down map).
4. ~~**C1** — on its own, with storage decided up front.~~ **DONE** (served folder on a
   Docker volume).

Re-run `scripts/e2e.sh` (**148/148** after the A and B batches — the suite gained a "6c. COLLECTION
ESTIMATE" section that winds `preparing_at` back ten minutes and asserts the figure actually drops,
plus the awaiting-class list) after each backend change, and re-run the relevant `TAP_THROUGH.md`
section after each front-end one.

⚠️ The suite still consumes the staged walk-in customer via "call next". Re-stage by flipping the
existing entry, never by placing a fresh order:
`UPDATE queue_entries SET status='WAITING' WHERE order_id='7b223015-6710-4ac4-ac27-5db53843a9ff';`
