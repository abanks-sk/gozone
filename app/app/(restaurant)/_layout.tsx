import { Stack } from 'expo-router';
import { Colors } from '../../src/components/ui';

export default function RestaurantLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: Colors.primary },
      headerTintColor: '#fff',
    }}>
      <Stack.Screen name="dashboard" options={{ title: 'Restaurant Dashboard' }} />
    </Stack>
  );
}
