// Local enrichment for the food experience — the backend only stores name/price,
// so images, descriptions, add-ons, cuisine, etc. live here (keyed by name).

export type Mode = 'DELIVERY' | 'PICKUP' | 'WALKIN';

export interface AddOnOption { label: string; price: number }
export interface AddOnGroup { name: string; type: 'single' | 'multi'; required?: boolean; options: AddOnOption[] }
export interface ItemMeta { image: string; description: string; addOns: AddOnGroup[]; modes: Mode[]; category: string }
export interface RestaurantMeta {
  cuisine: string;
  address: string;
  logoColor: string;
  banner: string;
  categories: string[];
  deliveryFee: number;
  promo?: string;
}

// Filter categories shown as chips on the browse page.
export const CATEGORIES = ['All', 'Local', 'Rice', 'Grill', 'Seafood', 'Drinks'];

const img = (kw: string, lock: number) => `https://loremflickr.com/640/480/${kw}?lock=${lock}`;

// Reusable add-on groups
const PROTEIN: AddOnGroup = {
  name: 'Choose your protein', type: 'single', required: true,
  options: [
    { label: 'Chicken', price: 8 },
    { label: 'Turkey', price: 12 },
    { label: 'Beef', price: 10 },
    { label: 'Grilled fish', price: 9 },
    { label: 'No protein', price: 0 },
  ],
};
const SPICE: AddOnGroup = {
  name: 'Spice level', type: 'single', required: true,
  options: [{ label: 'Mild', price: 0 }, { label: 'Medium', price: 0 }, { label: 'Extra hot', price: 0 }],
};
const SIZE: AddOnGroup = {
  name: 'Size', type: 'single', required: true,
  options: [{ label: 'Regular', price: 0 }, { label: 'Large', price: 3 }],
};
const EXTRAS: AddOnGroup = {
  name: 'Add extras', type: 'multi',
  options: [{ label: 'Extra sauce', price: 2 }, { label: 'Fried egg', price: 3 }, { label: 'Side salad', price: 5 }],
};

export const RESTAURANT_META: Record<string, RestaurantMeta> = {
  'Kofi Kitchen': {
    cuisine: 'Ghanaian · Local', address: 'Ring Road Central, Accra', logoColor: '#F59E0B',
    banner: img('jollof,rice,ghana', 31), categories: ['Local', 'Rice', 'Drinks'], deliveryFee: 2.0, promo: 'Buy 1, get 1',
  },
  'Accra Grill House': {
    cuisine: 'Grill · Seafood', address: 'Labone, Accra', logoColor: '#10B981',
    banner: img('grilled,tilapia,fish', 32), categories: ['Grill', 'Seafood', 'Local'], deliveryFee: 3.5,
  },
};

const ALL: Mode[] = ['DELIVERY', 'PICKUP', 'WALKIN'];

export const ITEM_META: Record<string, ItemMeta> = {
  'Jollof Rice': { image: img('jollof,rice', 21), description: 'Smoky party jollof in a rich tomato gravy, served with your choice of protein.', addOns: [PROTEIN, SPICE, EXTRAS], modes: ALL, category: 'Rice & grains' },
  'Waakye': { image: img('rice,beans', 22), description: 'Rice and beans cooked with millet leaves, served with spaghetti, gari and shito.', addOns: [PROTEIN, EXTRAS], modes: ALL, category: 'Rice & grains' },
  'Kelewele': { image: img('fried,plantain', 23), description: 'Spicy fried plantain cubes seasoned with ginger and pepper. A perfect snack.', addOns: [SPICE], modes: ALL, category: 'Sides & snacks' },
  'Iced Sobolo': { image: img('hibiscus,drink', 24), description: 'Chilled hibiscus drink infused with ginger, pineapple and cloves.', addOns: [SIZE], modes: ALL, category: 'Drinks' },
  'Grilled Tilapia': { image: img('grilled,fish', 25), description: 'Whole tilapia grilled over coals, served with banku and hot pepper sauce.', addOns: [SPICE, EXTRAS], modes: ['DELIVERY', 'PICKUP'], category: 'Grills' },
  'Banku + Okro': { image: img('okra,soup', 26), description: 'Soft banku paired with rich okro stew and your choice of protein.', addOns: [PROTEIN, SPICE], modes: ALL, category: 'Soups & swallows' },
  'Fufu + Light Soup': { image: img('african,soup', 27), description: 'Pounded fufu in a fragrant light soup. Made fresh — pickup or walk-in only.', addOns: [PROTEIN], modes: ['PICKUP', 'WALKIN'], category: 'Soups & swallows' },
  'Malt Drink': { image: img('malt,drink', 28), description: 'Refreshing non-alcoholic malt drink, served chilled.', addOns: [SIZE], modes: ALL, category: 'Drinks' },
};

/**
 * Stock imagery by vendor type, for anything this file has never heard of.
 *
 * A single 'food' fallback meant a pharmacy's paracetamol and a grocery's cooking oil both
 * appeared as a photograph of a meal — every unknown item sharing one picture, and the wrong
 * picture at that. Type is the only thing we reliably know about a vendor we did not seed.
 */
const TYPE_IMAGE: Record<string, string> = {
  RESTAURANT:  img('food,meal', 90),
  PHARMACY:    img('pharmacy,medicine', 91),
  GROCERY:     img('groceries,supermarket', 92),
  CONVENIENCE: img('convenience,store', 93),
  OTHER:       img('shop,storefront', 94),
};
const TYPE_CUISINE: Record<string, string> = {
  RESTAURANT: 'Local', PHARMACY: 'Pharmacy', GROCERY: 'Grocery',
  CONVENIENCE: 'Convenience', OTHER: 'Shop',
};

export function itemMeta(name: string, vendorType?: string | null): ItemMeta {
  const known = ITEM_META[name];
  if (known) return known;
  return {
    image: TYPE_IMAGE[vendorType ?? 'RESTAURANT'] ?? TYPE_IMAGE.OTHER,
    description: '', addOns: [], modes: ALL, category: 'More',
  };
}

export function restaurantMeta(name: string, vendorType?: string | null): RestaurantMeta {
  const known = RESTAURANT_META[name];
  if (known) return known;
  const type = vendorType ?? 'RESTAURANT';
  return {
    // Was hardcoded 'Accra', which is simply wrong for a Kumasi shop — and for any shop whose
    // owner typed their own address. Blank lets the caller show the real one from the server.
    cuisine: TYPE_CUISINE[type] ?? 'Shop', address: '', logoColor: '#2563EB',
    banner: TYPE_IMAGE[type] ?? TYPE_IMAGE.OTHER,
    categories: ['Local'], deliveryFee: 2.5,
  };
}

// Treat the buyer as being around Osu for demo proximity.
export const USER_LOCATION = { lat: 5.6120, lng: -0.1950 };

export function distanceKm(lat: number, lng: number): number {
  const R = 6371;
  const dLat = ((lat - USER_LOCATION.lat) * Math.PI) / 180;
  const dLng = ((lng - USER_LOCATION.lng) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((USER_LOCATION.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const MODE_LABEL: Record<Mode, string> = { DELIVERY: 'Delivery', PICKUP: 'Pickup', WALKIN: 'Walk-in' };
