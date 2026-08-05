import Constants from 'expo-constants';
import { storage } from './storage';

/**
 * The laptop's *current* LAN IP, read live from the Metro dev-server host the phone
 * is already connected to. This auto-adapts whenever the network / IP changes —
 * nothing is hardcoded, so it always follows wherever the dev server actually is.
 * Returns null on web, in a standalone build (there is no dev server), or on loopback.
 */
function devHost(): string | null {
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any).expoGoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  if (!hostUri) return null;
  const host = String(hostUri).split(':')[0];
  return host && host !== 'localhost' && host !== '127.0.0.1' ? host : null;
}

const STORAGE_KEY = 'apiBaseUrl';

/**
 * A backend address the user typed in, loaded once at startup.
 *
 * <p>Held in a module variable rather than read from storage per call because {@link apiBaseUrl}
 * is synchronous and used everywhere — including at module load, before any await could resolve.
 */
let override: string | null = null;

/** Load the saved override. Call once, before the first request. */
export async function hydrateApiBase(): Promise<void> {
  try { override = (await storage.get(STORAGE_KEY)) || null; } catch { override = null; }
}

/** Point the app at a different backend, and remember it across restarts. */
export async function setApiBase(url: string | null): Promise<void> {
  const clean = url?.trim().replace(/\/+$/, '') || null;
  // In memory first, and deliberately outside the try: if persisting fails, the app should still
  // talk to the address the user just entered for the rest of this session rather than refusing
  // to switch at all.
  override = clean;
  if (clean) await storage.set(STORAGE_KEY, clean);
  else await storage.remove(STORAGE_KEY);
}

/** What the user typed, or null when the app is using a default. */
export function apiBaseOverride(): string | null { return override; }

/**
 * Gateway base URL (the API + WebSocket entry point). Priority:
 *  1. A saved override the user entered — the only thing that works in a standalone APK,
 *     and what lets one build move from a laptop's Docker to a hosted backend without
 *     being rebuilt.
 *  2. The laptop's current IP derived from the Expo dev host (Expo Go only; auto-adapts).
 *  3. `EXPO_PUBLIC_API_BASE_URL` baked in at build time.
 *  4. localhost — web, or a last resort.
 *
 * <p>⚠️ On a phone, localhost is the PHONE. A standalone build that reaches step 4 cannot talk
 * to anything, which is exactly what happens if no override is set and none was baked in.
 */
export function apiBaseUrl(): string {
  if (override) return override;
  const host = devHost();
  if (host) return `http://${host}:8080`;
  const baked = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (baked) return baked.replace(/\/+$/, '');
  return 'http://localhost:8080';
}
