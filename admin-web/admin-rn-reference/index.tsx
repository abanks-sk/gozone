import { useEffect, useState } from 'react';
import {
  Alert, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import api from '../../src/api/client';
import { useAuthStore } from '../../src/store/authStore';
import { Btn, Card, Colors, Divider, Empty, Row, Section } from '../../src/components/ui';

interface KycItem {
  id: string;
  userId: string;
  licenceNo: string;
  vehicleReg: string;
  status: string;
  docUrl: string;
}

export default function AdminScreen() {
  const { logout } = useAuthStore();
  const [pendingKyc, setPendingKyc] = useState<KycItem[]>([]);
  const [stats, setStats] = useState({ pendingKyc: 0, totalUsers: 0 });
  const [refreshing, setRefreshing] = useState(false);

  async function loadKyc() {
    try {
      // Admin endpoint: GET /auth/driver/kyc?status=PENDING
      const res = await api.get<KycItem[]>('/auth/driver/kyc?status=PENDING');
      setPendingKyc(res.data);
      setStats(prev => ({ ...prev, pendingKyc: res.data.length }));
    } catch (e: any) {
      if (e?.response?.status !== 404) {
        // silently ignore — endpoint may not be fully wired
        setPendingKyc([]);
      }
    }
  }

  useEffect(() => { loadKyc(); }, []);

  async function reviewKyc(id: string, action: 'VERIFIED' | 'REJECTED') {
    try {
      await api.patch(`/auth/driver/kyc/${id}`, { status: action });
      Alert.alert('Done', `KYC ${action}`);
      await loadKyc();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed');
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadKyc(); setRefreshing(false); }} />}
    >
      <Row style={styles.topBar}>
        <Text style={styles.heading}>Admin</Text>
        <Btn label="Logout" variant="ghost" onPress={logout} style={{ paddingVertical: 6 }} />
      </Row>

      {/* Stats */}
      <Row style={{ gap: 12, marginBottom: 16 }}>
        <Card style={styles.statCard}>
          <Text style={styles.statNum}>{stats.pendingKyc}</Text>
          <Text style={styles.statLabel}>Pending KYC</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statNum}>—</Text>
          <Text style={styles.statLabel}>Active Trips</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statNum}>—</Text>
          <Text style={styles.statLabel}>Live Orders</Text>
        </Card>
      </Row>

      {/* KYC review queue */}
      <Section title="Driver KYC review">
        {pendingKyc.length === 0
          ? (
            <Card>
              <Text style={styles.meta}>No pending KYC submissions.</Text>
              <Text style={styles.meta}>
                (Demo: register as a DRIVER, submit KYC via POST /auth/driver/kyc, then refresh here.)
              </Text>
            </Card>
          )
          : pendingKyc.map(kyc => (
            <Card key={kyc.id}>
              <Text style={styles.kycDriver}>Driver: {kyc.userId.slice(0, 8)}…</Text>
              <Text style={styles.kycDetail}>Licence: {kyc.licenceNo}</Text>
              <Text style={styles.kycDetail}>Vehicle: {kyc.vehicleReg}</Text>
              {kyc.docUrl
                ? <Text style={styles.kycDetail}>Doc: {kyc.docUrl}</Text>
                : null}
              <Divider />
              <Row style={{ gap: 8 }}>
                <Btn
                  label="Approve"
                  onPress={() => reviewKyc(kyc.id, 'VERIFIED')}
                  style={{ flex: 1 }}
                />
                <Btn
                  label="Reject"
                  variant="danger"
                  onPress={() => reviewKyc(kyc.id, 'REJECTED')}
                  style={{ flex: 1 }}
                />
              </Row>
            </Card>
          ))
        }
      </Section>

      {/* Incident list stub */}
      <Section title="Incidents">
        <Card>
          <Text style={styles.meta}>SOS events and trip incidents are logged server-side.</Text>
          <Text style={styles.meta}>
            Check ride-service logs for [SOS-STUB] entries.
          </Text>
        </Card>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topBar: { justifyContent: 'space-between', marginBottom: 16 },
  heading: { fontSize: 26, fontWeight: '800', color: Colors.primaryDark },
  statCard: { flex: 1, alignItems: 'center', padding: 12 },
  statNum: { fontSize: 28, fontWeight: '800', color: Colors.primary },
  statLabel: { fontSize: 11, color: Colors.muted, textAlign: 'center', marginTop: 2 },
  meta: { fontSize: 13, color: Colors.muted, lineHeight: 20, marginBottom: 4 },
  kycDriver: { fontSize: 15, fontWeight: '700', color: Colors.text },
  kycDetail: { fontSize: 13, color: Colors.muted, marginTop: 2 },
});
