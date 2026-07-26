import { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { walletApi, Withdrawal, WithdrawalMethod } from '../api/wallet';
import { usePayout, MOMO_NETWORKS } from '../store/payoutStore';
import { normalizeGhPhone } from '../lib/phone';
import { Btn, Row } from '../components/ui';

/**
 * Cash out earned money to mobile money or a bank account.
 *
 * The wallet is debited the moment the request goes through, so the sheet closes with the
 * money already held — not "sent". Whether it lands automatically or waits for the payout
 * board is the backend's business; the sheet just reports the status it gets back.
 */
export function CashOutSheet({
  visible, onClose, balance, ownerType, minAmount = 10, onDone, defaultName, defaultNumber,
}: {
  visible: boolean;
  onClose: () => void;
  balance: number;
  ownerType: 'DRIVER' | 'RESTAURANT';
  minAmount?: number;
  onDone: (w: Withdrawal) => void;
  defaultName?: string;
  defaultNumber?: string;
}) {
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const saved = usePayout();
  const savePayout = usePayout((s) => s.save);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<WithdrawalMethod>(saved.method);
  const [provider, setProvider] = useState(saved.provider);
  const [accountNumber, setAccountNumber] = useState(saved.accountNumber);
  const [accountName, setAccountName] = useState(saved.accountName);
  const [busy, setBusy] = useState(false);

  // Open with the remembered destination, falling back to the account's own details so a
  // first-time cash out is mostly pre-filled.
  useEffect(() => {
    if (!visible) return;
    setAmount('');
    setMethod(saved.method);
    setProvider(saved.provider || (saved.method === 'MOMO' ? 'MTN' : ''));
    setAccountNumber(saved.accountNumber || (saved.method === 'MOMO' ? defaultNumber ?? '' : ''));
    setAccountName(saved.accountName || defaultName || '');
  }, [visible]);

  function switchMethod(next: WithdrawalMethod) {
    setMethod(next);
    setProvider(next === 'MOMO' ? saved.provider || 'MTN' : saved.method === 'BANK' ? saved.provider : '');
    if (next === 'MOMO' && !accountNumber) setAccountNumber(defaultNumber ?? '');
  }

  async function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return Alert.alert('Enter an amount', 'How much would you like to cash out?');
    }
    if (value < minAmount) {
      return Alert.alert('Amount too small', `The smallest cash out is GH₵ ${minAmount.toFixed(2)}.`);
    }
    if (value > balance) {
      return Alert.alert('More than your balance', `You have GH₵ ${balance.toFixed(2)} available.`);
    }
    if (!provider.trim()) {
      return Alert.alert(method === 'MOMO' ? 'Choose a network' : 'Enter your bank', 'We need to know where to send it.');
    }
    if (!accountName.trim()) {
      return Alert.alert('Account name', 'Enter the name on the account.');
    }
    // Momo numbers are Ghanaian mobile lines, so validate them like one; bank account
    // numbers are free-form (they vary by bank).
    const number = method === 'MOMO' ? normalizeGhPhone(accountNumber) : accountNumber.trim();
    if (!number) {
      return Alert.alert('Check the number', 'Enter a valid Ghanaian mobile-money number, e.g. 024 123 4567.');
    }

    setBusy(true);
    try {
      const w = await walletApi.requestWithdrawal({
        amount: value, method, provider: provider.trim(), accountName: accountName.trim(),
        accountNumber: number, ownerType,
      });
      savePayout({ method, provider: provider.trim(), accountNumber: number, accountName: accountName.trim() });
      onClose();
      onDone(w);
    } catch (e: any) {
      Alert.alert('Could not cash out', e?.response?.data?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: insets.bottom + 16, maxHeight: '92%' }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>

              <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: c.text }}>Cash out</Text>
                <TouchableOpacity onPress={onClose} activeOpacity={0.7} hitSlop={10}>
                  <Ionicons name="close" size={24} color={c.textMuted} />
                </TouchableOpacity>
              </Row>
              <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 18 }}>
                GH₵ {balance.toFixed(2)} available · smallest cash out GH₵ {minAmount.toFixed(2)}
              </Text>

              {/* Amount */}
              <Text style={label(c)}>Amount</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, marginBottom: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: c.textMuted }}>GH₵</Text>
                <TextInput
                  value={amount}
                  onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  placeholderTextColor={c.textMuted}
                  keyboardType="decimal-pad"
                  style={{ flex: 1, paddingVertical: 14, color: c.text, fontSize: 18, fontWeight: '700' }}
                />
                <TouchableOpacity onPress={() => setAmount(balance.toFixed(2))} activeOpacity={0.8}
                  style={{ backgroundColor: c.primarySoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ color: c.primary, fontWeight: '700', fontSize: 12.5 }}>All</Text>
                </TouchableOpacity>
              </View>

              {/* Destination type */}
              <Text style={label(c)}>Send to</Text>
              <Row style={{ backgroundColor: c.surfaceAlt, borderRadius: 999, padding: 4, marginBottom: 14 }}>
                {(['MOMO', 'BANK'] as WithdrawalMethod[]).map((m) => {
                  const sel = method === m;
                  return (
                    <TouchableOpacity key={m} onPress={() => switchMethod(m)} activeOpacity={0.85}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: 'center', backgroundColor: sel ? c.surface : 'transparent', borderWidth: sel ? 1 : 0, borderColor: c.border }}>
                      <Text style={{ fontSize: 13.5, fontWeight: '700', color: sel ? c.text : c.textMuted }}>
                        {m === 'MOMO' ? 'Mobile money' : 'Bank account'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </Row>

              {method === 'MOMO' ? (
                <>
                  <Text style={label(c)}>Network</Text>
                  <Row style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    {MOMO_NETWORKS.map((n) => {
                      const sel = provider === n.code;
                      return (
                        <TouchableOpacity key={n.code} onPress={() => setProvider(n.code)} activeOpacity={0.85}
                          style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: sel ? c.primarySoft : c.surfaceAlt, borderWidth: 1.5, borderColor: sel ? c.primary : 'transparent' }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? c.primary : c.text }}>{n.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </Row>

                  <Text style={label(c)}>Mobile money number</Text>
                  <Field value={accountNumber} onChangeText={setAccountNumber} placeholder="024 123 4567"
                    icon="phone-portrait-outline" keyboardType="phone-pad" c={c} />
                </>
              ) : (
                <>
                  <Text style={label(c)}>Bank</Text>
                  <Field value={provider} onChangeText={setProvider} placeholder="e.g. GCB Bank"
                    icon="business-outline" c={c} />

                  <Text style={label(c)}>Account number</Text>
                  <Field value={accountNumber} onChangeText={setAccountNumber} placeholder="Account number"
                    icon="card-outline" keyboardType="number-pad" c={c} />
                </>
              )}

              <Text style={label(c)}>Account name</Text>
              <Field value={accountName} onChangeText={setAccountName} placeholder="Name on the account"
                icon="person-outline" c={c} />

              <View style={{ flexDirection: 'row', gap: 8, backgroundColor: c.surfaceAlt, borderRadius: 14, padding: 12, marginTop: 4, marginBottom: 16 }}>
                <Ionicons name="information-circle-outline" size={17} color={c.textMuted} />
                <Text style={{ flex: 1, fontSize: 12.5, color: c.textMuted, lineHeight: 18 }}>
                  The amount leaves your balance straight away and is sent to this account. If it
                  can't be completed, it comes back to your wallet.
                </Text>
              </View>

              <Btn label={busy ? 'Requesting…' : 'Cash out'} onPress={submit} loading={busy} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function Field({ icon, c, ...props }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, marginBottom: 14 }}>
      <Ionicons name={icon} size={17} color={c.textMuted} />
      <TextInput {...props} placeholderTextColor={c.textMuted} style={{ flex: 1, paddingVertical: 14, color: c.text, fontSize: 15 }} />
    </View>
  );
}

const label = (c: any) => ({
  fontSize: 12.5, fontWeight: '700' as const, color: c.textMuted,
  textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 8,
});

/** Status pill colour + wording shared by the payout history lists. */
export function withdrawalLook(status: string, c: any): { label: string; color: string } {
  switch (status) {
    case 'PAID':       return { label: 'Paid', color: c.success };
    case 'PROCESSING': return { label: 'Sending', color: c.primary };
    case 'FAILED':     return { label: 'Failed', color: c.danger };
    default:           return { label: 'Pending', color: c.warning };
  }
}
