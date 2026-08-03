import { useEffect, useState } from 'react';
import { Alert, Dimensions, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Redirect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { rideApi } from '../../src/api/ride';
import { mapsApi } from '../../src/api/maps';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useRideDraft, hasDest } from '../../src/store/rideDraft';
import { useProfileStore } from '../../src/store/profileStore';
import { haversineKm, rideFare } from '../../src/lib/pricing';
import { Btn, Card, Row } from '../../src/components/ui';
import { LeafletMap } from '../../src/components/LeafletMap';
import { LatLng } from '../../src/components/mapTypes';

const RIDE_TYPES = [
  { key: 'standard', label: 'Standard', icon: 'car-sport' as const, mult: 1, bargain: true, eta: '3 min' },
  { key: 'premium', label: 'Luxe', icon: 'car-sport-sharp' as const, mult: 1.7, bargain: false, eta: '5 min' },
  { key: 'okada', label: 'Okada', icon: 'bicycle' as const, mult: 0.6, bargain: true, eta: '1 min' },
];

/**
 * Confirm the ride: where from, where to, which class, what you're offering.
 *
 * This used to sit in a card on the home screen, underneath the search bar — so the screen asked
 * "where are you going?" and simultaneously showed a priced trip and a Request button for a
 * destination nobody had chosen. Splitting it means the home screen asks one question, and this
 * screen only exists once there is an answer: everything here is about a route that is already
 * set, which is also why there is no longer any way to quote a fare without a destination.
 */
export default function RideRequestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const screenH = Dimensions.get('window').height;

  const origin = useRideDraft((s) => s.origin);
  const dest = useRideDraft((s) => s.dest);
  const swap = useRideDraft((s) => s.swap);
  const scheduledAt = useRideDraft((s) => s.scheduledAt);
  const setScheduledAt = useRideDraft((s) => s.setScheduledAt);
  const myPhone = useProfileStore((s) => s.phone);

  const distance = hasDest(dest) ? haversineKm(origin, dest) : 0;
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const [surge, setSurge] = useState(false);
  const [rideType, setRideType] = useState('standard');
  const [typeOpen, setTypeOpen] = useState(false);
  const [fare, setFare] = useState(() => rideFare(distance, 1));
  const [loading, setLoading] = useState(false);

  const typeMeta = RIDE_TYPES.find((t) => t.key === rideType) ?? RIDE_TYPES[0];
  const fareFor = (t: typeof RIDE_TYPES[number]) => quotes[t.key] ?? rideFare(distance, t.mult);

  // The real road route, so the shape on the map is the trip rather than a line across the city.
  // A straight segment stands in until it arrives (and if the proxy is unreachable).
  const [routePts, setRoutePts] = useState<LatLng[]>([]);
  useEffect(() => {
    if (!hasDest(dest)) return;
    let active = true;
    mapsApi.directions({ lat: origin.lat, lng: origin.lng }, { lat: dest.lat, lng: dest.lng })
      .then((d) => { if (active && d.points?.length) setRoutePts(d.points); })
      .catch(() => {});
    return () => { active = false; };
  }, [origin.lat, origin.lng, dest.lat, dest.lng]);

  // Server-authoritative fares per ride type (local pricing stands in on failure/offline).
  useEffect(() => {
    if (!hasDest(dest)) return;
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(RIDE_TYPES.map((t) =>
          rideApi.quote({
            originLat: origin.lat, originLng: origin.lng,
            destLat: dest.lat, destLng: dest.lng, rideType: t.key.toUpperCase(),
          }).then((q) => ({ key: t.key, fare: q.fare, surge: q.surge }))
        ));
        if (cancelled) return;
        const map: Record<string, number> = {};
        let anySurge = false;
        results.forEach((r) => { map[r.key] = r.fare; if (r.surge) anySurge = true; });
        setQuotes(map);
        setSurge(anySurge);
        setFare(map[rideType] ?? rideFare(distance, typeMeta.mult));
      } catch { /* keep local fallback */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.lat, origin.lng, dest.lat, dest.lng]);

  // Reached without a destination — nothing to confirm, so go and get one rather than showing an
  // empty priced card, which is the state this split exists to remove.
  if (!hasDest(dest)) return <Redirect href={'/search?field=dest&next=request' as never} />;

  const scheduledFuture = !!scheduledAt && scheduledAt > Date.now();
  const schedLabel = scheduledFuture
    ? new Date(scheduledAt!).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : 'Now';

  const route = routePts.length ? routePts : [{ lat: origin.lat, lng: origin.lng }, { lat: dest.lat, lng: dest.lng }];
  const mapH = Math.max(200, Math.round(screenH * 0.32)) + insets.top;

  function pickType(t: typeof RIDE_TYPES[number]) {
    setRideType(t.key);
    setFare(fareFor(t)); // re-anchor the offer to the new class (server quote where we have one)
    setTypeOpen(false);
  }

  async function requestRide() {
    setLoading(true);
    try {
      const rideTypeMap: Record<string, 'STANDARD' | 'LUXE' | 'OKADA'> = { standard: 'STANDARD', premium: 'LUXE', okada: 'OKADA' };
      const req = await rideApi.createRequest({
        originLat: origin.lat, originLng: origin.lng,
        destLat: dest.lat, destLng: dest.lng,
        proposedFare: fare || 30,
        kind: 'RIDE',
        rideType: rideTypeMap[rideType] ?? 'STANDARD',
        riderPhone: myPhone || undefined,
        scheduledAt: scheduledFuture ? new Date(scheduledAt!).toISOString() : undefined,
      });
      if (scheduledFuture) {
        Alert.alert('Ride scheduled', 'We’ll line up a driver near your pickup time. See it under Your rides.');
        setScheduledAt(null);
        router.replace('/(rider)/rides' as any);
      } else {
        // Hand off to the live tracking map, which owns the rest of the trip lifecycle.
        router.replace(`/(rider)/live?requestId=${req.id}` as any);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not place request');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style="dark" />

      {/* Map sits behind the top of the screen: pickup, destination and the road between them. */}
      <View style={{ height: mapH }}>
        <LeafletMap
          style={{ flex: 1 }}
          mode="view"
          center={{ lat: (origin.lat + dest.lat) / 2, lng: (origin.lng + dest.lng) / 2 }}
          zoom={13}
          markers={[
            { lat: origin.lat, lng: origin.lng, kind: 'pickup', label: origin.label },
            { lat: dest.lat, lng: dest.lng, kind: 'dest', label: dest.label },
          ]}
          route={route}
        />
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.85}
          style={{
            position: 'absolute', top: insets.top + 10, left: 16,
            width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4,
          }}
        >
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, marginTop: -24 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 28 }}
      >
        <Card>
          <Row style={{ justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: c.text }}>GoRide</Text>
            <TouchableOpacity onPress={() => setTypeOpen((o) => !o)} activeOpacity={0.85}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 14, paddingRight: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.primary }}>
              <Ionicons name={typeMeta.icon} size={15} color={c.primary} />
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: c.primary }}>{typeMeta.label}</Text>
              <Ionicons name={typeOpen ? 'chevron-up' : 'chevron-down'} size={15} color={c.primary} />
            </TouchableOpacity>
          </Row>

          {typeOpen && (
            <Row style={{ gap: 8, marginBottom: 14 }}>
              {RIDE_TYPES.map((t) => {
                const sel = rideType === t.key;
                return (
                  <TouchableOpacity key={t.key} onPress={() => pickType(t)} activeOpacity={0.85}
                    style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 12, borderRadius: 16, backgroundColor: sel ? c.primarySoft : c.surfaceAlt, borderWidth: 1.5, borderColor: sel ? c.primary : 'transparent' }}>
                    <Ionicons name={t.icon} size={22} color={sel ? c.primary : c.textMuted} />
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: sel ? c.primary : c.text }}>{t.label}</Text>
                    <Text style={{ fontSize: 11, color: c.textMuted }}>GH₵ {fareFor(t)}</Text>
                  </TouchableOpacity>
                );
              })}
            </Row>
          )}

          {surge && (
            <Row style={{ gap: 6, marginTop: -4, marginBottom: 12 }}>
              <Ionicons name="trending-up" size={13} color={c.warning} />
              <Text style={{ fontSize: 11.5, color: c.warning, fontWeight: '600' }}>Peak-time pricing in effect</Text>
            </Row>
          )}

          <View style={{ position: 'relative' }}>
            <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 18, paddingHorizontal: 14 }}>
              <RouteField icon="ellipse" iconColor={c.primary} label="From" value={origin.label}
                onPress={() => router.push('/search?field=origin' as any)} c={c} />
              <View style={{ height: 1, backgroundColor: c.border, marginLeft: 28 }} />
              <RouteField icon="location" iconColor={c.danger} label="To" value={dest.label}
                onPress={() => router.push('/search?field=dest' as any)} c={c} />
            </View>
            <TouchableOpacity onPress={swap} activeOpacity={0.8} style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="swap-vertical" size={18} color={c.primary} />
              </View>
            </TouchableOpacity>
          </View>

          <Row style={{ justifyContent: 'space-between', marginTop: 14 }}>
            <Row style={{ gap: 6 }}>
              <Ionicons name="navigate" size={13} color={c.textMuted} />
              <Text style={{ fontSize: 12.5, color: c.textMuted, fontWeight: '600' }}>{distance.toFixed(1)} km · {typeMeta.eta} away</Text>
            </Row>
            <TouchableOpacity onPress={() => router.push('/(rider)/schedule' as any)} activeOpacity={0.8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: c.surfaceAlt }}>
              <Ionicons name="time-outline" size={14} color={c.text} />
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: c.text }}>{schedLabel}</Text>
              <Ionicons name="chevron-down" size={13} color={c.textMuted} />
            </TouchableOpacity>
          </Row>

          {typeMeta.bargain ? (
            <Row style={{ justifyContent: 'space-between', marginTop: 16, marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 12, color: c.textMuted, letterSpacing: 0.3, fontWeight: '600' }}>Your fare offer · drivers can counter</Text>
                <Row style={{ alignItems: 'flex-end', marginTop: 2 }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>GH₵ </Text>
                  <TextInput
                    value={fare ? String(fare) : ''}
                    onChangeText={(t) => setFare(Number(t.replace(/[^0-9]/g, '')) || 0)}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={c.textMuted}
                    style={{ fontSize: 22, fontWeight: '800', color: c.text, minWidth: 44, padding: 0 }}
                  />
                </Row>
              </View>
              <Row style={{ gap: 10 }}>
                <StepBtn icon="remove" onPress={() => setFare((f) => Math.max(5, f - 5))} c={c} />
                <StepBtn icon="add" onPress={() => setFare((f) => f + 5)} c={c} />
              </Row>
            </Row>
          ) : (
            <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 16, backgroundColor: c.surfaceAlt, borderRadius: 14, padding: 14 }}>
              <View>
                <Text style={{ fontSize: 12, color: c.textMuted, fontWeight: '600' }}>Fixed fare · no bargaining</Text>
                <Text style={{ fontSize: 22, fontWeight: '800', color: c.text, marginTop: 2 }}>GH₵ {fare}</Text>
              </View>
              <Ionicons name="shield-checkmark" size={22} color={c.primary} />
            </Row>
          )}

          <Btn label={scheduledFuture ? 'Schedule ride' : typeMeta.bargain ? 'Request ride' : `Book ${typeMeta.label}`}
               onPress={requestRide} loading={loading} />
        </Card>
      </ScrollView>
    </View>
  );
}

function RouteField({ icon, iconColor, label, value, onPress, c }: any) {
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap onPress={onPress} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 }}>
      <Ionicons name={icon} size={12} color={iconColor} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: c.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, marginTop: 1 }} numberOfLines={1}>{value}</Text>
      </View>
    </Wrap>
  );
}

function StepBtn({ icon, onPress, c }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={20} color={c.primary} />
    </TouchableOpacity>
  );
}
