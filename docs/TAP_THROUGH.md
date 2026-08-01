# Device tap-through checklist

Everything here is **unverified by any automated test** and can only be cleared on a real device.
The e2e suite (121/121) covers the backend; these are the phone-side behaviours it cannot reach —
React Native Web ignores synthetic clicks, so none of this has ever been seen running.

Work top to bottom. **§1 first** — if the app red-screens on launch nothing else is testable.

Setup: backend up (`docker compose up -d`, wait for all six healthy), then `npm start -- --clear`
in each app. Phone and laptop on the same Wi-Fi.

---

## 1. Launch — the crash guard  ⚠️ blocker

| Step | Expected | If it fails |
|---|---|---|
| Open the customer app on a **physical Android** phone in Expo Go | Splash appears, no red screen | `expo-notifications` is still being imported. The guard in `src/lib/push.ts` keys off `expo-constants`; check `Constants.executionEnvironment` is actually `storeClient` in Expo Go on your SDK |
| Watch the Metro log | No `expo-notifications ... removed from Expo Go` error | as above |

iOS does not throw here, so **this must be checked on Android** — that is where the error was reported.

---

## 2. Splash and branding

- [ ] Glow orb is noticeably wider than the GZ mark, and the **mark sits inside the glow** rather than overhanging it
- [ ] Not *too* wide — if it is, `glowScale` in `src/components/brand.tsx` (currently `2.6`) is the single knob; try `2.4`
- [ ] Wordmark sits **well below** the orb, not tucked under it
- [ ] "GoZone" and the motto are **blue**, not white
- [ ] Driver app says **GoZone Driver**, vendor app says **GoZone Vendor**

---

## 3. Ride home — greeting and map

- [ ] Greeting text is **dark and readable** over the map, in **both** light and dark mode (toggle via Profile → Appearance)
- [ ] No hard white-on-black seam between the map and the content below it in dark mode
- [ ] Avatar bubble looks as it did before (dark translucent, not blue)
- [ ] Map fills the top ~third, your **blue dot** is on it
- [ ] **Destination starts empty** on a fresh account — no "Osu" prefilled
- [ ] With no destination the button reads **"Choose a destination"** and opens the search screen
- [ ] No fare is quoted until a destination is set

---

## 4. Markers — the blinking fix

- [ ] Open the map picker and **drag the map around continuously**
- [ ] The blue dot and the pickup/destination dots **do not flicker** while panning
- [ ] They are still *visible* — the 800 ms tracking window is what guarantees they get captured before tracking stops. **A missing dot is a worse failure than a blinking one**; if a dot never appears, raise the timeout in `useSettledTracking`
- [ ] During a live ride the **vehicle marker still rotates** to its heading (it must keep redrawing while moving)
- [ ] Same checks in the **driver app** — it is a separate copy of the component

---

## 5. Location and recents

- [ ] Ride search → **"Use current location"** returns immediately, does not spin
- [ ] The field shows "Current location" briefly, then **upgrades to a real street name**
- [ ] Go back into search: the **recent entry shows the street name**, not "Current location" ← this was the bug
- [ ] Do it twice from the same spot — you get **one** recent, not two
- [ ] On first launch the **pickup defaults to where you are**, named (not "Current location", not Kotoka Airport)
- [ ] Same "use current location" flow on the **GoShop address** screen

---

## 6. Payments  ⚠️ highest risk — this is where money is lost

**Wallet top-up** (already verified once, re-confirm):
- [ ] Add money → Paystack opens → complete → return to app → **balance increases**
- [ ] Kill the app during checkout, reopen → the payment is **still redeemed**

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
- [ ] A **pickup** order at READY offers **"Handed to customer"** — *not* "Out for delivery" ← this was the bug
- [ ] A **walk-in** order at READY offers **"Served — complete"**
- [ ] Neither produces an "invalid transition" error
- [ ] Customer gets a notification at READY: pickup → "ready for collection", walk-in → "head to the counter"
- [ ] A **delivery** customer gets nothing at READY, but is told when the **courier collects**

---

## 8. Walk-in leave time

- [ ] Place a walk-in order; the order screen shows **"Leave in N min"** with the reasoning under it
- [ ] Countdown reaches zero → card flips to **"Time to set off"** and an **alert fires once** (not repeatedly)
- [ ] Deny location permission → card degrades to **"Ready in about N min"** with a prompt, no crash
- [ ] Card **disappears** once the order completes or is cancelled

**Prep time:**
- [ ] Vendor catalogue: each dish has a **prep chip** ("Set prep time" / "20 min prep")
- [ ] Setting one changes the customer's estimate; **clearing it** falls back to the business default
- [ ] Order with two dishes ≈ the **slowest** dish plus a small margin — *not* the sum

---

## 9. Driver

- [ ] **"I've arrived"** appears while ENROUTE; tapping it notifies the customer and does **not** advance the trip status
- [ ] Feed shows incoming requests with a countdown; Accept / Decline / Counter all work
- [ ] Offer-sent card polls and returns to the feed if another driver wins

---

## 10. Admin web

- [ ] `npm run dev` → log in as `superadmin` (OTP from `docker logs gozone-auth`)
- [ ] Approvals: a pending driver can be approved **and assigned a vehicle class**
- [ ] Payouts, Incidents, Promos, Fees pages all load

---

## Known-bad, do not raise as bugs

- **Push banners do not appear in Expo Go** (SDK 53+). Notifications land in the in-app list; the
  walk-in alert stands in. Needs a development build.
- **Saved cards do nothing in mock mode** — see §6.
- **One-tap saved-card payment is wired into the ride flow only.** Food checkout and top-up still
  open the browser even with a card saved.
- **Driver/vendor apps have no leave-time or saved-card UI** — customer app only, by design.
