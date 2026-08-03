import type { Router } from 'expo-router';

// Drivers land on /onboarding, which gates them: ACTIVE drivers are sent straight to
// the feed; PENDING/REJECTED drivers see the setup / awaiting-approval flow.
export function roleHome(_role: string | null): string {
  return '/onboarding';
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
