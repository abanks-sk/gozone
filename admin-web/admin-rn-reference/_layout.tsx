import { Stack } from 'expo-router';
import { Colors } from '../../src/components/ui';

export default function AdminLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: Colors.primaryDark },
      headerTintColor: '#fff',
    }}>
      <Stack.Screen name="index" options={{ title: 'Admin' }} />
    </Stack>
  );
}
