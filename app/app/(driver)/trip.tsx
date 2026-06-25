import { useEffect, useRef, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { rideApi, Trip } from '../../src/api/ride';
import { wsClient } from '../../src/realtime/wsClient';
import { Btn, Badge, Card, Colors, Divider, Row, Section } from '../../src/components/ui';

const DEMO_TRIP_ID_KEY = 'gozone:active_trip_id';

const STATUS_FLOW = ['MATCHED', 'ENROUTE', 'STARTED', 'COMPLETED'] as const;

export default function DriverTripScreen() {
  const [tripId, setTripId] = useState<string>('');
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(false);
  const [pushingLoc, setPushingLoc] = useState(false);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Demo GPS waypoints (Airport → Osu)
  const waypoints = [
    { lat: 5.6052, lng: -0.1674 },
    { lat: 5.6060, lng: -0.1720 },
    { lat: 5.6075, lng: -0.1780 },
    { lat: 5.6085, lng: -0.1840 },
    { lat: 5.6092, lng: -0.1900 },
    { lat: 5.6098, lng: -0.1950 },
    { lat: 5.6105, lng: -0.2000 },
    { lat: 5.6110, lng: -0.1980 },
    { lat: 5.6120, lng: -0.1950 },
  ];
  const wpIdxRef = useRef(0);

  async function advanceStatus() {
    if (!trip) return;
    const idx = STATUS_FLOW.indexOf(trip.status as any);
    if (idx === -1 || idx === STATUS_FLOW.length - 1) return;
    const next = STATUS_FLOW[idx + 1];
    setLoading(true);
    try {
      const updated = await rideApi.updateTripStatus(trip.id, next);
      setTrip(updated);
      if (next === 'ENROUTE') startLocationPush();
      if (next === 'COMPLETED') {
        stopLocationPush();
        Alert.alert('Trip complete', 'Wallet settlement sent. Rate the rider!');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Status update failed');
    } finally {
      setLoading(false);
    }
  }

  function startLocationPush() {
    if (locationIntervalRef.current) return;
    setPushingLoc(true);
    locationIntervalRef.current = setInterval(() => {
      const wp = waypoints[wpIdxRef.current % waypoints.length];
      rideApi.pushLocation(wp.lat, wp.lng).catch(() => {});
      wpIdxRef.current++;
    }, 2500);
  }

  function stopLocationPush() {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
    setPushingLoc(false);
    wpIdxRef.current = 0;
  }

  useEffect(() => () => stopLocationPush(), []);

  function nextLabel() {
    if (!trip) return 'Set Trip ID first';
    const idx = STATUS_FLOW.indexOf(trip.status as any);
    if (idx >= STATUS_FLOW.length - 1) return 'Completed';
    return `Advance → ${STATUS_FLOW[idx + 1]}`;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Active Trip</Text>

      <Card>
        <Text style={styles.label}>Trip ID</Text>
        <Text style={styles.hint}>Enter the trip ID shown after accepting a request, then load it.</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn
            label="Load trip"
            onPress={async () => {
              if (!tripId) return Alert.alert('Enter a trip ID');
              try {
                // We can't directly fetch a single trip without adding an endpoint,
                // so we'll simulate by setting a placeholder and letting the driver advance status.
                // In a real build we'd GET /rides/trips/{id}
                setTrip({ id: tripId, driverId: '', agreedFare: 0, status: 'MATCHED' });
              } catch {}
            }}
            style={{ flex: 1 }}
          />
        </View>
      </Card>

      {trip && (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={styles.tripId}>Trip {trip.id.slice(0, 8)}…</Text>
              <Badge label={trip.status} color={trip.status === 'COMPLETED' ? Colors.primary : Colors.accent} />
            </Row>
            {pushingLoc && (
              <Text style={styles.locPushing}>Pushing GPS location…</Text>
            )}
            <Divider />
            <Btn
              label={nextLabel()}
              onPress={advanceStatus}
              loading={loading}
              disabled={trip.status === 'COMPLETED'}
            />
          </Card>

          <Section title="Demo quick-set trip ID">
            <Text style={styles.hint}>
              After accepting a request on the driver feed, the trip ID is returned in the bid response.
              Paste it above and tap Load.
            </Text>
          </Section>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 16, paddingTop: 56 },
  heading: { fontSize: 24, fontWeight: '800', color: Colors.primary, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.muted, textTransform: 'uppercase', marginBottom: 4 },
  hint: { fontSize: 12, color: Colors.muted, lineHeight: 18, marginBottom: 8 },
  tripId: { fontSize: 16, fontWeight: '700', color: Colors.text },
  locPushing: { fontSize: 13, color: Colors.accent, marginTop: 4 },
});
