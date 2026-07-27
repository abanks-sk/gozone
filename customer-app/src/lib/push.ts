import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { walletApi } from '../api/wallet';

/**
 * Expo Go cannot do remote push, and finding out is destructive.
 *
 * Since SDK 53 the module throws on Android the moment it is loaded — not when you call it.
 * `DevicePushTokenAutoRegistration.fx.js` runs at import time, so a lazy `await import()` is
 * still too late: the error is raised by the import itself. The only safe move is to never
 * touch the module in Expo Go at all.
 */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Register this device for push notifications.
 *
 * The backend has had a complete push pipeline for a long time — Expo Push with an SMS-stub
 * fallback, and every notification recorded either way. What it never had was a token: nothing in
 * any app called `/wallet/push-token`, so `findByUserId` always came back empty and *every*
 * notification the platform ever tried to send quietly took the fallback path and ended its life
 * as a `[SMS-STUB]` line in the logs. Order ready, driver arrived, payout failed — none of it
 * could reach a phone.
 *
 * Deliberately best-effort. Push is a courtesy layered on top of the app; a device that refuses
 * permission, or Expo Go on a platform that cannot mint a token, must still be able to book a
 * ride. Every failure here is swallowed and logged.
 */
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web' || isExpoGo) return null;
  try {
    const Notifications = await import('expo-notifications');

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return null;

    // Android needs a channel or notifications arrive silently with no heads-up display.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'GoZone',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync();
    if (!token) return null;

    await walletApi.registerPushToken(token);
    return token;
  } catch (e) {
    // Not an error worth surfacing: the in-app notifications list is fed by the same records
    // whether or not a banner ever appears.
    console.log('[push] not registered:', (e as Error)?.message);
    return null;
  }
}

/** Show notifications while the app is in the foreground, instead of dropping them silently. */
export async function configureForegroundPush(): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo) return;
  try {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch { /* not available — in-app list still works */ }
}
