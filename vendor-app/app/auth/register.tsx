import { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { roleHome, goBack } from '../../src/lib/routes';
import { normalizeGhPhone } from '../../src/lib/phone';
import { BrandScreen, GlowOrb, BrandInput, PillButton } from '../../src/components/brand';
import { brand } from '../../src/theme/tokens';

type Channel = 'phone' | 'email';

export default function AuthEntryScreen() {
  const router = useRouter();
  const { mode, ch } = useLocalSearchParams<{ mode?: string; ch?: string }>();
  const isSignup = mode !== 'login';
  const { register, login, loginEmailPassword } = useAuthStore();
  // Sign-up is phone-only (an email is added later in Settings); login supports both.
  const [channel, setChannel] = useState<Channel>(!isSignup && ch === 'email' ? 'email' : 'phone');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const isEmail = !isSignup && channel === 'email';
  const noun = isEmail ? 'email' : 'number';

  async function handleSubmit() {
    // Login with email = email + password → straight in, no OTP.
    if (isEmail) {
      const e = email.trim().toLowerCase();
      if (!e) return Alert.alert('Enter your email');
      if (!password) return Alert.alert('Enter your password');
      setLoading(true);
      try {
        await loginEmailPassword(e, password);
        // Same landing logic as the OTP flow (vendors finish onboarding/approval first).
        router.replace(roleHome(useAuthStore.getState().role) as any);
      } catch (err: any) {
        const status = err?.response?.status;
        Alert.alert(
          status === 403 || status === 401 ? 'Incorrect details' : 'Could not sign in',
          status === 403 || status === 401
            ? 'That email and password don’t match an account.'
            : err?.response?.data?.message ?? 'Please try again.');
      } finally { setLoading(false); }
      return;
    }

    let id = phone.trim();
    if (isSignup && !name.trim()) return Alert.alert('Enter your name');
    if (isSignup && username.trim().length < 3) return Alert.alert('Choose a username', 'Your username must be at least 3 characters.');
    // Same rule the server enforces, so a bad character is caught before the round-trip.
    if (isSignup && !/^[a-z0-9._]{3,30}$/.test(username.trim().toLowerCase()))
      return Alert.alert('Choose a username', 'Use only letters, numbers, dots and underscores.');
    if (!id) return Alert.alert('Enter a phone number');
    // Ghanaian mobile numbers only — validate + canonicalise to +233… before sending.
    const gh = normalizeGhPhone(id);
    if (!gh) return Alert.alert('Invalid number', 'Please enter a valid Ghanaian mobile number, e.g. 024 123 4567.');
    id = gh;
    setLoading(true);
    try {
      if (isSignup) await register(id, 'RESTAURANT_OWNER', name.trim(), username.trim().toLowerCase());
      else await login(id);
      router.push({
        pathname: '/auth/verify-otp',
        params: { channel: 'phone', phone: id, email: '' },
      });
    } catch (e: any) {
      if (!isSignup && e?.response?.status === 404) {
        Alert.alert('No account found', `That ${noun} isn’t registered yet. Create an account to get started.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign up', onPress: () => router.replace(`/auth/register?mode=signup&ch=${channel}` as any) },
        ]);
        return;
      }
      if (isSignup && e?.response?.status === 409) {
        Alert.alert('Account already exists', `That ${noun} already has an account. Log in instead.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log in', onPress: () => router.replace(`/auth/register?mode=login&ch=${channel}` as any) },
        ]);
        return;
      }
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not send the code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <BrandScreen>
      <GlowOrb size={280} style={{ position: 'absolute', top: -80, right: -100 }} />
      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <TouchableOpacity onPress={() => goBack(router, '/welcome')} style={{ marginTop: 4, width: 40 }}>
          <Ionicons name="chevron-back" size={26} color={brand.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: brand.text, letterSpacing: -0.5, marginBottom: 8 }}>
            {isSignup ? 'List your business' : 'Welcome back'}
          </Text>
          <Text style={{ fontSize: 14, color: brand.textMuted, marginBottom: 22, lineHeight: 20 }}>
            {isSignup
              ? 'Start with your name, username and number. You’ll add your business details and get approved next.'
              : isEmail
                ? 'Sign in with the email and password you added in Settings.'
                : 'Enter your number and we’ll send you a 6-digit code.'}
          </Text>

          {/* Login can use phone or email; sign-up is phone-only (add an email later in Settings). */}
          {!isSignup && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
              <ChannelTab label="Phone" icon="call" active={!isEmail} onPress={() => setChannel('phone')} />
              <ChannelTab label="Email" icon="mail" active={isEmail} onPress={() => setChannel('email')} />
            </View>
          )}

          {isSignup && (
            <>
              <BrandInput label="Your name" placeholder="Ama Boateng" value={name} onChangeText={setName} autoCapitalize="words" />
              <BrandInput label="Username" placeholder="amab" value={username} onChangeText={setUsername} autoCapitalize="none" />
            </>
          )}

          {isEmail ? (
            <>
              <BrandInput
                label="Email address"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
              <BrandInput
                label="Password"
                placeholder="Your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </>
          ) : (
            <BrandInput
              label="Phone number"
              placeholder="+233 50 123 4567"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
          )}

          <PillButton
            label={isSignup ? 'Create account' : isEmail ? 'Sign in' : 'Send code'}
            onPress={handleSubmit} loading={loading} style={{ marginTop: 6 }} />

          {/* Only on the email+password path: a phone login has no password to forget. */}
          {isEmail && (
            <TouchableOpacity onPress={() => router.push('/auth/forgot-password' as any)} style={{ marginTop: 14 }}>
              <Text style={{ fontSize: 13.5, color: brand.text, fontWeight: '700', textAlign: 'center' }}>
                Forgot your password?
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={() => router.replace(`/auth/register?mode=${isSignup ? 'login' : 'signup'}&ch=${channel}` as any)} style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 13, color: brand.textMuted, textAlign: 'center' }}>
              {isSignup ? 'Already have an account? Log in' : 'New here? Create an account'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </BrandScreen>
  );
}

function ChannelTab({ label, icon, active, onPress }: { label: string; icon: any; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={{
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
        paddingVertical: 11, borderRadius: 999,
        backgroundColor: active ? '#2563EB' : 'transparent',
        borderWidth: 1, borderColor: active ? '#2563EB' : 'rgba(255,255,255,0.16)',
      }}>
      <Ionicons name={icon} size={16} color={active ? '#fff' : brand.textMuted} />
      <Text style={{ fontSize: 13.5, fontWeight: '700', color: active ? '#fff' : brand.textMuted }}>{label}</Text>
    </TouchableOpacity>
  );
}
