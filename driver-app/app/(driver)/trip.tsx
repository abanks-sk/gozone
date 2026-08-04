import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { rideApi, TripPassenger } from '../../src/api/ride';
import { mapsApi } from '../../src/api/maps';
import { useDriverStore } from '../../src/store/driverStore';
import { useAuthStore } from '../../src/store/authStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Row, StarRating } from '../../src/components/ui';
import { GoogleMap } from '../../src/components/GoogleMap';
import { vehicleKindOf } from '../../src/components/mapTypes';

const FLOW = ['MATCHED', 'ENROUTE', 'STARTED', 'COMPLETED'] as const;
const stepsFor = (parcel: boolean) => [
  { key: 'MATCHED', label: 'Matched', sub: parcel ? 'The sender picked you as courier' : 'The passenger picked you' },
  { key: 'ENROUTE', label: 'Heading to pickup', sub: parcel ? 'Driving to collect the parcel' : 'Driving to the passenger' },
  { key: 'STARTED', label: parcel ? 'Delivering' : 'On trip', sub: parcel ? 'Taking the parcel to the drop-off' : 'Taking them to the destination' },
  { key: 'COMPLETED', label: 'Completed', sub: 'Fare settled to your wallet' },
];
const actionFor = (parcel: boolean): Record<string, string> => ({
  MATCHED: 'Start heading to pickup',
  ENROUTE: parcel ? 'Picked up — start delivery' : 'Arrived — start trip',
  STARTED: parcel ? 'Delivered — complete' : 'Complete trip',
});

/** Expand a (possibly 2-point straight-line) route into ~n evenly walkable steps. */
function densify(pts: { lat: number; lng: number }[], n = 30): { lat: number; lng: number }[] {
  if (pts.length < 2) return pts;
  if (pts.length >= n) return pts;
  const out: { lat: number; lng: number }[] = [];
  const perSeg = Math.ceil(n / (pts.length - 1));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function DriverTripScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const trip = useDriverStore((s) => s.activeTrip);
  // Draw yourself as what you actually ride, matching what the customer sees of you.
  const myVehicle = vehicleKindOf(useAuthStore.getState().vehicleClass);
  const req = useDriverStore((s) => s.activeReq);
  const myPos = useDriverStore((s) => s.myPos);
  const setActiveTrip = useDriverStore((s) => s.setActiveTrip);
  const setActiveReq = useDriverStore((s) => s.setActiveReq);
  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState(0);
  const [rated, setRated] = useState(false);
  const [pay, setPay] = useState<{ status?: string; method?: string | null }>({});
  const [arrived, setArrived] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [routePts, setRoutePts] = useState<{ lat: number; lng: number }[]>([]);
  const [pickupPts, setPickupPts] = useState<{ lat: number; lng: number }[]>([]);
  const [riderPhone, setRiderPhone] = useState<string | null>(null);
  // Parcel handover: who is at the far end. Comes from the same guarded trip fetch as the
  // customer's phone — the open feed deliberately doesn't carry contact details.
  const [handover, setHandover] = useState<{ direction?: string | null; name?: string | null; phone?: string | null }>({});

  // Everyone in the car, and what each of them owes. On a shared ride this is the whole job: an
  // extra pickup the driver did not have when they accepted, and a second fare to collect.
  const [passengers, setPassengers] = useState<TripPassenger[]>([]);
  const [sharedTrip, setSharedTrip] = useState(false);
  const [fare, setFare] = useState<number | null>(null);

  // The customer's phone comes with the full trip (participant-guarded).
  useEffect(() => {
    if (!trip) return;
    let active = true;
    rideApi.getTrip(trip.id).then((t) => {
      if (!active) return;
      setRiderPhone(t.riderPhone ?? null);
      setHandover({ direction: t.direction, name: t.partyName, phone: t.partyPhone });
      setSharedTrip(!!t.shared);
      setFare(Number(t.agreedFare));
    }).catch(() => {});
    return () => { active = false; };
  }, [trip?.id]);

  /**
   * Poll the passenger list while the trip runs.
   *
   * <p>Not a one-off fetch: on a shared ride somebody can get in AFTER the driver accepted, and
   * the whole point is that the new pickup and the higher fare reach them without their doing
   * anything. Stops once the trip is done, at which point the list is only about who still owes.
   */
  useEffect(() => {
    if (!trip) return;
    let active = true;
    const tick = () => {
      rideApi.tripPassengers(trip.id).then((p) => { if (active) setPassengers(p); }).catch(() => {});
      rideApi.getTrip(trip.id).then((t) => {
        if (!active) return;
        setSharedTrip(!!t.shared);
        setFare(Number(t.agreedFare));
      }).catch(() => {});
    };
    tick();
    const poll = setInterval(tick, 6000);
    return () => { active = false; clearInterval(poll); };
  }, [trip?.id, pay.status]);
  const locRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wpRef = useRef(0);
  const walkRef = useRef<{ lat: number; lng: number }[]>([]);

  // Real road route pickup→destination (backend Directions proxy); straight-line fallback.
  useEffect(() => {
    if (!req) return;
    let active = true;
    mapsApi.directions({ lat: req.originLat, lng: req.originLng }, { lat: req.destLat, lng: req.destLng })
      .then((d) => { if (active && d.points?.length) setRoutePts(d.points); })
      .catch(() => {});
    return () => { active = false; };
  }, [req?.originLat, req?.originLng, req?.destLat, req?.destLng]);

  // Route from where the driver offered → the pickup (the "heading to pickup" leg).
  useEffect(() => {
    if (!req) return;
    const start = myPos ?? { lat: 5.6037, lng: -0.187 };
    let active = true;
    mapsApi.directions(start, { lat: req.originLat, lng: req.originLng })
      .then((d) => { if (active && d.points?.length) setPickupPts(d.points); })
      .catch(() => {});
    return () => { active = false; };
  }, [req?.originLat, req?.originLng]);

  const done = trip?.status === 'COMPLETED';

  // After completion, poll the trip so we can see the customer's chosen payment method
  // and confirm cash when they pay that way.
  useEffect(() => {
    if (!done || !trip || pay.status === 'PAID') return;
    const poll = setInterval(async () => {
      try { const t = await rideApi.getTrip(trip.id); setPay({ status: t.paymentStatus, method: t.paymentMethod }); } catch {}
    }, 4000);
    return () => clearInterval(poll);
  }, [done, trip?.id, pay.status]);

  /**
   * Confirm cash. {@code riderId} names who paid — required on a shared ride, where two people
   * hand over two different amounts at two different kerbs.
   */
  /**
   * Confirm a shared passenger is in the car.
   *
   * <p>This is the driver's own protection, which is why it sits on their screen and not the
   * passenger's: until they tap it the passenger can still leave and owe nothing, and after it the
   * fare is theirs. Whoever booked the ride is confirmed automatically at Start.
   */
  const [pickingUp, setPickingUp] = useState<string | null>(null);
  async function markPickedUp(riderId: string) {
    if (!trip) return;
    setPickingUp(riderId);
    try {
      const updated = await rideApi.markPickedUp(trip.id, riderId);
      setPassengers((ps) => ps.map((p) => (p.riderId === riderId ? updated : p)));
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not confirm the pickup');
    } finally { setPickingUp(null); }
  }

  /**
   * Take back a pickup confirmed by mistake.
   *
   * <p>Confirmed first: this re-opens the passenger's exit, so a stray tap here undoes the thing
   * that guarantees the driver gets paid. The window is short and the server owns it — asking the
   * phone's clock whether the button should still be there invites a device with a wrong time to
   * hide an undo that would have worked, so it stays visible and the server's answer is shown.
   */
  function undoPickup(riderId: string) {
    if (!trip) return;
    Alert.alert(
      'Undo this pickup?',
      'Use this only if they are not actually in your car. They will be able to cancel again, and you would not be paid for them.',
      [
        { text: 'Keep' },
        {
          text: 'Undo', style: 'destructive',
          onPress: async () => {
            setPickingUp(riderId);
            try {
              const updated = await rideApi.undoPickup(trip.id, riderId);
              setPassengers((ps) => ps.map((p) => (p.riderId === riderId ? updated : p)));
            } catch (e: any) {
              Alert.alert('Couldn’t undo', e?.response?.data?.message ?? 'Please try again.');
            } finally { setPickingUp(null); }
          },
        },
      ],
    );
  }

  async function confirmCash(riderId?: string) {
    if (!trip) return;
    setConfirming(true);
    try {
      const t = await rideApi.confirmCash(trip.id, riderId);
      setPay({ status: t.paymentStatus, method: t.paymentMethod });
      setPassengers(await rideApi.tripPassengers(trip.id).catch(() => passengers));
    }
    catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Could not confirm'); }
    finally { setConfirming(false); }
  }

  // Walk the driver marker along a route, pushing each step to the passenger's
  // live map. ENROUTE walks driver→pickup; STARTED walks pickup→destination.
  function startGps(path: { lat: number; lng: number }[]) {
    stopGps();
    walkRef.current = densify(path);
    wpRef.current = 0;
    locRef.current = setInterval(() => {
      const pts = walkRef.current;
      if (!pts.length) return;
      const wp = pts[Math.min(wpRef.current, pts.length - 1)];
      rideApi.pushLocation(wp.lat, wp.lng).catch(() => {});
      setDriverPos(wp); // move the marker on the driver's own map too
      if (wpRef.current < pts.length - 1) wpRef.current++;
    }, 2500);
  }
  function stopGps() { if (locRef.current) { clearInterval(locRef.current); locRef.current = null; } }
  useEffect(() => () => stopGps(), []);

  async function advance() {
    if (!trip) return;
    const idx = FLOW.indexOf(trip.status as any);
    if (idx < 0 || idx >= FLOW.length - 1) return;
    const next = FLOW[idx + 1];
    setLoading(true);
    try {
      const updated = await rideApi.updateTripStatus(trip.id, next);
      setActiveTrip(updated);
      if (next === 'ENROUTE') {
        const start = myPos ?? { lat: 5.6037, lng: -0.187 };
        startGps(pickupPts.length ? pickupPts : (req ? [start, { lat: req.originLat, lng: req.originLng }] : []));
      }
      if (next === 'STARTED' && req) {
        startGps(routePts.length ? routePts : [
          { lat: req.originLat, lng: req.originLng },
          { lat: req.destLat, lng: req.destLng },
        ]);
      }
      if (next === 'COMPLETED') stopGps();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Status update failed');
    } finally { setLoading(false); }
  }

  /**
   * Tell the customer we are here.
   *
   * Separate from the status flow on purpose: arriving is not starting. The driver taps this when
   * they pull up, and still taps Start once the passenger is actually in the car — collapsing the
   * two would start the meter on someone standing in their doorway.
   */
  async function announceArrival() {
    if (!trip || arrived) return;
    setArriving(true);
    try { await rideApi.announceArrival(trip.id); setArrived(true); }
    catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Could not notify the customer'); }
    finally { setArriving(false); }
  }

  // Choosing a score and sending it are separate: tapping a star used to submit on the spot, so a
  // thumb that landed on the wrong one was the rating that stood.
  async function rate() {
    if (!trip || rated || !req || !rating) return;
    try { await rideApi.rateTrip(trip.id, req.riderId, rating); setRated(true); }
    catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Could not submit rating'); }
  }

  /**
   * Rate one passenger on a shared trip.
   *
   * <p>Kept separate from {@link rate} rather than generalised over it: a solo trip has one
   * passenger and one score, and collapsing the two would make the ordinary case carry a map of
   * per-rider state it never uses. Each score is submitted on its own, so rating the first person
   * is not lost if the second call fails.
   */
  const [paxScores, setPaxScores] = useState<Record<string, number>>({});
  const [paxRated, setPaxRated] = useState<Record<string, boolean>>({});
  async function ratePassenger(riderId: string) {
    const score = paxScores[riderId];
    if (!trip || !score || paxRated[riderId]) return;
    try {
      await rideApi.rateTrip(trip.id, riderId, score);
      setPaxRated((m) => ({ ...m, [riderId]: true }));
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not submit rating');
    }
  }

  /**
   * Leave the trip screen.
   *
   * Dropping `activeTrip` is what ends the job, so it must not happen while the fare is still
   * outstanding. A cash fare sits at AWAITING until the driver confirms they took the money, and
   * the driver used to clear the trip on the way back to the feed — after which there was no
   * route back to it, "Confirm cash received" was unreachable, and the customer sat on "waiting
   * for them to confirm" forever. Keeping the trip means the feed's active-trip banner leads back
   * here. (A completed trip no longer blocks the feed, so holding it costs the driver nothing —
   * see feed.tsx.)
   */
  function finish() {
    stopGps();
    if (done && pay.status !== 'PAID') { router.replace('/(driver)/feed'); return; }
    setActiveTrip(null); setActiveReq(null);
    router.replace('/(driver)/feed');
  }

  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="navigate-outline" size={34} color={c.textMuted} />
        </View>
        <Text style={{ fontSize: 18, fontWeight: '800', color: c.text, marginTop: 16 }}>No active trip</Text>
        <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>Accept a request from the Home tab to start a trip.</Text>
        <TouchableOpacity onPress={() => router.replace('/(driver)/feed')} activeOpacity={0.9}
          style={{ marginTop: 20, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 34 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Go to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const idx = FLOW.indexOf(trip.status as any);
  const tripKm = req ? haversine(req.originLat, req.originLng, req.destLat, req.destLng) : null;
  const isParcel = req?.kind === 'PARCEL';
  // The fare from the server, not from the store: on a shared ride it GROWS when somebody joins,
  // and the copy in the driver's store is whatever it was when they accepted.
  const totalFare = fare ?? Number(trip.agreedFare);
  // Everyone who boarded after the person who booked. These are the pickups the driver did not
  // agree to when they took the job, so they get their own treatment rather than a count.
  const extras = passengers.filter((p) => p.pickupSeq > 1);
  const sharing = sharedTrip && passengers.length > 1;
  const STEP = stepsFor(isParcel);
  const ACTION = actionFor(isParcel);

  // Call whoever is at the end you're driving to now. On a SEND the customer is at the pickup
  // and the other party at the drop-off; on a RECEIVE it's the reverse. Rides always call the
  // passenger.
  const pickedUp = trip.status === 'STARTED';
  const callParty = isParcel && (handover.direction === 'RECEIVE' ? !pickedUp : pickedUp);
  const callNumber = (callParty ? handover.phone : riderPhone) ?? riderPhone;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: c.text, marginBottom: 4 }}>
          {isParcel ? 'Active delivery' : sharing ? 'Shared trip' : 'Active trip'}
        </Text>
        <Text style={{ fontSize: 13.5, color: c.textMuted, marginBottom: 18 }}>
          {isParcel ? 'Delivery' : 'Trip'} {trip.id.slice(0, 8)}… · GH₵ {totalFare}
          {sharing ? ` · ${passengers.length} passengers` : ''}
        </Text>

        {/* Live map — pickup, destination, route and your position */}
        {!done && req && (() => {
          // Before pickup: show the leg to the passenger. On trip: the journey itself.
          const toPickup = trip.status === 'MATCHED' || trip.status === 'ENROUTE';
          const start = myPos ?? { lat: 5.6037, lng: -0.187 };
          const legRoute = toPickup
            ? (pickupPts.length ? pickupPts : [start, { lat: req.originLat, lng: req.originLng }])
            : (routePts.length ? routePts : [
                { lat: req.originLat, lng: req.originLng },
                { lat: req.destLat, lng: req.destLng },
              ]);
          const legMarkers = toPickup
            ? [{ lat: req.originLat, lng: req.originLng, kind: 'pickup' as const, label: 'Pickup' }]
            : [
                { lat: req.originLat, lng: req.originLng, kind: 'pickup' as const, label: 'Pickup' },
                { lat: req.destLat, lng: req.destLng, kind: 'dest' as const, label: 'Destination' },
              ];
          // Anybody who joined en route needs a pin of their own. Their pickup is a place the
          // driver has to actually find, and a card full of coordinates is not a way to find it.
          extras.forEach((p, i) =>
            legMarkers.push({ lat: p.originLat, lng: p.originLng, kind: 'pickup' as const,
                              label: `Pickup ${i + 2}` }));
          const mid = toPickup
            ? { lat: (start.lat + req.originLat) / 2, lng: (start.lng + req.originLng) / 2 }
            : { lat: (req.originLat + req.destLat) / 2, lng: (req.originLng + req.destLng) / 2 };
          return (
            <GoogleMap
              style={{ height: 220, borderRadius: 20, marginBottom: 14 }}
              center={mid}
              zoom={13}
              markers={legMarkers}
              route={legRoute}
              driver={driverPos}
              vehicleKind={myVehicle}
            />
          );
        })()}

        {/* Who/what you're carrying */}
        {!done && (
          <View style={{ backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 14 }}>
            <Row style={{ gap: 14 }}>
              <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                {isParcel
                  ? <Ionicons name="cube" size={22} color="#fff" />
                  : <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>P</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>
                  {isParcel ? `${req?.parcelSize ?? 'MEDIUM'} parcel` : 'Passenger'}
                </Text>
                {isParcel ? (
                  <>
                    <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 2 }} numberOfLines={2}>
                      {req?.parcelDesc || 'Parcel delivery'}
                    </Text>
                    {!!handover.name && (
                      <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 3 }}>
                        {handover.direction === 'RECEIVE'
                          ? `Collect from ${handover.name}`
                          : `Hand to ${handover.name}`}
                      </Text>
                    )}
                  </>
                ) : (
                  <Row style={{ gap: 5, marginTop: 2 }}>
                    <Ionicons name="star" size={13} color={c.warning} />
                    <Text style={{ fontSize: 13, color: c.textMuted }}>4.8 · {req?.seats ?? 1} seat{(req?.seats ?? 1) > 1 ? 's' : ''}</Text>
                  </Row>
                )}
              </View>
              {callNumber ? (
                <TouchableOpacity activeOpacity={0.85}
                  onPress={() => Linking.openURL(`tel:${callNumber}`).catch(() => {})}
                  style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="call" size={18} color={c.primary} />
                </TouchableOpacity>
              ) : null}
            </Row>
          </View>
        )}

        {/* Extra passengers picked up en route. Deliberately its own card rather than a line on
            the passenger card above: this is work that appeared AFTER the driver accepted the job,
            and it comes with a stop to make, a person to ring and a fare that went up. */}
        {!done && extras.length > 0 && (
          <View style={{ backgroundColor: `${c.success}10`, borderRadius: 20, borderWidth: 1.5, borderColor: c.success, padding: 16, marginBottom: 14 }}>
            <Row style={{ gap: 8, marginBottom: 10 }}>
              <Ionicons name="people" size={17} color={c.success} />
              <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '800', color: c.text }}>
                {extras.length === 1 ? 'One more passenger' : `${extras.length} more passengers`}
              </Text>
              <Text style={{ fontSize: 14.5, fontWeight: '800', color: c.success }}>GH₵ {totalFare}</Text>
            </Row>
            {extras.map((p, i) => (
              <View key={p.riderId} style={{ marginTop: i === 0 ? 0 : 14 }}>
                <Row style={{ gap: 10, alignItems: 'center' }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: p.pickedUpAt ? c.success : c.surface, borderWidth: p.pickedUpAt ? 0 : 1.5, borderColor: c.success, alignItems: 'center', justifyContent: 'center' }}>
                    {p.pickedUpAt
                      ? <Ionicons name="checkmark" size={14} color="#fff" />
                      : <Text style={{ color: c.success, fontSize: 12.5, fontWeight: '800' }}>{p.pickupSeq}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: c.text }}>
                      {p.pickedUpAt ? 'On board' : `Pick up at ${p.originLat.toFixed(4)}, ${p.originLng.toFixed(4)}`}
                    </Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 1 }}>
                      Dropping at {p.destLat.toFixed(4)}, {p.destLng.toFixed(4)} · GH₵ {p.lockedFare}
                    </Text>
                  </View>
                  {p.riderPhone ? (
                    <TouchableOpacity activeOpacity={0.85}
                      onPress={() => Linking.openURL(`tel:${p.riderPhone}`).catch(() => {})}
                      style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="call" size={16} color={c.success} />
                    </TouchableOpacity>
                  ) : null}
                </Row>

                {/* Until this is tapped the passenger can still walk away and owe nothing, so the
                    caption says so rather than leaving the driver to guess why it matters. Only on
                    the road: the server refuses it before then, so offering it would be a button
                    that fails. */}
                {!p.pickedUpAt && (trip.status === 'ENROUTE' || trip.status === 'STARTED') && (
                  <>
                    <TouchableOpacity onPress={() => markPickedUp(p.riderId)} disabled={pickingUp === p.riderId}
                      activeOpacity={0.9}
                      style={{ marginTop: 9, backgroundColor: c.success, borderRadius: 999, paddingVertical: 11, alignItems: 'center', opacity: pickingUp === p.riderId ? 0.6 : 1 }}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                        {pickingUp === p.riderId ? 'Confirming…' : 'They’re in — confirm pickup'}
                      </Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 11.5, color: c.textMuted, marginTop: 5, textAlign: 'center' }}>
                      Until you confirm, they can still cancel and you won’t be paid for them.
                    </Text>
                  </>
                )}

                {/* They say they are not in your car. Loud, because the alternative is a person
                    being carried on your fare who never got in — and because the fix is one tap
                    away and the driver is the only one who can make it. */}
                {!!p.pickupDisputedAt && (
                  <View style={{ marginTop: 9, backgroundColor: `${c.warning}18`, borderRadius: 12, padding: 11, borderWidth: 1, borderColor: c.warning }}>
                    <Row style={{ gap: 8, alignItems: 'flex-start' }}>
                      <Ionicons name="alert-circle" size={16} color={c.warning} />
                      <Text style={{ flex: 1, fontSize: 12.5, color: c.text, lineHeight: 18 }}>
                        This passenger says they're <Text style={{ fontWeight: '800' }}>not in your car</Text>.
                        If that's right, undo the pickup — you won't be charged for the trip and
                        they won't be billed. If they are in your car, carry on and support will see this.
                      </Text>
                    </Row>
                  </View>
                )}

                {/* The way back out of a mis-tap. Understated normally: it is the one action that
                    re-opens a passenger's exit, so it should be findable when you need it and easy
                    to ignore when you don't — but once somebody has objected it becomes the point
                    of the card, so it turns into a real button. Hidden once the fare is settled;
                    there is nothing left to undo at that point. */}
                {!!p.pickedUpAt && p.paymentStatus === 'UNPAID'
                  && trip.status !== 'COMPLETED' && trip.status !== 'CANCELLED' && (
                  p.pickupDisputedAt ? (
                    <TouchableOpacity onPress={() => undoPickup(p.riderId)} disabled={pickingUp === p.riderId}
                      activeOpacity={0.9}
                      style={{ marginTop: 9, backgroundColor: c.warning, borderRadius: 999, paddingVertical: 11, alignItems: 'center', opacity: pickingUp === p.riderId ? 0.6 : 1 }}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                        {pickingUp === p.riderId ? 'Undoing…' : "They're right — undo the pickup"}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => undoPickup(p.riderId)} disabled={pickingUp === p.riderId}
                      activeOpacity={0.7}
                      style={{ marginTop: 7, alignSelf: 'flex-start', paddingVertical: 4, opacity: pickingUp === p.riderId ? 0.5 : 1 }}>
                      <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.textMuted, textDecorationLine: 'underline' }}>
                        {pickingUp === p.riderId ? 'Undoing…' : 'Not in my car — undo'}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>
            ))}
          </View>
        )}

        {/* Route card */}
        {!done && req && (
          <View style={{ backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 18 }}>
            <Row style={{ alignItems: 'stretch' }}>
              <View style={{ width: 22, alignItems: 'center', paddingTop: 4 }}>
                <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: c.primary }} />
                <View style={{ width: 2, flex: 1, backgroundColor: c.border, marginVertical: 3, minHeight: 18 }} />
                <View style={{ width: 11, height: 11, borderRadius: 2, backgroundColor: c.danger }} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: c.textMuted, textTransform: 'uppercase' }}>Pickup</Text>
                <Text style={{ fontSize: 14.5, fontWeight: '700', color: c.text, marginBottom: 12 }}>{req.originLat.toFixed(4)}, {req.originLng.toFixed(4)}</Text>
                <Text style={{ fontSize: 11, fontWeight: '600', color: c.textMuted, textTransform: 'uppercase' }}>Drop-off</Text>
                <Text style={{ fontSize: 14.5, fontWeight: '700', color: c.text }}>{req.destLat.toFixed(4)}, {req.destLng.toFixed(4)}</Text>
              </View>
              {tripKm != null && (
                <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: c.text }}>{tripKm.toFixed(1)}</Text>
                  <Text style={{ fontSize: 11.5, color: c.textMuted }}>km</Text>
                </View>
              )}
            </Row>
          </View>
        )}

        {/* Status timeline */}
        <View style={{ backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.border, padding: 18, marginBottom: 18 }}>
          {STEP.map((s, i) => {
            const reached = i <= idx;
            const current = i === idx;
            return (
              <Row key={s.key} style={{ alignItems: 'flex-start', gap: 14, marginBottom: i === STEP.length - 1 ? 0 : 4 }}>
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: reached ? c.primary : c.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: current ? 3 : 0, borderColor: c.primarySoft }}>
                    {reached ? <Ionicons name="checkmark" size={15} color="#fff" /> : <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.textMuted }} />}
                  </View>
                  {i < STEP.length - 1 && <View style={{ width: 2, height: 26, backgroundColor: i < idx ? c.primary : c.border }} />}
                </View>
                <View style={{ flex: 1, paddingTop: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: current ? '800' : '600', color: reached ? c.text : c.textMuted }}>{s.label}</Text>
                  <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 1 }}>{s.sub}</Text>
                </View>
              </Row>
            );
          })}
        </View>

        {trip.status === 'ENROUTE' || trip.status === 'STARTED' ? (
          <Row style={{ gap: 6, marginBottom: 16, justifyContent: 'center' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.success }} />
            <Text style={{ fontSize: 12.5, color: c.textMuted, fontWeight: '600' }}>Sharing live location with {isParcel ? 'the customer' : 'the passenger'}</Text>
          </Row>
        ) : null}

        {trip.status === 'ENROUTE' && (
          <TouchableOpacity onPress={announceArrival} disabled={arriving || arrived} activeOpacity={0.9}
            style={{ marginBottom: 12, borderRadius: 999, paddingVertical: 14, alignItems: 'center',
                     backgroundColor: arrived ? `${c.success}1A` : c.surfaceAlt,
                     borderWidth: 1, borderColor: arrived ? c.success : c.border }}>
            <Row style={{ gap: 8 }}>
              <Ionicons name={arrived ? 'checkmark-circle' : 'notifications-outline'} size={18}
                        color={arrived ? c.success : c.text} />
              <Text style={{ fontWeight: '800', fontSize: 15, color: arrived ? c.success : c.text }}>
                {arriving ? 'Notifying…' : arrived ? 'Customer notified' : "I've arrived"}
              </Text>
            </Row>
          </TouchableOpacity>
        )}

        {!done ? (
          <TouchableOpacity onPress={advance} disabled={loading} activeOpacity={0.9}
            style={{ backgroundColor: c.primary, borderRadius: 999, paddingVertical: 16, alignItems: 'center', shadowColor: c.primary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{loading ? 'Working…' : ACTION[trip.status]}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: `${c.success}1A`, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark-done" size={28} color={c.success} />
            </View>
            <Text style={{ fontSize: 19, fontWeight: '800', color: c.text, marginTop: 12 }}>Trip complete</Text>
            <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 2 }}>
              Fare GH₵ {totalFare}{sharing ? ` · ${passengers.length} passengers` : ''}
            </Text>

            {/* Payment. On a shared trip each passenger settles separately, so this is a list of
                people rather than one button: confirming "the trip" would credit one person's
                cash to everybody, and the driver is standing there with only one person's money.
                The wallet is not settled until every row is paid. */}
            {sharing && pay.status !== 'PAID' ? (
              <View style={{ marginTop: 14, alignSelf: 'stretch', backgroundColor: c.surfaceAlt, borderRadius: 16, padding: 14 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                  Fares to collect
                </Text>
                {passengers.map((p, i) => (
                  <View key={p.riderId} style={{ marginTop: i === 0 ? 0 : 12 }}>
                    <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>
                          Passenger {p.pickupSeq}
                        </Text>
                        <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 1 }}>
                          {p.paymentStatus === 'PAID' ? `Paid${p.paymentMethod ? ` · ${p.paymentMethod}` : ''}`
                            : p.paymentStatus === 'AWAITING' ? `Paying ${p.paymentMethod ?? 'cash'} — collect it`
                            : 'Waiting for them to pay'}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: p.paymentStatus === 'PAID' ? c.success : c.text }}>
                        GH₵ {p.lockedFare}
                      </Text>
                    </Row>
                    {p.paymentStatus === 'AWAITING' && (
                      <TouchableOpacity onPress={() => confirmCash(p.riderId)} disabled={confirming} activeOpacity={0.9}
                        style={{ marginTop: 8, backgroundColor: c.success, borderRadius: 999, paddingVertical: 10, alignItems: 'center', opacity: confirming ? 0.6 : 1 }}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                          {confirming ? 'Confirming…' : `Confirm GH₵ ${p.lockedFare} received`}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            ) : pay.status === 'PAID' ? (
              <Row style={{ justifyContent: 'center', gap: 8, marginTop: 14, backgroundColor: `${c.success}1A`, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 }}>
                <Ionicons name="checkmark-circle" size={17} color={c.success} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.success }}>Paid{pay.method ? ` · ${pay.method}` : ''}</Text>
              </Row>
            ) : pay.method === 'cash' && pay.status === 'AWAITING' ? (
              <View style={{ marginTop: 14, alignSelf: 'stretch', backgroundColor: c.surfaceAlt, borderRadius: 16, padding: 14 }}>
                <Text style={{ fontSize: 14, color: c.text, textAlign: 'center', marginBottom: 10 }}>{isParcel ? 'The customer' : 'The passenger'} is paying <Text style={{ fontWeight: '800' }}>GH₵ {totalFare} cash</Text>. Collect it, then confirm.</Text>
                <TouchableOpacity onPress={() => confirmCash()} disabled={confirming} activeOpacity={0.9}
                  style={{ backgroundColor: c.success, borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{confirming ? 'Confirming…' : 'Confirm cash received'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Row style={{ justifyContent: 'center', gap: 8, marginTop: 14 }}>
                <ActivityIndicator color={c.textMuted} />
                <Text style={{ fontSize: 13, color: c.textMuted }}>Waiting for {isParcel ? 'the customer’s' : 'the passenger’s'} payment…</Text>
              </Row>
            )}

            {/* Rate the passengers. A shared trip carried more than one person and the driver has
                an opinion about each — rating only whoever booked credits or blames the wrong one
                as often as not. Each score submits on its own, so rating the first is not lost if
                the second fails. */}
            {sharing ? (
              <View style={{ alignSelf: 'stretch', marginTop: 20 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'center' }}>
                  {passengers.every((p) => paxRated[p.riderId]) ? 'Thanks for rating!' : 'Rate your passengers'}
                </Text>
                {passengers.map((p) => (
                  <View key={p.riderId} style={{ marginTop: 14, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 6 }}>
                      Passenger {p.pickupSeq} · GH₵ {p.lockedFare}
                    </Text>
                    <Row style={{ gap: 10 }}>
                      <StarRating
                        value={paxScores[p.riderId] ?? 0}
                        onChange={(v: number) => setPaxScores((m) => ({ ...m, [p.riderId]: v }))}
                        disabled={!!paxRated[p.riderId]} />
                    </Row>
                    {!paxRated[p.riderId] && (paxScores[p.riderId] ?? 0) > 0 && (
                      <TouchableOpacity onPress={() => ratePassenger(p.riderId)} activeOpacity={0.85}
                        style={{ marginTop: 10, paddingHorizontal: 22, paddingVertical: 9, borderRadius: 999, backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.primary }}>
                        <Text style={{ color: c.primary, fontWeight: '800', fontSize: 13.5 }}>Submit</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <>
                <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, marginTop: 20 }}>
                  {rated ? 'Thanks for rating!' : isParcel ? 'Rate the customer' : 'Rate your passenger'}
                </Text>
                <Row style={{ gap: 10, marginTop: 10 }}>
                  <StarRating value={rating} onChange={setRating} disabled={rated} />
                </Row>
                {!rated && rating > 0 && (
                  <TouchableOpacity onPress={rate} activeOpacity={0.85}
                    style={{ marginTop: 12, alignSelf: 'center', paddingHorizontal: 26, paddingVertical: 11, borderRadius: 999, backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.primary }}>
                    <Text style={{ color: c.primary, fontWeight: '800', fontSize: 14 }}>Submit rating</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            <TouchableOpacity onPress={finish} activeOpacity={0.9}
              style={{ marginTop: 22, backgroundColor: pay.status === 'PAID' ? c.primary : c.surfaceAlt, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 40 }}>
              <Text style={{ color: pay.status === 'PAID' ? '#fff' : c.text, fontWeight: '800', fontSize: 15 }}>
                {pay.status === 'PAID' ? 'Back to Home' : 'Take more requests'}
              </Text>
            </TouchableOpacity>
            {pay.status !== 'PAID' && (
              <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 8, textAlign: 'center' }}>
                This trip stays on your home screen until the fare is settled.
              </Text>
            )}
          </View>
        )}

        {!done && (
          <TouchableOpacity onPress={() => Alert.alert('Cancel trip', 'Cancel this trip?', [{ text: 'No' }, { text: 'Yes', style: 'destructive', onPress: finish }])}
            activeOpacity={0.7} style={{ marginTop: 14, alignItems: 'center' }}>
            <Text style={{ color: c.textMuted, fontSize: 14, fontWeight: '600' }}>Cancel trip</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

