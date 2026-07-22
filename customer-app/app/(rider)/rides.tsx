import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { rideApi, RideHistoryItem } from '../../src/api/ride';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Row, Badge, Empty } from '../../src/components/ui';

const ACTIVE = ['MATCHED', 'ENROUTE', 'STARTED'];

function statusColor(status: string, c: any) {
  if (status === 'COMPLETED') return c.textMuted;
  if (status === 'CANCELLED') return c.danger;
  if (ACTIVE.includes(status)) return c.primary;
  return c.warning; // OPEN / scheduled
}
function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function RidesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const [rides, setRides] = useState<RideHistoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() { try { setRides(await rideApi.myRides()); } catch {} finally { setLoaded(true); } }
  useEffect(() => { load(); }, []);

  const now = Date.now();
  const isUpcoming = (r: RideHistoryItem) =>
    ACTIVE.includes(r.status) || r.status === 'OPEN' || (!!r.scheduledAt && new Date(r.scheduledAt).getTime() > now);
  const upcoming = rides.filter(isUpcoming);
  const past = rides.filter((r) => !isUpcoming(r));

  function open(r: RideHistoryItem) {
    if (r.status === 'OPEN' || ACTIVE.includes(r.status)) {
      router.push(`/(rider)/live?requestId=${r.requestId}` as any);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Row style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, gap: 12, marginBottom: 8 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Your rides</Text>
      </Row>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>

        {loaded && rides.length === 0 && <Empty message="No rides yet — book your first trip!" />}

        {upcoming.length > 0 && (
          <>
            <Text style={section(c)}>Upcoming & active</Text>
            {upcoming.map((r) => <RideRow key={r.requestId} r={r} c={c} onPress={() => open(r)} />)}
          </>
        )}
        {past.length > 0 && (
          <>
            <Text style={[section(c), { marginTop: upcoming.length ? 22 : 0 }]}>Past</Text>
            {past.map((r) => <RideRow key={r.requestId} r={r} c={c} onPress={() => open(r)} />)}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function RideRow({ r, c, onPress }: { r: RideHistoryItem; c: any; onPress: () => void }) {
  const scheduled = !!r.scheduledAt && new Date(r.scheduledAt).getTime() > Date.now();
  const when = scheduled ? `Scheduled · ${fmt(r.scheduledAt!)}` : fmt(r.createdAt);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 14, marginBottom: 12 }}>
      <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={scheduled ? 'time' : 'car-sport'} size={20} color={c.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>GoRide trip</Text>
        <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 2 }}>{when}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: c.text }}>GH₵ {r.fare}</Text>
        <Badge label={r.status.replace(/_/g, ' ')} color={statusColor(r.status, c)} />
      </View>
    </TouchableOpacity>
  );
}

const section = (c: any) => ({ fontSize: 13, fontWeight: '700' as const, color: c.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 8 });
