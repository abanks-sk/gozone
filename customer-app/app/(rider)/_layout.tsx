import { Stack } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';

// No bottom tab bar — the passenger home is a single surface. Wallet now lives
// under Profile → Payment, and Food/Parcel are reached via the round buttons.
export default function RiderLayout() {
  const { colors: c } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="home" />
      <Stack.Screen name="live" />
      <Stack.Screen name="rides" />
      <Stack.Screen name="schedule" options={{ animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
