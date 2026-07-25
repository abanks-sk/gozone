import { useVendorStore } from '../store/vendorStore';
import { useVendorSetup } from '../store/vendorSetupStore';
import { useBusiness } from '../store/businessStore';
import { useProfileStore } from '../store/profileStore';

// Wipe every user-scoped store (the owner's cached account details, selected business +
// open state, the resumable business-setup draft, the editable business profile) so no
// data leaks from one vendor account into the next. Called on logout and before a fresh
// login. (Catalogue now lives in the backend, so nothing local to clear there.)
export async function clearUserData(): Promise<void> {
  await useProfileStore.getState().reset();
  await useVendorStore.getState().reset();
  useVendorSetup.getState().clear();
  await useBusiness.getState().reset();
}
