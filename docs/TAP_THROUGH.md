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

**Prep time:**

- [ ] Vendor catalogue: each dish has a **prep chip** ("Set prep time" / "20 min prep")
- [ ] Setting one changes the customer's estimate; **clearing it** falls back to the business default
- [ ] Order with two dishes ≈ the **slowest** dish plus a small margin — _not_ the sum

---

## 9. Driver

- [ ] **"I've arrived"** appears while ENROUTE; tapping it notifies the customer and does **not** advance the trip status
- [ ] Feed shows incoming requests with a countdown; Accept / Decline / Counter all work
- [ ] Offer-sent card polls and returns to the feed if another driver wins

---

## 10. Admin web

- [x] `npm run dev` → log in as `superadmin` (OTP from `docker logs gozone-auth`)
- [/] Approvals: a pending driver can be approved **and assigned a vehicle class**
- [x] Payouts, Incidents, Promos, Fees pages all load

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

Run by the user; findings triaged in **`ISSUES_FROM_TESTING.md`** — 17 issues, none fixed yet.
`[x]` passed, `[/]` partly, `[ ]` failed or blocked. Sections 6 (food/parcel/cash payments), 7
(courier), 9 (driver) are largely **untested** because earlier failures blocked them — they are
still open, not passing.
