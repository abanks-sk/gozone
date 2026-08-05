import { useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { rideApi, DriverTripItem } from '../src/api/ride';
import { useTheme } from '../src/theme/ThemeProvider';
import { Badge, Empty, Row } from '../src/components/ui';

/**
 * A driver's own job history.
 *
 * <p>Built for one failure in particular: the app kept the active trip in a persisted store and
 * nowhere else, and that store is cleared on logout *and* on every fresh OTP verify. A driver who
 * left a trip before confirming a cash handover lost the only route back to it — they could not
 * confirm, and the customer sat on "waiting for them to confirm" indefinitely. Money owed is
 * pinned to the top here, because the whole point is that it stops being lost.
 */
export default function DriverTripsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const [trips, setTrips] = useState<DriverTripItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function load() {
    try { setTrips(await rideApi.myTrips()); } catch {} finally { setLoaded(true); }
  }
  useEffect(() => { load(); }, []);

  const toConfirm = trips.filter((t) => t.cashToConfirm > 0);
  const rest = trips.filter((t) => t.cashToConfirm === 0);

  /**
   * Confirm the cash on a trip the driver has already walked away from.
   *
   * <p>No rider id, which clears everyone still awaiting on that trip — the same behaviour the
   * single-passenger flow always had. Per-passenger confirmation stays on the live trip screen,
   * where the driver can actually see who handed over what.
   */
  async function confirmCash(t: DriverTripItem) {
    Alert.alert(
      `Confirm GH₵ ${t.cashAmount}`,
      t.cashToConfirm > 1
        ? `Mark cash received from all ${t.cashToConfirm} passengers on this trip?`
        : 'Mark that you received this cash payment?',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setConfirming(t.tripId);
            try {
              await rideApi.confirmCash(t.tripId);
              await load();
            } catch (e: any) {
              Alert.alert('Could not confirm', e?.response?.data?.message ?? 'Please try again.');
            } finally { setConfirming(null); }
          },
        },
      ],
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Row style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, gap: 12, marginBottom: 8 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Your trips</Text>
      </Row>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>

        {loaded && trips.length === 0 && <Empty message="No trips yet — accept a job from Home." />}

        {toConfirm.length > 0 && (
          <>
            <Text style={[section(c), { color: c.warning }]}>Cash to confirm</Text>
            {toConfirm.map((t) => (
              <TripCard key={t.tripId} t={t} c={c}
                busy={confirming === t.tripId} onConfirm={() => confirmCash(t)} />
            ))}
          </>
        )}

        {rest.length > 0 && (
          <>
            <Text style={[section(c), { marginTop: toConfirm.length ? 22 : 0 }]}>History</Text>
            {rest.map((t) => <TripCard key={t.tripId} t={t} c={c} />)}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function TripCard({ t, c, busy, onConfirm }: { t: DriverTripItem; c: any; busy?: boolean; onConfirm?: () => void }) {
  const owed = t.cashToConfirm > 0;
  const parcel = t.kind === 'PARCEL';
  const when = fmt(t.completedAt ?? t.createdAt);
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: owed ? c.warning : c.border, padding: 14, marginBottom: 12 }}>
      <Row style={{ gap: 12, alignItems: 'center' }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: owed ? `${c.warning}1A` : c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={parcel ? 'cube' : 'car-sport'} size={20} color={owed ? c.warning : c.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>{parcel ? 'Parcel run' : 'Ride'}</Text>
          <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 2 }}>{when}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: c.text }}>GH₵ {t.fare}</Text>
          <Badge
            label={owed ? 'Cash owed' : t.paymentStatus === 'PAID' ? 'Paid' : t.status.replace(/_/g, ' ')}
            color={owed ? c.warning : t.paymentStatus === 'PAID' ? c.success : c.textMuted} />
        </View>
      </Row>

      {owed && (
        <>
          <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 10, lineHeight: 18 }}>
            {t.cashToConfirm > 1
              ? `${t.cashToConfirm} passengers paid GH₵ ${t.cashAmount} in cash. `
              : `A passenger paid GH₵ ${t.cashAmount} in cash. `}
            They're still waiting for you to confirm it.
          </Text>
          <TouchableOpacity onPress={onConfirm} disabled={busy} activeOpacity={0.9}
            style={{ marginTop: 12, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 12, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14.5 }}>
              {busy ? 'Confirming…' : 'Confirm cash received'}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    + ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const section = (c: any) => ({
  fontSize: 13, fontWeight: '700' as const, color: c.textMuted,
  textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 8,
});
