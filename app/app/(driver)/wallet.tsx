import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';
import { walletApi, LedgerEntry } from '../../src/api/wallet';
import { Card, Colors, Empty, Row, Section } from '../../src/components/ui';

export default function DriverWalletScreen() {
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const [bal, entries] = await Promise.all([
        walletApi.getBalance('DRIVER'),
        walletApi.getLedger('DRIVER'),
      ]);
      setBalance(bal.balance);
      setLedger(entries);
    } catch {}
  }

  useEffect(() => { load(); }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, paddingTop: 56 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Text style={styles.heading}>Earnings</Text>

      <Card style={styles.balanceCard}>
        <Text style={styles.balLabel}>Available Balance</Text>
        <Text style={styles.bal}>GH₵ {balance !== null ? balance.toFixed(2) : '—'}</Text>
      </Card>

      <Section title="Transaction history">
        {ledger.length === 0
          ? <Empty message="Complete a trip to see earnings" />
          : ledger.map(e => (
            <Row key={e.id} style={styles.row}>
              <Text style={{ flex: 1, color: Colors.text, fontSize: 14 }}>{e.type}</Text>
              <Text style={[styles.amt, e.amount >= 0 ? styles.credit : styles.debit]}>
                {e.amount >= 0 ? '+' : ''}GH₵ {Math.abs(e.amount).toFixed(2)}
              </Text>
            </Row>
          ))
        }
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 24, fontWeight: '800', color: Colors.primary, marginBottom: 16 },
  balanceCard: { backgroundColor: Colors.primaryDark },
  balLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' },
  bal: { fontSize: 34, fontWeight: '800', color: '#fff', marginTop: 4 },
  row: { justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  amt: { fontSize: 15, fontWeight: '700' },
  credit: { color: Colors.primary },
  debit: { color: Colors.danger },
});
