import { Tabs } from 'expo-router';
import { Colors } from '../../src/components/ui';

export default function RiderLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: Colors.muted,
      headerShown: false,
    }}>
      <Tabs.Screen name="home"   options={{ title: 'Ride' }} />
      <Tabs.Screen name="food"   options={{ title: 'Food' }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
    </Tabs>
  );
}
