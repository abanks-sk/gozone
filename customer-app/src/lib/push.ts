import { Platform } from 'react-native';
import { walletApi } from '../api/wallet';

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
  try {
    // Loaded lazily: importing expo-notifications at module scope has crashed startup in Expo Go
    // before, and this must never be on the path between opening the app and using it.
    const Notifications = await import('expo-notifications');

    // Push tokens are a physical-device feature; simulators cannot mint one.
    if (Platform.OS === 'web') return null;

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
    // Expo Go on SDK 53+ cannot always issue a token, and that is not an error worth surfacing:
    // the in-app notifications list still fills in from the same records.
    console.log('[push] not registered:', (e as Error)?.message);
    return null;
  }
}

/** Show notifications while the app is in the foreground, instead of dropping them silently. */
export async function configureForegroundPush(): Promise<void> {
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
