import { useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { foodApi, QueuePosition } from '../../src/api/food';
import { wsClient } from '../../src/realtime/wsClient';
import { useVendorStore } from '../../src/store/vendorStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Row } from '../../src/components/ui';
import { VendorGate } from '../../src/components/VendorGate';

function VendorQueueScreenBoard() {
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const vendor = useVendorStore((s) => s.vendor);
  const [queue, setQueue] = useState<QueuePosition[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [calling, setCalling] = useState(false);

  async function load() {
    if (!vendor) return;
    try { setQueue(await foodApi.getQueue(vendor.id)); } catch {}
  }
  useEffect(() => { load(); }, [vendor?.id]);
  useEffect(() => {
    if (!vendor) return;
    const stop = wsClient.subscribeToQueue(vendor.id, () => load());
    return () => stop();
    const poll = setInterval(load, 6000);
    return () => clearInterval(poll);
  }, [vendor?.id]);

  async function callNext() {
    if (!vendor) return;
    setCalling(true);
    try {
      const entry = await foodApi.callNext(vendor.id);
      Alert.alert('Called', `Now calling #${entry.position}.`);
      await load();
    } catch {
      Alert.alert('Queue empty', 'No one is waiting.');
    } finally { setCalling(false); }
  }

  const waiting = queue.filter((q) => q.status === 'WAITING');
  const called = queue.filter((q) => q.status === 'CALLED');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>

        <Text style={{ fontSize: 27, fontWeight: '800', color: c.text, letterSpacing: -0.5, marginBottom: 4 }}>Walk-in queue</Text>
        <Text style={{ fontSize: 13.5, color: c.textMuted, marginBottom: 18 }}>{vendor?.name ?? 'Your business'}</Text>

        {/* Now calling */}
        <View style={{ backgroundColor: c.primary, borderRadius: 24, padding: 22, alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>Now calling</Text>
          <Text style={{ color: '#fff', fontSize: 52, fontWeight: '800', marginVertical: 4 }}>{called[0] ? `#${called[0].position}` : '—'}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>{waiting.length} waiting in line</Text>
        </View>

        <TouchableOpacity onPress={callNext} disabled={calling} activeOpacity={0.9}
          style={{ backgroundColor: c.text, borderRadius: 999, paddingVertical: 16, alignItems: 'center', marginBottom: 22 }}>
          <Text style={{ color: c.bg, fontWeight: '800', fontSize: 16 }}>{calling ? 'Calling…' : 'Call next customer'}</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>In line</Text>
        {queue.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 30, gap: 10 }}>
            <Ionicons name="people-outline" size={34} color={c.textMuted} />
            <Text style={{ color: c.textMuted, fontSize: 14 }}>No one in the queue yet</Text>
          </View>
        ) : (
          queue.map((q) => (
            <Row key={q.entryId} style={{ justifyContent: 'space-between', backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14, marginBottom: 10 }}>
              <Row style={{ gap: 14 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: c.text }}>{q.position}</Text>
                </View>
                <View style={{ justifyContent: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>Ticket #{q.position}</Text>
                  <Text style={{ fontSize: 12.5, color: c.textMuted }}>Order {q.orderId.slice(0, 8)}…</Text>
                </View>
              </Row>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: q.status === 'CALLED' ? `${c.success}1A` : c.surfaceAlt }}>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: q.status === 'CALLED' ? c.success : c.textMuted }}>{q.status}</Text>
              </View>
            </Row>
          ))
        )}
      </ScrollView>
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
export default function VendorQueueScreen() {
  return (
    <VendorGate>
      <VendorQueueScreenBoard />
    </VendorGate>
  );
}
