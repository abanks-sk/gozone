import { Tabs } from 'expo-router';
import { Colors } from '../../src/components/ui';

export default function DriverLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: Colors.primary,
      headerShown: false,
    }}>
      <Tabs.Screen name="feed"   options={{ title: 'Requests' }} />
      <Tabs.Screen name="trip"   options={{ title: 'Active Trip' }} />
      <Tabs.Screen name="wallet" options={{ title: 'Earnings' }} />
    </Tabs>
  );
}
