import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { roleHome } from '../src/lib/routes';
import { BrandScreen, GzHero } from '../src/components/brand';
import { brand } from '../src/theme/tokens';

// Entry route. Shows the splash while tokens hydrate (min ~1.3s for the brand beat),
// then redirects: no session → Welcome, session → role home.
export default function Index() {
  const { accessToken, role, hydrated } = useAuthStore();
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), 1300);
    return () => clearTimeout(t);
  }, []);

  if (!hydrated || !minElapsed) return <Splash />;
  if (!accessToken) return <Redirect href="/welcome" />;
  return <Redirect href={roleHome(role) as any} />;
}

function Splash() {
  return (
    <BrandScreen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <GzHero size={180} />
        <Text style={{ fontSize: 34, fontWeight: '800', color: brand.text, letterSpacing: -1, marginTop: 8 }}>
          GoZone
        </Text>
        <Text style={{ fontSize: 13, color: brand.textMuted, marginTop: 6 }}>Your city, in motion</Text>
      </View>
    </BrandScreen>
  );
}
