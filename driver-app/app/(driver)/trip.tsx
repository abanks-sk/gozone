import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { rideApi } from '../../src/api/ride';
import { mapsApi } from '../../src/api/maps';
import { useDriverStore } from '../../src/store/driverStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Row } from '../../src/components/ui';
import { GoogleMap } from '../../src/components/GoogleMap';

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
  const req = useDriverStore((s) => s.activeReq);
  const myPos = useDriverStore((s) => s.myPos);
  const setActiveTrip = useDriverStore((s) => s.setActiveTrip);
  const setActiveReq = useDriverStore((s) => s.setActiveReq);
  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState(0);
  const [rated, setRated] = useState(false);
  const [pay, setPay] = useState<{ status?: string; method?: string | null }>({});
  const [confirming, setConfirming] = useState(false);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [routePts, setRoutePts] = useState<{ lat: number; lng: number }[]>([]);
  const [pickupPts, setPickupPts] = useState<{ lat: number; lng: number }[]>([]);
  const [riderPhone, setRiderPhone] = useState<string | null>(null);
  // Parcel handover: who is at the far end. Comes from the same guarded trip fetch as the
  // customer's phone — the open feed deliberately doesn't carry contact details.
  const [handover, setHandover] = useState<{ direction?: string | null; name?: string | null; phone?: string | null }>({});

  // The customer's phone comes with the full trip (participant-guarded).
  useEffect(() => {
    if (!trip) return;
    let active = true;
    rideApi.getTrip(trip.id).then((t) => {
      if (!active) return;
      setRiderPhone(t.riderPhone ?? null);
      setHandover({ direction: t.direction, name: t.partyName, phone: t.partyPhone });
    }).catch(() => {});
    return () => { active = false; };
  }, [trip?.id]);
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

  async function confirmCash() {
    if (!trip) return;
    setConfirming(true);
    try { const t = await rideApi.confirmCash(trip.id); setPay({ status: t.paymentStatus, method: t.paymentMethod }); }
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

  async function rate(score: number) {
    if (!trip || rated || !req) return;
    setRating(score);
    try { await rideApi.rateTrip(trip.id, req.riderId, score); setRated(true); }
    catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Could not submit rating'); }
  }

  function finish() { stopGps(); setActiveTrip(null); setActiveReq(null); router.replace('/(driver)/feed'); }

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
        <Text style={{ fontSize: 24, fontWeight: '800', color: c.text, marginBottom: 4 }}>{isParcel ? 'Active delivery' : 'Active trip'}</Text>
        <Text style={{ fontSize: 13.5, color: c.textMuted, marginBottom: 18 }}>{isParcel ? 'Delivery' : 'Trip'} {trip.id.slice(0, 8)}… · GH₵ {trip.agreedFare}</Text>

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
            <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 2 }}>Fare GH₵ {trip.agreedFare}</Text>

            {/* Payment */}
            {pay.status === 'PAID' ? (
              <Row style={{ justifyContent: 'center', gap: 8, marginTop: 14, backgroundColor: `${c.success}1A`, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 }}>
                <Ionicons name="checkmark-circle" size={17} color={c.success} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.success }}>Paid{pay.method ? ` · ${pay.method}` : ''}</Text>
              </Row>
            ) : pay.method === 'cash' && pay.status === 'AWAITING' ? (
              <View style={{ marginTop: 14, alignSelf: 'stretch', backgroundColor: c.surfaceAlt, borderRadius: 16, padding: 14 }}>
                <Text style={{ fontSize: 14, color: c.text, textAlign: 'center', marginBottom: 10 }}>{isParcel ? 'The customer' : 'The passenger'} is paying <Text style={{ fontWeight: '800' }}>GH₵ {trip.agreedFare} cash</Text>. Collect it, then confirm.</Text>
                <TouchableOpacity onPress={confirmCash} disabled={confirming} activeOpacity={0.9}
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

            {/* Rate the passenger */}
            <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, marginTop: 20 }}>{rated ? 'Thanks for rating!' : isParcel ? 'Rate the customer' : 'Rate your passenger'}</Text>
            <Row style={{ gap: 10, marginTop: 10 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => rate(n)} activeOpacity={0.7} disabled={rated}>
                  <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={32} color={c.warning} />
                </TouchableOpacity>
              ))}
            </Row>

            <TouchableOpacity onPress={finish} activeOpacity={0.9}
              style={{ marginTop: 22, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 40 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Back to Home</Text>
            </TouchableOpacity>
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

