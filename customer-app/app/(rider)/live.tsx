import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, TextInput, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { rideApi, Trip, BidOffer, PoolOffer } from '../../src/api/ride';
import { walletApi } from '../../src/api/wallet';
import { mapsApi, LatLng } from '../../src/api/maps';
import { wsClient } from '../../src/realtime/wsClient';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useRideDraft } from '../../src/store/rideDraft';
import { usePaymentStore, PAY_METHODS, isPaystack, isSavedCard, cardIdOf } from '../../src/store/paymentStore';
import { useProfileStore } from '../../src/store/profileStore';
import { apiBaseUrl } from '../../src/lib/host';
import { clearPending, getPending, setPending } from '../../src/lib/pendingPayment';
import { getCurrentLocation } from '../../src/lib/location';
import { LeafletMap } from '../../src/components/LeafletMap';
import { vehicleKindOf } from '../../src/components/mapTypes';
import { Row, Badge, StarRating } from '../../src/components/ui';

function tripPhase(status: string): { label: string; title: string; sub: string } {
  switch (status) {
    case 'MATCHED': return { label: 'Driver matched', title: 'Your driver is on the way', sub: 'Hang tight — they’re heading to your pickup.' };
    case 'ENROUTE': return { label: 'En route', title: 'Driver heading to pickup', sub: 'Meet them at your pickup point.' };
    case 'STARTED': return { label: 'On trip', title: 'Enjoy your ride', sub: 'You’re on your way to your destination.' };
    default: return { label: status, title: 'Your trip', sub: '' };
  }
}

/** Rough metres between two points — accurate enough to decide "have they moved much?". */
function metresBetween(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function LiveRideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const origin = useRideDraft((s) => s.origin);
  const dest = useRideDraft((s) => s.dest);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [offers, setOffers] = useState<BidOffer[]>([]);
  const [driverInfo, setDriverInfo] = useState<BidOffer | null>(null);
  const [accepting, setAccepting] = useState(false);
  // Shared rides already on the road that this request could join. Only ever non-empty when the
  // passenger ticked "share" — the endpoint returns nothing otherwise.
  const [poolOffers, setPoolOffers] = useState<PoolOffer[]>([]);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [disputing, setDisputing] = useState(false);
  // Stop "searching" forever: after this long with no driver we surface a
  // "no drivers available" state instead of spinning indefinitely.
  const [timedOut, setTimedOut] = useState(false);
  const [reqDead, setReqDead] = useState(false); // backend expired/cancelled the request
  const [driverLoc, setDriverLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [rating, setRating] = useState(0);
  const [rated, setRated] = useState(false);
  const payMethod = usePaymentStore((s) => s.selected);
  const savedMethods = usePaymentStore((s) => s.cards);
  const profilePhone = useProfileStore((s) => s.phone);
  const [momoNumber, setMomoNumber] = useState(profilePhone || '');
  const [paying, setPaying] = useState(false);
  const [payRef, setPayRef] = useState<string | null>(null); // pending Paystack reference

  // Client-side search window (backend auto-expires the request at ~90s; we surface it a bit sooner).
  const SEARCH_TIMEOUT_MS = 60000;
  // Real road route (via backend Directions proxy); falls back to a straight line.
  const [routePts, setRoutePts] = useState<LatLng[]>([]);
  useEffect(() => {
    let active = true;
    mapsApi.directions({ lat: origin.lat, lng: origin.lng }, { lat: dest.lat, lng: dest.lng })
      .then((d) => { if (active && d.points?.length) setRoutePts(d.points); })
      .catch(() => {});
    return () => { active = false; };
  }, [origin.lat, origin.lng, dest.lat, dest.lng]);
  const route = routePts.length ? routePts : [{ lat: origin.lat, lng: origin.lng }, { lat: dest.lat, lng: dest.lng }];

  // The driver's road route to your pickup, shown while they're on their way (MATCHED/ENROUTE).
  // It is re-drawn as they move, so the line visibly shortens and you can see how far off they
  // are — fetching it once (as this used to) left a stale route with only the car sliding along.
  const [pickupRoute, setPickupRoute] = useState<LatLng[]>([]);
  const beforePickup = !!trip && (trip.status === 'MATCHED' || trip.status === 'ENROUTE');
  // Where the driver was when we last asked for a route. Re-routing on every GPS ping would be a
  // request every few seconds per rider; re-routing once they've actually covered ground keeps
  // it live for a fraction of the traffic.
  const lastRoutedFrom = useRef<LatLng | null>(null);
  useEffect(() => {
    if (!beforePickup || !driverLoc) return;
    if (lastRoutedFrom.current && metresBetween(lastRoutedFrom.current, driverLoc) < 120) return;

    let active = true;
    lastRoutedFrom.current = driverLoc;
    mapsApi.directions(driverLoc, { lat: origin.lat, lng: origin.lng })
      .then((d) => { if (active && d.points?.length) setPickupRoute(d.points); })
      .catch(() => {});
    return () => { active = false; };
  }, [beforePickup, driverLoc?.lat, driverLoc?.lng]);

  // Once they've picked you up the map becomes the journey, so drop the pickup leg.
  useEffect(() => {
    if (!beforePickup) { setPickupRoute([]); lastRoutedFrom.current = null; }
  }, [beforePickup]);

  // Put the driver's vehicle on the map as soon as they're matched, using the position they
  // offered from. Waiting for the first GPS ping meant no vehicle marker at all for the first
  // few seconds — or indefinitely if their app wasn't pushing location.
  useEffect(() => {
    if (!driverInfo?.lat || !driverInfo?.lng) return;
    setDriverLoc((cur) => cur ?? { lat: driverInfo.lat as number, lng: driverInfo.lng as number });
  }, [driverInfo?.lat, driverInfo?.lng]);

  // Draw them as what they're actually riding — a car pin for an okada is misleading when
  // you're stood on the street looking for them.
  const vehicleKind = vehicleKindOf(driverInfo?.vehicle);

  // Your own position — without it the map says nothing while you wait for a driver.
  const [myLoc, setMyLoc] = useState<LatLng | null>(null);
  useEffect(() => {
    let active = true;
    getCurrentLocation().then((l) => { if (active && l) setMyLoc(l); }).catch(() => {});
    return () => { active = false; };
  }, []);

  /**
   * What THIS passenger owes.
   *
   * <p>`agreedFare` is the whole car's money — on a shared ride it is two people's fares added up,
   * and it is what the driver earns, not what anybody is billed. Every price shown to the
   * passenger and every amount sent to a payment provider reads this instead. The fallback covers
   * an ordinary solo trip, where the two are the same number.
   */
  const myFare = Number(trip?.myFare ?? trip?.agreedFare ?? 0);
  const soloFare = trip?.mySoloFare != null ? Number(trip.mySoloFare) : null;
  const isShared = !!trip?.shared && (trip?.passengerCount ?? 1) > 1;
  const saved = soloFare != null && soloFare > myFare ? soloFare - myFare : 0;
  /**
   * Can this passenger get out?
   *
   * <p>Only somebody who *joined* — the person who booked the ride cancels it instead, which is a
   * different operation with a different consequence for everyone else in the car. The exit closes
   * at the car door: once the driver has confirmed them aboard, leaving would be a free ride.
   * Blocked once paid too, because refunds are not built and the server refuses it anyway.
   */
  const canLeavePool = !!trip
    && (trip.myPickupSeq ?? 1) > 1
    && !trip.myPickedUp
    && trip.status !== 'COMPLETED' && trip.status !== 'CANCELLED'
    && (trip.paymentStatus ?? 'UNPAID') === 'UNPAID';

  /**
   * Marked as being in a car you are not in.
   *
   * <p>The other side of boarding: the driver's tap put a fare on this person, and this is how they
   * answer back. Offered exactly when that has happened and they have not already said so.
   */
  const canDispute = !!trip
    && !!trip.myPickedUp
    && !trip.myPickupDisputed
    && trip.status !== 'COMPLETED' && trip.status !== 'CANCELLED'
    && (trip.paymentStatus ?? 'UNPAID') === 'UNPAID';
  const disputed = !!trip?.myPickupDisputed;

  const searching = !trip;
  // Show the "no drivers" panel once the request is dead, or we timed out with no live offers.
  // A joinable shared ride counts as an offer: telling somebody nobody can take them while a car
  // they could get into sits on the screen would be plainly false.
  const noDrivers = searching && (reqDead || (timedOut && offers.length === 0 && poolOffers.length === 0));
  const completed = trip?.status === 'COMPLETED';
  const cancelled = trip?.status === 'CANCELLED';
  const paid = trip?.paymentStatus === 'PAID';
  const awaitingCash = trip?.paymentStatus === 'AWAITING';
  const methodMeta = [...PAY_METHODS, ...savedMethods].find((m) => m.key === payMethod) ?? PAY_METHODS[0];
  const viaPaystack = isPaystack(payMethod);

  // Poll request → matched trip; while still open, also poll driver offers (bargaining).
  // Stops once a trip is found, the request dies, or we hit the search timeout.
  useEffect(() => {
    if (!requestId || completed || cancelled || noDrivers) return;
    let active = true;
    const tick = async () => {
      try {
        const s = await rideApi.requestStatus(requestId);
        if (!active) return;
        if (s.trip) { setTrip(s.trip); if (s.driver) setDriverInfo(s.driver); return; }
        // Backend timed the request out (no driver) — surface it immediately.
        if (s.request?.status === 'EXPIRED' || s.request?.status === 'CANCELLED') {
          setReqDead(true);
          return;
        }
        // Driver bids and joinable shared rides are two answers to the same question — "how do I
        // get there?" — so they are fetched together and shown together. pool-offers returns an
        // empty list unless this request asked to share, so the extra call costs nothing for
        // everybody else.
        const [b, pool] = await Promise.all([
          rideApi.listBids(requestId),
          rideApi.poolOffers(requestId).catch(() => [] as PoolOffer[]),
        ]);
        if (!active) return;
        setOffers(b);
        setPoolOffers(pool);
      } catch {}
    };
    tick();
    const poll = setInterval(tick, 3000);
    const timeout = setTimeout(() => { if (active) setTimedOut(true); }, SEARCH_TIMEOUT_MS);
    return () => { active = false; clearInterval(poll); clearTimeout(timeout); };
  }, [requestId, completed, cancelled, noDrivers]);

  // "Keep looking" — resume polling with a fresh window (only possible while the request is still live).
  function keepLooking() { setTimedOut(false); }

  async function acceptOffer(b: BidOffer) {
    setAccepting(true);
    try { const t = await rideApi.acceptBid(requestId, b.id); setTrip(t); setDriverInfo(b); }
    catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Could not accept offer'); }
    finally { setAccepting(false); }
  }

  /**
   * Get into a ride that is already on the road.
   *
   * <p>The offer list is a poll of a moving world, so this can legitimately fail — the car fills
   * up, the trip ends, somebody else takes the seat. The server re-checks everything and says
   * why; the message is shown rather than swallowed, and the list refreshes so the passenger is
   * not staring at an offer that no longer exists.
   */
  async function joinPool(o: PoolOffer) {
    setJoining(true);
    try {
      await rideApi.poolJoin(o.tripId, requestId);
      // Re-read rather than assume: the join response is a receipt, but the status poll is what
      // owns the trip shape this screen renders (driver card included).
      const s = await rideApi.requestStatus(requestId);
      if (s.trip) setTrip(s.trip);
      if (s.driver) setDriverInfo(s.driver);
    } catch (e: any) {
      Alert.alert('Couldn’t join', e?.response?.data?.message ?? 'That ride is no longer available.');
      rideApi.poolOffers(requestId).then(setPoolOffers).catch(() => {});
    } finally { setJoining(false); }
  }

  // Cash awaits the driver's confirmation — poll until it flips to PAID.
  useEffect(() => {
    if (!completed || !awaitingCash || !requestId) return;
    const poll = setInterval(async () => {
      try { const s = await rideApi.requestStatus(requestId); if (s.trip) setTrip(s.trip); } catch {}
    }, 4000);
    return () => clearInterval(poll);
  }, [completed, awaitingCash, requestId]);

  // Wallet/cash pay in one tap. Paystack (added card/momo) is two steps:
  // open the Paystack checkout, then confirm to verify + mark the trip paid.
  async function pay() {
    if (!trip) return;
    setPaying(true);
    try {
      // A saved card charges server-side — no browser, no re-entering anything. That is the
      // whole point of having saved it. The reference it returns goes through exactly the same
      // verification as a checkout payment.
      if (isSavedCard(payMethod) && !payRef) {
        const { reference } = await walletApi.chargeCard(cardIdOf(payMethod), myFare);
        setTrip(await rideApi.payTrip(trip.id, 'card', reference));
        await clearPending();
      } else if (viaPaystack && !payRef) {
        const { reference, authorizationUrl } = await walletApi.payInitialize(myFare);
        const url = authorizationUrl.startsWith('http') ? authorizationUrl : `${apiBaseUrl()}${authorizationUrl}`;
        setPayRef(reference);
        // Survive the browser hand-off: returning from Paystack usually reloads the app, and a
        // reference kept only in React state dies with it — the customer pays and the fare stays
        // unpaid. See src/lib/pendingPayment.ts.
        await setPending({ kind: 'trip', reference, amount: myFare, targetId: trip.id, method: payMethod });
        await Linking.openURL(url);
      } else {
        const t = await rideApi.payTrip(trip.id, payMethod, payRef ?? undefined);
        setTrip(t);
        // Paid by card through checkout — offer it as one tap next time.
        if (payRef) walletApi.rememberCard(payRef, myFare);
        setPayRef(null);
        await clearPending();
      }
    } catch (e: any) {
      Alert.alert('Payment', e?.response?.data?.message ?? 'Please try again');
    } finally { setPaying(false); }
  }

  /**
   * Finish a fare that was paid for in the Paystack browser.
   *
   * Coming back from checkout usually means a cold start, so `payRef` is gone and the customer
   * would be looking at an unpaid trip they have already been charged for. The stored reference
   * is redeemed here instead. payTrip re-verifies the reference server-side and is idempotent, so
   * running this on a payment that never completed simply fails and leaves the Pay button.
   */
  useEffect(() => {
    if (!completed || paid || !trip) return;
    let active = true;
    (async () => {
      const p = await getPending('trip');
      if (!p || p.targetId !== trip.id || !active) return;
      try {
        const t = await rideApi.payTrip(trip.id, p.method ?? payMethod, p.reference);
        if (!active) return;
        setTrip(t); setPayRef(null);
        await clearPending();
      } catch {
        // Not completed at Paystack — restore the reference so the Verify button works.
        if (active) setPayRef(p.reference);
      }
    })();
    return () => { active = false; };
  }, [completed, paid, trip?.id]);

  // Live driver location over WS.
  useEffect(() => {
    if (!trip || completed || cancelled) return;
    const stop = wsClient.subscribeToRide(trip.id, (loc) => { setDriverLoc({ lat: loc.lat, lng: loc.lng }); setIsStale(false); });
    const staleTimer = setInterval(() => setIsStale(true), 6000);
    // Both, and in one place: dropping the subscription with the screen stops a finished trip
    // moving the marker on the next one.
    return () => { stop(); clearInterval(staleTimer); };
  }, [trip?.id, completed, cancelled]);

  /**
   * Get out of a ride you joined.
   *
   * <p>Confirmed first, and the wording is careful: the passenger needs to know this ends *their*
   * trip and not the ride — leaving a stranger to think they have cancelled somebody else's
   * journey would be worse than not offering the button.
   */
  function leaveRide() {
    if (!trip) return;
    Alert.alert(
      'Leave this ride?',
      'You’ll be dropped from this shared ride and won’t be picked up. The other passenger carries on. You can request another ride afterwards.',
      [
        { text: 'Stay' },
        {
          text: 'Leave', style: 'destructive',
          onPress: async () => {
            setLeaving(true);
            try {
              await rideApi.leavePool(trip.id);
              router.replace('/(rider)/home' as any);
            } catch (e: any) {
              Alert.alert('Couldn’t leave', e?.response?.data?.message ?? 'Please try again.');
            } finally { setLeaving(false); }
          },
        },
      ],
    );
  }

  /**
   * Tell the system you are not in that car.
   *
   * <p>Careful not to promise more than it does: this does not cancel anything or remove the fare
   * by itself. It reaches the driver, who can correct it in a tap. Saying "we've told your driver"
   * is the honest description of what happens next.
   */
  function disputePickup() {
    if (!trip) return;
    Alert.alert(
      "You're not in this car?",
      'Your driver marked you as picked up. We\'ll tell them straight away so they can correct it — and it stays on record if they don\'t.',
      [
        { text: 'Cancel' },
        {
          text: "I'm not in it", style: 'destructive',
          onPress: async () => {
            setDisputing(true);
            try {
              await rideApi.disputePickup(trip.id, 'Passenger says they are not in the vehicle');
              const s = await rideApi.requestStatus(requestId);
              if (s.trip) setTrip(s.trip);
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message ?? 'Could not send that. Please try again.');
            } finally { setDisputing(false); }
          },
        },
      ],
    );
  }

  async function sos() {
    if (!trip) return;
    try {
      await rideApi.sos(trip.id, driverLoc ?? { lat: origin.lat, lng: origin.lng });
      Alert.alert('SOS sent', 'Your alert has reached the GoZone safety team. They are reviewing it now and will contact you or the authorities as needed.');
    } catch {
      Alert.alert('SOS', 'Could not send the alert — please call emergency services directly if you are in danger.');
    }
  }
  // Choosing a score and sending it are separate now: tapping a star used to submit on the spot,
  // so a thumb that landed on the wrong one was the rating that stood.
  async function rate() {
    if (!trip || rated || !rating) return;
    try { await rideApi.rateTrip(trip.id, trip.driverId, rating); setRated(true); }
    catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Could not submit rating'); }
  }

  // Map phases: while the driver heads to you the map is about the pickup leg
  // (driver → pickup); once the trip starts it becomes the journey (pickup → dest).
  // Centre on whatever the rider needs to see right now: the gap between them and the driver
  // while they wait, and the journey itself once they're aboard.
  const center = beforePickup && driverLoc
    ? { lat: (driverLoc.lat + origin.lat) / 2, lng: (driverLoc.lng + origin.lng) / 2 }
    : { lat: (origin.lat + dest.lat) / 2, lng: (origin.lng + dest.lng) / 2 };
  const markers = beforePickup
    ? [{ lat: origin.lat, lng: origin.lng, kind: 'pickup' as const, label: 'Pickup' }]
    : [
        { lat: origin.lat, lng: origin.lng, kind: 'pickup' as const, label: 'Pickup' },
        { lat: dest.lat, lng: dest.lng, kind: 'dest' as const, label: 'Destination' },
      ];
  const shownRoute = beforePickup
    ? (pickupRoute.length ? pickupRoute : (driverLoc ? [driverLoc, { lat: origin.lat, lng: origin.lng }] : []))
    : route;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <LeafletMap style={{ flex: 1 }} mode="view" center={center} zoom={13} markers={markers}
        driver={driverLoc} vehicleKind={vehicleKind} userLocation={myLoc} route={shownRoute} />

      {/* Back */}
      <TouchableOpacity onPress={() => router.replace('/(rider)/home' as any)} activeOpacity={0.85}
        style={{ position: 'absolute', top: insets.top + 8, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="chevron-back" size={24} color={c.text} />
      </TouchableOpacity>

      {/* Bottom sheet */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: insets.bottom + 18, borderTopWidth: 1, borderColor: c.border }}>
        {searching && !noDrivers && (
          <>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Badge label={offers.length ? `${offers.length} offer${offers.length > 1 ? 's' : ''}` : 'Searching'} color={offers.length ? c.success : c.warning} />
              {!offers.length && <ActivityIndicator color={c.primary} />}
            </Row>
            <Text style={{ fontSize: 20, fontWeight: '800', color: c.text, marginTop: 10 }}>
              {offers.length ? 'Drivers are offering' : 'Finding you a driver…'}
            </Text>
            <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>
              {offers.length ? 'Pick a driver to confirm your ride.' : 'Nearby drivers are being notified — their offers will appear here.'}
            </Text>

            {/* Shared rides already on the road. Shown ABOVE the driver offers because it is the
                cheaper answer and it is available now — a car that is already moving beats one
                that still has to reach you. */}
            {poolOffers.length > 0 && (
              <View style={{ marginTop: 14 }}>
                <Row style={{ gap: 7, marginBottom: 8 }}>
                  <Ionicons name="people" size={15} color={c.success} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: c.success, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Going your way now
                  </Text>
                </Row>
                {poolOffers.map((o) => (
                  <View key={o.tripId} style={{ marginBottom: 10, backgroundColor: `${c.success}12`, borderRadius: 16, borderWidth: 1.5, borderColor: c.success, padding: 13 }}>
                    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }} numberOfLines={1}>
                          {o.driverName || 'A GoZone driver'}
                        </Text>
                        <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 2 }} numberOfLines={1}>
                          {[o.vehicle, o.plate].filter(Boolean).join(' · ') || 'Already on the road'}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Row style={{ gap: 6, alignItems: 'flex-end' }}>
                          {/* The struck-through solo price is the whole argument for sharing —
                              a discount you cannot see the size of is not a discount. */}
                          <Text style={{ fontSize: 13, color: c.textMuted, textDecorationLine: 'line-through' }}>
                            GH₵ {o.yourSoloFare}
                          </Text>
                          <Text style={{ fontSize: 19, fontWeight: '800', color: c.success }}>GH₵ {o.yourFare}</Text>
                        </Row>
                        <Text style={{ fontSize: 11.5, fontWeight: '700', color: c.success }}>save {o.savingPct}%</Text>
                      </View>
                    </Row>

                    <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 8, lineHeight: 18 }}>
                      {o.passengerCount === 1 ? 'One passenger' : `${o.passengerCount} passengers`} aboard, heading
                      {' '}{o.destGapKm < 0.5 ? 'to your destination' : `within ${o.destGapKm.toFixed(1)} km of your destination`}.
                      {' '}Their fare drops to GH₵ {o.newFare} too.
                    </Text>

                    <TouchableOpacity onPress={() => joinPool(o)} disabled={joining} activeOpacity={0.9}
                      style={{ marginTop: 11, backgroundColor: c.success, borderRadius: 999, paddingVertical: 12, alignItems: 'center', opacity: joining ? 0.6 : 1 }}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14.5 }}>
                        {joining ? 'Joining…' : `Join this ride · GH₵ ${o.yourFare}`}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {offers.map((o) => (
              <View key={o.id} style={{ marginTop: 12, backgroundColor: c.surfaceAlt, borderRadius: 16, padding: 12 }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Row style={{ gap: 12, flex: 1 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>
                        {(o.driverName || 'D').trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }} numberOfLines={1}>
                        {o.driverName || `Driver ${o.driverId.slice(0, 6)}`}
                      </Text>
                      <Text style={{ fontSize: 12.5, color: c.textMuted }} numberOfLines={1}>
                        {[o.vehicle, o.plate].filter(Boolean).join(' · ') || (o.type === 'COUNTER' ? 'Counter offer' : 'Accepts your fare')}
                      </Text>
                    </View>
                  </Row>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: o.type === 'COUNTER' ? c.warning : c.text }}>GH₵ {o.amount}</Text>
                    {o.type === 'COUNTER' && <Text style={{ fontSize: 11, color: c.warning, fontWeight: '700' }}>counter offer</Text>}
                  </View>
                </Row>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <Row style={{ gap: 5, alignItems: 'center' }}>
                    <Ionicons name="navigate" size={13} color={c.textMuted} />
                    <Text style={{ fontSize: 12.5, color: c.textMuted, fontWeight: '600' }}>
                      {o.distanceKm != null ? `${o.distanceKm} km from pickup` : 'Distance unknown'}
                    </Text>
                  </Row>
                  <TouchableOpacity onPress={() => acceptOffer(o)} disabled={accepting} activeOpacity={0.85}
                    style={{ backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9, opacity: accepting ? 0.6 : 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13.5 }}>Choose driver</Text>
                  </TouchableOpacity>
                </Row>
              </View>
            ))}

            <TouchableOpacity onPress={() => router.replace('/(rider)/home' as any)} activeOpacity={0.85}
              style={{ marginTop: 16, borderRadius: 999, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: c.border }}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}

        {noDrivers && (
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: `${c.warning}1A`, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="car-outline" size={26} color={c.warning} />
            </View>
            <Text style={{ fontSize: 19, fontWeight: '800', color: c.text, marginTop: 10, textAlign: 'center' }}>No drivers available right now</Text>
            <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>
              We couldn’t reach a driver near you in time. Please try again in a few minutes.
            </Text>
            {!reqDead && (
              <TouchableOpacity onPress={keepLooking} activeOpacity={0.9}
                style={{ marginTop: 18, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 14, alignItems: 'center', alignSelf: 'stretch' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Keep looking</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => router.replace('/(rider)/home' as any)} activeOpacity={0.85}
              style={{ marginTop: 10, borderRadius: 999, paddingVertical: 14, alignItems: 'center', alignSelf: 'stretch', borderWidth: 1.5, borderColor: c.border }}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>{reqDead ? 'Back to home' : 'Cancel'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {trip && !completed && !cancelled && (
          <>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Badge label={tripPhase(trip.status).label} color={c.primary} />
              <Badge label={isStale ? 'Stale' : 'Live'} color={isStale ? c.textMuted : c.success} />
            </Row>
            <Text style={{ fontSize: 20, fontWeight: '800', color: c.text, marginTop: 10 }}>{tripPhase(trip.status).title}</Text>
            <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>{tripPhase(trip.status).sub}</Text>

            {/* Somebody else is in the car. Worth saying plainly and early: an unannounced extra
                stop on the way reads as the driver going the wrong way. */}
            {isShared && (
              <Row style={{ gap: 9, marginTop: 12, backgroundColor: `${c.success}14`, borderRadius: 14, padding: 12 }}>
                <Ionicons name="people" size={17} color={c.success} />
                <Text style={{ flex: 1, fontSize: 13, color: c.text, lineHeight: 18 }}>
                  You're sharing this ride with {(trip.passengerCount ?? 2) - 1} other
                  {(trip.passengerCount ?? 2) - 1 > 1 ? ' passengers' : ' passenger'}
                  {saved > 0 ? ` — your fare dropped to GH₵ ${myFare}, saving GH₵ ${saved.toFixed(2)}.` : '.'}
                  {' '}There's one more stop on the way.
                </Text>
              </Row>
            )}

            <View style={{ marginTop: 16, backgroundColor: c.surfaceAlt, borderRadius: 18, padding: 14 }}>
              <Row style={{ gap: 14 }}>
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 21, fontWeight: '800' }}>
                    {(driverInfo?.driverName || 'D').trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }} numberOfLines={1}>
                    {driverInfo?.driverName || 'Your driver'}
                  </Text>
                  <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 2 }} numberOfLines={1}>
                    {driverInfo?.vehicle || 'Vehicle details unavailable'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: c.primary }}>GH₵ {myFare}</Text>
                  {driverInfo?.plate ? (
                    <View style={{ marginTop: 4, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 12.5, fontWeight: '800', color: c.text, letterSpacing: 0.8 }}>{driverInfo.plate}</Text>
                    </View>
                  ) : null}
                </View>
              </Row>
            </View>

            <Row style={{ gap: 10, marginTop: 14 }}>
              <TouchableOpacity activeOpacity={0.85}
                onPress={() => {
                  if (driverInfo?.driverPhone) Linking.openURL(`tel:${driverInfo.driverPhone}`).catch(() => {});
                  else Alert.alert('Call', 'This driver has no phone number on their offer.');
                }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 999, backgroundColor: c.surfaceAlt }}>
                <Ionicons name="call" size={17} color={c.primary} />
                <Text style={{ fontSize: 14.5, fontWeight: '700', color: c.text }}>
                  {driverInfo?.driverPhone ? 'Call driver' : 'Call'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.85} onPress={sos}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 999, backgroundColor: `${c.danger}1A` }}>
                <Ionicons name="alert-circle" size={17} color={c.danger} />
                <Text style={{ fontSize: 14.5, fontWeight: '700', color: c.danger }}>SOS</Text>
              </TouchableOpacity>
            </Row>

            {/* Only for someone who JOINED. The passenger who booked has no button here because
                for them the operation is cancelling the ride, which would end the journey for
                everyone else in the car — a different thing entirely, and not one to offer behind
                the same word. Quiet styling: this is an escape hatch, not an invitation. */}
            {canLeavePool && (
              <TouchableOpacity onPress={leaveRide} disabled={leaving} activeOpacity={0.7}
                style={{ marginTop: 12, alignItems: 'center', paddingVertical: 10, opacity: leaving ? 0.5 : 1 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '600', color: c.textMuted }}>
                  {leaving ? 'Leaving…' : 'Leave this shared ride'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Once the driver marks you aboard your exit closes and the fare is yours, so if that
                is wrong you need a way to say so from the same screen it happened on. */}
            {canDispute && (
              <TouchableOpacity onPress={disputePickup} disabled={disputing} activeOpacity={0.7}
                style={{ marginTop: 12, alignItems: 'center', paddingVertical: 10, opacity: disputing ? 0.5 : 1 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '600', color: c.textMuted }}>
                  {disputing ? 'Sending…' : "I'm not in this car"}
                </Text>
              </TouchableOpacity>
            )}

            {disputed && (
              <Row style={{ gap: 9, marginTop: 12, backgroundColor: `${c.warning}14`, borderRadius: 14, padding: 12 }}>
                <Ionicons name="alert-circle" size={17} color={c.warning} />
                <Text style={{ flex: 1, fontSize: 12.5, color: c.text, lineHeight: 18 }}>
                  We've told your driver you're not in their car. If they don't correct it, our
                  support team can see this.
                </Text>
              </Row>
            )}
          </>
        )}

        {completed && (
          <>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: `${c.success}1A`, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="checkmark-done" size={26} color={c.success} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: '800', color: c.text, marginTop: 10 }}>Trip complete</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: c.primary, marginTop: 4 }}>GH₵ {myFare}</Text>
              {saved > 0 && (
                <Row style={{ gap: 6, marginTop: 4 }}>
                  <Ionicons name="people" size={13} color={c.success} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.success }}>
                    Sharing saved you GH₵ {saved.toFixed(2)}
                  </Text>
                </Row>
              )}
            </View>

            {/* Payment */}
            {paid ? (
              <Row style={{ justifyContent: 'center', gap: 8, marginTop: 14, backgroundColor: `${c.success}1A`, borderRadius: 14, paddingVertical: 12 }}>
                <Ionicons name="checkmark-circle" size={18} color={c.success} />
                <Text style={{ fontSize: 14.5, fontWeight: '700', color: c.success }}>Payment received · {methodMeta.label}</Text>
              </Row>
            ) : (
              <View style={{ marginTop: 14, backgroundColor: c.surfaceAlt, borderRadius: 18, padding: 14 }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Payment</Text>
                  <TouchableOpacity onPress={() => router.push('/wallet' as any)}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>Change · {methodMeta.label}</Text>
                  </TouchableOpacity>
                </Row>

                {viaPaystack && (
                  <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 10 }}>
                    {payRef
                      ? 'Finish paying in the Paystack checkout, then tap Verify to confirm.'
                      : `You’ll pay GH₵ ${myFare} securely via Paystack (${methodMeta.label}).`}
                  </Text>
                )}
                {payMethod === 'wallet' && (
                  <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 10 }}>Pay GH₵ {myFare} from your GoZone Wallet balance.</Text>
                )}
                {payMethod === 'cash' && awaitingCash && (
                  <Row style={{ gap: 10, alignItems: 'center', marginBottom: 6 }}>
                    <ActivityIndicator color={c.primary} />
                    <Text style={{ fontSize: 13.5, color: c.text, flex: 1 }}>Pay the driver GH₵ {myFare} in cash — waiting for them to confirm.</Text>
                  </Row>
                )}
                {payMethod === 'cash' && !awaitingCash && (
                  <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 10 }}>Pay the driver GH₵ {myFare} in cash. They’ll confirm it in their app.</Text>
                )}

                {!(payMethod === 'cash' && awaitingCash) && (
                  <TouchableOpacity onPress={pay} disabled={paying} activeOpacity={0.9}
                    style={{ backgroundColor: c.primary, borderRadius: 999, paddingVertical: 14, alignItems: 'center', opacity: paying ? 0.6 : 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                      {paying ? 'Processing…'
                        : viaPaystack ? (payRef ? 'Verify payment' : `Pay with ${methodMeta.label}`)
                        : payMethod === 'cash' ? 'Pay with cash'
                        : `Pay GH₵ ${myFare}`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Rating */}
            <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, marginTop: 16, textAlign: 'center' }}>{rated ? 'Thanks for rating!' : 'Rate your driver'}</Text>
            <Row style={{ gap: 10, marginTop: 10, justifyContent: 'center' }}>
              <StarRating value={rating} onChange={setRating} disabled={rated} />
            </Row>
            {!rated && rating > 0 && (
              <TouchableOpacity onPress={rate} activeOpacity={0.85}
                style={{ marginTop: 12, alignSelf: 'center', paddingHorizontal: 26, paddingVertical: 11, borderRadius: 999, backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.primary }}>
                <Text style={{ color: c.primary, fontWeight: '800', fontSize: 14 }}>Submit rating</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => router.replace('/(rider)/home' as any)} activeOpacity={0.9}
              style={{ marginTop: 16, backgroundColor: paid ? c.primary : c.surfaceAlt, borderRadius: 999, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: paid ? '#fff' : c.text, fontWeight: '800', fontSize: 15 }}>{paid ? 'Book another ride' : 'Done'}</Text>
            </TouchableOpacity>
          </>
        )}

        {cancelled && (
          <View style={{ alignItems: 'center' }}>
            <Badge label="Cancelled" color={c.danger} />
            <Text style={{ fontSize: 19, fontWeight: '800', color: c.text, marginTop: 10 }}>Trip cancelled</Text>
            <TouchableOpacity onPress={() => router.replace('/(rider)/home' as any)} activeOpacity={0.9}
              style={{ marginTop: 16, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 44 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Back to home</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
