import Constants from 'expo-constants';

/**
 * The laptop's *current* LAN IP, read live from the Metro dev-server host the phone
 * is already connected to. This auto-adapts whenever the network / IP changes —
 * nothing is hardcoded, so it always follows wherever the dev server actually is.
 * Returns null on web (or when the host is loopback), where a fixed URL is used instead.
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

/**
 * Gateway base URL (the API + WebSocket entry point on :8080). Priority:
 *  1. On a device: the laptop's current IP derived from the Expo host (auto-adapts).
 *  2. An explicit `expo.extra.apiBaseUrl` override, if one is set (for real builds).
 *  3. localhost — web, or a last resort.
 * Note: only the *host* is taken from Expo; the port is always the gateway's 8080,
 * independent of whatever port Metro happens to run on.
 */
export function apiBaseUrl(): string {
  const host = devHost();
  if (host) return `http://${host}:8080`;
  const override = (Constants.expoConfig?.extra as any)?.apiBaseUrl as string | undefined;
  return override ?? 'http://localhost:8080';
}
