// The passenger app only hosts the passenger (consumer) experience.
// Drivers, couriers and restaurants use their own dedicated apps, so every
// signed-in session here lands on the passenger home.
export function roleHome(_role: string | null): string {
  return '/(rider)/home';
}
