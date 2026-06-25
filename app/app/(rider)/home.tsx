import { useState, useEffect, useRef } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { rideApi, Trip } from '../../src/api/ride';
import { wsClient } from '../../src/realtime/wsClient';
import { Btn, Card, Colors, Divider, Input, Row } from '../../src/components/ui';

// Demo coords — Accra, Ghana
const DEMO_ORIGIN = { lat: 5.6052, lng: -0.1674, label: 'Kotoka Airport' };
const DEMO_DEST   = { lat: 5.6120, lng: -0.1950, label: 'Osu, Oxford Street' };

type Phase = 'idle' | 'requested' | 'matched' | 'live' | 'done';

export default function RiderHomeScreen() {
  const router = useRouter();
  const { userId, logout } = useAuthStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [proposedFare, setProposedFare] = useState('30');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [driverLoc, setDriverLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [loading, setLoading] = useState(false);

  // Subscribe to live driver location once matched
  useEffect(() => {
    if (!trip) return;
    wsClient.subscribeToRide(trip.id, loc => {
      setDriverLoc({ lat: loc.lat, lng: loc.lng });
      setIsStale(false);
    });
    const staleTimer = setInterval(() => {
      setIsStale(true);
    }, 6000);
    return () => clearInterval(staleTimer);
  }, [trip?.id]);

  async function requestRide() {
    setLoading(true);
    try {
      const req = await rideApi.createRequest({
        originLat: DEMO_ORIGIN.lat, originLng: DEMO_ORIGIN.lng,
        destLat: DEMO_DEST.lat, destLng: DEMO_DEST.lng,
        proposedFare: parseFloat(proposedFare) || 30,
      });
      setRequestId(req.id);
      setPhase('requested');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not place request');
    } finally {
      setLoading(false);
    }
  }

  async function sos() {
    if (!trip) return;
    await rideApi.sos(trip.id);
    Alert.alert('SOS', 'Emergency logged. Help is on the way.');
  }

  function reset() {
    setPhase('idle');
    setRequestId(null);
    setTrip(null);
    setDriverLoc(null);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Row style={styles.topBar}>
        <Text style={styles.heading}>GoRide</Text>
        <Btn label="Logout" variant="ghost" onPress={logout} style={styles.logoutBtn} />
      </Row>

      {phase === 'idle' && (
        <Card>
          <Text style={styles.label}>From</Text>
          <Text style={styles.place}>{DEMO_ORIGIN.label}</Text>
          <Text style={styles.label}>To</Text>
          <Text style={styles.place}>{DEMO_DEST.label}</Text>
          <Divider />
          <Input
            label="Proposed fare (GH₵)"
            value={proposedFare}
            onChangeText={setProposedFare}
            keyboardType="decimal-pad"
          />
          <Btn label="Request Ride" onPress={requestRide} loading={loading} />
        </Card>
      )}

      {phase === 'requested' && (
        <Card>
          <Text style={styles.status}>Looking for a driver…</Text>
          <Text style={styles.sub}>Request ID: {requestId?.slice(0, 8)}…</Text>
          <Text style={styles.sub}>
            In the demo: log in as a driver and accept this request.
          </Text>
          <Divider />
          <Btn label="Cancel" variant="outline" onPress={reset} />
        </Card>
      )}

      {phase === 'matched' && trip && (
        <Card>
          <Text style={styles.status}>Driver matched!</Text>
          <Text style={styles.sub}>Agreed fare: GH₵ {trip.agreedFare}</Text>
          <Text style={styles.sub}>Status: {trip.status}</Text>
          {driverLoc && (
            <Text style={styles.sub}>
              Driver at: {driverLoc.lat.toFixed(4)}, {driverLoc.lng.toFixed(4)}
              {isStale ? ' (stale)' : ' (live)'}
            </Text>
          )}
          <Divider />
          <Btn label="SOS" variant="danger" onPress={sos} />
          <Btn label="Done" variant="ghost" onPress={reset} style={{ marginTop: 8 }} />
        </Card>
      )}

      {/* Food shortcut */}
      <Card style={{ marginTop: 8 }}>
        <Text style={styles.sectionTitle}>Hungry?</Text>
        <Btn
          label="Order food with GoBite"
          variant="outline"
          onPress={() => router.push('/(rider)/food')}
        />
      </Card>

      {/* Wallet shortcut */}
      <Card>
        <Btn
          label="View Wallet"
          variant="ghost"
          onPress={() => router.push('/(rider)/wallet')}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 16, paddingTop: 56 },
  topBar: { justifyContent: 'space-between', marginBottom: 16 },
  heading: { fontSize: 28, fontWeight: '800', color: Colors.primary },
  logoutBtn: { paddingVertical: 6 },
  label: { fontSize: 11, fontWeight: '600', color: Colors.muted, textTransform: 'uppercase' },
  place: { fontSize: 16, fontWeight: '600', color: Colors.text, marginBottom: 10 },
  status: { fontSize: 20, fontWeight: '700', color: Colors.primary, marginBottom: 6 },
  sub: { fontSize: 14, color: Colors.muted, marginBottom: 4, lineHeight: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 10 },
});
