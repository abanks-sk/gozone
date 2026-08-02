import { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { registerForPush } from '../../src/lib/push';
import { useProfileStore } from '../../src/store/profileStore';
import { clearUserData } from '../../src/lib/session';
import { roleHome } from '../../src/lib/routes';
import { BrandScreen, GlowOrb, BrandInput, PillButton } from '../../src/components/brand';
import { brand } from '../../src/theme/tokens';

export default function VerifyOtpScreen() {
  const { phone, email, channel, name, username } = useLocalSearchParams<{ phone?: string; email?: string; channel?: string; name?: string; username?: string }>();
  const router = useRouter();
  const { verifyOtp, verifyEmailOtp, fetchMe } = useAuthStore();
  const setProfile = useProfileStore((s) => s.setProfile);
  const setFromServer = useProfileStore((s) => s.setFromServer);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const isEmail = channel === 'email';
  const target = isEmail ? (email ?? '') : (phone ?? '');

  async function handleVerify() {
    if (code.length !== 6) return Alert.alert('Enter the 6-digit code');
    setLoading(true);
    try {
      if (isEmail) await verifyEmailOtp(target, code);
      else await verifyOtp(target, code);
      // Start from a clean slate so no previous account's data (recents, cart, profile)
      // bleeds into this session, then seed this user's own profile from the server —
      // the same call works for sign-up and login, since sign-up already sent the
      // name/username to /auth/register.
      await clearUserData();
      const contact = isEmail ? { email: target } : { phone: target };
      const me = await fetchMe();
      if (me.name || me.phone || me.email) {
        setFromServer(me);
      } else {
        // /auth/me didn't answer (offline?) — fall back to what we know locally so the
        // app isn't nameless; the account screen refreshes from the server on open.
        setProfile({ name: name ?? '', ...(username ? { username } : {}), ...contact });
      }
      // Register this device for push now that we have a session — the token is stored against
      // the signed-in user. Not awaited: a permission prompt must not hold up the sign-in.
      registerForPush();
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
      <GlowOrb size={280} style={{ position: 'absolute', top: -80, right: -90 }} />
      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 4, width: 40 }}>
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
        </View>
      </View>
    </BrandScreen>
  );
}
