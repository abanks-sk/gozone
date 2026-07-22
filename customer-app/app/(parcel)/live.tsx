import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { rideApi, Trip, BidOffer } from '../../src/api/ride';
import { walletApi } from '../../src/api/wallet';
import { mapsApi, LatLng } from '../../src/api/maps';
import { wsClient } from '../../src/realtime/wsClient';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useRideDraft } from '../../src/store/rideDraft';
import { usePaymentStore, PAY_METHODS, isPaystack } from '../../src/store/paymentStore';
import { apiBaseUrl } from '../../src/lib/host';
import { LeafletMap } from '../../src/components/LeafletMap';
import { Row, Badge } from '../../src/components/ui';

// Step 3 of the parcel flow — mirrors the ride live screen: full-screen map,
// searching → courier offers → live tracking → delivered (pay + rate).
// A parcel run reuses the ride backend, so a "trip" is the courier run.
function courierPhase(status: string, sending: boolean, party: string) {
  switch (status) {
    case 'MATCHED': return {
      label: 'Courier assigned',
      title: 'Your courier is on the way',
      sub: sending ? 'They’re heading to your pickup point.' : 'They’re heading to the sender to collect your parcel.',
    };
    case 'ENROUTE': return {
      label: 'Heading to pickup',
      title: sending ? 'Courier coming to you' : 'Courier heading to the sender',
      sub: sending ? 'Have the parcel ready to hand over.' : `They’ll collect the parcel from ${party || 'the sender'} and bring it to you.`,
    };
    case 'STARTED': return {
      label: 'In transit',
      title: sending ? 'Your parcel is on its way' : 'Your parcel is coming to you',
      sub: sending ? `It’s heading to ${party || 'your recipient'}. Track it live below.` : 'Track it live below.',
    };
    default: return { label: status, title: 'Your parcel', sub: '' };
  }
}

export default function ParcelLiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const p = useLocalSearchParams<{ requestId: string; direction: 'send' | 'receive'; size: string; party: string; fare: string }>();
  const sending = (p.direction ?? 'send') === 'send';
  const requestId = p.requestId;
  const origin = useRideDraft((s) => s.origin);
  const dest = useRideDraft((s) => s.dest);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [offers, setOffers] = useState<BidOffer[]>([]);
  const [courierInfo, setCourierInfo] = useState<BidOffer | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [reqDead, setReqDead] = useState(false);
  const [courierLoc, setCourierLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [rating, setRating] = useState(0);
  const [rated, setRated] = useState(false);
  const payMethod = usePaymentStore((s) => s.selected);
  const savedMethods = usePaymentStore((s) => s.cards);
  const [paying, setPaying] = useState(false);
  const [payRef, setPayRef] = useState<string | null>(null);

  const SEARCH_TIMEOUT_MS = 60000;

  // Real road route pickup→drop-off (backend Directions proxy); straight-line fallback.
  const [routePts, setRoutePts] = useState<LatLng[]>([]);
  useEffect(() => {
    let active = true;
    mapsApi.directions({ lat: origin.lat, lng: origin.lng }, { lat: dest.lat, lng: dest.lng })
      .then((d) => { if (active && d.points?.length) setRoutePts(d.points); })
      .catch(() => {});
    return () => { active = false; };
  }, [origin.lat, origin.lng, dest.lat, dest.lng]);
  const route = routePts.length ? routePts : [{ lat: origin.lat, lng: origin.lng }, { lat: dest.lat, lng: dest.lng }];

  // The courier's road route to the pickup, shown while they head there.
  const [pickupRoute, setPickupRoute] = useState<LatLng[]>([]);
  const beforePickup = !!trip && (trip.status === 'MATCHED' || trip.status === 'ENROUTE');
  useEffect(() => {
    if (!beforePickup || !courierLoc || pickupRoute.length) return;
    let active = true;
    mapsApi.directions(courierLoc, { lat: origin.lat, lng: origin.lng })
      .then((d) => { if (active && d.points?.length) setPickupRoute(d.points); })
      .catch(() => {});
    return () => { active = false; };
  }, [beforePickup, courierLoc?.lat, courierLoc?.lng]);

  const searching = !trip;
  const noCouriers = searching && (reqDead || (timedOut && offers.length === 0));
  const completed = trip?.status === 'COMPLETED';
  const cancelled = trip?.status === 'CANCELLED';
  const paid = trip?.paymentStatus === 'PAID';
  const awaitingCash = trip?.paymentStatus === 'AWAITING';
  const methodMeta = [...PAY_METHODS, ...savedMethods].find((m) => m.key === payMethod) ?? PAY_METHODS[0];
  const viaPaystack = isPaystack(payMethod);
  const fareShown = trip?.agreedFare ?? p.fare;

  // Poll request → courier offers → matched run.
  useEffect(() => {
    if (!requestId || completed || cancelled || noCouriers) return;
    let active = true;
    const tick = async () => {
      try {
        const s = await rideApi.requestStatus(requestId);
        if (!active) return;
        if (s.trip) { setTrip(s.trip); if (s.driver) setCourierInfo(s.driver); return; }
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
  }, [requestId, completed, cancelled, noCouriers]);

  function keepLooking() { setTimedOut(false); }

  async function acceptOffer(b: BidOffer) {
    setAccepting(true);
    try { const t = await rideApi.acceptBid(requestId, b.id); setTrip(t); setCourierInfo(b); }
    catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Could not accept offer'); }
    finally { setAccepting(false); }
  }

  // Cash awaits the courier's confirmation — poll until it flips to PAID.
  useEffect(() => {
    if (!completed || !awaitingCash || !requestId) return;
    const poll = setInterval(async () => {
      try { const s = await rideApi.requestStatus(requestId); if (s.trip) setTrip(s.trip); } catch {}
    }, 4000);
    return () => clearInterval(poll);
  }, [completed, awaitingCash, requestId]);

  async function pay() {
    if (!trip) return;
    setPaying(true);
    try {
      if (viaPaystack && !payRef) {
        const { reference, authorizationUrl } = await walletApi.payInitialize(Number(trip.agreedFare));
        const url = authorizationUrl.startsWith('http') ? authorizationUrl : `${apiBaseUrl()}${authorizationUrl}`;
        setPayRef(reference);
        await Linking.openURL(url);
      } else {
        setTrip(await rideApi.payTrip(trip.id, payMethod, payRef ?? undefined));
        setPayRef(null);
      }
    } catch (e: any) {
      Alert.alert('Payment', e?.response?.data?.message ?? 'Please try again');
    } finally { setPaying(false); }
  }

  // Live courier location over WS.
  useEffect(() => {
    if (!trip || completed || cancelled) return;
    wsClient.subscribeToRide(trip.id, (loc) => { setCourierLoc({ lat: loc.lat, lng: loc.lng }); setIsStale(false); });
    const staleTimer = setInterval(() => setIsStale(true), 6000);
    return () => clearInterval(staleTimer);
  }, [trip?.id, completed, cancelled]);

  async function sos() {
    if (!trip) return;
    try {
      await rideApi.sos(trip.id, courierLoc ?? { lat: origin.lat, lng: origin.lng });
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

  const phase = trip ? courierPhase(trip.status, sending, p.party ?? '') : null;

  // Map phases: courier→pickup while collecting; pickup→drop-off once in transit.
  const center = beforePickup && courierLoc
    ? { lat: (courierLoc.lat + origin.lat) / 2, lng: (courierLoc.lng + origin.lng) / 2 }
    : { lat: (origin.lat + dest.lat) / 2, lng: (origin.lng + dest.lng) / 2 };
  const markers = beforePickup
    ? [{ lat: origin.lat, lng: origin.lng, kind: 'pickup' as const, label: 'Pickup' }]
    : [
        { lat: origin.lat, lng: origin.lng, kind: 'pickup' as const, label: 'Pickup' },
        { lat: dest.lat, lng: dest.lng, kind: 'dest' as const, label: 'Drop-off' },
      ];
  const shownRoute = beforePickup
    ? (pickupRoute.length ? pickupRoute : (courierLoc ? [courierLoc, { lat: origin.lat, lng: origin.lng }] : []))
    : route;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <LeafletMap style={{ flex: 1 }} mode="view" center={center} zoom={13} markers={markers} driver={courierLoc} route={shownRoute} />

      {/* Back */}
      <TouchableOpacity onPress={() => router.replace('/(parcel)' as any)} activeOpacity={0.85}
        style={{ position: 'absolute', top: insets.top + 8, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="chevron-back" size={24} color={c.text} />
      </TouchableOpacity>

      {/* Bottom sheet */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: insets.bottom + 18, borderTopWidth: 1, borderColor: c.border }}>
        {searching && !noCouriers && (
          <>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Badge label={offers.length ? `${offers.length} offer${offers.length > 1 ? 's' : ''}` : 'Searching'} color={offers.length ? c.success : c.warning} />
              {!offers.length && <ActivityIndicator color={c.primary} />}
            </Row>
            <Text style={{ fontSize: 20, fontWeight: '800', color: c.text, marginTop: 10 }}>
              {offers.length ? 'Couriers are offering' : 'Finding you a courier…'}
            </Text>
            <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>
              {offers.length
                ? 'Pick a courier to carry your parcel.'
                : `${p.size ?? 'Medium'} parcel · GH₵ ${p.fare} — nearby couriers are being notified.`}
            </Text>

            {offers.map((o) => (
              <View key={o.id} style={{ marginTop: 12, backgroundColor: c.surfaceAlt, borderRadius: 16, padding: 12 }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Row style={{ gap: 12, flex: 1 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>
                        {(o.driverName || 'C').trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }} numberOfLines={1}>
                        {o.driverName || `Courier ${o.driverId.slice(0, 6)}`}
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
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13.5 }}>Choose courier</Text>
                  </TouchableOpacity>
                </Row>
              </View>
            ))}

            <TouchableOpacity onPress={() => router.replace('/(parcel)' as any)} activeOpacity={0.85}
              style={{ marginTop: 16, borderRadius: 999, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: c.border }}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}

        {noCouriers && (
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: `${c.warning}1A`, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="cube-outline" size={26} color={c.warning} />
            </View>
            <Text style={{ fontSize: 19, fontWeight: '800', color: c.text, marginTop: 10, textAlign: 'center' }}>No couriers available right now</Text>
            <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>
              We couldn’t reach a courier near the pickup in time. Please try again in a few minutes.
            </Text>
            {!reqDead && (
              <TouchableOpacity onPress={keepLooking} activeOpacity={0.9}
                style={{ marginTop: 18, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 14, alignItems: 'center', alignSelf: 'stretch' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Keep looking</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => router.replace('/(parcel)' as any)} activeOpacity={0.85}
              style={{ marginTop: 10, borderRadius: 999, paddingVertical: 14, alignItems: 'center', alignSelf: 'stretch', borderWidth: 1.5, borderColor: c.border }}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>{reqDead ? 'Back to parcels' : 'Cancel'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {trip && !completed && !cancelled && phase && (
          <>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Badge label={phase.label} color={c.primary} />
              <Badge label={isStale ? 'Stale' : 'Live'} color={isStale ? c.textMuted : c.success} />
            </Row>
            <Text style={{ fontSize: 20, fontWeight: '800', color: c.text, marginTop: 10 }}>{phase.title}</Text>
            <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>{phase.sub}</Text>

            <View style={{ marginTop: 16, backgroundColor: c.surfaceAlt, borderRadius: 18, padding: 14 }}>
              <Row style={{ gap: 14 }}>
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 21, fontWeight: '800' }}>
                    {(courierInfo?.driverName || 'C').trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }} numberOfLines={1}>
                    {courierInfo?.driverName || 'Your courier'}
                  </Text>
                  <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 2 }} numberOfLines={1}>
                    {courierInfo?.vehicle || 'Vehicle details unavailable'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: c.primary }}>GH₵ {fareShown}</Text>
                  {courierInfo?.plate ? (
                    <View style={{ marginTop: 4, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 12.5, fontWeight: '800', color: c.text, letterSpacing: 0.8 }}>{courierInfo.plate}</Text>
                    </View>
                  ) : null}
                </View>
              </Row>
            </View>

            <Row style={{ gap: 10, marginTop: 14 }}>
              <TouchableOpacity activeOpacity={0.85}
                onPress={() => {
                  if (courierInfo?.driverPhone) Linking.openURL(`tel:${courierInfo.driverPhone}`).catch(() => {});
                  else Alert.alert('Call', 'This courier has no phone number on their offer.');
                }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 999, backgroundColor: c.surfaceAlt }}>
                <Ionicons name="call" size={17} color={c.primary} />
                <Text style={{ fontSize: 14.5, fontWeight: '700', color: c.text }}>
                  {courierInfo?.driverPhone ? 'Call courier' : 'Call'}
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
              <Text style={{ fontSize: 20, fontWeight: '800', color: c.text, marginTop: 10 }}>Parcel delivered</Text>
              <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>
                {sending ? (p.party ? `Handed to ${p.party}.` : 'Handed to your recipient.') : 'Your parcel has arrived.'}
              </Text>
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
                    <Text style={{ fontSize: 13.5, color: c.text, flex: 1 }}>Pay the courier GH₵ {trip?.agreedFare} in cash — waiting for them to confirm.</Text>
                  </Row>
                )}
                {payMethod === 'cash' && !awaitingCash && (
                  <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 10 }}>Pay the courier GH₵ {trip?.agreedFare} in cash. They’ll confirm it in their app.</Text>
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
            <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, marginTop: 16, textAlign: 'center' }}>{rated ? 'Thanks for rating!' : 'Rate your courier'}</Text>
            <Row style={{ gap: 10, marginTop: 10, justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => rate(n)} activeOpacity={0.7} disabled={rated}>
                  <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={32} color={c.warning} />
                </TouchableOpacity>
              ))}
            </Row>
            <TouchableOpacity onPress={() => router.replace('/(parcel)' as any)} activeOpacity={0.9}
              style={{ marginTop: 16, backgroundColor: paid ? c.primary : c.surfaceAlt, borderRadius: 999, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: paid ? '#fff' : c.text, fontWeight: '800', fontSize: 15 }}>{paid ? 'Send another parcel' : 'Done'}</Text>
            </TouchableOpacity>
          </>
        )}

        {cancelled && (
          <View style={{ alignItems: 'center' }}>
            <Badge label="Cancelled" color={c.danger} />
            <Text style={{ fontSize: 19, fontWeight: '800', color: c.text, marginTop: 10 }}>Courier run cancelled</Text>
            <TouchableOpacity onPress={() => router.replace('/(parcel)' as any)} activeOpacity={0.9}
              style={{ marginTop: 16, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 44 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Back to parcels</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
