import { Stack } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function FoodLayout() {
  const { colors: c } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="restaurants" />
      <Stack.Screen name="menu" />
      <Stack.Screen name="orders" />
      <Stack.Screen name="filter" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="address" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="item" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="checkout" />
      <Stack.Screen name="order" />
    </Stack>
  );
}
