import { create } from 'zustand';

export type SortKey = 'recommended' | 'nearest' | 'rating' | 'fastest';

interface FoodFilterState {
  sort: SortKey;
  openNow: boolean;
  freeDelivery: boolean;
  favouritesOnly: boolean;
  category: string; // cuisine category ('All' = no filter)
  setSort: (s: SortKey) => void;
  setOpenNow: (v: boolean) => void;
  setFreeDelivery: (v: boolean) => void;
  setFavouritesOnly: (v: boolean) => void;
  setCategory: (v: string) => void;
  reset: () => void;
}

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'nearest', label: 'Nearest first' },
  { key: 'rating', label: 'Top rated' },
  { key: 'fastest', label: 'Fastest delivery' },
];

export const useShopFilter = create<FoodFilterState>((set) => ({
  sort: 'recommended',
  openNow: false,
  freeDelivery: false,
  favouritesOnly: false,
  category: 'All',
  setSort: (sort) => set({ sort }),
  setOpenNow: (openNow) => set({ openNow }),
  setFreeDelivery: (freeDelivery) => set({ freeDelivery }),
  setFavouritesOnly: (favouritesOnly) => set({ favouritesOnly }),
  setCategory: (category) => set({ category }),
  reset: () => set({ sort: 'recommended', openNow: false, freeDelivery: false, favouritesOnly: false, category: 'All' }),
}));

export function activeFilterCount(s: FoodFilterState): number {
  let n = 0;
  if (s.sort !== 'recommended') n++;
  if (s.openNow) n++;
  if (s.freeDelivery) n++;
  if (s.favouritesOnly) n++;
  if (s.category && s.category !== 'All') n++;
  return n;
}
