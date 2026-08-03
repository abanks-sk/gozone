import { useRideDraft } from '../store/rideDraft';
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
    // The draft carries the last rider's pickup and destination. Missed when the other stores
    // were cleared, so a new sign-in inherited somebody else's route.
    useRideDraft.getState().reset(),
    useProfileStore.getState().reset(),
    useRecents.getState().reset(),
    usePaymentStore.getState().reset(),
    useSavedPlaces.getState().reset(),
    useFavourites.getState().reset(),
  ]);
  useShopCart.getState().clear();
}

/**
 * Load the stores that belong to a specific account, once we know who signed in.
 *
 * Recents are kept per user id rather than wiped, so signing back in restores your own search
 * history instead of starting you from nothing every session.
 */
export async function loadUserData(userId: string | null): Promise<void> {
  await useRecents.getState().hydrate(userId);
}
