import { useEffect, useState } from 'react';
import {
  Alert, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useAuthStore } from '../../../src/store/authStore';
import { foodApi, Order, QueuePosition } from '../../../src/api/food';
import { wsClient } from '../../../src/realtime/wsClient';
import { Btn, Badge, Card, Colors, Divider, Empty, Row, Section } from '../../../src/components/ui';

// Demo restaurant ID from seed data
const DEMO_RESTAURANT_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

const NEXT_STATUS: Record<string, string> = {
  PLACED: 'CONFIRMED',
  CONFIRMED: 'PREPARING',
  PREPARING: 'READY',
  READY: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'COMPLETED',
};

const STATUS_COLOR: Record<string, string> = {
  PLACED: '#94a3b8',
  CONFIRMED: '#f59e0b',
  PREPARING: '#f97316',
  READY: '#3b82f6',
  OUT_FOR_DELIVERY: '#8b5cf6',
  COMPLETED: Colors.primary,
};

export default function RestaurantDashboard() {
  const { logout } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [queue, setQueue] = useState<QueuePosition[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  async function load() {
    try {
      const [ordersData, queueData] = await Promise.all([
        foodApi.restaurantOrders(DEMO_RESTAURANT_ID),
        foodApi.getQueue(DEMO_RESTAURANT_ID),
      ]);
      setOrders(ordersData);
      setQueue(queueData);
    } catch (e: any) {
      if (e?.response?.status !== 403) {
        // Silently ignore 403 (wrong role in demo)
      }
    }
  }

  useEffect(() => {
    load();
    // Subscribe to queue updates
    wsClient.subscribeToQueue(DEMO_RESTAURANT_ID, () => load());
  }, []);

  async function advance(order: Order) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setAdvancingId(order.id);
    try {
      await foodApi.advanceStatus(order.id, next);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Status update failed');
    } finally {
      setAdvancingId(null);
    }
  }

  async function callNext() {
    try {
      const entry = await foodApi.callNext(DEMO_RESTAURANT_ID);
      Alert.alert('Called', `Queue position #${entry.position} called up!`);
      await load();
    } catch (e: any) {
      Alert.alert('Queue empty', 'No one is waiting.');
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Row style={styles.topBar}>
        <Text style={styles.heading}>Kitchen</Text>
        <Btn label="Logout" variant="ghost" onPress={logout} style={{ paddingVertical: 6 }} />
      </Row>

      {/* Walk-in queue panel */}
      <Card style={styles.queueCard}>
        <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={styles.queueTitle}>Walk-in Queue</Text>
          <Text style={styles.queueCount}>{queue.length} waiting</Text>
        </Row>
        {queue.slice(0, 5).map((entry, i) => (
          <Row key={entry.entryId} style={styles.queueEntry}>
            <Text style={styles.queueNum}>#{entry.position}</Text>
            <Badge label={entry.status} />
          </Row>
        ))}
        <Btn label="Call next" onPress={callNext} variant="outline" style={{ marginTop: 8 }} />
      </Card>

      {/* Live orders */}
      <Section title={`Orders (${orders.length})`}>
        {orders.length === 0
          ? <Empty message="No active orders" />
          : orders.map(order => (
            <Card key={order.id}>
              <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={styles.orderId}>#{order.id.slice(0, 8)}</Text>
                <Badge
                  label={order.status}
                  color={STATUS_COLOR[order.status] ?? Colors.muted}
                />
              </Row>
              <Text style={styles.mode}>{order.mode} · GH₵ {order.total.toFixed(2)}</Text>
              {order.items.slice(0, 3).map((item, i) => (
                <Text key={i} style={styles.item}>• {item.name} × {item.qty}</Text>
              ))}
              {NEXT_STATUS[order.status] && (
                <>
                  <Divider />
                  <Btn
                    label={`→ ${NEXT_STATUS[order.status]}`}
                    onPress={() => advance(order)}
                    loading={advancingId === order.id}
                    style={{ marginTop: 0 }}
                  />
                </>
              )}
            </Card>
          ))
        }
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topBar: { justifyContent: 'space-between', marginBottom: 16 },
  heading: { fontSize: 26, fontWeight: '800', color: Colors.primary },
  queueCard: { backgroundColor: Colors.primaryDark, marginBottom: 16 },
  queueTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  queueCount: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  queueEntry: { paddingVertical: 4, gap: 8 },
  queueNum: { fontSize: 18, fontWeight: '800', color: '#fff', width: 36 },
  orderId: { fontSize: 15, fontWeight: '700', color: Colors.text },
  mode: { fontSize: 13, color: Colors.muted, marginBottom: 4 },
  item: { fontSize: 13, color: Colors.muted, lineHeight: 20 },
});
