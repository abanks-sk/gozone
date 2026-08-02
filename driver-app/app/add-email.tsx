import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { useAuthStore } from '../src/store/authStore';
import { useProfileStore } from '../src/store/profileStore';
import { Btn, Row } from '../src/components/ui';

// Adds a login email to a phone-verified driver account:
//   step 1 — enter email + create a password  → a 6-digit code is emailed
//   step 2 — enter that code                  → the email is verified and attached
export default function AddEmailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const startAddEmail = useAuthStore((s) => s.startAddEmail);
  const verifyAddEmail = useAuthStore((s) => s.verifyAddEmail);
  const setProfile = useProfileStore((s) => s.setProfile);

  const [step, setStep] = useState<'details' | 'code'>('details');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return Alert.alert('Invalid email', 'Enter a valid email address.');
    if (password.length < 6) return Alert.alert('Weak password', 'Password must be at least 6 characters.');
    if (password !== confirm) return Alert.alert('Passwords don’t match', 'Re-enter the same password.');
    setBusy(true);
    try {
      await startAddEmail(e, password);
      setStep('code');
    } catch (err: any) {
      Alert.alert('Could not send code', err?.response?.data?.message ?? 'Please try again.');
    } finally { setBusy(false); }
  }

  async function confirmCode() {
    const e = email.trim().toLowerCase();
    if (code.trim().length < 4) return Alert.alert('Enter the code', 'Type the 6-digit code we emailed you.');
    setBusy(true);
    try {
      await verifyAddEmail(e, code.trim());
      setProfile({ email: e });
      Alert.alert('Email verified', 'You can now log in with your email and password.', [
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
            <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Add an email</Text>
          </Row>

          {step === 'details' ? (
            <>
              <Text style={{ fontSize: 13.5, color: c.textMuted, lineHeight: 20, marginBottom: 18 }}>
                Add an email and password so you can also sign in without your phone. We’ll email you a
                6-digit code to confirm it’s yours.
              </Text>

              <Text style={section(c)}>Email address</Text>
              <Field value={email} onChangeText={setEmail} placeholder="you@email.com" icon="mail-outline"
                keyboardType="email-address" autoCapitalize="none" autoComplete="email" c={c} />

              <Text style={section(c)}>Create a password</Text>
              <Field value={password} onChangeText={setPassword} placeholder="At least 6 characters"
                icon="lock-closed-outline" secureTextEntry autoCapitalize="none" c={c} />

              <Text style={section(c)}>Confirm password</Text>
              <Field value={confirm} onChangeText={setConfirm} placeholder="Re-enter password"
                icon="lock-closed-outline" secureTextEntry autoCapitalize="none" c={c} />

              <View style={{ height: 16 }} />
              <Btn label={busy ? 'Sending…' : 'Send verification code'} onPress={sendCode} loading={busy} />
            </>
          ) : (
            <>
              <Text style={{ fontSize: 13.5, color: c.textMuted, lineHeight: 20, marginBottom: 18 }}>
                Enter the 6-digit code we sent to{' '}
                <Text style={{ color: c.text, fontWeight: '700' }}>{email.trim().toLowerCase()}</Text>.
              </Text>

              <Text style={section(c)}>Verification code</Text>
              <Field value={code} onChangeText={(t: string) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="123456" icon="keypad-outline" keyboardType="number-pad" c={c} />

              <View style={{ height: 16 }} />
              <Btn label={busy ? 'Verifying…' : 'Verify email'} onPress={confirmCode} loading={busy} />

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
