import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { rideApi, RideRequest } from '../../src/api/ride';
import { walletApi } from '../../src/api/wallet';
import { useAuthStore } from '../../src/store/authStore';
import { useDriverStore } from '../../src/store/driverStore';
import { useProfileStore } from '../../src/store/profileStore';
import { useVehicle } from '../../src/store/vehicleStore';
import { getCurrentLocation } from '../../src/lib/location';
import { reverseGeocode } from '../../src/lib/geocode';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Row } from '../../src/components/ui';

// Fallback driver position (Accra centre) if the device location is unavailable.
const FALLBACK = { lat: 5.6037, lng: -0.1870 };
const SEARCH_RADIUS_KM = 50; // generous so pickups across Accra reach the driver
const COMMISSION = 0.15; // platform fee (mock) — driver keeps the rest
const OFFER_SECONDS = 25;

function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function DriverFeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const screenW = Dimensions.get('window').width;
  const heroH = 250 + insets.top;

  const vehicleClass = useAuthStore((s) => s.vehicleClass);
  const serviceMode = useAuthStore((s) => s.serviceMode);
  const accountStatus = useAuthStore((s) => s.status);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  useEffect(() => { fetchMe(); }, []);

  /**
   * Why this driver cannot be given work yet — null when they can.
   *
   * A driver who registers a car is class-null until an admin grades it, and the backend's
   * class filter then matches nothing. The feed showed them a spinner reading "Looking for
   * requests nearby…" forever: indistinguishable from a quiet night, so they waited instead of
   * chasing the approval. The Deliveries tab already explained itself; the first screen did not,
   * and the first screen is the one they actually sit on.
   */
  const blockedReason: string | null =
    accountStatus && accountStatus !== 'ACTIVE'
      ? 'Your account is still being reviewed. You can’t take trips until an admin approves it — this screen updates on its own once they do.'
      : !vehicleClass
        ? 'An admin still needs to approve your vehicle. Trips are matched by vehicle class, so nothing can reach you until yours is set. You’ll start receiving requests as soon as it is.'
        : null;

  const online = useDriverStore((s) => s.online);
  const setOnline = useDriverStore((s) => s.setOnline);
  const activeTrip = useDriverStore((s) => s.activeTrip);
  const setActiveTrip = useDriverStore((s) => s.setActiveTrip);
  const setActiveReq = useDriverStore((s) => s.setActiveReq);
  const pendingOffer = useDriverStore((s) => s.pendingOffer);
  const setPendingOffer = useDriverStore((s) => s.setPendingOffer);
  const setMyPos = useDriverStore((s) => s.setMyPos);
  const bumpAccepted = useDriverStore((s) => s.bumpAccepted);
  const acceptedToday = useDriverStore((s) => s.acceptedToday);
  const myName = useAuthStore((s) => s.name);
  const myPhone = useProfileStore((s) => s.phone);
  const vehicle = useVehicle();

  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [balance, setBalance] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  // Whether a poll has actually come back yet. Without this the empty feed shows a spinner and
  // "Looking for requests nearby…" indefinitely, so a quiet night is indistinguishable from a
  // stuck app — and the driver has no idea whether to wait or go and fix something.
  const [polled, setPolled] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [pos, setPos] = useState(FALLBACK);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [usingReal, setUsingReal] = useState(false);

  useEffect(() => { walletApi.getBalance('DRIVER').then((b) => setBalance(b.balance)).catch(() => {}); }, []);

  // Every driver in the app showed 4.9, including one who had never carried anybody. This is the
  // real average, and it stays "New" until enough passengers have rated them to mean something.
  const [rating, setRating] = useState<{ average: number | null; count: number } | null>(null);
  useEffect(() => { rideApi.rating().then(setRating).catch(() => {}); }, []);

  // Resolve the driver's real position (once) + reverse-geocode a readable name.
  async function locate() {
    const loc = await getCurrentLocation();
    const p = loc ?? FALLBACK;
    setPos(p); setUsingReal(!!loc);
    const geo = await reverseGeocode(p.lat, p.lng);
    setPlaceName(geo?.label ?? (loc ? 'Your area' : 'Accra (demo)'));
  }
  useEffect(() => { locate(); }, []);

  // A trip the driver is still driving blocks new work; one that is finished but waiting on the
  // fare does not. The trip is deliberately kept after completion so the driver can come back and
  // confirm a cash payment (see trip.tsx finish()) — that must not also take them off the road,
  // which could be a long wait on a customer who has not opened their app.
  const onTheRoad = !!activeTrip && activeTrip.status !== 'COMPLETED';

  // Poll nearby requests while online, not on a trip and not awaiting an offer answer.
  // Skipped entirely when the account cannot be given work: `nearby` requires STATUS_ACTIVE, so an
  // unapproved driver would collect a 403 and see "Can't load requests" stacked on top of the real
  // explanation — two error states for one cause, neither of them the useful one.
  useEffect(() => {
    if (!online || onTheRoad || pendingOffer || blockedReason) { setRequests([]); return; }
    let active = true;
    const tick = async () => {
      try {
        setSearching(true);
        const data = await rideApi.nearbyRequests(pos.lat, pos.lng, SEARCH_RADIUS_KM, vehicleClass, serviceMode);
        if (active) { setRequests(data.filter((r) => r.status === 'OPEN')); setFeedError(null); }
      } catch (e: any) {
        if (!active) return;
        // A 403 here means the account is not cleared for work. api/client.ts has already spent a
        // token refresh on it, so reaching this point is about the account itself, not a stale
        // claim — ask the server what the account looks like now and let blockedReason explain it
        // properly. Showing the raw "Forbidden" was the old behaviour and told the driver nothing.
        if (e?.response?.status === 403) {
          setFeedError('Your account isn’t cleared to take trips yet. Checking why…');
          fetchMe();
        } else {
          setFeedError(e?.response?.data?.message ?? e?.message ?? 'Could not reach the server');
        }
      } finally { if (active) { setSearching(false); setPolled(true); } }
    };
    tick();
    const poll = setInterval(tick, 5000);
    return () => { active = false; clearInterval(poll); };
  }, [online, onTheRoad, pendingOffer, blockedReason, pos.lat, pos.lng, vehicleClass, serviceMode]);

  // Offering no longer starts the trip — it sends an offer the passenger picks from
  // (several drivers can offer; they compare price + distance). Poll the bid until
  // the passenger decides, then jump to the trip or return to the feed.
  useEffect(() => {
    if (!pendingOffer) return;
    let active = true;
    const poll = setInterval(async () => {
      try {
        const b = await rideApi.getBid(pendingOffer.bidId);
        if (!active) return;
        if (b.status === 'ACCEPTED' && b.tripId) {
          setActiveTrip({ id: b.tripId, driverId: '', agreedFare: pendingOffer.amount, status: 'MATCHED' });
          setActiveReq(pendingOffer.req);
          bumpAccepted();
          setPendingOffer(null);
          router.push('/(driver)/trip');
        } else if (b.status === 'REJECTED' || b.requestStatus === 'EXPIRED' || b.requestStatus === 'CANCELLED'
                   || (b.requestStatus === 'MATCHED' && b.status !== 'ACCEPTED')) {
          setPendingOffer(null);
          Alert.alert('Offer closed', b.status === 'REJECTED' || b.requestStatus === 'MATCHED'
            ? 'The customer chose another driver.' : 'The request is no longer available.');
        }
      } catch {}
    }, 3000);
    return () => { active = false; clearInterval(poll); };
  }, [pendingOffer?.bidId]);

  function bidExtras() {
    return {
      driverName: myName || undefined,
      driverPhone: myPhone || undefined,
      vehicle: [vehicle.make, vehicle.model, vehicle.color].filter(Boolean).join(' ') || undefined,
      plate: vehicle.plate || undefined,
      lat: pos.lat,
      lng: pos.lng,
    };
  }

  async function accept(req: RideRequest) {
    try {
      const bid = await rideApi.placeBid(req.id, 'ACCEPT', req.proposedFare, bidExtras());
      setMyPos(pos);
      setPendingOffer({ bidId: bid.bidId, req, amount: req.proposedFare, type: 'ACCEPT' });
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not accept');
    }
  }

  async function counter(req: RideRequest, amount: number) {
    try {
      const bid = await rideApi.placeBid(req.id, 'COUNTER', amount, bidExtras());
      setMyPos(pos);
      setPendingOffer({ bidId: bid.bidId, req, amount, type: 'COUNTER' });
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not counter');
    }
  }

  async function withdrawOffer() {
    if (!pendingOffer) return;
    try { await rideApi.withdrawBid(pendingOffer.bidId); } catch {}
    setPendingOffer(null);
  }

  function dismiss(id: string) { setDismissed((p) => new Set(p).add(id)); }

  const visible = requests.filter((r) => !dismissed.has(r.id));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
        {/* ── Hero ── */}
        <View style={{ height: heroH, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: 'hidden' }}>
          <Svg width={screenW} height={heroH} style={{ position: 'absolute' }}>
            <Defs>
              <SvgGradient id="dhero" x1="0" y1="0" x2="0.3" y2="1">
                <Stop offset="0" stopColor={online ? '#1E9E5A' : '#2A56C6'} />
                <Stop offset="0.55" stopColor={online ? '#0E5530' : '#13234A'} />
                <Stop offset="1" stopColor="#080C18" />
              </SvgGradient>
            </Defs>
            <Rect x="0" y="0" width={screenW} height={heroH} fill="url(#dhero)" />
          </Svg>

          <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 22 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text style={{ color: 'rgba(255,255,255,0.62)', fontSize: 14 }}>GoZone Driver</Text>
                <Text style={{ color: '#fff', fontSize: 25, fontWeight: '800', letterSpacing: -0.6, marginTop: 3 }}>
                  {online ? 'You’re online' : 'You’re offline'}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13.5, marginTop: 4 }}>
                  {online ? 'Watching for requests near you' : 'Go online to start earning'}
                </Text>
                <TouchableOpacity onPress={locate} activeOpacity={0.7}>
                  <Row style={{ gap: 5, marginTop: 8 }}>
                    <Ionicons name="location" size={13} color="rgba(255,255,255,0.85)" />
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '600' }}>
                      {placeName ? placeName : 'Locating…'}{!usingReal && placeName ? ' · tap to update' : ''}
                    </Text>
                  </Row>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => router.push('/profile' as any)} activeOpacity={0.8}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>D</Text>
                </View>
              </TouchableOpacity>
            </Row>

            {/* Online toggle */}
            <TouchableOpacity onPress={() => setOnline(!online)} activeOpacity={0.9}
              style={{ marginTop: 22, height: 56, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', flexDirection: 'row', alignItems: 'center', padding: 5 }}>
              <View style={{ position: 'absolute', left: online ? undefined : 5, right: online ? 5 : undefined, width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={online ? 'flash' : 'power'} size={22} color={online ? '#1E9E5A' : '#2A56C6'} />
              </View>
              <Text style={{ flex: 1, textAlign: 'center', color: '#fff', fontWeight: '800', fontSize: 15, marginLeft: online ? -40 : 40 }}>
                {online ? 'ONLINE — tap to stop' : 'OFFLINE — tap to go online'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Stats strip ── */}
        <View style={{ paddingHorizontal: 16, marginTop: -26 }}>
          <Row style={{ backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.border, paddingVertical: 16, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 }}>
            <Stat label="Wallet" value={balance != null ? `GH₵ ${balance.toFixed(0)}` : '—'} c={c} />
            <Sep c={c} />
            <Stat label="Trips today" value={String(acceptedToday)} c={c} />
            <Sep c={c} />
            <Stat label="Rating" value={rating?.average != null ? rating.average.toFixed(1) : 'New'} c={c} />
          </Row>
        </View>

        {/* ── Active trip banner ── */}
        {activeTrip && (
          <TouchableOpacity activeOpacity={0.9} onPress={() => router.push('/(driver)/trip')}
            style={{ marginHorizontal: 16, marginTop: 18, borderRadius: 18, backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.primary, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name={onTheRoad ? 'navigate-circle' : 'cash-outline'} size={26} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: c.text }}>
                {onTheRoad ? 'Trip in progress' : 'Payment outstanding'}
              </Text>
              <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 1 }}>
                {onTheRoad
                  ? `${activeTrip.status} · GH₵ ${activeTrip.agreedFare} — tap to manage`
                  : `GH₵ ${activeTrip.agreedFare} — tap to confirm you were paid`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.primary} />
          </TouchableOpacity>
        )}

        {/* ── Body ── */}
        <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
          {/* Verification comes first: if they cannot be given work, everything below is noise. */}
          {blockedReason ? (
            <View style={{ backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.border, padding: 22, alignItems: 'center', gap: 10 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shield-checkmark-outline" size={27} color={c.primary} />
              </View>
              <Text style={{ fontSize: 17.5, fontWeight: '800', color: c.text, textAlign: 'center' }}>
                {accountStatus && accountStatus !== 'ACTIVE' ? 'Account under review' : 'Vehicle awaiting approval'}
              </Text>
              <Text style={{ fontSize: 13.5, color: c.textMuted, textAlign: 'center', lineHeight: 20 }}>
                {blockedReason}
              </Text>
              <TouchableOpacity onPress={() => fetchMe()} activeOpacity={0.85}
                style={{ marginTop: 6, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 26, borderWidth: 1.5, borderColor: c.border }}>
                <Text style={{ color: c.text, fontWeight: '700', fontSize: 14 }}>Check again</Text>
              </TouchableOpacity>
            </View>
          ) : !online ? (
            <Offline c={c} onGoOnline={() => setOnline(true)} />
          ) : onTheRoad ? (
            <Text style={{ color: c.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 24 }}>
              Finish your current trip to receive new requests.
            </Text>
          ) : pendingOffer ? (
            <View style={{ backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.border, padding: 20, alignItems: 'center' }}>
              <ActivityIndicator color={c.primary} />
              <Text style={{ fontSize: 17, fontWeight: '800', color: c.text, marginTop: 12 }}>Offer sent</Text>
              <Text style={{ fontSize: 13.5, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>
                {pendingOffer.type === 'ACCEPT'
                  ? `You accepted the customer's fare of GH₵ ${pendingOffer.amount}.`
                  : `Your counter of GH₵ ${pendingOffer.amount} is with the customer.`} Waiting for them to pick a driver…
              </Text>
              <TouchableOpacity onPress={withdrawOffer} activeOpacity={0.85}
                style={{ marginTop: 16, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 32, borderWidth: 1.5, borderColor: c.border }}>
                <Text style={{ color: c.text, fontWeight: '700', fontSize: 14.5 }}>Withdraw offer</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: c.text }}>Incoming requests</Text>
                <Row style={{ gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.success }} />
                  <Text style={{ fontSize: 12.5, color: c.textMuted, fontWeight: '600' }}>Live</Text>
                </Row>
              </Row>

              {feedError ? (
                <View style={{ alignItems: 'center', paddingVertical: 30, gap: 10, paddingHorizontal: 16 }}>
                  <Ionicons name="cloud-offline" size={30} color={c.danger} />
                  <Text style={{ color: c.danger, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>Can’t load requests</Text>
                  <Text style={{ color: c.textMuted, fontSize: 13, textAlign: 'center' }} numberOfLines={3}>{feedError}</Text>
                  <Text style={{ color: c.textMuted, fontSize: 12.5, textAlign: 'center' }}>Retrying automatically…</Text>
                </View>
              ) : visible.length === 0 && !polled ? (
                <View style={{ alignItems: 'center', paddingVertical: 36, gap: 12 }}>
                  <ActivityIndicator color={c.primary} />
                  <Text style={{ color: c.textMuted, fontSize: 14 }}>Looking for requests nearby…</Text>
                </View>
              ) : visible.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 36, gap: 8 }}>
                  <Ionicons name="time-outline" size={32} color={c.textMuted} />
                  <Text style={{ color: c.text, fontSize: 14.5, fontWeight: '700' }}>No requests right now</Text>
                  <Text style={{ color: c.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 20, lineHeight: 19 }}>
                    You’re online and we’re still checking every few seconds. Requests within
                    {' '}{SEARCH_RADIUS_KM} km of {placeName || 'you'} will appear here.
                  </Text>
                </View>
              ) : (
                visible.map((req) => (
                  <IncomingCard key={req.id} req={req} c={c} myLat={pos.lat} myLng={pos.lng}
                    onAccept={() => accept(req)} onDecline={() => dismiss(req.id)} onCounter={(amt: number) => counter(req, amt)} />
                ))
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function IncomingCard({ req, c, myLat, myLng, onAccept, onDecline, onCounter }: any) {
  const [secs, setSecs] = useState(OFFER_SECONDS);
  const [countering, setCountering] = useState(false);
  const [amt, setAmt] = useState<number>(Math.round(req.proposedFare));

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (secs <= 0) onDecline(); }, [secs]);

  const pickupKm = haversine(myLat, myLng, req.originLat, req.originLng);
  const tripKm = haversine(req.originLat, req.originLng, req.destLat, req.destLng);
  const keep = req.proposedFare * (1 - COMMISSION);
  const pct = Math.max(0, secs / OFFER_SECONDS);

  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 14 }}>
      {/* countdown bar */}
      <View style={{ height: 4, borderRadius: 2, backgroundColor: c.border, overflow: 'hidden', marginBottom: 12 }}>
        <View style={{ width: `${pct * 100}%`, height: 4, backgroundColor: secs <= 8 ? c.danger : c.primary }} />
      </View>

      {/* request-type chip */}
      <Row style={{ gap: 6, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Ionicons name={req.kind === 'PARCEL' ? 'cube' : 'car-sport'} size={13} color={c.primary} />
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: c.primary }}>
            {req.kind === 'PARCEL' ? `${(req.parcelSize ?? 'MEDIUM')} parcel` : `${req.rideType ?? 'STANDARD'} ride`}
          </Text>
        </View>
      </Row>
      {req.kind === 'PARCEL' && req.parcelDesc ? (
        <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 12 }} numberOfLines={2}>“{req.parcelDesc}”</Text>
      ) : null}

      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {req.kind === 'PARCEL' ? 'Delivery fare' : 'Passenger fare'}
          </Text>
          <Text style={{ fontSize: 30, fontWeight: '800', color: c.text, marginTop: 2 }}>GH₵ {req.proposedFare}</Text>
          <Text style={{ fontSize: 12.5, color: c.success, fontWeight: '600', marginTop: 2 }}>≈ GH₵ {keep.toFixed(2)} after fees</Text>
        </View>
        <View style={{ alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 23, backgroundColor: secs <= 8 ? `${c.danger}1A` : c.primarySoft }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: secs <= 8 ? c.danger : c.primary }}>{secs}</Text>
        </View>
      </Row>

      <Row style={{ gap: 18, marginTop: 14 }}>
        <Row style={{ gap: 6 }}>
          <Ionicons name="walk" size={15} color={c.textMuted} />
          <Text style={{ fontSize: 13.5, color: c.text, fontWeight: '600' }}>{pickupKm.toFixed(1)} km away</Text>
        </Row>
        <Row style={{ gap: 6 }}>
          <Ionicons name="map" size={15} color={c.textMuted} />
          <Text style={{ fontSize: 13.5, color: c.text, fontWeight: '600' }}>~{tripKm.toFixed(1)} km trip</Text>
        </Row>
        <Row style={{ gap: 6 }}>
          <Ionicons name="person" size={15} color={c.textMuted} />
          <Text style={{ fontSize: 13.5, color: c.text, fontWeight: '600' }}>{req.seats}</Text>
        </Row>
      </Row>

      {countering ? (
        <View style={{ marginTop: 16 }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center', backgroundColor: c.surfaceAlt, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 }}>
            <TouchableOpacity onPress={() => setAmt((a) => Math.max(5, a - 1))} style={stepBtn(c)}><Ionicons name="remove" size={20} color={c.primary} /></TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: '800', color: c.text }}>GH₵ {amt}</Text>
            <TouchableOpacity onPress={() => setAmt((a) => a + 1)} style={stepBtn(c)}><Ionicons name="add" size={20} color={c.primary} /></TouchableOpacity>
          </Row>
          <Row style={{ gap: 10, marginTop: 10 }}>
            <TouchableOpacity onPress={() => setCountering(false)} activeOpacity={0.8} style={[btn(c, 'ghost'), { flex: 1 }]}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onCounter(amt)} activeOpacity={0.9} style={[btn(c, 'solid'), { flex: 2 }]}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Send counter</Text>
            </TouchableOpacity>
          </Row>
        </View>
      ) : (
        <Row style={{ gap: 10, marginTop: 16 }}>
          <TouchableOpacity onPress={onDecline} activeOpacity={0.8} style={[btn(c, 'ghost'), { flex: 1 }]}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCountering(true)} activeOpacity={0.8} style={[btn(c, 'outline'), { flex: 1 }]}>
            <Text style={{ color: c.primary, fontWeight: '700', fontSize: 15 }}>Counter</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onAccept} activeOpacity={0.9} style={[btn(c, 'solid'), { flex: 1.4 }]}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Accept</Text>
          </TouchableOpacity>
        </Row>
      )}
    </View>
  );
}

function Offline({ c, onGoOnline }: any) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 30 }}>
      <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="moon" size={34} color={c.textMuted} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: '800', color: c.text, marginTop: 16 }}>You’re offline</Text>
      <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4, textAlign: 'center', lineHeight: 20 }}>
        Go online to start receiving ride and delivery requests near you.
      </Text>
      <TouchableOpacity onPress={onGoOnline} activeOpacity={0.9}
        style={{ marginTop: 20, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 40 }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Go online</Text>
      </TouchableOpacity>
    </View>
  );
}

function Stat({ label, value, c }: any) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: c.text }}>{value}</Text>
      <Text style={{ fontSize: 11.5, color: c.textMuted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
function Sep({ c }: any) { return <View style={{ width: 1, height: 30, backgroundColor: c.border }} />; }
const stepBtn = (c: any) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: c.primarySoft, alignItems: 'center' as const, justifyContent: 'center' as const });
const btn = (c: any, kind: 'solid' | 'outline' | 'ghost') => ({
  borderRadius: 999, paddingVertical: 13, alignItems: 'center' as const, justifyContent: 'center' as const,
  backgroundColor: kind === 'solid' ? c.primary : kind === 'ghost' ? c.surfaceAlt : 'transparent',
  borderWidth: kind === 'outline' ? 1.5 : 0, borderColor: c.primary,
});
