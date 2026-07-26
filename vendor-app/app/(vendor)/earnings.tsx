import { useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { walletApi, LedgerEntry, Withdrawal } from '../../src/api/wallet';
import { useVendorStore } from '../../src/store/vendorStore';
import { useProfileStore } from '../../src/store/profileStore';
import { useBusiness } from '../../src/store/businessStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { CashOutSheet, withdrawalLook } from '../../src/components/CashOutSheet';
import { Empty, Row } from '../../src/components/ui';

const TYPE_LABEL: Record<string, string> = {
  FARE_CREDIT: 'Order revenue', SALE_CREDIT: 'Order revenue', COMMISSION_DEBIT: 'Platform fee',
  PAYOUT: 'Payout', REFUND: 'Refund', CREDIT: 'Revenue', DEBIT: 'Charge', COMMISSION: 'Platform fee',
};
const labelFor = (t: string) => TYPE_LABEL[t] ?? t.replace(/_/g, ' ').toLowerCase();
type Period = 'today' | 'week' | 'all';
const DAY = 86400000;

export default function VendorEarningsScreen() {
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const vendor = useVendorStore((s) => s.vendor);
  const cardW = Dimensions.get('window').width - 32;
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [payouts, setPayouts] = useState<Withdrawal[]>([]);
  const [period, setPeriod] = useState<Period>('today');
  const [refreshing, setRefreshing] = useState(false);
  const [cashOut, setCashOut] = useState(false);
  const profile = useProfileStore();
  const business = useBusiness();

  async function load() {
    try {
      const [bal, entries, withdrawals] = await Promise.all([
        walletApi.getBalance('RESTAURANT'),
        walletApi.getLedger('RESTAURANT'),
        walletApi.getWithdrawals('RESTAURANT'),
      ]);
      setBalance(bal.balance);
      setLedger(entries);
      setPayouts(withdrawals);
    } catch {}
  }
  useEffect(() => { load(); }, []);

  // Only one payout can be in flight, so say so on the button rather than hitting a 409.
  const openPayout = payouts.find((p) => p.status === 'PENDING' || p.status === 'PROCESSING');

  const since = period === 'today' ? Date.now() - DAY : period === 'week' ? Date.now() - 7 * DAY : 0;
  const inPeriod = useMemo(() => ledger.filter((e) => new Date(e.createdAt).getTime() >= since), [ledger, since]);
  const revenue = inPeriod.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const orders = inPeriod.filter((e) => e.amount > 0).length;
  const fees = Math.abs(inPeriod.filter((e) => e.amount < 0).reduce((s, e) => s + e.amount, 0));

  const days = useMemo(() => {
    const out: { label: string; total: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * DAY);
      const total = ledger.filter((e) => e.amount > 0 && sameDay(new Date(e.createdAt), d)).reduce((s, e) => s + e.amount, 0);
      out.push({ label: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()], total });
    }
    return out;
  }, [ledger]);
  const maxDay = Math.max(1, ...days.map((d) => d.total));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>

        <Text style={{ fontSize: 27, fontWeight: '800', color: c.text, letterSpacing: -0.5 }}>Earnings</Text>
        <Text style={{ fontSize: 13.5, color: c.textMuted, marginBottom: 14 }}>{vendor?.name ?? 'Your business'}</Text>

        <Row style={{ backgroundColor: c.surfaceAlt, borderRadius: 999, padding: 4, marginBottom: 16 }}>
          {(['today', 'week', 'all'] as Period[]).map((p) => {
            const sel = period === p;
            return (
              <TouchableOpacity key={p} onPress={() => setPeriod(p)} activeOpacity={0.85}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 999, backgroundColor: sel ? c.surface : 'transparent', alignItems: 'center', borderWidth: sel ? 1 : 0, borderColor: c.border }}>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: sel ? c.text : c.textMuted }}>{p === 'all' ? 'All time' : p[0].toUpperCase() + p.slice(1)}</Text>
              </TouchableOpacity>
            );
          })}
        </Row>

        <View style={{ height: 172, borderRadius: 24, overflow: 'hidden', marginBottom: 18 }}>
          <Svg width={cardW} height={172} style={{ position: 'absolute' }}>
            <Defs>
              <SvgGradient id="vrev" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#3B82F6" />
                <Stop offset="1" stopColor="#1D4ED8" />
              </SvgGradient>
            </Defs>
            <Rect x="0" y="0" width={cardW} height={172} fill="url(#vrev)" />
          </Svg>
          <View style={{ flex: 1, padding: 20, justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '600' }}>
                Revenue {period === 'today' ? 'today' : period === 'week' ? 'this week' : 'all time'}
              </Text>
              <Text style={{ color: '#fff', fontSize: 38, fontWeight: '800', marginTop: 4 }}>GH₵ {revenue.toFixed(2)}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13, marginTop: 2 }}>Wallet balance: GH₵ {balance != null ? balance.toFixed(2) : '—'}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (openPayout) {
                  return Alert.alert('Payout in progress',
                    `Your GH₵ ${openPayout.amount.toFixed(2)} payout is still being processed. It has to complete first.`);
                }
                if (balance == null || balance <= 0) {
                  return Alert.alert('Nothing to pay out', 'Revenue from completed orders shows up here.');
                }
                setCashOut(true);
              }}
              activeOpacity={0.85}
              style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 }}>
              <Ionicons name={openPayout ? 'time-outline' : 'cash-outline'} size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13.5 }}>
                {openPayout ? 'Payout pending' : 'Request payout'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Row style={{ gap: 12, marginBottom: 18 }}>
          <StatCard icon="receipt" label="Orders" value={String(orders)} c={c} />
          <StatCard icon="remove-circle" label="Platform fees" value={`GH₵ ${fees.toFixed(0)}`} c={c} />
        </Row>

        <Text style={section(c)}>Last 7 days</Text>
        <View style={{ backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 20 }}>
          <Row style={{ alignItems: 'flex-end', justifyContent: 'space-between', height: 110 }}>
            {days.map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <View style={{ width: 18, height: Math.max(4, (d.total / maxDay) * 84), borderRadius: 6, backgroundColor: d.total > 0 ? c.primary : c.border }} />
                <Text style={{ fontSize: 11, color: c.textMuted }}>{d.label}</Text>
              </View>
            ))}
          </Row>
        </View>

        {payouts.length > 0 && (
          <>
            <Text style={section(c)}>Payouts</Text>
            <View style={{ marginBottom: 20 }}>
              {payouts.slice(0, 6).map((p) => {
                const look = withdrawalLook(p.status, c);
                return (
                  <View key={p.id} style={{ backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 14, marginBottom: 8 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: c.text }}>GH₵ {p.amount.toFixed(2)}</Text>
                      <View style={{ backgroundColor: `${look.color}1A`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 11.5, fontWeight: '800', color: look.color }}>{look.label}</Text>
                      </View>
                    </Row>
                    <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 3 }}>
                      {p.method === 'MOMO' ? 'Mobile money' : 'Bank'} · {p.provider} {p.accountNumberMasked} ·{' '}
                      {new Date(p.createdAt).toLocaleDateString()}
                    </Text>
                    {!!p.note && p.status !== 'PAID' && (
                      <Text style={{ fontSize: 12, color: p.status === 'FAILED' ? c.danger : c.textMuted, marginTop: 6, lineHeight: 17 }}>
                        {p.status === 'FAILED' ? p.note : 'Waiting to be sent — GoZone is processing it.'}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        <Text style={section(c)}>Activity</Text>
        {inPeriod.length === 0 ? (
          <Empty message="No revenue in this period yet" />
        ) : (
          inPeriod.slice(0, 30).map((e) => {
            const credit = e.amount >= 0;
            return (
              <Row key={e.id} style={{ gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: credit ? `${c.success}1A` : `${c.danger}1A` }}>
                  <Ionicons name={credit ? 'arrow-down' : 'arrow-up'} size={18} color={credit ? c.success : c.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>{labelFor(e.type)}</Text>
                  <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 1 }}>{new Date(e.createdAt).toLocaleDateString()}</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: credit ? c.success : c.text }}>
                  {credit ? '+' : '−'}GH₵ {Math.abs(e.amount).toFixed(2)}
                </Text>
              </Row>
            );
          })
        )}
      </ScrollView>

      <CashOutSheet
        visible={cashOut}
        onClose={() => setCashOut(false)}
        balance={balance ?? 0}
        ownerType="RESTAURANT"
        defaultName={vendor?.name || profile.name}
        defaultNumber={business.phone || profile.phone}
        onDone={async (w) => {
          await load();
          Alert.alert(
            'Payout requested',
            w.status === 'PROCESSING'
              ? `GH₵ ${w.amount.toFixed(2)} is on its way to your ${w.method === 'MOMO' ? 'mobile money' : 'bank account'}.`
              : `GH₵ ${w.amount.toFixed(2)} has left your balance and is queued to be sent. You'll be notified once it's paid.`
          );
        }}
      />
    </View>
  );
}

function StatCard({ icon, label, value, c }: any) {
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 16 }}>
      <Ionicons name={icon} size={20} color={c.primary} />
      <Text style={{ fontSize: 20, fontWeight: '800', color: c.text, marginTop: 8 }}>{value}</Text>
      <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 1 }}>{label}</Text>
    </View>
  );
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
const section = (c: any) => ({ fontSize: 13, fontWeight: '700' as const, color: c.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 8 });
