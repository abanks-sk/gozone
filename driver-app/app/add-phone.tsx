import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuthStore } from '../src/store/authStore';
import { useProfileStore } from '../src/store/profileStore';
import { normalizeGhPhone } from '../src/lib/phone';
import { Btn, Row } from '../src/components/ui';

// Adds or changes the phone number on an account:
//   step 1 — enter the new Ghanaian number → a 6-digit code is texted to it
//   step 2 — enter that code               → the verified number replaces the old one
// The number is only attached after the code checks out, so nobody can move their
// account onto a line they don't control.
export default function AddPhoneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const startAddPhone = useAuthStore((s) => s.startAddPhone);
  const verifyAddPhone = useAuthStore((s) => s.verifyAddPhone);
  const setProfile = useProfileStore((s) => s.setProfile);
  const current = useProfileStore((s) => s.phone);

  const [step, setStep] = useState<'details' | 'code'>('details');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    const e164 = normalizeGhPhone(phone);
    if (!e164) return Alert.alert('Invalid number', 'Enter a valid Ghanaian mobile number (e.g. 024 123 4567).');
    if (e164 === current) return Alert.alert('Same number', 'That is already the number on your account.');
    setBusy(true);
    try {
      await startAddPhone(e164);
      setStep('code');
    } catch (err: any) {
      Alert.alert('Could not send code', err?.response?.data?.message ?? 'Please try again.');
    } finally { setBusy(false); }
  }

  async function confirmCode() {
    const e164 = normalizeGhPhone(phone);
    if (!e164) return;
    if (code.trim().length < 6) return Alert.alert('Enter the code', 'Type the 6-digit code we texted you.');
    setBusy(true);
    try {
      await verifyAddPhone(e164, code.trim());
      setProfile({ phone: e164 });
      Alert.alert('Number verified', `${e164} is now the number on your account.`, [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Verification failed', err?.response?.data?.message ?? 'Check the code and try again.');
    } finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>

          <Row style={{ gap: 12, marginBottom: 18 }}>
            <TouchableOpacity onPress={() => (step === 'code' ? setStep('details') : router.back())} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={26} color={c.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>
              {current ? 'Change your number' : 'Add a phone number'}
            </Text>
          </Row>

          {step === 'details' ? (
            <>
              <Text style={{ fontSize: 13.5, color: c.textMuted, lineHeight: 20, marginBottom: 18 }}>
                {current
                  ? `Your account currently uses ${current}. Enter the new number and we’ll text it a 6-digit code to confirm it’s yours.`
                  : 'Enter your mobile number and we’ll text you a 6-digit code to confirm it’s yours.'}
              </Text>

              <Text style={section(c)}>New phone number</Text>
              <Field value={phone} onChangeText={setPhone} placeholder="024 123 4567" icon="call-outline"
                keyboardType="phone-pad" autoComplete="tel" c={c} />

              <View style={{ height: 16 }} />
              <Btn label={busy ? 'Sending…' : 'Send verification code'} onPress={sendCode} loading={busy} />
            </>
          ) : (
            <>
              <Text style={{ fontSize: 13.5, color: c.textMuted, lineHeight: 20, marginBottom: 18 }}>
                Enter the 6-digit code we sent to{' '}
                <Text style={{ color: c.text, fontWeight: '700' }}>{normalizeGhPhone(phone)}</Text>.
              </Text>

              <Text style={section(c)}>Verification code</Text>
              <Field value={code} onChangeText={(t: string) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="123456" icon="keypad-outline" keyboardType="number-pad" c={c} />

              <View style={{ height: 16 }} />
              <Btn label={busy ? 'Verifying…' : 'Verify number'} onPress={confirmCode} loading={busy} />

              <TouchableOpacity onPress={sendCode} disabled={busy} activeOpacity={0.7} style={{ marginTop: 14, alignItems: 'center' }}>
                <Text style={{ fontSize: 13.5, fontWeight: '600', color: c.primary }}>Resend code</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </View>
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

const section = (c: any) => ({
  fontSize: 13, fontWeight: '700' as const, color: c.textMuted,
  textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 8,
});
