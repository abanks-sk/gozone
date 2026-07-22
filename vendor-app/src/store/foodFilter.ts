import { create } from 'zustand';

export type SortKey = 'recommended' | 'nearest' | 'rating' | 'fastest';

interface FoodFilterState {
  sort: SortKey;
  openNow: boolean;
  freeDelivery: boolean;
  setSort: (s: SortKey) => void;
  setOpenNow: (v: boolean) => void;
  setFreeDelivery: (v: boolean) => void;
  reset: () => void;
}

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'nearest', label: 'Nearest first' },
  { key: 'rating', label: 'Top rated' },
  { key: 'fastest', label: 'Fastest delivery' },
];

export const useFoodFilter = create<FoodFilterState>((set) => ({
  sort: 'recommended',
  openNow: false,
  freeDelivery: false,
  setSort: (sort) => set({ sort }),
  setOpenNow: (openNow) => set({ openNow }),
  setFreeDelivery: (freeDelivery) => set({ freeDelivery }),
  reset: () => set({ sort: 'recommended', openNow: false, freeDelivery: false }),
}));

export function activeFilterCount(s: FoodFilterState): number {
  let n = 0;
  if (s.sort !== 'recommended') n++;
  if (s.openNow) n++;
  if (s.freeDelivery) n++;
  return n;
}
