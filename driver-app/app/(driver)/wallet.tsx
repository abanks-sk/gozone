import { useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, Linking, Modal, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { walletApi, LedgerEntry, Withdrawal } from '../../src/api/wallet';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useProfileStore } from '../../src/store/profileStore';
import { CashOutSheet, withdrawalLook } from '../../src/components/CashOutSheet';
import { Empty, Row, Btn } from '../../src/components/ui';
import { apiBaseUrl } from '../../src/lib/host';

const TYPE_LABEL: Record<string, string> = {
  DELIVERY_FEE: 'Delivery earning', CASH_COLLECTED: 'Cash you collected', PAYMENT: 'Payment',
  FARE_CREDIT: 'Trip earning', COMMISSION_DEBIT: 'Platform fee', PAYOUT: 'Cash out',
  TOP_UP: 'Top up', REFUND: 'Refund', CREDIT: 'Earning', DEBIT: 'Charge', COMMISSION: 'Platform fee',
};
const labelFor = (t: string) => TYPE_LABEL[t] ?? t.replace(/_/g, ' ').toLowerCase();

type Period = 'today' | 'week' | 'all';
const DAY = 86400000;

export default function DriverEarningsScreen() {
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const cardW = Dimensions.get('window').width - 32;
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [payouts, setPayouts] = useState<Withdrawal[]>([]);
  const [period, setPeriod] = useState<Period>('today');
  const [refreshing, setRefreshing] = useState(false);
  const [cashOut, setCashOut] = useState(false);
  const [payIn, setPayIn] = useState(false);
  const [payAmt, setPayAmt] = useState('');
  const [payRef, setPayRef] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const profile = useProfileStore();

  async function load() {
    try {
      const [bal, entries, withdrawals] = await Promise.all([
        walletApi.getBalance('DRIVER'),
        walletApi.getLedger('DRIVER'),
        walletApi.getWithdrawals('DRIVER'),
      ]);
      setBalance(bal.balance);
      setLedger(entries);
      setPayouts(withdrawals);
    } catch {}
  }
  useEffect(() => { load(); }, []);

  // A payout in flight blocks another one, so say so on the button instead of letting
  // the driver hit a 409.
  const openPayout = payouts.find((p) => p.status === 'PENDING' || p.status === 'PROCESSING');

  // A negative balance means cash they collected on GoZone's behalf and haven't paid in yet.
  // Until it's cleared they can't take new cash jobs or cash out, so it needs to be the loudest
  // thing on the screen — not a minus sign buried in the balance line.
  const owed = balance != null && balance < 0 ? Math.abs(balance) : 0;

  // Step 1: open Paystack for the amount owed.
  async function startPayIn() {
    const amount = Number(payAmt);
    if (!amount || amount <= 0) return Alert.alert('Amount', 'Enter an amount greater than 0.');
    setPayBusy(true);
    try {
      const { reference, authorizationUrl } = await walletApi.initializeTopUp(amount);
      const url = authorizationUrl.startsWith('http') ? authorizationUrl : `${apiBaseUrl()}${authorizationUrl}`;
      setPayRef(reference);
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert('Pay in', e?.response?.data?.message ?? 'Could not start the payment. Please try again.');
    } finally { setPayBusy(false); }
  }

  // Step 2: verify server-side, which credits the DRIVER wallet and clears the debt.
  async function verifyPayIn() {
    const amount = Number(payAmt);
    if (!payRef) return;
    setPayBusy(true);
    try {
      await walletApi.verifyTopUp(amount, payRef);
      setPayIn(false);
      setPayRef(null);
      await load();
      Alert.alert('Received', `GH₵ ${amount.toFixed(2)} paid in. Thanks!`);
    } catch (e: any) {
      Alert.alert('Not yet confirmed', e?.response?.data?.message ?? 'If you completed the payment, tap Verify again.');
    } finally { setPayBusy(false); }
  }

  const since = period === 'today' ? Date.now() - DAY : period === 'week' ? Date.now() - 7 * DAY : 0;
  const inPeriod = useMemo(() => ledger.filter((e) => new Date(e.createdAt).getTime() >= since), [ledger, since]);
  const earned = inPeriod.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const trips = inPeriod.filter((e) => e.amount > 0).length;
  const avg = trips > 0 ? earned / trips : 0;

  // Last 7 days bar chart (positive earnings per day).
  const days = useMemo(() => {
    const out: { label: string; total: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * DAY);
      const total = ledger
        .filter((e) => e.amount > 0 && sameDay(new Date(e.createdAt), d))
        .reduce((s, e) => s + e.amount, 0);
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

        <Text style={{ fontSize: 27, fontWeight: '800', color: c.text, letterSpacing: -0.5, marginBottom: 14 }}>Earnings</Text>

        {/* Period selector */}
        <Row style={{ backgroundColor: c.surfaceAlt, borderRadius: 999, padding: 4, marginBottom: 16 }}>
          {(['today', 'week', 'all'] as Period[]).map((p) => {
            const sel = period === p;
            return (
              <TouchableOpacity key={p} onPress={() => setPeriod(p)} activeOpacity={0.85}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 999, backgroundColor: sel ? c.surface : 'transparent', alignItems: 'center', borderWidth: sel ? 1 : 0, borderColor: c.border }}>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: sel ? c.text : c.textMuted, textTransform: 'capitalize' }}>{p === 'all' ? 'All time' : p}</Text>
              </TouchableOpacity>
            );
          })}
        </Row>

        {/* Cash owed — the one thing that blocks working, so it sits above everything else. */}
        {owed > 0 && (
          <View style={{ backgroundColor: `${c.danger}14`, borderColor: c.danger, borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 16 }}>
            <Row style={{ gap: 10 }}>
              <Ionicons name="alert-circle" size={20} color={c.danger} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: c.danger }}>
                You owe GoZone GH₵ {owed.toFixed(2)}
              </Text>
            </Row>
            <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 8, lineHeight: 19 }}>
              This is cash you collected from customers on GoZone's behalf. Pay it in to take cash
              orders again — prepaid orders are unaffected, so you can keep earning meanwhile.
            </Text>
            <TouchableOpacity onPress={() => { setPayAmt(owed.toFixed(2)); setPayRef(null); setPayIn(true); }} activeOpacity={0.9}
              style={{ marginTop: 12, backgroundColor: c.danger, borderRadius: 999, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14.5 }}>Pay in GH₵ {owed.toFixed(2)}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Earnings hero */}
        <View style={{ height: 172, borderRadius: 24, overflow: 'hidden', marginBottom: 18 }}>
          <Svg width={cardW} height={172} style={{ position: 'absolute' }}>
            <Defs>
              <SvgGradient id="earn" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#1E9E5A" />
                <Stop offset="1" stopColor="#0E5530" />
              </SvgGradient>
            </Defs>
            <Rect x="0" y="0" width={cardW} height={172} fill="url(#earn)" />
          </Svg>
          <View style={{ flex: 1, padding: 20, justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '600' }}>
                Earned {period === 'today' ? 'today' : period === 'week' ? 'this week' : 'all time'}
              </Text>
              <Text style={{ color: '#fff', fontSize: 38, fontWeight: '800', marginTop: 4 }}>GH₵ {earned.toFixed(2)}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13, marginTop: 2 }}>
                Wallet balance: GH₵ {balance != null ? balance.toFixed(2) : '—'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (openPayout) {
                  return Alert.alert('Cash out in progress',
                    `Your GH₵ ${openPayout.amount.toFixed(2)} payout is still being processed. It has to complete first.`);
                }
                if (balance == null || balance <= 0) {
                  return Alert.alert('Nothing to cash out', 'Complete some trips and your earnings will show up here.');
                }
                setCashOut(true);
              }}
              activeOpacity={0.85}
              style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 }}>
              <Ionicons name={openPayout ? 'time-outline' : 'cash-outline'} size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13.5 }}>
                {openPayout ? 'Cash out pending' : 'Cash out'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <Row style={{ gap: 12, marginBottom: 18 }}>
          <StatCard icon="car-sport" label="Trips" value={String(trips)} c={c} />
          <StatCard icon="trending-up" label="Avg / trip" value={`GH₵ ${avg.toFixed(0)}`} c={c} />
        </Row>

        {/* 7-day chart */}
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

        {/* Cash outs */}
        {payouts.length > 0 && (
          <>
            <Text style={section(c)}>Cash outs</Text>
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

        {/* Transactions */}
        <Text style={section(c)}>Activity</Text>
        {inPeriod.length === 0 ? (
          <Empty message="No earnings in this period yet" />
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

      {/* Pay in what's owed — Paystack, credited straight to the courier's own wallet. */}
      <Modal visible={payIn} transparent animationType="slide" onRequestClose={() => setPayIn(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: insets.bottom + 20 }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: c.text }}>Pay in cash collected</Text>
              <TouchableOpacity onPress={() => setPayIn(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={c.textMuted} />
              </TouchableOpacity>
            </Row>
            <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 16, lineHeight: 19 }}>
              {payRef
                ? 'Once you have completed the payment, tap Verify to clear it against your balance.'
                : `You are holding GH₵ ${owed.toFixed(2)} of GoZone's money. Pay it in by mobile money or card.`}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: c.textMuted }}>GH₵</Text>
              <TextInput
                value={payAmt}
                onChangeText={(t) => setPayAmt(t.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                placeholderTextColor={c.textMuted}
                keyboardType="decimal-pad"
                editable={!payRef}
                style={{ flex: 1, paddingVertical: 14, color: c.text, fontSize: 18, fontWeight: '700' }}
              />
            </View>

            {payRef ? (
              <Btn label={payBusy ? 'Verifying…' : 'Verify payment'} onPress={verifyPayIn} loading={payBusy} />
            ) : (
              <Btn label={payBusy ? 'Opening…' : 'Pay now'} onPress={startPayIn} loading={payBusy} />
            )}
          </View>
        </View>
      </Modal>

      <CashOutSheet
        visible={cashOut}
        onClose={() => setCashOut(false)}
        balance={balance ?? 0}
        ownerType="DRIVER"
        defaultName={profile.name}
        defaultNumber={profile.phone}
        onDone={async (w) => {
          await load();
          Alert.alert(
            'Cash out requested',
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
