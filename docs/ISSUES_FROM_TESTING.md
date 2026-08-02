# Issues from device testing — triaged

Raised by the user during the first real tap-through (see `TAP_THROUGH.md` for the run itself,
where `[/]` means partly passing and `((notes))` are the user's own).

**None of these are fixed yet.** Ordered by cost-to-fix so a session can clear the cheap
correctness bugs first and not stall on the feature work. Each entry says where to look, because
the diagnosis is the expensive part and it is already done here.

---

## A. Quick correctness bugs — do these first

**A1. A fare is quoted with no destination.**
`(rider)/home.tsx` guards the *quote fetch* with `hasDest(dest)`, but `fare` is seeded from
`useState(() => rideFare(distance, 1))` and `distance` is computed against `NO_DEST` (0,0), so a
stale figure renders anyway. Guard the fare *display*, not just the fetch.
→ This is the `NO_DEST` sentinel leaking exactly where predicted. Converting `dest` to a proper
nullable type would have caught it at compile time; worth doing now rather than patching again.

**A2. Destination survives logout.**
Empty on a fresh *account* but not a fresh *login*. `rideDraft` is not cleared by
`src/lib/session.ts clearUserData()` — add it alongside profile/recents/payment/cart. Same class of
bug as the "new account inherited the previous user's data" fix; the store was simply missed.

**A3. Splash wordmark is white, motto is blue.**
Both should be blue. `app/index.tsx` sets `brand.primaryBright` on the name — check it is not being
overridden, and that all three apps match.

**A4. GZ mark missing or malformed on some devices.**
`GzMark` renders the PNG with `tintColor`. Suspect the cleaned asset's alpha or the tint on certain
Android versions. Test on the device that fails; fall back to an untinted white variant if needed.

**A5. Glow orb appears in a top corner on screens that already have the glow background.**
Double-rendered `GlowOrb` — one from `BrandScreen`, one from `GzHero`. Find the screens that use
both and drop the inner one.

**A6. Walk-in / pickup estimate does not count down as the vendor works.**
`readyInMinutes` is computed from queue position and prep time only; it ignores *elapsed* time, so
it returns the same number at PLACED and ten minutes into PREPARING. Fix in
`FoodService.walkInLeaveTime`: subtract time since the status timestamp (needs a `preparing_at` or
similar, or derive from `updated_at`).

**A7. Vehicle class "Awaiting admin" never reaches the admin web.**
Driver profile shows it, admin Approvals does not list them. Likely the Approvals query filters on
account `status=PENDING` while these drivers are already ACTIVE with a null `vehicle_class`. Needs a
separate "awaiting class" list, not the approval list.

---

## B. Blocked flows — these stopped the tester

**B1. Cannot add dishes or items to the catalogue.** Blocks §8 prep-time testing entirely. Reported
before as "could not add item" when food-service was stale — food-service *has* been rebuilt, so
this is a new cause. Check the create call against `POST /food/restaurants/{id}/menu` and read the
actual server message.

**B2. Driver sees nothing explaining why there is no work.** An unverified driver gets a silent
empty feed. The Deliveries tab was fixed this way already; the **main feed** needs the same
treatment — a clear "your account is still being verified" state on the first screen.

**B3. Courier live location not showing during delivery.** Customer order screen has the courier
card but no map. The WS topic broadcasts on the **order id** and the plumbing exists — wire the map
in, mirroring `(rider)/live.tsx`.

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

**C4. Vendor profile editing**, including what customers see (business name, image, description).

**C5. Bolt-style scrollable map on the customer home.** Pull the sheet down to reveal the full map,
search bar docked at the bottom. A layout change to `(rider)/home.tsx`.

**C6. Keyboard avoidance.** Screens do not lift when a low text field is focused. Needs
`KeyboardAvoidingView` / `react-native-keyboard-controller` applied **globally**, not per screen —
otherwise it gets fixed once per form forever.

**C7. One-tap saved cards for food checkout and top-up.** Ride flow only today. Same three lines per
call site; deferred previously for context, not difficulty.

---

## Suggested order

1. **A1–A7** — one session, all small, all correctness. Convert `dest` to nullable while in there.
2. **B1–B3** — one session; B1 unblocks the prep-time tests that could not run.
3. **C6, C2, C3, C4, C7** — grouped; C6 first since it touches every form.
4. **C5** — on its own, it is a visual rework.
5. **C1** — on its own, with storage decided up front.

Re-run `scripts/e2e.sh` (121/121 today) after each backend change, and re-run the relevant
`TAP_THROUGH.md` section after each front-end one.
