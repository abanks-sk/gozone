import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useVendorStore } from '../../src/store/vendorStore';
import { authApi } from '../../src/api/auth';

export default function VendorLayout() {
  const { colors: c } = useTheme();
  // Tab label/icon follow the business type: a pharmacy manages a "Catalogue",
  // a restaurant manages a "Menu".
  const vendorType = useVendorStore((s) => s.vendor?.vendorType ?? 'RESTAURANT');
  const isFood = vendorType === 'RESTAURANT';

  const vendor = useVendorStore((s) => s.vendor);
  const setVendor = useVendorStore((s) => s.setVendor);

  // Pick a business for the whole tab group, not just for Orders.
  //
  // This used to live in orders.tsx alone, so every other tab read a null vendor and quietly did
  // nothing: Catalogue showed "no items yet" and its Add button was completely dead, Queue showed
  // an empty queue. Signing out clears the stored selection, so that was the state after *every*
  // fresh login — open Catalogue first and the app looked broken. Selecting the business is a
  // property of being signed in, not of which tab you happened to visit.
  useEffect(() => {
    if (vendor) return;
    authApi.myVendors()
      .then((list) => { if (list.length) setVendor(list[0]); })
      .catch(() => {});
  }, [vendor?.id]);
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
