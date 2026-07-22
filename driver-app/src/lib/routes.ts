// Drivers land on /onboarding, which gates them: ACTIVE drivers are sent straight to
// the feed; PENDING/REJECTED drivers see the setup / awaiting-approval flow.
export function roleHome(_role: string | null): string {
  return '/onboarding';
}
