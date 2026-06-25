import { Stack } from 'expo-router';
import { Colors } from '../../src/components/ui';

export default function FoodLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: Colors.primary },
      headerTintColor: '#fff',
    }}>
      <Stack.Screen name="restaurants" options={{ title: 'GoBite' }} />
      <Stack.Screen name="menu"        options={{ title: 'Menu' }} />
      <Stack.Screen name="order"       options={{ title: 'Your Order' }} />
    </Stack>
  );
}
