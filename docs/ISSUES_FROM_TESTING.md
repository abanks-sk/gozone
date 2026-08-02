# Issues from device testing — triaged

Raised by the user during the first real tap-through (see `TAP_THROUGH.md` for the run itself,
where `[/]` means partly passing and `((notes))` are the user's own).

**Status: sections A (A1–A7) and B (B1–B3) are fixed. C is open.** `dest` is still the `NO_DEST`
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

## C. Product gaps — real work, scope each before starting

**C1. Unmock driver KYC.** Needs real uploads: driver photo, vehicle photo, licence. This is file
storage (S3/Cloudinary or a served volume), an upload endpoint, and admin review UI showing the
images. **The single biggest item on this list** — do not start it in the same session as anything
else.

**C2. Vendor app should admit unverified users** like the driver app does — let them in, restrict to
profile/settings until approved.

**C3. Vendor location via map picker / current location.** Port the customer's `map-picker` flow.
Currently hardcoded Accra coordinates.

**C4. Vendor *storefront* editing.** Personal/business profile editing already works — this is the
**kitchen information shown on the customer's menu screen**: the header, description, imagery and
anything else a customer reads before ordering. That surface has no editor at all today.

**C5. Bolt-style scrollable map on the customer home.** Pull the sheet down to reveal the full map,
search bar docked at the bottom. A layout change to `(rider)/home.tsx`.

**C6. Keyboard avoidance.** Screens do not lift when a low text field is focused. Needs
`KeyboardAvoidingView` / `react-native-keyboard-controller` applied **globally**, not per screen —
otherwise it gets fixed once per form forever.

**C7. One-tap saved cards for food checkout and top-up.** Ride flow only today. Same three lines per
call site; deferred previously for context, not difficulty.

---

## Suggested order

1. ~~**A1–A7** — one session, all small, all correctness.~~ **DONE.** Converting `dest` to a proper
   nullable type was *not* done and is still outstanding — it is the root cause behind A1.
2. ~~**B1–B3**; B1 unblocks the prep-time tests that could not run.~~ **DONE** — so §8 of
   `TAP_THROUGH.md` (prep time, leave time) is now testable and should be run.
3. **C6, C2, C3, C4, C7** — grouped; C6 first since it touches every form.
4. **C5** — on its own, it is a visual rework.
5. **C1** — on its own, with storage decided up front.

Re-run `scripts/e2e.sh` (**135/135** after the A and B batches — the suite gained a "6c. COLLECTION
ESTIMATE" section that winds `preparing_at` back ten minutes and asserts the figure actually drops,
plus the awaiting-class list) after each backend change, and re-run the relevant `TAP_THROUGH.md`
section after each front-end one.

⚠️ The suite still consumes the staged walk-in customer via "call next". Re-stage by flipping the
existing entry, never by placing a fresh order:
`UPDATE queue_entries SET status='WAITING' WHERE order_id='7b223015-6710-4ac4-ac27-5db53843a9ff';`
