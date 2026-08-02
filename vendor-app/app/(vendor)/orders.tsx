import { useEffect, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { foodApi, Order, Restaurant } from '../../src/api/food';
import { authApi } from '../../src/api/auth';
import { useVendorStore } from '../../src/store/vendorStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Row } from '../../src/components/ui';
import { VendorGate } from '../../src/components/VendorGate';

/**
 * The next status, which depends on how the order is being collected.
 *
 * This used to be one flat map ending READY -> OUT_FOR_DELIVERY for everything, so a pickup or
 * walk-in order offered the vendor an "Out for delivery" button that the backend then refused as
 * an invalid transition. Nobody is delivering a walk-in: the customer is standing there. Those
 * go straight from READY to COMPLETED when the food is handed over.
 */
function nextStatus(order: Order): string | null {
  const shared: Record<string, string> = {
    PLACED: 'CONFIRMED', CONFIRMED: 'PREPARING', PREPARING: 'READY',
  };
  if (shared[order.status]) return shared[order.status];
  if (order.status === 'READY') {
    // A delivery leaves the kitchen with a courier and is theirs to advance from here.
    return order.mode === 'DELIVERY' ? null : 'COMPLETED';
  }
  return null;
}

function actionLabel(order: Order): string | null {
  const shared: Record<string, string> = {
    PLACED: 'Confirm order', CONFIRMED: 'Start preparing', PREPARING: 'Mark ready',
  };
  if (shared[order.status]) return shared[order.status];
  if (order.status === 'READY' && order.mode !== 'DELIVERY') {
    return order.mode === 'WALKIN' ? 'Served — complete' : 'Handed to customer';
  }
  return null;
}

/**
 * A delivery order leaves the kitchen's hands once it's ready: a courier collects it and their
 * own updates drive the rest, so there is nothing for the vendor to press. Pickup and walk-in
 * orders stay the vendor's all the way to COMPLETED, because the vendor really is the one
 * handing the food over.
 */
function vendorAction(order: Order): string | null {
  if (order.mode === 'DELIVERY' && (order.status === 'READY' || order.status === 'OUT_FOR_DELIVERY')) {
    return null;
  }
  return actionLabel(order);
}

/** What the vendor sees instead of a button while the courier has it. */
function courierNote(order: Order): string | null {
  if (order.mode !== 'DELIVERY') return null;
  if (order.status === 'READY') return 'Waiting for a courier to collect';
  if (order.status === 'OUT_FOR_DELIVERY') return 'Courier is on the way to the customer';
  return null;
}

/** Tell the vendor the customer has been told to come — so they know why they are waiting. */
function collectNote(order: Order): string | null {
  if (order.mode === 'DELIVERY' || order.status !== 'READY') return null;
  return order.mode === 'WALKIN'
    ? 'Customer notified — call them when their table is ready'
    : 'Customer notified to come and collect';
}
const STATUS_COLOR = (c: any): Record<string, string> => ({
  PLACED: c.warning, CONFIRMED: c.warning, PREPARING: '#f97316',
  READY: c.primary, OUT_FOR_DELIVERY: '#8b5cf6', COMPLETED: c.success, CANCELLED: c.danger,
});
const TYPE_LABEL: Record<string, string> = {
  RESTAURANT: 'Restaurant', PHARMACY: 'Pharmacy', GROCERY: 'Grocery', CONVENIENCE: 'Convenience', OTHER: 'Vendor',
};

function VendorOrdersScreenBoard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const vendor = useVendorStore((s) => s.vendor);
  const setVendor = useVendorStore((s) => s.setVendor);
  const open = useVendorStore((s) => s.open);
  const setOpen = useVendorStore((s) => s.setOpen);

  const [vendors, setVendors] = useState<Restaurant[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [awaitingCash, setAwaitingCash] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [switcher, setSwitcher] = useState(false);

  // Load the owner's own vendors; default to the first if none selected.
  useEffect(() => {
    authApi.myVendors().then((list) => {
      setVendors(list);
      if (!vendor && list.length) setVendor(list[0]);
    }).catch(() => {});
  }, []);

  async function load() {
    if (!vendor) return;
    try { setOrders(await foodApi.restaurantOrders(vendor.id)); } catch {}
    try { setAwaitingCash(await foodApi.awaitingCash(vendor.id)); } catch {}
  }
  useEffect(() => { load(); }, [vendor?.id]);

  async function confirmCash(o: Order) {
    setConfirmingId(o.id);
    try { await foodApi.confirmOrderCash(o.id); await load(); }
    catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Could not confirm'); }
    finally { setConfirmingId(null); }
  }

  // Auto-poll for new/updated orders.
  useEffect(() => {
    if (!vendor) return;
    const poll = setInterval(load, 5000);
    return () => clearInterval(poll);
  }, [vendor?.id]);

  async function advance(order: Order) {
    const next = nextStatus(order);
    if (!next) return;
    setAdvancingId(order.id);
    try { await foodApi.advanceStatus(order.id, next); await load(); }
    catch (e: any) { Alert.alert('Error', e?.response?.data?.message ?? 'Status update failed'); }
    finally { setAdvancingId(null); }
  }

  const newCount = orders.filter((o) => o.status === 'PLACED').length;
  const prepCount = orders.filter((o) => o.status === 'CONFIRMED' || o.status === 'PREPARING').length;
  const readyCount = orders.filter((o) => o.status === 'READY' || o.status === 'OUT_FOR_DELIVERY').length;
  const active = orders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>

        {/* Header: vendor switcher + avatar */}
        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => setSwitcher(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{vendor?.name?.[0] ?? 'G'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Row style={{ gap: 5 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: c.text }} numberOfLines={1}>{vendor?.name ?? 'Your business'}</Text>
                <Ionicons name="chevron-down" size={15} color={c.textMuted} />
              </Row>
              <Text style={{ fontSize: 12.5, color: c.textMuted }}>{vendor ? TYPE_LABEL[vendor.vendorType] : '—'}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/profile' as any)} activeOpacity={0.8}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person" size={18} color={c.text} />
          </TouchableOpacity>
        </Row>

        {/* Open/closed toggle */}
        <TouchableOpacity onPress={() => setOpen(!open)} activeOpacity={0.9}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: open ? `${c.success}1A` : c.surfaceAlt, borderRadius: 16, borderWidth: 1, borderColor: open ? c.success : c.border, padding: 14, marginBottom: 16 }}>
          <Row style={{ gap: 10 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: open ? c.success : c.textMuted }} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>{open ? 'Open — accepting orders' : 'Closed'}</Text>
          </Row>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>{open ? 'Go closed' : 'Go open'}</Text>
        </TouchableOpacity>

        {/* Stats */}
        <Row style={{ gap: 12, marginBottom: 20 }}>
          <Stat label="New" value={newCount} color={c.warning} c={c} />
          <Stat label="Preparing" value={prepCount} color="#f97316" c={c} />
          <Stat label="Ready" value={readyCount} color={c.primary} c={c} />
        </Row>

        {/* Awaiting cash confirmation */}
        {awaitingCash.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: c.text, marginBottom: 12 }}>Awaiting cash</Text>
            {awaitingCash.map((o) => (
              <View key={o.id} style={{ backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.warning, padding: 16, marginBottom: 12 }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: c.text }}>#{o.id.slice(0, 8)}</Text>
                    <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 2 }}>{o.mode} · collect cash</Text>
                  </View>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: c.text }}>GH₵ {o.total.toFixed(2)}</Text>
                </Row>
                <TouchableOpacity onPress={() => confirmCash(o)} disabled={confirmingId === o.id} activeOpacity={0.9}
                  style={{ marginTop: 12, backgroundColor: c.success, borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14.5 }}>{confirmingId === o.id ? 'Confirming…' : 'Confirm cash received'}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <Text style={{ fontSize: 17, fontWeight: '800', color: c.text, marginBottom: 12 }}>Live orders</Text>
        {active.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 36, gap: 10 }}>
            <Ionicons name="receipt-outline" size={34} color={c.textMuted} />
            <Text style={{ color: c.textMuted, fontSize: 14 }}>No active orders right now</Text>
          </View>
        ) : (
          active.map((o) => (
            <View key={o.id} style={{ backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 14 }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: c.text }}>#{o.id.slice(0, 8)}</Text>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: `${STATUS_COLOR(c)[o.status]}1A` }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: STATUS_COLOR(c)[o.status] }}>{o.status.replace(/_/g, ' ')}</Text>
                </View>
              </Row>
              <Row style={{ gap: 8, marginTop: 4 }}>
                <Ionicons name={o.mode === 'DELIVERY' ? 'bicycle' : o.mode === 'PICKUP' ? 'bag-handle' : 'walk'} size={14} color={c.textMuted} />
                <Text style={{ fontSize: 13, color: c.textMuted }}>{o.mode} · GH₵ {o.total.toFixed(2)}</Text>
              </Row>
              <View style={{ marginTop: 10 }}>
                {o.items.slice(0, 4).map((it, i) => (
                  <Text key={i} style={{ fontSize: 13.5, color: c.text, lineHeight: 21 }}>{it.qty} × {it.name}</Text>
                ))}
                {o.items.length > 4 && <Text style={{ fontSize: 13, color: c.textMuted }}>+{o.items.length - 4} more</Text>}
              </View>
              {vendorAction(o) ? (
                <TouchableOpacity onPress={() => advance(o)} disabled={advancingId === o.id} activeOpacity={0.9}
                  style={{ marginTop: 14, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{advancingId === o.id ? 'Updating…' : vendorAction(o)}</Text>
                </TouchableOpacity>
              ) : courierNote(o) ? (
                <Row style={{ marginTop: 14, gap: 8, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 }}>
                  <Ionicons name="bicycle-outline" size={17} color={c.textMuted} />
                  <Text style={{ flex: 1, fontSize: 13, color: c.textMuted }}>{courierNote(o)}</Text>
                </Row>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      {/* Vendor switcher modal */}
      <Modal visible={switcher} transparent animationType="fade" onRequestClose={() => setSwitcher(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setSwitcher(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: insets.bottom + 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: c.text, marginBottom: 14 }}>Your businesses</Text>
            {vendors.map((v) => {
              const sel = vendor?.id === v.id;
              return (
                <TouchableOpacity key={v.id} onPress={() => { setVendor(v); setSwitcher(false); }} activeOpacity={0.85}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, marginBottom: 8, backgroundColor: sel ? c.primarySoft : c.surface, borderWidth: 1, borderColor: sel ? c.primary : c.border }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800' }}>{v.name[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>{v.name}</Text>
                    <Text style={{ fontSize: 12.5, color: c.textMuted }}>{TYPE_LABEL[v.vendorType]}</Text>
                  </View>
                  {sel && <Ionicons name="checkmark-circle" size={22} color={c.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function Stat({ label, value, color, c }: any) {
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 14, alignItems: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

/**
 * Only an approved business can use this screen.
 *
 * The tab itself stays reachable — an unapproved vendor gets in and is told where they
 * stand, rather than being parked on a dead-end page with nothing but a logout button.
 * Profile is deliberately NOT gated: fixing your details is what the wait is for.
 */
export default function VendorOrdersScreen() {
  return (
    <VendorGate>
      <VendorOrdersScreenBoard />
    </VendorGate>
  );
}
