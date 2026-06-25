import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../src/store/authStore';
import { walletApi } from '../src/api/wallet';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const { accessToken, role, hydrate } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  // Rehydrate stored tokens on cold start
  useEffect(() => { hydrate(); }, []);

  // Auth gate: redirect based on token presence and role
  useEffect(() => {
    const inAuth = segments[0] === 'auth';
    if (!accessToken) {
      if (!inAuth) router.replace('/auth/register');
    } else {
      if (inAuth) {
        // Navigate to the correct home based on role
        routeForRole(role, router);
      }
    }
  }, [accessToken, role, segments]);

  // Register push token with backend on mount
  useEffect(() => {
    if (!accessToken) return;
    (async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') return;
        const tokenData = await Notifications.getExpoPushTokenAsync();
        await walletApi.registerPushToken(tokenData.data);
      } catch {
        // Push registration is best-effort
      }
    })();
  }, [accessToken]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="auth/register" />
        <Stack.Screen name="auth/verify-otp" />
        <Stack.Screen name="(rider)" />
        <Stack.Screen name="(driver)" />
        <Stack.Screen name="(food)" />
        <Stack.Screen name="(restaurant)" />
        <Stack.Screen name="(admin)" />
      </Stack>
    </>
  );
}

function routeForRole(role: string | null, router: ReturnType<typeof useRouter>) {
  switch (role) {
    case 'DRIVER':    return router.replace('/(driver)/feed');
    case 'RESTAURANT_OWNER': return router.replace('/(restaurant)/dashboard');
    case 'ADMIN':     return router.replace('/(admin)');
    case 'COURIER':   return router.replace('/(driver)/feed');
    default:          return router.replace('/(rider)/home');
  }
}
