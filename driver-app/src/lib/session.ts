import { useDriverStore } from '../store/driverStore';
import { useDriverSetup } from '../store/driverSetupStore';
import { useVehicle } from '../store/vehicleStore';
import { useProfileStore } from '../store/profileStore';

// Wipe every user-scoped store (online/active-trip state, the resumable KYC setup
// draft, vehicle details, account profile) so no data leaks from one driver account
// into the next. Called on logout and before a fresh login.
export async function clearUserData(): Promise<void> {
  await useDriverStore.getState().reset();
  useDriverSetup.getState().clear();
  await useVehicle.getState().reset();
  await useProfileStore.getState().reset();
}
