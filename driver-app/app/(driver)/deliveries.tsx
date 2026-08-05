import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { deliveryApi, Delivery } from '../../src/api/food';
import { useAuthStore } from '../../src/store/authStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Row } from '../../src/components/ui';
import { GoogleMap } from '../../src/components/GoogleMap';
import { vehicleKindOf } from '../../src/components/mapTypes';

const NEXT: Record<string, string> = { ASSIGNED: 'PICKED_UP', PICKED_UP: 'ENROUTE', ENROUTE: 'DELIVERED' };
const ACTION: Record<string, string> = {
  ASSIGNED: 'Picked up the order', PICKED_UP: 'Start delivery', ENROUTE: 'Mark delivered',
};
const STEP = [
  { key: 'ASSIGNED', label: 'Assigned', sub: 'Head to the vendor' },
  { key: 'PICKED_UP', label: 'Picked up', sub: 'Order collected' },
  { key: 'ENROUTE', label: 'On the way', sub: 'Driving to the customer' },
  { key: 'DELIVERED', label: 'Delivered', sub: 'Handed over' },
];
type Pt = { lat: number; lng: number };

/** Accra centre — only used when a delivery has no coordinates at all to work from. */
const ACCRA: Pt = { lat: 5.6037, lng: -0.187 };

/**
 * Demo GPS along the leg the courier is actually driving.
 *
 * This used to be six coordinates hardcoded into the app, walked in a loop regardless of which
 * restaurant the order came from or where the customer lived — so the customer's tracking map
 * showed a courier wandering a fixed stretch of central Accra, nowhere near their food, and
 * teleporting back to the start every six pings. It also made movement look trivial no matter
 * how far apart the two ends really were.
 *
 * Now the path is generated between the real endpoints, so distance on the map is real distance.
 * Still scripted — GPS is mocked for the demo, per the project's "what is mocked" list.
 */
function legPath(from: Pt, to: Pt, steps = 24): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({ lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t });
  }
  return pts;
}

export default function DriverDeliveriesScreen() {
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const [available, setAvailable] = useState<Delivery[]>([]);
  const [active, setActive] = useState<Delivery | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [courierPos, setCourierPos] = useState<{ lat: number; lng: number } | null>(null);
  const locRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wpRef = useRef(0);

  const vehicleClass = useAuthStore((s) => s.vehicleClass);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  useEffect(() => { fetchMe(); }, []);
  /**
   * Who may take a food delivery.
   *
   * This used to be Okada only, which silently produced an empty feed for everyone else — a
   * driver with a car saw "no deliveries" forever and had no way to tell that from there being
   * no work. A saloon car can carry a takeaway perfectly well; what cannot is a truck, and a
   * car whose class an admin has not assigned yet is not approved for anything.
   */
  const canDeliver = vehicleClass === 'OKADA' || vehicleClass === 'STANDARD' || vehicleClass === 'LUXE';

  async function load() {
    try {
      // Ineligible drivers still see their own active delivery, so nothing is stranded if a
      // class changes mid-job.
      const [avail, mine] = await Promise.all([
        canDeliver ? deliveryApi.available() : Promise.resolve([]),
        deliveryApi.mine(),
      ]);
      setAvailable(avail);
      // A cash delivery stays "active" after DELIVERED until the courier confirms the
      // cash was collected — so it isn't dropped before payment is settled.
      setActive(mine.find((d) =>
        d.status !== 'DELIVERED' || (d.paymentMethod === 'cash' && d.paymentStatus === 'AWAITING')
      ) ?? null);
    } catch {}
  }
  useEffect(() => { load(); }, [canDeliver]);
  // Poll the available feed while idle.
  useEffect(() => {
    if (active) return;
    const poll = setInterval(load, 5000);
    return () => clearInterval(poll);
  }, [active]);

  // ── The two ends of the active job, and the leg currently being driven ──────
  const vendorPt: Pt | null = active?.vendorLat != null && active?.vendorLng != null
    ? { lat: Number(active.vendorLat), lng: Number(active.vendorLng) } : null;
  const dropoffPt: Pt | null = active?.dropoffLat != null && active?.dropoffLng != null
    ? { lat: Number(active.dropoffLat), lng: Number(active.dropoffLng) } : null;
  // Before collection you are driving to the vendor; after it, to the customer. An order placed
  // before destinations were stored has no dropoff pin, so the second leg simply has nothing to
  // draw and the courier holds at the vendor rather than being sent somewhere invented.
  const legStart = active?.status === 'ASSIGNED' ? (courierPos ?? ACCRA) : (vendorPt ?? ACCRA);
  const legEnd = active?.status === 'ASSIGNED' ? vendorPt : dropoffPt;
  const activePath: Pt[] = legEnd ? legPath(legStart, legEnd) : [];
  // Frame the whole leg when there is one, otherwise just the vendor.
  const mapCenter: Pt = legEnd && vendorPt
    ? { lat: (legStart.lat + legEnd.lat) / 2, lng: (legStart.lng + legEnd.lng) / 2 }
    : vendorPt ?? ACCRA;

  // Push scripted GPS along whichever leg is actually being driven.
  //
  // Restarts at the top of each leg (the dep array includes status), so collecting the order
  // switches the courier from "approaching the restaurant" to "carrying it to the customer" —
  // which is the transition the customer's map is meant to show.
  useEffect(() => {
    const live = active && active.status !== 'DELIVERED';
    if (!live) { stopGps(); return; }
    stopGps();
    wpRef.current = 0;
    const path = activePath;
    if (!path.length) return;
    locRef.current = setInterval(() => {
      // Hold at the destination instead of wrapping round to the start: a courier who has
      // arrived stays arrived until they advance the status.
      const wp = path[Math.min(wpRef.current, path.length - 1)];
      deliveryApi.pushLocation(active!.id, wp.lat, wp.lng).catch(() => {});
      setCourierPos(wp); // move the marker on the courier's own map too
      wpRef.current++;
    }, 2500);
    return () => stopGps();
  }, [active?.id, active?.status]);
  function stopGps() { if (locRef.current) { clearInterval(locRef.current); locRef.current = null; } }
  useEffect(() => () => stopGps(), []);

  async function accept(d: Delivery) {
    setBusy(true);
    try { await deliveryApi.accept(d.id); await load(); }
    catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Could not accept'); }
    finally { setBusy(false); }
  }
  async function advance() {
    if (!active) return;
    const next = NEXT[active.status];
    if (!next) return;
    setBusy(true);
    try { await deliveryApi.advanceStatus(active.id, next); await load(); }
    catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Update failed'); }
    finally { setBusy(false); }
  }
  async function confirmCash() {
    if (!active) return;
    setBusy(true);
    try { await deliveryApi.confirmCash(active.id); await load(); }
    catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Could not confirm'); }
    finally { setBusy(false); }
  }

  const idx = active ? STEP.findIndex((s) => s.key === active.status) : -1;
  const isCash = active?.paymentMethod === 'cash';
  const cashDue = isCash && active?.paymentStatus === 'AWAITING';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>

        <Text style={{ fontSize: 27, fontWeight: '800', color: c.text, letterSpacing: -0.5, marginBottom: 16 }}>Deliveries</Text>

        {active ? (
          /* Active delivery */
          <View style={{ backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.border, padding: 18 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: c.text }}>{active.vendorName}</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: c.primary }}>GH₵ {active.total.toFixed(2)}</Text>
            </Row>
            <Row style={{ gap: 8, marginTop: 6 }}>
              <Ionicons name="location" size={14} color={c.danger} />
              <Text style={{ fontSize: 13.5, color: c.textMuted, flex: 1 }}>{active.dropoffAddr ?? 'Customer address'}</Text>
            </Row>
            {/* Who is receiving this. An address gets you to the building; a name is how you know
                you are handing a stranger's dinner to the right person, and the number is how you
                find them when the pin is thirty metres out. */}
            {!!active.customerName && (
              <Row style={{ gap: 8, marginTop: 6 }}>
                <Ionicons name="person" size={14} color={c.textMuted} />
                <Text style={{ fontSize: 13.5, color: c.text, flex: 1, fontWeight: '600' }}>{active.customerName}</Text>
                {!!active.customerPhone && (
                  <TouchableOpacity activeOpacity={0.85}
                    onPress={() => Linking.openURL(`tel:${active.customerPhone}`).catch(() => {})}>
                    <Ionicons name="call" size={18} color={c.primary} />
                  </TouchableOpacity>
                )}
              </Row>
            )}

            {/* Live delivery map — the real pickup, drop-off, current leg and your position.
                Needs the vendor pin at minimum; without it there is no map worth drawing. */}
            {active.status !== 'DELIVERED' && vendorPt && (
              <GoogleMap
                style={{ height: 200, borderRadius: 16, marginTop: 12 }}
                center={mapCenter}
                zoom={13}
                vehicleKind={vehicleKindOf(vehicleClass)}
                markers={[
                  { ...vendorPt, kind: 'pickup', label: active.vendorName },
                  ...(dropoffPt ? [{ ...dropoffPt, kind: 'dest' as const, label: 'Customer' }] : []),
                ]}
                route={activePath}
                driver={courierPos}
              />
            )}

            <View style={{ height: 14 }} />
            {STEP.map((s, i) => {
              const reached = i <= idx;
              const current = i === idx;
              return (
                <Row key={s.key} style={{ alignItems: 'flex-start', gap: 12 }}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: reached ? c.primary : c.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: current ? 3 : 0, borderColor: c.primarySoft }}>
                      {reached ? <Ionicons name="checkmark" size={14} color="#fff" /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.textMuted }} />}
                    </View>
                    {i < STEP.length - 1 && <View style={{ width: 2, height: 22, backgroundColor: i < idx ? c.primary : c.border }} />}
                  </View>
                  <View style={{ flex: 1, paddingTop: 1 }}>
                    <Text style={{ fontSize: 14.5, fontWeight: current ? '800' : '600', color: reached ? c.text : c.textMuted }}>{s.label}</Text>
                    <Text style={{ fontSize: 12, color: c.textMuted }}>{s.sub}</Text>
                  </View>
                </Row>
              );
            })}

            {active.status !== 'DELIVERED' && (
              <TouchableOpacity onPress={advance} disabled={busy} activeOpacity={0.9}
                style={{ marginTop: 14, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{busy ? 'Working…' : ACTION[active.status]}</Text>
              </TouchableOpacity>
            )}

            {/* Cash collection — courier settles cash on hand-off */}
            {isCash && (
              <View style={{ marginTop: 14, backgroundColor: c.surfaceAlt, borderRadius: 16, padding: 14 }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Row style={{ gap: 8 }}>
                    <Ionicons name="cash-outline" size={18} color={cashDue ? c.warning : c.success} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>
                      {cashDue ? `Collect GH₵ ${active.total.toFixed(2)} cash` : 'Cash collected'}
                    </Text>
                  </Row>
                  {!cashDue && <Ionicons name="checkmark-circle" size={20} color={c.success} />}
                </Row>
                {cashDue && (
                  <TouchableOpacity onPress={confirmCash} disabled={busy} activeOpacity={0.9}
                    style={{ marginTop: 12, backgroundColor: c.success, borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{busy ? 'Working…' : 'Confirm cash received'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ) : (
          /* Available feed */
          <>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>Available now</Text>
            {!canDeliver ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
                <Ionicons name="bicycle-outline" size={34} color={c.textMuted} />
                <Text style={{ color: c.textMuted, fontSize: 14, textAlign: 'center', paddingHorizontal: 20 }}>
                  {vehicleClass
                    ? 'Food deliveries go to okada, car and luxe drivers. Parcels for your class appear on the Home feed.'
                    : 'An admin still needs to approve your vehicle before you can take deliveries.'}
                </Text>
              </View>
            ) : available.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
                <Ionicons name="cube-outline" size={34} color={c.textMuted} />
                <Text style={{ color: c.textMuted, fontSize: 14 }}>No deliveries available right now</Text>
              </View>
            ) : (
              available.map((d) => (
                <View key={d.id} style={{ backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 14 }}>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <Row style={{ gap: 10 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="restaurant" size={18} color={c.primary} />
                      </View>
                      <View>
                        <Text style={{ fontSize: 15.5, fontWeight: '700', color: c.text }}>{d.vendorName}</Text>
                        <Text style={{ fontSize: 12.5, color: c.textMuted }}>GH₵ {d.total.toFixed(2)} order</Text>
                      </View>
                    </Row>
                  </Row>
                  <Row style={{ gap: 8, marginTop: 10 }}>
                    <Ionicons name="location" size={14} color={c.danger} />
                    <Text style={{ fontSize: 13, color: c.textMuted, flex: 1 }} numberOfLines={1}>{d.dropoffAddr ?? 'Customer address'}</Text>
                  </Row>
                  <TouchableOpacity onPress={() => accept(d)} disabled={busy} activeOpacity={0.9}
                    style={{ marginTop: 14, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Accept delivery</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
