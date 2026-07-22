import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useVendorStore } from '../../src/store/vendorStore';

export default function VendorLayout() {
  const { colors: c } = useTheme();
  // Tab label/icon follow the business type: a pharmacy manages a "Catalogue",
  // a restaurant manages a "Menu".
  const vendorType = useVendorStore((s) => s.vendor?.vendorType ?? 'RESTAURANT');
  const isFood = vendorType === 'RESTAURANT';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <Ionicons name="receipt" size={size} color={color} /> }} />
      <Tabs.Screen name="queue" options={{ title: 'Queue', tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }} />
      <Tabs.Screen name="menu" options={{ title: isFood ? 'Menu' : 'Catalogue', tabBarIcon: ({ color, size }) => <Ionicons name={isFood ? 'fast-food' : 'pricetags'} size={size} color={color} /> }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: ({ color, size }) => <Ionicons name="wallet" size={size} color={color} /> }} />
    </Tabs>
  );
}
