import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

// Closes the popup/tab and hands the result back once Google redirects. Safe to call at module
// load; it is a no-op off web.
WebBrowser.maybeCompleteAuthSession();

/**
 * The OAuth client ID this build signs in with, or null when it hasn't been configured.
 *
 * <p>Read from `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (customer-app/.env, gitignored). A client ID is
 * public by design — it identifies the app, it does not authorise anything. The client *secret*
 * is the sensitive half, and this flow never uses one: the app obtains an ID token from Google
 * and auth-service verifies it with Google directly.
 */
export const GOOGLE_WEB_CLIENT_ID: string | null =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || null;

/**
 * Can Google sign-in actually complete on this build?
 *
 * <p>False in Expo Go on a phone, and that is not a configuration problem to be fixed by adding
 * more client IDs. Google refuses `exp://` redirect URIs, and Expo's hosted auth proxy — the old
 * way round it — was removed after SDK 48. So the honest answer on native-in-Expo-Go is "not
 * here", and the button says so instead of opening a browser that dead-ends on a Google error
 * page. A dev/standalone build with the Android and iOS client IDs registered lifts this.
 */
export const googleAvailable = Platform.OS === 'web' && !!GOOGLE_WEB_CLIENT_ID;

/** Why it isn't available, in words a user can act on. */
export function googleUnavailableReason(): string {
  if (!GOOGLE_WEB_CLIENT_ID) {
    return 'Google sign-in isn’t configured for this build yet.';
  }
  return 'Google sign-in needs the installed GoZone app — it can’t complete inside Expo Go. Use your phone number for now.';
}

/**
 * Hook wrapping Google's ID-token flow.
 *
 * <p>`useIdTokenAuthRequest` rather than the access-token variant on purpose: an ID token is a
 * signed assertion of *who* the user is, which is the only thing the backend wants. An access
 * token would mean asking Google for the profile ourselves and trusting our own round trip.
 */
export function useGoogleIdToken() {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID ?? undefined,
  });

  const idToken =
    response?.type === 'success'
      ? ((response.params as Record<string, string> | undefined)?.id_token ?? null)
      : null;

  const failed = response?.type === 'error';

  return { ready: !!request, idToken, failed, promptAsync };
}
