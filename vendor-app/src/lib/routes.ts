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
