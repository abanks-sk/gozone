import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { shopApi, PlatformFees, Promo } from '../../src/api/shop';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useShopCart, cartTotal, lineTotal } from '../../src/store/shopCart';
import { itemMeta, Mode, MODE_LABEL } from '../../src/data/shopCatalog';
import { haversineKm } from '../../src/lib/pricing';
import { previewPromos } from '../../src/lib/promos';
import { Empty, Row } from '../../src/components/ui';

const MODE_ICON: Record<Mode, any> = { DELIVERY: 'bicycle', PICKUP: 'bag-handle', WALKIN: 'walk' };

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const { restaurantId, restaurantName, lines, deliveryPlace, setQty, clear } = useShopCart();
  const [loading, setLoading] = useState(false);

  // Modes available = intersection of every item's allowed modes.
  const allowed: Mode[] = lines.length
    ? lines.map((l) => itemMeta(l.name).modes).reduce((acc, m) => acc.filter((x) => m.includes(x)))
    : ['DELIVERY', 'PICKUP', 'WALKIN'];
  const [mode, setMode] = useState<Mode>(allowed[0]);
  useEffect(() => { if (!allowed.includes(mode)) setMode(allowed[0]); }, [allowed.join()]);

  // Admin-controlled fees + the vendor's coords (for the distance-based delivery estimate).
  const [fees, setFees] = useState<PlatformFees | null>(null);
  const [vendorCoord, setVendorCoord] = useState<{ lat: number; lng: number } | null>(null);
  // This vendor's live promos + each item's category, so the discount can be
  // previewed here. The server recomputes it authoritatively on placeOrder.
  const [promos, setPromos] = useState<Promo[]>([]);
  const [catById, setCatById] = useState<Record<string, string | undefined>>({});
  useEffect(() => {
    shopApi.getPlatformFees().then(setFees).catch(() => {});
    if (!restaurantId) return;               // empty cart — nothing to price yet
    shopApi.listRestaurants()
      .then((list) => { const v = list.find((r) => r.id === restaurantId); if (v) setVendorCoord({ lat: v.lat, lng: v.lng }); })
      .catch(() => {});
    shopApi.listPromos()
      .then((all) => setPromos(all.filter((p) => p.vendorId === restaurantId)))
      .catch(() => {});
    shopApi.getMenu(restaurantId)
      .then((items) => {
        const m: Record<string, string | undefined> = {};
        items.forEach((i) => { m[i.id] = i.category ?? undefined; });
        setCatById(m);
      })
      .catch(() => {});
  }, [restaurantId]);

  const subtotal = cartTotal(lines);
  const promo = useMemo(
    () => previewPromos(promos, lines, (id) => catById[id]),
    [promos, lines, catById]);
  // The service fee is charged on what's actually paid for the goods, i.e. after
  // any discount — same rule as the server.
  const discounted = Math.max(0, subtotal - promo.discount);
  const serviceFee = fees ? Math.round(discounted * fees.serviceFeePct * 100) / 100 : 0;
  const deliveryFee = fees && mode === 'DELIVERY' && vendorCoord
    ? Math.round((fees.deliveryBaseFee + fees.deliveryPerKm * haversineKm(vendorCoord, deliveryPlace)) * 100) / 100
    : 0;
  const total = discounted + serviceFee + deliveryFee;

  async function placeOrder() {
    if (!restaurantId || lines.length === 0) return;
    setLoading(true);
    try {
      // Each cart line is its own order line so its add-on selections survive.
      const items = lines.map((l) => ({
        menuItemId: l.menuItemId,
        qty: l.qty,
        addonOptionIds: l.options.map((o) => o.optionId).filter((id): id is string => !!id),
      }));
      const addr = `${deliveryPlace.label}, ${deliveryPlace.sub}`;
      const order = await shopApi.placeOrder({
        restaurantId, mode, items,
        deliveryAddr: mode === 'DELIVERY' ? addr : undefined,
        deliveryLat: mode === 'DELIVERY' ? deliveryPlace.lat : undefined,
        deliveryLng: mode === 'DELIVERY' ? deliveryPlace.lng : undefined,
      });
      clear();
      router.replace({ pathname: '/(shop)/order', params: { orderId: order.id } });
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not place order');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Row style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, gap: 12, marginBottom: 8 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Checkout</Text>
      </Row>

      {lines.length === 0 ? (
        <Empty message="Your cart is empty" />
      ) : (
        <>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 120 }}>
            <Text style={{ fontSize: 13, color: c.textMuted }}>Order from</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: c.text, marginBottom: 16 }}>{restaurantName}</Text>

            {/* How to get it */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>How to get it</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {(['DELIVERY', 'PICKUP', 'WALKIN'] as Mode[]).map((m) => {
                const ok = allowed.includes(m);
                const sel = mode === m;
                return (
                  <TouchableOpacity key={m} disabled={!ok} onPress={() => setMode(m)} activeOpacity={0.85}
                    style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 16, backgroundColor: sel ? c.primarySoft : c.surface, borderWidth: 1.5, borderColor: sel ? c.primary : c.border, opacity: ok ? 1 : 0.4 }}>
                    <Ionicons name={MODE_ICON[m]} size={20} color={sel ? c.primary : c.textMuted} />
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: sel ? c.primary : c.text }}>{MODE_LABEL[m]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Delivery address */}
            {mode === 'DELIVERY' && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, color: c.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7 }}>Deliver to</Text>
                <TouchableOpacity onPress={() => router.push('/(shop)/address' as any)} activeOpacity={0.8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13 }}>
                  <Ionicons name="location" size={16} color={c.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>{deliveryPlace.label}</Text>
                    <Text style={{ fontSize: 12.5, color: c.textMuted }}>{deliveryPlace.sub}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* Items */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Your items</Text>
            {lines.map((l) => (
              <View key={l.key} style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, flex: 1 }}>{l.name}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>GH₵ {lineTotal(l).toFixed(2)}</Text>
                </Row>
                {l.options.length > 0 && (
                  <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 3 }}>{l.options.map((o) => o.label).join(' · ')}</Text>
                )}
                <Row style={{ gap: 14, marginTop: 8 }}>
                  <TouchableOpacity onPress={() => setQty(l.key, l.qty - 1)} activeOpacity={0.7}
                    style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={l.qty <= 1 ? 'trash-outline' : 'remove'} size={16} color={c.primary} />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, minWidth: 16, textAlign: 'center' }}>{l.qty}</Text>
                  <TouchableOpacity onPress={() => setQty(l.key, l.qty + 1)} activeOpacity={0.7}
                    style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="add" size={16} color={c.primary} />
                  </TouchableOpacity>
                </Row>
              </View>
            ))}

            {/* Totals */}
            <Row style={{ justifyContent: 'space-between', marginTop: 16 }}>
              <Text style={{ fontSize: 15, color: c.textMuted }}>Subtotal</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>GH₵ {subtotal.toFixed(2)}</Text>
            </Row>
            {promo.discount > 0 && (
              <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
                <Row style={{ gap: 6, alignItems: 'center', flex: 1 }}>
                  <Ionicons name="pricetag" size={14} color={c.success} />
                  <Text style={{ fontSize: 14, color: c.success, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                    {promo.applied?.title ?? 'Discount'}
                  </Text>
                </Row>
                <Text style={{ fontSize: 14, color: c.success, fontWeight: '700' }}>− GH₵ {promo.discount.toFixed(2)}</Text>
              </Row>
            )}
            <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ fontSize: 14, color: c.textMuted }}>Service fee</Text>
              <Text style={{ fontSize: 14, color: c.text }}>GH₵ {serviceFee.toFixed(2)}</Text>
            </Row>
            {mode === 'DELIVERY' && (
              <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ fontSize: 14, color: c.textMuted }}>Delivery fee</Text>
                <Text style={{ fontSize: 14, color: c.text }}>
                  {vendorCoord ? `GH₵ ${deliveryFee.toFixed(2)}` : 'calculated at confirmation'}
                </Text>
              </Row>
            )}
            <Row style={{ justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: c.text }}>Total</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: c.text }}>GH₵ {total.toFixed(2)}</Text>
            </Row>

            {/* Vendor-fulfilled offers: no money changes here, the vendor honours
                them — but the customer should know what they're entitled to. */}
            {promo.notes.map((n) => (
              <Row key={n.id} style={{ gap: 8, marginTop: 10, backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12 }}>
                <Ionicons name="gift" size={16} color={c.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: c.text }}>{n.title}</Text>
                  <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 1 }}>
                    {n.description || 'Applied by the vendor when they prepare your order.'}
                  </Text>
                </View>
              </Row>
            ))}
          </ScrollView>

          {/* Place order */}
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 14 }}>
            <TouchableOpacity onPress={placeOrder} disabled={loading} activeOpacity={0.9}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.primary, borderRadius: 999, paddingVertical: 16, paddingHorizontal: 24, shadowColor: c.primary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{loading ? 'Placing…' : 'Place order'}</Text>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>GH₵ {total.toFixed(2)}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}
