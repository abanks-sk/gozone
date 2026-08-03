import type { Router } from 'expo-router';

// Vendors land straight in the app.
//
// This used to return '/onboarding', which gated the entire product behind approval: an
// unapproved owner was parked on a full-screen "awaiting approval" page whose only control was
// Log out — they could not reach their profile, add an email or correct a detail while they
// waited, which is precisely when they would want to. The tabs are now always reachable and
// `VendorGate` explains the state on the operational ones, matching the driver app.
export function roleHome(_role: string | null): string {
  return '/(vendor)/orders';
}

/**
 * Go back, or go somewhere sensible when there is nothing to go back to.
 *
 * `router.back()` is a silent no-op on an empty history — the button simply does nothing, which is
 * what was reported on the driver sign-up code screen. A screen can end up as the only entry in the
 * stack more easily than it looks: a `replace` earlier in the flow, a deep link, or a Metro reload
 * while sitting on it. The fallback makes the control always do something.
 */
export function goBack(router: Router, fallback: string) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}
