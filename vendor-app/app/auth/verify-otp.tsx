import { useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { useProfileStore } from '../../src/store/profileStore';
import { clearUserData } from '../../src/lib/session';
import { roleHome, goBack } from '../../src/lib/routes';
import { BrandScreen, GlowOrb, BrandInput, PillButton } from '../../src/components/brand';
import { brand } from '../../src/theme/tokens';

/** How long before a fresh code can be requested. */
const RESEND_AFTER_SECONDS = 30;

export default function VerifyOtpScreen() {
  const { phone, email, channel } = useLocalSearchParams<{ phone?: string; email?: string; channel?: string }>();
  const router = useRouter();
  const { verifyOtp, verifyEmailOtp, fetchMe, login, loginEmail } = useAuthStore();
  const setProfile = useProfileStore((s) => s.setProfile);
  const setFromServer = useProfileStore((s) => s.setFromServer);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  // Codes go astray — a dropped SMS used to leave the only way forward as backing out and
  // starting the whole sign-up again. Offer another one, but not instantly: a resend re-issues a
  // code and invalidates the one in flight, so an impatient double-tap would break a code that
  // was about to arrive.
  const [wait, setWait] = useState(RESEND_AFTER_SECONDS);

  const isEmail = channel === 'email';
  const target = isEmail ? (email ?? '') : (phone ?? '');

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function handleResend() {
    if (wait > 0 || resending) return;
    setResending(true);
    try {
      // /auth/register already created the account before sending the first code, so by the time
      // anyone is on this screen the number exists and the login path can issue another one —
      // that holds for sign-up and sign-in alike.
      if (isEmail) await loginEmail(target);
      else await login(target);
      setWait(RESEND_AFTER_SECONDS);
      setCode('');
      Alert.alert('Code sent', `We sent a new code to ${target}.`);
    } catch (e: any) {
      Alert.alert('Could not resend', e?.response?.data?.message ?? 'Please try again.');
    } finally {
      setResending(false);
    }
  }

  async function handleVerify() {
    if (code.length !== 6) return Alert.alert('Enter the 6-digit code');
    setLoading(true);
    try {
      if (isEmail) await verifyEmailOtp(target, code);
      else await verifyOtp(target, code);
      // Start clean so no previous vendor's business selection / onboarding draft bleeds in.
      await clearUserData();
      // Seed the owner's own account details from the server (sign-up already sent the
      // name to /auth/register, so one call covers both sign-up and login).
      const me = await fetchMe();
      if (me.name || me.phone || me.email) setFromServer(me);
      else setProfile(isEmail ? { email: target } : { phone: target }); // offline fallback
      const newRole = useAuthStore.getState().role;
      router.replace(roleHome(newRole) as any);
    } catch (e: any) {
      Alert.alert('Invalid code', e?.response?.data?.message ?? 'Try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <BrandScreen>
      <GlowOrb size={280} style={{ position: 'absolute', top: -80, left: -90 }} />
      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <TouchableOpacity onPress={() => goBack(router, '/welcome')} style={{ marginTop: 4, width: 40 }}>
          <Ionicons name="chevron-back" size={26} color={brand.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: brand.text, letterSpacing: -0.5, marginBottom: 8 }}>
            Enter the code
          </Text>
          <Text style={{ fontSize: 14, color: brand.textMuted, marginBottom: 26, lineHeight: 20 }}>
            We sent a 6-digit code to {target}. Enter it below to continue.
          </Text>

          <BrandInput
            label="6-digit code"
            placeholder="123456"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
          />

          <PillButton label="Verify" onPress={handleVerify} loading={loading} style={{ marginTop: 6 }} />

          <TouchableOpacity
            onPress={handleResend}
            disabled={wait > 0 || resending}
            activeOpacity={0.7}
            style={{ marginTop: 18, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: wait > 0 ? brand.textMuted : brand.primary }}>
              {resending ? 'Sending…' : wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </BrandScreen>
  );
}
