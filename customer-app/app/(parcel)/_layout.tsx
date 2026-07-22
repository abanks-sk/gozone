import { Stack } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function ParcelLayout() {
  const { colors: c } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="details" />
      <Stack.Screen name="live" />
    </Stack>
  );
}
