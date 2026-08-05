import { useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BrandScreen, Logo, PillButton } from '../src/components/brand';
import { brand } from '../src/theme/tokens';
import { useAuthStore } from '../src/store/authStore';
import { roleHome } from '../src/lib/routes';
import { clearUserData, loadUserData } from '../src/lib/session';
import { googleAvailable, googleUnavailableReason, useGoogleIdToken } from '../src/lib/googleAuth';

export default function WelcomeScreen() {
  const router = useRouter();
  const googleSignIn = useAuthStore((s) => s.googleSignIn);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const { idToken, failed, promptAsync } = useGoogleIdToken();
  const [busy, setBusy] = useState(false);

  /**
   * Google hands the ID token back through a redirect, so the exchange runs in an effect rather
   * than inside the button's handler — by the time the token exists, the tap is long over.
   */
  useEffect(() => {
    if (!idToken) return;
    let active = true;
    (async () => {
      setBusy(true);
      try {
        // Same clean-slate rule as the OTP path: whoever used this phone last must not leave
        // their recents, cart or profile behind for the next account.
        await clearUserData();
        const { needsPhone } = await googleSignIn(idToken);
        await loadUserData(useAuthStore.getState().userId);
        await fetchMe();
        if (!active) return;
        // Google proves an email, never a number — and a driver has to be reachable. Anyone
        // without one is sent to add it before they can do anything that needs it.
        if (needsPhone) router.replace('/add-phone' as any);
        else router.replace(roleHome(useAuthStore.getState().role) as any);
      } catch (e: any) {
        Alert.alert('Google sign-in failed', e?.response?.data?.message ?? 'Please try again.');
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => { active = false; };
  }, [idToken]);

  useEffect(() => {
    if (failed) Alert.alert('Google sign-in failed', 'The sign-in was cancelled or refused.');
  }, [failed]);

  function onGoogle() {
    // Says why rather than opening a browser that dead-ends on a Google error page.
    if (!googleAvailable) {
      return Alert.alert('Google sign-in', googleUnavailableReason());
    }
    promptAsync();
  }

  return (
    <BrandScreen>
      {/* No corner glow here: the logo is the focal point, and a second light source
          beside it read as a stray orb rather than as the brand's glow. */}
      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <View style={{ marginTop: 8 }}>
          <Logo size={52} />
        </View>

        <View style={{ flex: 1 }} />

        <Text style={{ fontSize: 34, fontWeight: '800', color: brand.text, lineHeight: 38, letterSpacing: -1 }}>
          Move your{'\n'}city.
        </Text>
        <Text style={{ fontSize: 14, color: brand.textMuted, marginTop: 12, marginBottom: 26, lineHeight: 20 }}>
          Rides, food, and deliveries — one app, one account.
        </Text>

        <PillButton label="Create account" icon="person-add" onPress={() => router.push('/auth/register?mode=signup' as any)} />
        <PillButton
          label="I already have an account"
          icon="log-in"
          variant="outline"
          onPress={() => router.push('/auth/register?mode=login' as any)}
          style={{ marginTop: 12 }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: brand.borderSoft }} />
          <Text style={{ color: brand.textMuted, fontSize: 12 }}>or</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: brand.borderSoft }} />
        </View>

        <PillButton
          label={busy ? 'Signing in…' : 'Continue with Google'}
          icon="logo-google"
          variant="outline"
          disabled={busy}
          onPress={onGoogle}
        />

        <Text style={{ fontSize: 11, color: brand.textMuted, textAlign: 'center', marginTop: 22, marginBottom: 8, lineHeight: 16 }}>
          By continuing you agree to our Terms and Privacy Policy.
        </Text>

        {/* Deliberately before the login wall: an installed build with the wrong backend address
            cannot sign in, so a setting hidden inside the account screens would be unreachable
            precisely when it is needed. */}
        <TouchableOpacity onPress={() => router.push('/server' as any)} activeOpacity={0.7} style={{ marginTop: 2, paddingVertical: 6 }}>
          <Text style={{ fontSize: 11, color: brand.textMuted, textAlign: 'center' }}>Server address</Text>
        </TouchableOpacity>
      </View>
    </BrandScreen>
  );
}
