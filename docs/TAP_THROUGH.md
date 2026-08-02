# Device tap-through checklist

Everything here is **unverified by any automated test** and can only be cleared on a real device.
The e2e suite (121/121) covers the backend; these are the phone-side behaviours it cannot reach —
React Native Web ignores synthetic clicks, so none of this has ever been seen running.

Work top to bottom. **§1 first** — if the app red-screens on launch nothing else is testable.

Setup: backend up (`docker compose up -d`, wait for all six healthy), then `npm start -- --clear`
in each app. Phone and laptop on the same Wi-Fi.

---

## 1. Launch — the crash guard ⚠️ blocker

| Step                                                             | Expected                                               | If it fails                                                                                                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open the customer app on a **physical Android** phone in Expo Go | Splash appears, no red screen                          | `expo-notifications` is still being imported. The guard in `src/lib/push.ts` keys off `expo-constants`; check `Constants.executionEnvironment` is actually `storeClient` in Expo Go on your SDK |
| Watch the Metro log                                              | No `expo-notifications ... removed from Expo Go` error | as above                                                                                                                                                                                        |

iOS does not throw here, so **this must be checked on Android** — that is where the error was reported.

---

## 2. Splash and branding

- [/] Glow orb is noticeably wider than the GZ mark, and the **mark sits inside the glow** rather than overhanging it ((appears well on some devices but the Gz does not appear or loads wierdly on some devices))
- [x] Not _too_ wide — if it is, `glowScale` in `src/components/brand.tsx` (currently `2.6`) is the single knob; try `2.4`
- [x] Wordmark sits **well below** the orb, not tucked under it
- [x] "GoZone" and the motto are **blue**, not white ((app name changed to white and motto remains blue))
- [x] Driver app says **GoZone Driver**, vendor app says **GoZone Vendor**

**Retest after the A4/A5 fixes — this is the section that could not be cleared:**

- [ ] **On the device where the GZ did not appear**, the mark now shows white on the splash. The fix
      removed `tintColor` entirely in favour of a pre-whitened asset, so a failing tint can no longer
      leave a navy mark on a near-black background. If it is *still* missing, the cause is the asset
      itself, not the tint — check `assets/gz-logo-white.png` loads at all
- [ ] Welcome screen (all three apps): **no glow orb in the top-right corner** — only the blue
      squircle logo. The brand background keeps its own glow
- [ ] Driver and vendor **awaiting-approval** screens: the hero glow is centred behind the mark, with
      **no second orb** in the corner
- [ ] Register / verify-OTP / driver-and-vendor setup form **still have** their corner orb — those
      screens carry no logo, so the orb is the only light source and is meant to be there

---

## 3. Ride home — greeting and map

- [x] Greeting text is **dark and readable** over the map, in **both** light and dark mode (toggle via Profile → Appearance)
- [x] No hard white-on-black seam between the map and the content below it in dark mode
- [x] Avatar bubble looks as it did before (dark translucent, not blue)
- [x] Map fills the top ~third, your **blue dot** is on it
- [x] **Destination starts empty** on a fresh account — no "Osu" prefilled ((not only a fresh account but also fresh login or session))
- [x] With no destination the button reads **"Choose a destination"** and opens the search screen
- [ ] No fare is quoted until a destination is set ((fair is being quoted))

---

## 4. Markers — the blinking fix

- [x] Open the map picker and **drag the map around continuously**
- [x] The blue dot and the pickup/destination dots **do not flicker** while panning
- [x] They are still _visible_ — the 800 ms tracking window is what guarantees they get captured before tracking stops. **A missing dot is a worse failure than a blinking one**; if a dot never appears, raise the timeout in `useSettledTracking`
- [ ] During a live ride the **vehicle marker still rotates** to its heading (it must keep redrawing while moving)
- [ ] Same checks in the **driver app** — it is a separate copy of the component

---

## 5. Location and recents

- [x] Ride search → **"Use current location"** returns immediately, does not spin
- [x] The field shows "Current location" briefly, then **upgrades to a real street name**
- [x] Go back into search: the **recent entry shows the street name**, not "Current location" ← this was the bug
- [x] Do it twice from the same spot — you get **one** recent, not two
- [x] On first launch the **pickup defaults to where you are**, named (not "Current location", not Kotoka Airport)
- [x] Same "use current location" flow on the **GoShop address** screen

---

## 6. Payments ⚠️ highest risk — this is where money is lost

**Wallet top-up** (already verified once, re-confirm):

- [x] Add money → Paystack opens → complete → return to app → **balance increases**
- [x] Kill the app during checkout, reopen → the payment is **still redeemed**

**Food order — never tested on device:**

- [ ] Place an order, pay with momo or card → Paystack → return → order shows **PAID**
- [ ] Repeat but force-close the app while on the Paystack page, then reopen the order
- [ ] Order settles as PAID; you are **not** asked to pay again ← the fix
- [ ] Vendor board shows it paid

**Parcel — never tested on device:** same two steps on a parcel fare.

**Cash:**

- [ ] Customer picks cash → sees "waiting for driver to confirm"
- [ ] Driver sees a **"Confirm cash received"** button (not "credited")
- [ ] Driver confirms → customer flips to PAID, driver's Earnings increases
- [ ] Driver can **still take new work** while a completed trip awaits cash

**Saved cards — cannot pass in mock mode:**

- [ ] Requires a **real `PAYSTACK_SECRET_KEY`**. With `mock`, capture is skipped by design and no card will ever appear
- [ ] With a live key: pay by card once → card appears under Payment → next ride charges **in one tap, no browser**
- [ ] Check `docker logs gozone-wallet | grep CARD` — silence means the capture path did not fire
- [ ] Mobile Money has **no "add number" form** and always goes to Paystack

---

## 7. Shop — courier and vendor flows

**The courier bug:**

- [ ] Vendor advances a **delivery** order to READY
- [ ] A driver whose vehicle class is **Okada, Standard or Luxe** sees it under **Deliveries** ← this was the bug
- [ ] A driver with an **unapproved car** sees "An admin still needs to approve your vehicle", not an empty list
- [ ] Courier accepts → customer sees live courier location → DELIVERED completes the order

**Courier map (B3) — order from Tema to see it properly:**

> Order from **Tema Harbour Grill**, not a central-Accra vendor. The other five sit within about
> two kilometres of each other, and at that scale you cannot tell a moving marker from a stuck one.
> Tema is ~20 km out, so the courier visibly covers ground.

- [ ] Customer order screen shows a **map**, not a line of raw coordinates ← this was the bug
- [ ] The map appears **as soon as the order is READY**, before the courier has collected anything —
      you should watch them drive *to the restaurant* first. It used to appear only after pickup
- [ ] Card reads **"Finding you a courier"** → **"Courier heading to the restaurant"** →
      **"Your courier is on the way"** as the job progresses
- [ ] The courier marker moves along the **real route between the restaurant and your address** —
      it used to walk a fixed loop in central Accra regardless of the order, and teleport back to
      the start every six updates
- [ ] Your address shows as a **destination pin** on the map
- [ ] On the **courier's** side the same two pins and the current leg are drawn, and the leg
      switches from "to the restaurant" to "to the customer" when they tap picked-up
- [ ] Live/Stale badge only appears once a courier is actually assigned

**Pickup / walk-in:**

- [x] A **pickup** order at READY offers **"Handed to customer"** — _not_ "Out for delivery" ← this was the bug
- [x] A **walk-in** order at READY offers **"Served — complete"**
- [x] Neither produces an "invalid transition" error
- [ ] Customer gets a notification at READY: pickup → "ready for collection", walk-in → "head to the counter"
- [ ] A **delivery** customer gets nothing at READY, but is told when the **courier collects**

---

## 8. Walk-in leave time

- [x] Place a walk-in order; the order screen shows **"Leave in N min"** with the reasoning under it
- [ ] Countdown reaches zero → card flips to **"Time to set off"** and an **alert fires once** (not repeatedly)
- [ ] Deny location permission → card degrades to **"Ready in about N min"** with a prompt, no crash
- [ ] Card **disappears** once the order completes or is cancelled

**The countdown fix (A6) — verified server-side, wants a device pass:**

- [ ] While the order sits at PLACED/CONFIRMED the figure **does not move**, and the card explains
      why: _"The kitchen hasn't started yet — the countdown begins when they do."_ This is deliberate;
      nothing is cooking, so a ticking number would imply progress that is not happening
- [ ] The moment the vendor taps **Start preparing**, the figure begins dropping — leave the screen
      open for a few minutes and watch it fall (it refreshes on the existing 4s poll)
- [ ] It never reads **0** while still cooking; only a READY order shows 0
- [ ] A **pickup** order now gets the same card (it used to be walk-in only). A **delivery** order
      still gets none — there is no journey for the customer to time
- [ ] Curl equivalent, if you want it without waiting:
      `GET /food/orders/{id}/leave-time?lat=&lng=` → `readyInMinutes` should fall between calls
      once PREPARING

**Prep time:**

- [ ] Vendor catalogue: each dish has a **prep chip** ("Set prep time" / "20 min prep")
- [ ] Setting one changes the customer's estimate; **clearing it** falls back to the business default
- [ ] Order with two dishes ≈ the **slowest** dish plus a small margin — _not_ the sum

**Adding items (B1) — this is what blocked all the prep-time testing:**

- [ ] Sign out of the vendor app and back in, then go **straight to the Catalogue tab** without
      opening Orders first. Items should load and **"Add item" should work** ← this was the bug:
      only the Orders tab ever picked your business, so every other tab had none and the Add
      button did nothing at all, silently
- [ ] Fill in name + price → **Add to catalogue** → the item appears in the list
- [ ] It also appears for a customer browsing that business
- [ ] The Queue tab likewise works straight after a fresh login
- [ ] If anything does fail you now get a **message** — a red "Couldn't load your catalogue" with a
      Try again button, or an explicit alert. A silent no-op is itself a bug; report it

---

## 9. Driver

- [ ] **"I've arrived"** appears while ENROUTE; tapping it notifies the customer and does **not** advance the trip status
- [ ] Feed shows incoming requests with a countdown; Accept / Decline / Counter all work
- [ ] Offer-sent card polls and returns to the feed if another driver wins

**Why there's no work (B2) — the feed used to say nothing at all:**

- [ ] Sign in as a driver who registered a **car that no admin has graded yet**. The Home feed
      shows **"Vehicle awaiting approval"** with an explanation and a **Check again** button
      ← this was the bug: it showed a spinner reading "Looking for requests nearby…" forever, so
      an unapproved driver could not tell that from a quiet night and just waited
- [ ] An account still under review shows **"Account under review"** instead
- [ ] Grade the vehicle in the admin web (Approvals → Awaiting vehicle class), tap **Check again** →
      the normal feed appears
- [ ] An **approved** driver who is online with genuinely no work nearby sees **"No requests right
      now"** with the search radius — not an endless spinner

---

## 10. Admin web

- [x] `npm run dev` → log in as `superadmin` (OTP from `docker logs gozone-auth`)
- [/] Approvals: a pending driver can be approved **and assigned a vehicle class**
- [x] Payouts, Incidents, Promos, Fees pages all load
- [ ] **A7:** approve a driver who registered a **car** *without* setting a class. They should then
      appear under **Approvals → "Awaiting vehicle class"** (they used to vanish from every screen
      while their own app still read "Awaiting admin"), and the Dashboard should count them
- [ ] Setting the class removes them from that list, and the driver's app stops saying "Awaiting admin"

---

## Known-bad, do not raise as bugs

- **Push banners do not appear in Expo Go** (SDK 53+). Notifications land in the in-app list; the
  walk-in alert stands in. Needs a development build.
- **Saved cards do nothing in mock mode** — see §6.
- **One-tap saved-card payment is wired into the ride flow only.** Food checkout and top-up still
  open the browser even with a card saved. ((fix this))
- **Driver/vendor apps have no leave-time or saved-card UI** — customer app only, by design.

FIXES OR ISSUES FOUND
-Screens with the glow background and logo should never have the glowing orb in the top corner
-The vendor app, like the driver app, should let the user enter the app but be unable to do anything serious apart from settings like updating profile with necessary information.
-Unable to add dishes or items to catalogue or menu
-When driver signs in, and has not been fully verified, the should see a clear message on the first screen informing them that they have to be completely verified. -Currently it doesn't say anything there but doesn't load the requests. I does say un verified in the profile or settings page but changes when you add vehicle information because the KYC is mocked. It shouldn't be mocked, we need the drivers picture, picture of vehicle and drivers lisense.
-The vehicle class says Awaiting admin but doesn't appear on the admin web.
-The vendor's locations should be set using the pick location or current location like in customer app
-The vendor should be able to edit their profile in the app and also what appears in the customer app
-The main screen of the customer map there should be a feature where you can scroll down the menu to view the map fully, like in bolt, so it will chat be the search bar left at the bottom.
-The screen should move up a bit when you are entering information into a text box that is a low on the screen so it does not go behind the keyboard and blind you from seeing what you are typing. I f possible, for situations like that, measure the keyboard on the users device and let the screen move up in a way where the textbox is above the keyboard
-It should show the live location of the courier when they are delivering
-Fix the walk in and pick up time estimations, it shows but does not reduce as the order is processed on the vendor app

---

## Results of the first run

Run by the user; findings triaged in **`ISSUES_FROM_TESTING.md`** — 17 issues. `[x]` passed,
`[/]` partly, `[ ]` failed or blocked. Sections 6 (food/parcel/cash payments), 7 (courier), 9
(driver) are largely **untested** because earlier failures blocked them — they are still open, not
passing.

**Since that run:** sections **A and B are both fixed** (A1–A3 first, then A4–A7, then B1–B3).
`scripts/e2e.sh` is **135/135** against the rebuilt stack and now guards the new behaviour
directly: the collection estimate counts down, the awaiting-class list works, and a delivery keeps
both of its endpoints as coordinates.

Verified against the running stack: A6, A7, B1 (the API was never broken — the bug was app-side),
B3's backend. Only checkable on a phone, so **still open**: A4, A5 (splash appearance), B1's
front-end path, B2 (feed states), B3's map. New checks for all of them are in the sections above.

**Section C is untouched** and is the remaining work.
