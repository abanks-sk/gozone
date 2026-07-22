import { useProfileStore } from '../store/profileStore';
import { useRecents } from '../store/recentsStore';
import { usePaymentStore } from '../store/paymentStore';
import { useSavedPlaces } from '../store/savedPlacesStore';
import { useFavourites } from '../store/favouritesStore';
import { useShopCart } from '../store/shopCart';

// Wipe every user-scoped store (profile, recents, payment method, cart) so no data
// leaks from one account into the next. Called on logout and before a fresh login so
// a new/returning account never inherits the previous person's identity or history.
export async function clearUserData(): Promise<void> {
  await Promise.all([
    useProfileStore.getState().reset(),
    useRecents.getState().reset(),
    usePaymentStore.getState().reset(),
    useSavedPlaces.getState().reset(),
    useFavourites.getState().reset(),
  ]);
  useShopCart.getState().clear();
}
