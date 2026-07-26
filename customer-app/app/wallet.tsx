import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Linking, Modal, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { walletApi, LedgerEntry, Notification } from '../src/api/wallet';
import { apiBaseUrl } from '../src/lib/host';
import { useTheme } from '../src/theme/ThemeProvider';
import { usePaymentStore, PAY_METHODS, PayMethodMeta } from '../src/store/paymentStore';
import { Empty, Row } from '../src/components/ui';

function cardBrand(digits: string): string {
  if (digits.startsWith('4')) return 'Visa';
  if (digits.startsWith('5')) return 'Mastercard';
  if (digits.startsWith('3')) return 'Amex';
  return 'Card';
}

const TYPE_LABEL: Record<string, string> = {
  PAYMENT: 'Paid', DELIVERY_FEE: 'Delivery fee', CASH_COLLECTED: 'Cash collected',
  FARE_CREDIT: 'Ride credit', COMMISSION_DEBIT: 'Commission', PAYOUT: 'Payout',
  TOP_UP: 'Top up', REFUND: 'Refund', CREDIT: 'Credit', DEBIT: 'Debit', COMMISSION: 'Commission',
};
const labelFor = (t: string) => TYPE_LABEL[t] ?? t.replace(/_/g, ' ').toLowerCase();

export default function PaymentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const cardW = Dimensions.get('window').width - 32;
  const selected = usePaymentStore((s) => s.selected);
  const setSelected = usePaymentStore((s) => s.setSelected);
  const cards = usePaymentStore((s) => s.cards);
  const addCard = usePaymentStore((s) => s.addCard);
  const removeCard = usePaymentStore((s) => s.removeCard);
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [num, setNum] = useState('');
  const [exp, setExp] = useState('');
  const [holder, setHolder] = useState('');
  // Top-up (Paystack) flow state
  const [topUp, setTopUp] = useState(false);
  const [topAmt, setTopAmt] = useState('');
  const [topRef, setTopRef] = useState<string | null>(null);
  const [topBusy, setTopBusy] = useState(false);
  const [momoOpen, setMomoOpen] = useState(false);
  const [momoNum, setMomoNum] = useState('');

  const methods: PayMethodMeta[] = [...PAY_METHODS, ...cards];

  function submitCard() {
    const digits = num.replace(/\D/g, '');
    if (digits.length < 13) return Alert.alert('Card number', 'Enter a valid card number.');
    if (!/^\d{2}\/\d{2}$/.test(exp.trim())) return Alert.alert('Expiry', 'Enter the expiry as MM/YY.');
    addCard({
      key: `card_${Date.now()}`,
      label: holder.trim() ? `${cardBrand(digits)} · ${holder.trim()}` : cardBrand(digits),
      sub: `•••• ${digits.slice(-4)}`,
      icon: 'card-outline',
    });
    setNum(''); setExp(''); setHolder(''); setAdding(false);
  }

  // Add a mobile-money number as a Paystack-routed method.
  function submitMomo() {
    const digits = momoNum.replace(/\D/g, '');
    if (digits.length < 9) return Alert.alert('Mobile money', 'Enter a valid mobile money number.');
    addCard({
      key: `momo_${Date.now()}`,
      label: 'Mobile Money',
      sub: `•••• ${digits.slice(-4)}`,
      icon: 'phone-portrait-outline',
    });
    setMomoNum(''); setMomoOpen(false);
  }

  function confirmRemoveCard(m: PayMethodMeta) {
    Alert.alert('Remove card', `Remove ${m.label} (${m.sub})?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeCard(m.key) },
    ]);
  }

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

  function openTopUp() { setTopAmt(''); setTopRef(null); setTopUp(true); }

  // Step 1: create the Paystack transaction and open its checkout page.
  async function startTopUp() {
    const amount = Number(topAmt);
    if (!amount || amount <= 0) return Alert.alert('Amount', 'Enter an amount greater than 0.');
    setTopBusy(true);
    try {
      const { reference, authorizationUrl } = await walletApi.initializeTopUp(amount);
      const url = authorizationUrl.startsWith('http') ? authorizationUrl : `${apiBaseUrl()}${authorizationUrl}`;
      setTopRef(reference);
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert('Top-up', e?.response?.data?.message ?? 'Could not start the top-up. Please try again.');
    } finally { setTopBusy(false); }
  }

  // Step 2: after paying, verify the reference server-side to credit the wallet.
  async function verifyTopUp() {
    const amount = Number(topAmt);
    if (!topRef) return;
    setTopBusy(true);
    try {
      const { balance: newBal } = await walletApi.verifyTopUp(amount, topRef);
      setBalance(newBal);
      setTopUp(false);
      await load();
      Alert.alert('Wallet funded', `GH₵ ${amount.toFixed(2)} added to your wallet.`);
    } catch (e: any) {
      Alert.alert('Not yet confirmed', e?.response?.data?.message ?? 'Could not verify the payment yet. If you completed it, tap Verify again.');
    } finally { setTopBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>

        {/* Header */}
        <Row style={{ gap: 12, marginBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color={c.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Payment</Text>
        </Row>

        {/* Balance card */}
        <View style={{ height: 168, borderRadius: 24, overflow: 'hidden', marginBottom: 22 }}>
          <Svg width={cardW} height={168} style={{ position: 'absolute' }}>
            <Defs>
              <SvgGradient id="wbal" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#3B82F6" />
                <Stop offset="1" stopColor="#1D4ED8" />
              </SvgGradient>
            </Defs>
            <Rect x="0" y="0" width={cardW} height={168} fill="url(#wbal)" />
          </Svg>
          <View style={{ flex: 1, padding: 20, justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' }}>Available balance</Text>
              <Text style={{ color: '#fff', fontSize: 38, fontWeight: '800', marginTop: 4 }}>
                GH₵ {balance !== null ? balance.toFixed(2) : '—'}
              </Text>
            </View>
            <Row style={{ gap: 10 }}>
              <CardBtn icon="add" label="Add money" onPress={openTopUp} />
            </Row>
          </View>
        </View>

        {/* Payment methods */}
        <Text style={section(c)}>Payment method</Text>
        <View style={{ gap: 10, marginBottom: 8 }}>
          {methods.map((m) => {
            const sel = selected === m.key;
            const custom = m.key.startsWith('card_') || m.key.startsWith('momo_');
            return (
              <TouchableOpacity key={m.key} onPress={() => setSelected(m.key)} activeOpacity={0.85}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, backgroundColor: sel ? c.primarySoft : c.surface, borderWidth: 1.5, borderColor: sel ? c.primary : c.border }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? c.primary : c.surfaceAlt }}>
                  <Ionicons name={m.icon as any} size={20} color={sel ? '#fff' : c.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>{m.label}</Text>
                  <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 1 }}>{m.sub}</Text>
                </View>
                {custom && (
                  <TouchableOpacity onPress={() => confirmRemoveCard(m)} hitSlop={8} style={{ marginRight: 2 }}>
                    <Ionicons name="trash-outline" size={18} color={c.danger} />
                  </TouchableOpacity>
                )}
                <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={22} color={sel ? c.primary : c.textMuted} />
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={() => setMomoOpen(true)} activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 4 }}>
            <Ionicons name="add-circle-outline" size={20} color={c.primary} />
            <Text style={{ fontSize: 14.5, fontWeight: '600', color: c.primary }}>Add mobile money</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAdding(true)} activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 4 }}>
            <Ionicons name="add-circle-outline" size={20} color={c.primary} />
            <Text style={{ fontSize: 14.5, fontWeight: '600', color: c.primary }}>Add debit / credit card</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 11.5, color: c.textMuted, paddingHorizontal: 4, marginTop: 2 }}>
            Cards and mobile money are charged securely via Paystack.
          </Text>
        </View>

        {/* Transactions */}
        <Text style={[section(c), { marginTop: 16 }]}>Transactions</Text>
        {ledger.length === 0 ? (
          <Empty message="No transactions yet" />
        ) : (
          ledger.slice(0, 20).map((e) => {
            const credit = e.amount >= 0;
            return (
              <Row key={e.id} style={{ gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: credit ? `${c.success}1A` : `${c.danger}1A` }}>
                  <Ionicons name={credit ? 'arrow-down' : 'arrow-up'} size={18} color={credit ? c.success : c.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: c.text, textTransform: 'capitalize' }}>{labelFor(e.type)}</Text>
                  <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 1 }}>{new Date(e.createdAt).toLocaleDateString()}</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: credit ? c.success : c.text }}>
                  {credit ? '+' : '−'}GH₵ {Math.abs(e.amount).toFixed(2)}
                </Text>
              </Row>
            );
          })
        )}

        {/* Notifications */}
        <Text style={[section(c), { marginTop: 24 }]}>Notifications</Text>
        {notifications.length === 0 ? (
          <Empty message="No notifications" />
        ) : (
          notifications.slice(0, 10).map((n) => (
            <View key={n.id} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="notifications" size={17} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{n.title}</Text>
                <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 1 }}>{n.body}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>{n.channel} · {new Date(n.createdAt).toLocaleString()}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add card modal */}
      <Modal visible={adding} transparent animationType="slide" onRequestClose={() => setAdding(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: insets.bottom + 20, gap: 14 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 19, fontWeight: '800', color: c.text }}>Add a card</Text>
              <TouchableOpacity onPress={() => setAdding(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={c.textMuted} />
              </TouchableOpacity>
            </Row>

            <Field label="Card number" value={num} onChangeText={setNum} placeholder="1234 5678 9012 3456" keyboardType="number-pad" c={c} />
            <Row style={{ gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Expiry (MM/YY)" value={exp} onChangeText={setExp} placeholder="08/27" keyboardType="numbers-and-punctuation" c={c} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Name on card" value={holder} onChangeText={setHolder} placeholder="A. Mensah" c={c} />
              </View>
            </Row>

            <Text style={{ fontSize: 11.5, color: c.textMuted, lineHeight: 17 }}>
              Demo only — cards are stored on your device and not charged (no real payment provider yet).
            </Text>
            <TouchableOpacity onPress={submitCard} activeOpacity={0.9}
              style={{ backgroundColor: c.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Add card</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Top-up (Paystack) modal */}
      <Modal visible={topUp} transparent animationType="slide" onRequestClose={() => setTopUp(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: insets.bottom + 20, gap: 14 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 19, fontWeight: '800', color: c.text }}>Add money</Text>
              <TouchableOpacity onPress={() => setTopUp(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={c.textMuted} />
              </TouchableOpacity>
            </Row>

            <Field label="Amount (GH₵)" value={topAmt} onChangeText={(t: string) => setTopAmt(t.replace(/[^0-9.]/g, ''))} placeholder="50" keyboardType="decimal-pad" c={c} />
            <Row style={{ gap: 8 }}>
              {[20, 50, 100, 200].map((v) => (
                <TouchableOpacity key={v} onPress={() => setTopAmt(String(v))} activeOpacity={0.8}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: c.text }}>{v}</Text>
                </TouchableOpacity>
              ))}
            </Row>

            {!topRef ? (
              <>
                <Text style={{ fontSize: 11.5, color: c.textMuted, lineHeight: 17 }}>
                  You’ll be taken to the secure Paystack checkout to pay. Come back and tap Verify to fund your wallet.
                </Text>
                <TouchableOpacity onPress={startTopUp} disabled={topBusy} activeOpacity={0.9}
                  style={{ backgroundColor: c.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center', opacity: topBusy ? 0.6 : 1 }}>
                  {topBusy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Continue to payment</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Row style={{ gap: 8, alignItems: 'center', backgroundColor: `${c.primary}12`, borderRadius: 12, padding: 12 }}>
                  <Ionicons name="information-circle" size={18} color={c.primary} />
                  <Text style={{ flex: 1, fontSize: 12.5, color: c.text }}>Finish paying in the browser, then tap Verify to credit your wallet.</Text>
                </Row>
                <TouchableOpacity onPress={verifyTopUp} disabled={topBusy} activeOpacity={0.9}
                  style={{ backgroundColor: c.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center', opacity: topBusy ? 0.6 : 1 }}>
                  {topBusy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Verify top-up</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={startTopUp} disabled={topBusy} activeOpacity={0.7} style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: c.textMuted }}>Reopen checkout</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Add mobile money modal */}
      <Modal visible={momoOpen} transparent animationType="slide" onRequestClose={() => setMomoOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: insets.bottom + 20, gap: 14 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 19, fontWeight: '800', color: c.text }}>Add mobile money</Text>
              <TouchableOpacity onPress={() => setMomoOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={c.textMuted} />
              </TouchableOpacity>
            </Row>
            <Field label="Mobile money number" value={momoNum} onChangeText={setMomoNum} placeholder="024 123 4567" keyboardType="phone-pad" c={c} />
            <Text style={{ fontSize: 11.5, color: c.textMuted, lineHeight: 17 }}>
              You’ll approve each payment on the secure Paystack checkout — your number isn’t charged without consent.
            </Text>
            <TouchableOpacity onPress={submitMomo} activeOpacity={0.9}
              style={{ backgroundColor: c.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Add mobile money</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, c }: any) {
  return (
    <View>
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.textMuted, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.textMuted}
        keyboardType={keyboardType}
        style={{ backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: c.text }}
      />
    </View>
  );
}

function CardBtn({ icon, label, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 }}>
      <Ionicons name={icon} size={16} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );
}

const section = (c: any) => ({ fontSize: 13, fontWeight: '700' as const, color: c.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 8 });
