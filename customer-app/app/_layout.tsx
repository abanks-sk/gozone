import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider as NavThemeProvider, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { KeyboardAvoider } from '../src/components/KeyboardAvoider';
import { useAuthStore } from '../src/store/authStore';
import { configureForegroundPush, registerForPush } from '../src/lib/push';
import { usePaymentStore } from '../src/store/paymentStore';
import { useProfileStore } from '../src/store/profileStore';
import { useRecents } from '../src/store/recentsStore';
import { useSavedPlaces } from '../src/store/savedPlacesStore';
import { useFavourites } from '../src/store/favouritesStore';
import '../src/lib/webAlert'; // patches Alert.alert on web (no-op on native)

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydratePayment = usePaymentStore((s) => s.hydrate);
  const hydrateProfile = useProfileStore((s) => s.hydrate);
  const hydrateRecents = useRecents((s) => s.hydrate);
  const hydrateSaved = useSavedPlaces((s) => s.hydrate);
  const hydrateFavs = useFavourites((s) => s.hydrate);

  // Rehydrate stored tokens + local prefs on cold start. Routing is handled
  // declaratively by app/index.tsx (<Redirect>).
  //
  // Auth is awaited before recents because recents are stored per account: until the token has
  // been read there is no user id to look them up under, and loading them unkeyed would show a
  // signed-in user an empty history on every cold start.
  useEffect(() => {
    hydratePayment(); hydrateProfile(); hydrateSaved(); hydrateFavs();
    hydrate().then(() => hydrateRecents(useAuthStore.getState().userId));
  }, []);

  // Push: show notifications that arrive while the app is open, and make sure a device that is
  // already signed in has a token registered (verify-otp only covers a fresh sign-in, and until
  // now nobody registered at all — see src/lib/push.ts).
  useEffect(() => {
    configureForegroundPush();
    if (useAuthStore.getState().accessToken) registerForPush();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedStack />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function ThemedStack() {
  const { scheme, colors: c } = useTheme();

  // The white flash on navigation came from React Navigation's *container* theme
  // (which follows the OS scheme, not our in-app theme) painting white during the
  // transition. Drive the nav theme background from our own theme instead.
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: c.bg, card: c.bg } };

  // On web the page <body> behind the root also flashes white on route changes.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = c.bg;
    }
  }, [c.bg]);

  return (
    <NavThemeProvider value={navTheme}>
      {/* One keyboard handler for the whole app. It shifts by the measured overlap, so screens
          whose fields already clear the keyboard (a map with a search bar on top) never move. */}
      <KeyboardAvoider style={{ backgroundColor: c.bg }}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: c.bg },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="welcome" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="account" />
          <Stack.Screen name="add-email" />
          <Stack.Screen name="add-phone" />
          <Stack.Screen name="about" />
          <Stack.Screen name="help" />
          <Stack.Screen name="terms" />
          <Stack.Screen name="privacy" />
          <Stack.Screen name="wallet" />
          <Stack.Screen name="saved-places" />
          <Stack.Screen name="search" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="map-picker" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="auth/register" />
          <Stack.Screen name="auth/verify-otp" />
          <Stack.Screen name="(rider)" />
          <Stack.Screen name="(shop)" />
          <Stack.Screen name="(parcel)" />
        </Stack>
      </KeyboardAvoider>
    </NavThemeProvider>
  );
}
