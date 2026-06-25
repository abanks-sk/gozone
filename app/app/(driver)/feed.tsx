import { useCallback, useState } from 'react';
import {
  Alert, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { rideApi, RideRequest } from '../../src/api/ride';
import { Btn, Badge, Card, Colors, Divider, Empty, Row } from '../../src/components/ui';

// Demo driver position — Kotoka Airport
const MY_LAT = 5.6052;
const MY_LNG = -0.1674;

export default function DriverFeedScreen() {
  const router = useRouter();
  const { logout } = useAuthStore();
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);

  async function fetchNearby() {
    setLoading(true);
    try {
      const data = await rideApi.nearbyRequests(MY_LAT, MY_LNG, 10);
      setRequests(data);
    } catch (e: any) {
      Alert.alert('Error', 'Could not fetch requests');
    } finally {
      setLoading(false);
    }
  }

  async function accept(req: RideRequest) {
    try {
      const bid = await rideApi.placeBid(req.id, 'ACCEPT', req.proposedFare);
      if (bid.tripId) {
        Alert.alert('Matched!', `Trip created. Go to Active Trip tab.`);
        setActiveTripId(bid.tripId);
        setRequests(prev => prev.filter(r => r.id !== req.id));
        router.push('/(driver)/trip');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not accept');
    }
  }

  async function counter(req: RideRequest) {
    Alert.prompt(
      'Counter bid',
      `Rider proposed GH₵ ${req.proposedFare}. Enter your price:`,
      async (value) => {
        const amt = parseFloat(value);
        if (isNaN(amt) || amt <= 0) return;
        try {
          await rideApi.placeBid(req.id, 'COUNTER', amt);
          Alert.alert('Counter sent', `Your bid of GH₵ ${amt} is pending rider acceptance.`);
        } catch (e: any) {
          Alert.alert('Error', e?.response?.data?.message ?? 'Could not counter');
        }
      },
      'plain-text',
      req.proposedFare.toString(),
    );
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNearby();
    setRefreshing(false);
  }, []);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Row style={styles.topBar}>
        <Text style={styles.heading}>Nearby Requests</Text>
        <Btn label="Logout" variant="ghost" onPress={logout} style={{ paddingVertical: 6 }} />
      </Row>

      <Btn
        label="Refresh feed"
        onPress={fetchNearby}
        loading={loading}
        variant="outline"
        style={{ marginBottom: 12 }}
      />

      {requests.length === 0
        ? <Empty message="No requests nearby. Pull to refresh." />
        : requests.map(req => (
          <Card key={req.id}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <Badge label={`${req.seats} seat${req.seats > 1 ? 's' : ''}`} />
              <Text style={styles.fare}>GH₵ {req.proposedFare}</Text>
            </Row>
            <Text style={styles.coords}>
              From: {req.originLat.toFixed(4)}, {req.originLng.toFixed(4)}
            </Text>
            <Text style={styles.coords}>
              To: {req.destLat.toFixed(4)}, {req.destLng.toFixed(4)}
            </Text>
            <Divider />
            <Row style={{ gap: 8 }}>
              <Btn
                label="Accept"
                onPress={() => accept(req)}
                style={{ flex: 1 }}
              />
              <Btn
                label="Counter"
                variant="outline"
                onPress={() => counter(req)}
                style={{ flex: 1 }}
              />
            </Row>
          </Card>
        ))
      }
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 16, paddingTop: 56 },
  topBar: { justifyContent: 'space-between', marginBottom: 16 },
  heading: { fontSize: 24, fontWeight: '800', color: Colors.primary },
  fare: { fontSize: 20, fontWeight: '800', color: Colors.accent },
  coords: { fontSize: 13, color: Colors.muted, marginBottom: 2 },
});
