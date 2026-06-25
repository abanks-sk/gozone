import { useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { foodApi, Order, QueuePosition } from '../../../src/api/food';
import { wsClient } from '../../../src/realtime/wsClient';
import { Btn, Badge, Card, Colors, Divider, Row, Section } from '../../../src/components/ui';

const STATUS_COLOR: Record<string, string> = {
  PLACED: '#94a3b8',
  CONFIRMED: '#f59e0b',
  PREPARING: Colors.accent,
  READY: '#3b82f6',
  OUT_FOR_DELIVERY: '#8b5cf6',
  COMPLETED: Colors.primary,
  CANCELLED: Colors.danger,
};

export default function OrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [queue, setQueue] = useState<QueuePosition | null>(null);
  const [courierLoc, setCourierLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);
  const staleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const o = await foodApi.getOrder(orderId);
      setOrder(o);

      if (o.mode === 'WALKIN') {
        const pos = await foodApi.queuePosition(orderId).catch(() => null);
        setQueue(pos);
      }
    } catch {}
  }

  useEffect(() => {
    load();
  }, [orderId]);

  // Subscribe to delivery courier location when OUT_FOR_DELIVERY
  useEffect(() => {
    if (!order || order.mode !== 'DELIVERY' || order.status !== 'OUT_FOR_DELIVERY') return;
    wsClient.subscribeToDelivery(orderId, loc => {
      setCourierLoc({ lat: loc.lat, lng: loc.lng });
      setIsStale(false);
      if (staleTimerRef.current) clearInterval(staleTimerRef.current);
      staleTimerRef.current = setInterval(() => setIsStale(true), 6000);
    });
    return () => {
      if (staleTimerRef.current) clearInterval(staleTimerRef.current);
    };
  }, [order?.status]);

  // Subscribe to queue updates
  useEffect(() => {
    if (!order || order.mode !== 'WALKIN') return;
    wsClient.subscribeToQueue(order.restaurantId, payload => {
      // Reload queue position when queue changes
      foodApi.queuePosition(orderId).then(setQueue).catch(() => {});
    });
  }, [order?.restaurantId]);

  async function rate() {
    if (!order) return;
    Alert.prompt('Rate this order', 'Score 1–5:', async (val) => {
      const score = parseInt(val);
      if (isNaN(score) || score < 1 || score > 5) return;
      await foodApi.rateOrder(orderId, score);
      setRatingDone(true);
      Alert.alert('Thanks for rating!');
    }, 'plain-text', '5');
  }

  if (!order) return null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={styles.heading}>Order</Text>
        <Badge label={order.status} color={STATUS_COLOR[order.status] ?? Colors.muted} />
      </Row>

      <Card>
        <Text style={styles.restaurant}>{order.restaurantName}</Text>
        <Text style={styles.meta}>Mode: {order.mode}</Text>
        {order.deliveryAddr ? <Text style={styles.meta}>Deliver to: {order.deliveryAddr}</Text> : null}
        <Divider />
        {order.items.map((item, i) => (
          <Row key={i} style={styles.lineRow}>
            <Text style={{ flex: 1, color: Colors.text }}>{item.name} × {item.qty}</Text>
            <Text style={{ color: Colors.text, fontWeight: '600' }}>
              GH₵ {(item.unitPrice * item.qty).toFixed(2)}
            </Text>
          </Row>
        ))}
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: Colors.muted }}>Delivery fee</Text>
          <Text style={{ color: Colors.text }}>GH₵ {order.deliveryFee.toFixed(2)}</Text>
        </Row>
        <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.total}>GH₵ {order.total.toFixed(2)}</Text>
        </Row>
      </Card>

      {/* Walk-in queue position */}
      {order.mode === 'WALKIN' && queue && (
        <Card>
          <Text style={styles.queueTitle}>Queue position</Text>
          <Text style={styles.queuePos}>#{queue.position}</Text>
          <Badge label={queue.status} />
        </Card>
      )}

      {/* Live courier tracking */}
      {order.mode === 'DELIVERY' && order.status === 'OUT_FOR_DELIVERY' && (
        <Card>
          <Text style={styles.sectionTitle}>Live courier</Text>
          {courierLoc
            ? <Text style={styles.meta}>
                {courierLoc.lat.toFixed(4)}, {courierLoc.lng.toFixed(4)}
                {isStale ? ' (stale)' : ' (live)'}
              </Text>
            : <Text style={styles.meta}>Waiting for courier location…</Text>
          }
        </Card>
      )}

      {/* Rating */}
      {order.status === 'COMPLETED' && !ratingDone && (
        <Btn label="Rate this order" variant="outline" onPress={rate} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 22, fontWeight: '800', color: Colors.text },
  restaurant: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  meta: { fontSize: 13, color: Colors.muted, marginBottom: 2 },
  lineRow: { justifyContent: 'space-between', paddingVertical: 6 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: Colors.text },
  total: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  queueTitle: { fontSize: 14, fontWeight: '600', color: Colors.muted, marginBottom: 4 },
  queuePos: { fontSize: 48, fontWeight: '800', color: Colors.primary, textAlign: 'center', marginVertical: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 6 },
});
