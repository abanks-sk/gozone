import { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { goBack } from '../../src/lib/routes';
import { BrandScreen, GlowOrb, BrandInput, PillButton } from '../../src/components/brand';
import { brand } from '../../src/theme/tokens';

/**
 * Reset a forgotten password.
 *
 * <p>One screen, two steps, because they are one task: asking for a code and typing it in are not
 * two things a person has decided to do. Splitting them across routes also loses the email on the
 * way, and re-typing it is the step where people give up.
 *
 * <p>Note what step one does <em>not</em> tell you. The server answers identically whether or not
 * the address has an account, so this screen cannot say "no account with that email" — that would
 * turn a reset form into a way to find out who has a GoZone account. The message is deliberately
 * about what was sent, not about what exists.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { forgotPassword, resetPassword } = useAuthStore();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendCode() {
    const e = email.trim().toLowerCase();
    if (!e) return Alert.alert('Enter your email');
    setLoading(true);
    try {
      await forgotPassword(e);
      setStep('code');
    } catch (err: any) {
      Alert.alert('Could not send the code', err?.response?.data?.message ?? 'Please try again.');
    } finally { setLoading(false); }
  }

  async function submit() {
    if (code.trim().length !== 6) return Alert.alert('Enter the 6-digit code');
    if (password.length < 6) return Alert.alert('Choose a password', 'At least 6 characters.');
    // Checked here as well as on the server: a typo in a password you cannot see is the one
    // mistake that locks you out of the account you were trying to get back into.
    if (password !== confirm) return Alert.alert('Passwords don’t match', 'Please type the same password twice.');
    setLoading(true);
    try {
      await resetPassword(email.trim().toLowerCase(), code.trim(), password);
      Alert.alert('Password updated', 'You’ve been signed out everywhere. Sign in with your new password.', [
        { text: 'Sign in', onPress: () => router.replace('/auth/register?mode=login&ch=email' as any) },
      ]);
    } catch (err: any) {
      Alert.alert('Could not reset', err?.response?.data?.message ?? 'Please try again.');
    } finally { setLoading(false); }
  }

  return (
    <BrandScreen>
      <GlowOrb />
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 26 }}>
        {/* Back out of step two to step one rather than off the screen — the email is already
            typed, and losing it is the point at which people abandon a reset. */}
        <TouchableOpacity onPress={() => (step === 'code' ? setStep('email') : goBack(router, '/auth/register?mode=login&ch=email'))}
          activeOpacity={0.7} style={{ position: 'absolute', top: 8, left: 20 }}>
          <Ionicons name="chevron-back" size={28} color={brand.text} />
        </TouchableOpacity>

        <Text style={{ fontSize: 28, fontWeight: '800', color: brand.text, marginBottom: 6 }}>
          {step === 'email' ? 'Reset your password' : 'Check your email'}
        </Text>
        <Text style={{ fontSize: 14.5, color: brand.textMuted, marginBottom: 26, lineHeight: 21 }}>
          {step === 'email'
            ? 'Enter the email on your account and we’ll send you a six-digit code.'
            : `If ${email.trim().toLowerCase()} has an account with a password, a code is on its way. Enter it below with your new password.`}
        </Text>

        {step === 'email' ? (
          <>
            <BrandInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <View style={{ height: 18 }} />
            <PillButton label={loading ? 'Sending…' : 'Send code'} onPress={sendCode} disabled={loading} />
          </>
        ) : (
          <>
            <BrandInput
              label="6-digit code"
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              keyboardType="number-pad"
              maxLength={6}
            />
            <View style={{ height: 14 }} />
            <BrandInput
              label="New password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry
              autoCapitalize="none"
            />
            <View style={{ height: 14 }} />
            <BrandInput
              label="Confirm new password"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Type it again"
              secureTextEntry
              autoCapitalize="none"
            />
            <View style={{ height: 18 }} />
            <PillButton label={loading ? 'Updating…' : 'Set new password'} onPress={submit} disabled={loading} />
            <TouchableOpacity onPress={sendCode} disabled={loading} activeOpacity={0.7} style={{ marginTop: 16 }}>
              <Text style={{ color: brand.textMuted, fontSize: 13.5, textAlign: 'center' }}>
                Didn’t get it? <Text style={{ color: brand.text, fontWeight: '700' }}>Send another code</Text>
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </BrandScreen>
  );
}
