import { Platform } from 'react-native';

export interface Coord { lat: number; lng: number }

/** Shape of the expo-location result we care about (the module is require()'d, so untyped). */
type Fix = { coords?: { latitude: number; longitude: number } } | null;

/** Nothing here may hang: a spinner that never stops is worse than "location unavailable". */
const FIX_TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * The device's current position, or null if it can't be had quickly.
 *
 * Web uses the browser Geolocation API; native lazy-loads expo-location (so the app still runs
 * if the dep isn't installed).
 *
 * <p>Two things matter here. First, **it always finishes**: `getCurrentPositionAsync` waits for a
 * GPS fix and, with a cold receiver or indoors — iOS especially — that wait can be effectively
 * forever, which is what left the "use current location" button spinning with nothing happening.
 * Second, **the cached fix comes first**: a position from a moment ago is accurate enough to set
 * a pickup point and returns instantly, so the common case feels immediate instead of costing
 * several seconds.
 */
export async function getCurrentLocation(): Promise<Coord | null> {
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    return new Promise((resolve) => {
      let settled = false;
      const done = (v: Coord | null) => { if (!settled) { settled = true; resolve(v); } };
      navigator.geolocation.getCurrentPosition(
        (p) => done({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => done(null),
        { enableHighAccuracy: true, timeout: FIX_TIMEOUT_MS, maximumAge: 30000 },
      );
      // Belt and braces: some browsers never fire either callback when permission is
      // dismissed rather than denied.
      setTimeout(() => done(null), FIX_TIMEOUT_MS + 500);
    });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Location = require('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    // A recent cached fix is good enough to drop a pin, and it comes back at once.
    const last = (await withTimeout<Fix>(
      Location.getLastKnownPositionAsync({ maxAge: 120000 }), 1500)) as Fix;
    if (last?.coords) {
      return { lat: last.coords.latitude, lng: last.coords.longitude };
    }

    const pos = (await withTimeout<Fix>(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy?.Balanced }), FIX_TIMEOUT_MS)) as Fix;
    if (pos?.coords) {
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }
    return null;
  } catch {
    return null;
  }
}
