import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider as NavThemeProvider, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { useAuthStore } from '../src/store/authStore';
import { useDriverStore } from '../src/store/driverStore';
import { useDriverSetup } from '../src/store/driverSetupStore';
import { useVehicle } from '../src/store/vehicleStore';
import { useProfileStore } from '../src/store/profileStore';
import '../src/lib/webAlert'; // patches Alert.alert on web (no-op on native)

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrateDriver = useDriverStore((s) => s.hydrate);
  const hydrateSetup = useDriverSetup((s) => s.hydrate);
  const hydrateVehicle = useVehicle((s) => s.hydrate);
  const hydrateProfile = useProfileStore((s) => s.hydrate);

  // Rehydrate stored tokens + driver prefs on cold start. Routing is handled
  // declaratively by app/index.tsx (<Redirect>).
  useEffect(() => { hydrate(); hydrateDriver(); hydrateSetup(); hydrateVehicle(); hydrateProfile(); }, []);

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

  // Drive React Navigation's container theme from our in-app theme so transitions
  // never flash white (the container otherwise follows the OS scheme).
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: c.bg, card: c.bg } };

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = c.bg;
    }
  }, [c.bg]);

  return (
    <NavThemeProvider value={navTheme}>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
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
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="account" />
          <Stack.Screen name="help" />
          <Stack.Screen name="vehicle" />
          <Stack.Screen name="auth/register" />
          <Stack.Screen name="auth/verify-otp" />
          <Stack.Screen name="(driver)" />
        </Stack>
      </View>
    </NavThemeProvider>
  );
}
