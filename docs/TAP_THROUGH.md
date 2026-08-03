# Device tap-through checklist

Everything here is **unverified by any automated test** and can only be cleared on a real device.
The e2e suite (148/148) covers the backend; these are the phone-side behaviours it cannot reach —
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

- [x] Glow orb is noticeably wider than the GZ mark, and the **mark sits inside the glow** rather than overhanging it ((appears well on some devices but the Gz does not appear or loads wierdly on some devices))
- [x] Not _too_ wide — if it is, `glowScale` in `src/components/brand.tsx` (currently `2.6`) is the single knob; try `2.4`
- [x] Wordmark sits **well below** the orb, not tucked under it
- [x] "GoZone" and the motto are **blue**, not white ((app name changed to white and motto remains blue))
- [x] Driver app says **GoZone Driver**, vendor app says **GoZone Vendor**

**Retest after the A4/A5 fixes — this is the section that could not be cleared:**

- [x] **On the device where the GZ did not appear**, the mark now shows white on the splash. The fix
      removed `tintColor` entirely in favour of a pre-whitened asset, so a failing tint can no longer
      leave a navy mark on a near-black background. If it is _still_ missing, the cause is the asset
      itself, not the tint — check `assets/gz-logo-white.png` loads at all
- [x] Welcome screen (all three apps): **no glow orb in the top-right corner** — only the blue
      squircle logo. The brand background keeps its own glow
- [x] Driver and vendor **awaiting-approval** screens: the hero glow is centred behind the mark, with
      **no second orb** in the corner
- [x] Register / verify-OTP / driver-and-vendor setup form **still have** their corner orb — those
      screens carry no logo, so the orb is the only light source and is meant to be there

---

## 3. Ride home — greeting and map

- [x] Greeting text is **dark and readable** over the map, in **both** light and dark mode (toggle via Profile → Appearance)
- [x] No hard white-on-black seam between the map and the content below it in dark mode
- [x] Avatar bubble looks as it did before (dark translucent, not blue)
- [x] ~~Map fills the top ~third~~ — **superseded by C5**: the map is now full-screen behind a
      pull-down sheet, so at rest it _looks_ like the top third. Your **blue dot** is on it. See §11
- [x] **Destination starts empty** on a fresh account — no "Osu" prefilled ((not only a fresh account but also fresh login or session))
- [x] With no destination the button reads **"Choose a destination"** and opens the search screen
- [x] No fare is quoted until a destination is set ((fair is being quoted))

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

- [x] Place an order, pay with momo or card → Paystack → return → order shows **PAID**
- [x] Repeat but force-close the app while on the Paystack page, then reopen the order
- [x] Order settles as PAID; you are **not** asked to pay again ← the fix
- [x] Vendor board shows it paid

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
- [x] Mobile Money has **no "add number" form** and always goes to Paystack

---

## 7. Shop — courier and vendor flows

**The courier bug:**

- [x] Vendor advances a **delivery** order to READY
- [x] A driver whose vehicle class is **Okada, Standard or Luxe** sees it under **Deliveries** ← this was the bug
- [ ] A driver with an **unapproved car** sees "An admin still needs to approve your vehicle", not an empty list
- [-] Courier accepts → customer sees live courier location → DELIVERED completes the order

**Courier map (B3) — order from Tema to see it properly:**

> Order from **Tema Harbour Grill**, not a central-Accra vendor. The other five sit within about
> two kilometres of each other, and at that scale you cannot tell a moving marker from a stuck one.
> Tema is ~20 km out, so the courier visibly covers ground.

- [ ] Customer order screen shows a **map**, not a line of raw coordinates ← this was the bug
- [x] The map appears **as soon as the order is READY**, before the courier has collected anything —
      you should watch them drive _to the restaurant_ first. It used to appear only after pickup
- [x] Card reads **"Finding you a courier"** → **"Courier heading to the restaurant"** →
      **"Your courier is on the way"** as the job progresses
- [ ] The courier marker moves along the **real route between the restaurant and your address** —
      it used to walk a fixed loop in central Accra regardless of the order, and teleport back to
      the start every six updates
- [x] Your address shows as a **destination pin** on the map
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

- [x] While the order sits at PLACED/CONFIRMED the figure **does not move**, and the card explains
      why: _"The kitchen hasn't started yet — the countdown begins when they do."_ This is deliberate;
      nothing is cooking, so a ticking number would imply progress that is not happening
- [x] The moment the vendor taps **Start preparing**, the figure begins dropping — leave the screen
      open for a few minutes and watch it fall (it refreshes on the existing 4s poll)
- [x] It never reads **0** while still cooking; only a READY order shows 0
- [x] A **pickup** order now gets the same card (it used to be walk-in only). A **delivery** order
      still gets none — there is no journey for the customer to time
- [x] Curl equivalent, if you want it without waiting:
      `GET /food/orders/{id}/leave-time?lat=&lng=` → `readyInMinutes` should fall between calls
      once PREPARING

**Prep time:**

- [x] Vendor catalogue: each dish has a **prep chip** ("Set prep time" / "20 min prep")
- [x] Setting one changes the customer's estimate; **clearing it** falls back to the business default
- [x] Order with two dishes ≈ the **slowest** dish plus a small margin — _not_ the sum

**Adding items (B1) — this is what blocked all the prep-time testing:**

- [x] Sign out of the vendor app and back in, then go **straight to the Catalogue tab** without
      opening Orders first. Items should load and **"Add item" should work** ← this was the bug:
      only the Orders tab ever picked your business, so every other tab had none and the Add
      button did nothing at all, silently
- [x] Fill in name + price → **Add to catalogue** → the item appears in the list
- [x] It also appears for a customer browsing that business
- [ ] The Queue tab likewise works straight after a fresh login
- [x] If anything does fail you now get a **message** — a red "Couldn't load your catalogue" with a
      Try again button, or an explicit alert. A silent no-op is itself a bug; report it

---

## 9. Driver

- [ ] **"I've arrived"** appears while ENROUTE; tapping it notifies the customer and does **not** advance the trip status
- [ ] Feed shows incoming requests with a countdown; Accept / Decline / Counter all work
- [ ] Offer-sent card polls and returns to the feed if another driver wins

**Why there's no work (B2) — the feed used to say nothing at all:**

- [x] Sign in as a driver who registered a **car that no admin has graded yet**. The Home feed
      shows **"Vehicle awaiting approval"** with an explanation and a **Check again** button
      ← this was the bug: it showed a spinner reading "Looking for requests nearby…" forever, so
      an unapproved driver could not tell that from a quiet night and just waited
- [x] An account still under review shows **"Account under review"** instead
- [x] Grade the vehicle in the admin web (Approvals → Awaiting vehicle class), tap **Check again** →
      the normal feed appears
- [ ] An **approved** driver who is online with genuinely no work nearby sees **"No requests right
      now"** with the search radius — not an endless spinner

---

## 10. Admin web

- [x] `npm run dev` → log in as `superadmin` (OTP from `docker logs gozone-auth`)
- [x] Approvals: a pending driver can be approved **and assigned a vehicle class**
- [x] Payouts, Incidents, Promos, Fees pages all load
- [ ] **A7:** approve a driver who registered a **car** _without_ setting a class. They should then
      appear under **Approvals → "Awaiting vehicle class"** (they used to vanish from every screen
      while their own app still read "Awaiting admin"), and the Dashboard should count them
- [x] Setting the class removes them from that list, and the driver's app stops saying "Awaiting admin"

---

## 11. Ride home, and the new request screen

> The drag itself already passed on device — flick, snap, tap-through and scrolling are all
> confirmed and are **not** re-listed below. What was wrong was the resting layout (`[/]`), and the
> composer has since moved off this screen entirely: home asks one question, and the request screen
> only exists once there is an answer.
>
> Re-measured in a browser at 375×812 after the change: map fills all 812pt, sheet rests at 276
> with its bottom **flush to the screen edge (gap 0)**, the peek window is 210pt against 187pt of
> content so the search bar and all three circles stay on screen when collapsed, and search → pick
> a destination lands on `/request` with both pins, the blue road route and a real GH₵12 quote.

**Home:**

- [ ] The map shows **only your own location** — no destination pin left from a previous trip
- [ ] **No GoRide box, no price, no Request button** anywhere on this screen ← they moved
- [ ] The handle is a bare grab bar with **no caption** under it ← the "Pull down…" text is gone
- [ ] **No strip of map below the sheet** — no Google logo peeking out at the bottom edge ← this
      was the bug in your screenshot; the sheet was sized from a window height that excludes the
      Android system bars, so it stopped short of the real bottom
- [ ] Pull the sheet down → the search bar **and the three round buttons** stay docked at the
      bottom over the full map ← the circles used to go with it; this is your first screenshot
- [ ] Nothing overlaps: the search bar no longer sits on top of any card behind it

**Search → request:**

- [ ] Tap the search bar → search. Set a **destination** → you land straight on the request screen
      ← you no longer come back to home to finish
- [ ] Changing only the **pickup** keeps you on search (it isn't an answer to "where to?")
- [ ] Picking a **recent** from home goes to the request screen too
- [ ] Request screen: map at the top with **your location, the destination and the route between
      them**; the GoRide card below with From/To, ride class, fare and Request ride
- [ ] The From/To rows there open search and come **back to the request screen**, not to home
- [ ] "Now" / schedule still works, from the request screen
- [ ] Request ride → live tracking, exactly as before
- [ ] Back from the request screen returns you to home
- [ ] The **parcel** composer's From/To still behave as they always did — it shares the search
      screen, so it is the thing most likely to have been broken by this change

---

## 12. Keyboard, vendor storefront and one-tap cards (section C)

**Keyboard (C6) — check this on a low field in several forms, not just one:**

- [x] Tap a text box near the **bottom** of a screen — the screen lifts so the box sits just above
      the keyboard ← Android previously did nothing at all here ((works but isn't really good, when you click on the textbox directly it goes up then comes back down. But when you click on a high text first then click on the halfway hidden textbox, it comes up a bit but even that, it is still quite low))
- [x] Move between two fields at different heights **without closing the keyboard**; the lift
      follows the field you're in
- [x] A screen whose fields are already high up (search over a map) **does not jump**
- [ ] Vendor **Add item** sheet: the add-on option rows at the bottom stay visible while typing
- [ ] Driver/vendor **Cash out** sheet: momo number and account name stay visible
- [x] Nothing lifts twice or overshoots — that would mean a leftover per-screen handler

**Vendor gets in before approval (C2):**

- [x] Sign up a brand-new vendor. You land **in the app**, not on a dead-end waiting page
- [x] Orders/Queue/Catalogue/Earnings each explain the state; **Profile & settings** is reachable
      from every one of them
- [x] Profile works fully — edit your details, add an email
- [x] Approve the business in admin web; the app opens up **on its own** within ~8s

**Vendor storefront + location (C3/C4):**

- [x] Profile → **Storefront & location** → set a description, cover photo link and location
- [/] The cover preview updates as you paste a link ((What type of link does it use and why doesm't it just let you choose a photo))
- [x] Tap the location row → map picker → drag/search/locate-me → **Use this location**
- [x] Save, then open that vendor as a **customer**: your banner, description and address show
      on the menu screen ← none of this was editable before
- [x] A vendor you have _not_ customised still looks exactly as it did (bundled imagery)
- [x] Shop list order is stable — it no longer reshuffles after a vendor edits anything

**One-tap cards (C7) — needs a real `PAYSTACK_SECRET_KEY`, see §6:**

- [ ] With a saved card, pay for a **food order** → charged in one tap, no browser ← was ride-only
- [ ] Same for a **parcel** and for **wallet top-up**
- [ ] Without a saved card, all three still open Paystack as before

---

## 13. Driver KYC — real documents (C1)

> The API is curl-verified end to end (upload, sniffing, access control, submission guards). What
> needs a phone is the camera, the picker and the upload over a mobile connection.
> **Run `npm install` in `driver-app` first** — it needs `expo-image-picker`.

**As a new driver:**

- [x] Sign up a driver and reach "Finish your setup". Four rows: your photo, licence, vehicle,
      roadworthy (optional) ← these were fake "Upload" taps that set a placeholder string
- [ ] **Take photo** opens the camera; **Choose** opens the library. Denying permission returns
      quietly rather than hanging or crashing
- [ ] After picking, the row shows **your actual photo** as a thumbnail and says "Uploaded"
- [ ] **Remove** clears it; retaking replaces it
- [x] Submitting with a photo missing is refused, naming the one that's missing
- [x] Submit with all three → "Application submitted"
- [ ] Force-close and reopen the app mid-setup: text fields and uploaded documents survive; the
      thumbnails become ticks (the local file is gone, the upload is not) — this is expected

**As an admin:**

- [x] Admin web → Driver KYC → Pending shows the driver by **name and phone**, not a UUID
- [x] All three photographs render. Click one — it opens full size, readable enough to check a
      licence ← the page previously showed no images at all
- [x] The seeded drivers show "Not provided" (they were verified before documents were real —
      that is honest, not a bug)
- [x] Approve → the driver's app moves on by itself

**Worth confirming once, because it is the design's load-bearing claim:**

- [ ] `docker compose build auth-service && docker compose up -d auth-service`, then re-open a
      KYC record — **the images are still there.** They live on a named volume; anywhere else and
      a rebuild would destroy every driver's documents

---

## Known-bad, do not raise as bugs

- **Push banners do not appear in Expo Go** (SDK 53+). Notifications land in the in-app list; the
  walk-in alert stands in. Needs a development build.
- **Saved cards do nothing in mock mode** — see §6.
- ~~**One-tap saved-card payment is wired into the ride flow only.**~~ **FIXED** — food orders,
  parcels and wallet top-up all charge a saved card in one tap now. Without a saved card they
  still open Paystack, which is correct.
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

**Since that run:** **every issue raised is now implemented** — A (A1–A7), B (B1–B3) and C (C1–C7).
`scripts/e2e.sh` is **148/148** against the rebuilt stack and now guards the new behaviour
directly: the collection estimate counts down, the awaiting-class list works, and a delivery keeps
both of its endpoints as coordinates.

Verified against the running stack: A6, A7, B1 (the API was never broken — the bug was app-side),
B3's backend. Only checkable on a phone, so **still open**: A4, A5 (splash appearance), B1's
front-end path, B2 (feed states), B3's map. New checks for all of them are in the sections above.

**Nothing is left to build from that run.** What remains is _this document_: most of these fixes
are phone-side and only a real device can clear them. Work through it top to bottom.

NEW ISSUES FOUND
For the ride page
There should be no "Pull down to see the map" text. It should just be the handle.
The map shows at the bottom of the screen which is very wrong, after the sliding part where you set your ride. I have added a screenshot to show it.
The when you slide down to show the map, it should show the search bar a the 3 round botton. I have added another screenshot to show exactly how i want it.

Used a vendor and a customer's number to login into the driver app and they went through. It is an issue across all apps which shouldn't be the case. Every app must have it's own set of users. As a result, you cannot sign up for another app because you are already registered, which you, the user, didn't do.
I tried signing up on the driver app with a particular number but i couldn't complete because the otp wasn't logged. the account has not been created
All apps give an option to resend otp after 30 secs
Back button on the enter the code page for driver sign up doesn't work. Check other screens for similar issue
Take photo is opening a select image menu or page instead of taking a picture
Vehicle should be set during sign up
Information shouldn't be editable but can be viewed
Documents are saying verified while i have not verified them on the admin web and KYC is saying still saying mocked even though it was filled.
All drivers are unable to recieve requests. this actually started a while back, i forgot to mention it. It says "Couldn't load requests Forbidden Retrying automatically" and nothing happens
Account details should be in that top bar, board or button of the profile screen like all the other apps
Vendors should be able to add a picture of their company logo in the storefront page. Whatever image is used as the banner for a particular shop is what the customer will see on the Go Shop page when looking through vendors or businesses.
Vendors should we be able to add a picture of a particular dish or product when adding it to their menu or catalog and the dish or products should be editable but on when the store is closed
Add a driver rating system because currently all drivers are rated 4.9, even the new ones, which is wrong.
And for the rating, I realized that when you click on a particular star, it just locks it at that. I think that is not convenient. So you can make it in a way that the user can read from the first star and continue to the second and onwards or the user can just select let's say the fourth star directly. If you get what I mean.
Currently, there is no way for a vendor to add another shop to their account. So, you can add it to the place where when you click on the current shop or business name, it pops up. So, as part of the list of businesses, you can add a business. And it will go and start like exactly when the vendor first signed up and didn't have a business. It can go and start from that page and progress on. But the business will have to be verified by the an admin just like during sign up.
About the verifications on the admin web. It doesn't show much detail. It only shows the person's name and whether they are a driver or a vendor. It should show more information. For instance, when it comes to the vendors, verification of the account is different from verification of a business. Right now, what is happening is like we use the setup of the first business as the form of verification. And even that one, the business name doesn't come on the admin page, which is very wrong. For the driver one too, you can do it in a way where when you click on the driver that's is awaiting approval, it gives you information on the driver and can even take you to the driver's KYC. And the driver's KYC and the account approval should be together. So, once you approve the driver, it means you've approved everything.
Location in Goshop should always be set to the current location when you first sign up or log in
When a customer is paying with cash for a delivery from a vendor, it also shows up on the vendor app to confirm whether they have received the cash or not. This is wrong because the vendor is automatically credited whichever way payment is made. So that shouldn't show up on their page.
Some of the information rxts are too much, example, with the payment screen, you don't need to add the fact that mobile money is confirmed by paystack each time because of the system. Just the info that cards and mobile money are charged securely by paystack is ok. Also the part about paying once with card and it being save is confusing because there is nothing about card in the payment methods.
Orders that are not confirmed by the vendor after 5 minutes should be cancelled so they don't appear on live orders again and the customer gets a message like the vendor is busy. Deliveries to the same when a restaurant isn't able to get a courier for a delivery after 2 minutes. The customer is given an option to pick up or cancel as a result of no couriers around. And those cancelled deliveries don't show up on the delivery page in the driver app.
The customer's name should be on the delivery and orders. Even if just their first name, so that it can be used to identify them.
During the selection of a location one time, I mistakenly selected use this address, while it was still loading. And it's resulted in the locations being set to pinned location, which is bad. So, fix that.
The route still doesn't show on the goride screen map.
