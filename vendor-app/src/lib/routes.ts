// Vendors land on /onboarding, which gates them: ACTIVE owners go to the orders board;
// PENDING/REJECTED owners see the business-setup / awaiting-approval flow.
export function roleHome(_role: string | null): string {
  return '/onboarding';
}
