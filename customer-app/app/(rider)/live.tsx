import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, TextInput, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { rideApi, Trip, BidOffer } from '../../src/api/ride';
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
import { Row, Badge } from '../../src/components/ui';

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

  const searching = !trip;
  // Show the "no drivers" panel once the request is dead, or we timed out with no live offers.
  const noDrivers = searching && (reqDead || (timedOut && offers.length === 0));
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
        const b = await rideApi.listBids(requestId);
        if (active) setOffers(b);
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
        const { reference } = await walletApi.chargeCard(cardIdOf(payMethod), Number(trip.agreedFare));
        setTrip(await rideApi.payTrip(trip.id, 'card', reference));
        await clearPending();
      } else if (viaPaystack && !payRef) {
        const { reference, authorizationUrl } = await walletApi.payInitialize(Number(trip.agreedFare));
        const url = authorizationUrl.startsWith('http') ? authorizationUrl : `${apiBaseUrl()}${authorizationUrl}`;
        setPayRef(reference);
        // Survive the browser hand-off: returning from Paystack usually reloads the app, and a
        // reference kept only in React state dies with it — the customer pays and the fare stays
        // unpaid. See src/lib/pendingPayment.ts.
        await setPending({ kind: 'trip', reference, amount: Number(trip.agreedFare), targetId: trip.id, method: payMethod });
        await Linking.openURL(url);
      } else {
        const t = await rideApi.payTrip(trip.id, payMethod, payRef ?? undefined);
        setTrip(t);
        // Paid by card through checkout — offer it as one tap next time.
        if (payRef) walletApi.rememberCard(payRef, Number(trip.agreedFare));
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
    wsClient.subscribeToRide(trip.id, (loc) => { setDriverLoc({ lat: loc.lat, lng: loc.lng }); setIsStale(false); });
    const staleTimer = setInterval(() => setIsStale(true), 6000);
    return () => clearInterval(staleTimer);
  }, [trip?.id, completed, cancelled]);

  async function sos() {
    if (!trip) return;
    try {
      await rideApi.sos(trip.id, driverLoc ?? { lat: origin.lat, lng: origin.lng });
      Alert.alert('SOS sent', 'Your alert has reached the GoZone safety team. They are reviewing it now and will contact you or the authorities as needed.');
    } catch {
      Alert.alert('SOS', 'Could not send the alert — please call emergency services directly if you are in danger.');
    }
  }
  async function rate(score: number) {
    if (!trip || rated) return;
    setRating(score);
    try { await rideApi.rateTrip(trip.id, trip.driverId, score); setRated(true); }
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
                  <Text style={{ fontSize: 17, fontWeight: '800', color: c.primary }}>GH₵ {trip.agreedFare}</Text>
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
          </>
        )}

        {completed && (
          <>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: `${c.success}1A`, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="checkmark-done" size={26} color={c.success} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: '800', color: c.text, marginTop: 10 }}>Trip complete</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: c.primary, marginTop: 4 }}>GH₵ {trip?.agreedFare}</Text>
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
                      : `You’ll pay GH₵ ${trip?.agreedFare} securely via Paystack (${methodMeta.label}).`}
                  </Text>
                )}
                {payMethod === 'wallet' && (
                  <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 10 }}>Pay GH₵ {trip?.agreedFare} from your GoZone Wallet balance.</Text>
                )}
                {payMethod === 'cash' && awaitingCash && (
                  <Row style={{ gap: 10, alignItems: 'center', marginBottom: 6 }}>
                    <ActivityIndicator color={c.primary} />
                    <Text style={{ fontSize: 13.5, color: c.text, flex: 1 }}>Pay the driver GH₵ {trip?.agreedFare} in cash — waiting for them to confirm.</Text>
                  </Row>
                )}
                {payMethod === 'cash' && !awaitingCash && (
                  <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 10 }}>Pay the driver GH₵ {trip?.agreedFare} in cash. They’ll confirm it in their app.</Text>
                )}

                {!(payMethod === 'cash' && awaitingCash) && (
                  <TouchableOpacity onPress={pay} disabled={paying} activeOpacity={0.9}
                    style={{ backgroundColor: c.primary, borderRadius: 999, paddingVertical: 14, alignItems: 'center', opacity: paying ? 0.6 : 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                      {paying ? 'Processing…'
                        : viaPaystack ? (payRef ? 'Verify payment' : `Pay with ${methodMeta.label}`)
                        : payMethod === 'cash' ? 'Pay with cash'
                        : `Pay GH₵ ${trip?.agreedFare}`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Rating */}
            <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, marginTop: 16, textAlign: 'center' }}>{rated ? 'Thanks for rating!' : 'Rate your driver'}</Text>
            <Row style={{ gap: 10, marginTop: 10, justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => rate(n)} activeOpacity={0.7} disabled={rated}>
                  <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={32} color={c.warning} />
                </TouchableOpacity>
              ))}
            </Row>
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
