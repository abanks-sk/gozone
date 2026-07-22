import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { shopApi, Order } from '../../src/api/shop';
import { useTheme } from '../../src/theme/ThemeProvider';
import { restaurantMeta } from '../../src/data/shopCatalog';
import { Badge, Empty, Row } from '../../src/components/ui';

const ACTIVE = ['PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];
const STATUS_LABEL: Record<string, string> = {
  PLACED: 'Placed', CONFIRMED: 'Confirmed', PREPARING: 'Preparing', READY: 'Ready',
  OUT_FOR_DELIVERY: 'On the way', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};

export default function OrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const [orders, setOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function load() { try { setOrders(await shopApi.myOrders()); } catch {} }
  useEffect(() => { load(); }, []);

  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const past = orders.filter((o) => !ACTIVE.includes(o.status));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Row style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, gap: 12, marginBottom: 8 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Your orders</Text>
      </Row>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {orders.length === 0 && <Empty message="No orders yet" />}

        {active.length > 0 && (
          <>
            <Text style={section(c)}>Active</Text>
            {active.map((o) => <OrderCard key={o.id} o={o} c={c} onPress={() => router.push({ pathname: '/(shop)/order', params: { orderId: o.id } })} />)}
          </>
        )}
        {past.length > 0 && (
          <>
            <Text style={[section(c), { marginTop: active.length ? 22 : 0 }]}>Past</Text>
            {past.map((o) => <OrderCard key={o.id} o={o} c={c} onPress={() => router.push({ pathname: '/(shop)/order', params: { orderId: o.id } })} />)}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function OrderCard({ o, c, onPress }: any) {
  const meta = restaurantMeta(o.restaurantName);
  const cancelled = o.status === 'CANCELLED';
  const done = o.status === 'COMPLETED';
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 12, marginBottom: 12 }}>
      <View style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: meta.logoColor, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{o.restaurantName?.[0]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>{o.restaurantName}</Text>
        <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 2 }}>{o.items.length} item{o.items.length > 1 ? 's' : ''} · GH₵ {o.total.toFixed(2)}</Text>
      </View>
      <Badge label={STATUS_LABEL[o.status] ?? o.status} color={cancelled ? c.danger : done ? c.textMuted : c.primary} />
    </TouchableOpacity>
  );
}

const section = (c: any) => ({ fontSize: 13, fontWeight: '700' as const, color: c.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 8 });
