import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BrandScreen, Logo, PillButton } from '../src/components/brand';
import { brand } from '../src/theme/tokens';

export default function WelcomeScreen() {
  const router = useRouter();

  const soon = (method: string) =>
    Alert.alert(`${method} sign-in`, 'This lands in the next build. Use phone for now.');

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
          Run your{'\n'}business.
        </Text>
        <Text style={{ fontSize: 14, color: brand.textMuted, marginTop: 12, marginBottom: 26, lineHeight: 20 }}>
          Manage your catalogue, orders, and walk-in queue.
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
          label="Continue with Google"
          icon="logo-google"
          variant="outline"
          onPress={() => soon('Google')}
        />

        <Text style={{ fontSize: 11, color: brand.textMuted, textAlign: 'center', marginTop: 22, marginBottom: 8, lineHeight: 16 }}>
          By continuing you agree to our Terms and Privacy Policy.
        </Text>
      </View>
    </BrandScreen>
  );
}
