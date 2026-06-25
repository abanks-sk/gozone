import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuthStore } from '../../src/store/authStore';
import { walletApi, LedgerEntry, Notification } from '../../src/api/wallet';
import { Btn, Card, Colors, Divider, Empty, Row, Section } from '../../src/components/ui';

export default function WalletScreen() {
  const { logout } = useAuthStore();
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const [bal, entries, notifs] = await Promise.all([
        walletApi.getBalance('RIDER'),
        walletApi.getLedger('RIDER'),
        walletApi.getNotifications(),
      ]);
      setBalance(bal.balance);
      setLedger(entries);
      setNotifications(notifs);
    } catch {}
  }

  useEffect(() => { load(); }, []);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <Text style={styles.heading}>Wallet</Text>

      <Card style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Balance</Text>
        <Text style={styles.balance}>
          GH₵ {balance !== null ? balance.toFixed(2) : '—'}
        </Text>
      </Card>

      <Section title="Recent transactions">
        {ledger.length === 0
          ? <Empty message="No transactions yet" />
          : ledger.slice(0, 20).map(e => (
            <Row key={e.id} style={styles.entry}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryType}>{e.type}</Text>
                <Text style={styles.entryDate}>{new Date(e.createdAt).toLocaleDateString()}</Text>
              </View>
              <Text style={[styles.entryAmt, e.amount < 0 ? styles.debit : styles.credit]}>
                {e.amount >= 0 ? '+' : ''}GH₵ {Math.abs(e.amount).toFixed(2)}
              </Text>
            </Row>
          ))
        }
      </Section>

      <Divider />

      <Section title="Notifications">
        {notifications.length === 0
          ? <Empty message="No notifications" />
          : notifications.slice(0, 10).map(n => (
            <Card key={n.id} style={styles.notif}>
              <Text style={styles.notifTitle}>{n.title}</Text>
              <Text style={styles.notifBody}>{n.body}</Text>
              <Text style={styles.notifMeta}>{n.channel} · {new Date(n.createdAt).toLocaleString()}</Text>
            </Card>
          ))
        }
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 16, paddingTop: 56 },
  heading: { fontSize: 28, fontWeight: '800', color: Colors.primary, marginBottom: 16 },
  balanceCard: { backgroundColor: Colors.primary, marginBottom: 20 },
  balanceLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' },
  balance: { fontSize: 36, fontWeight: '800', color: '#fff', marginTop: 4 },
  entry: { justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  entryType: { fontSize: 14, fontWeight: '600', color: Colors.text },
  entryDate: { fontSize: 12, color: Colors.muted, marginTop: 2 },
  entryAmt: { fontSize: 16, fontWeight: '700' },
  credit: { color: Colors.primary },
  debit: { color: Colors.danger },
  notif: { marginBottom: 8, padding: 12 },
  notifTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  notifBody: { fontSize: 13, color: Colors.muted, marginTop: 2 },
  notifMeta: { fontSize: 11, color: Colors.border, marginTop: 6 },
});
