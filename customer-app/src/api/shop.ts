export interface LeaveTime {
  orderId: string;
  position: number | null;
  peopleAhead: number;
  readyInMinutes: number;
  travelMinutes: number | null;
  /** Negative or zero = set off now. Null when we had no location to work from. */
  leaveInMinutes: number | null;
  status: string;
}

import api from './client';

export type VendorType = 'RESTAURANT' | 'PHARMACY' | 'GROCERY' | 'CONVENIENCE' | 'OTHER';

export interface Restaurant {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: string;
  prepMinutes: number;
  vendorType: VendorType;
  /**
   * Storefront the vendor set themselves. Null on the seeded vendors and on anyone who hasn't
   * filled it in, in which case the app falls back to its bundled `shopCatalog` metadata — which
   * is how every vendor looked before there was an editor.
   */
  description?: string | null;
  imageUrl?: string | null;
  /** Square shop mark the vendor uploaded. The banner is imageUrl. */
  logoUrl?: string | null;
  address?: string | null;
  /** Whether an admin has cleared this business to trade. Customers only ever see APPROVED. */
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  /** Why it was refused. Null unless rejected. */
  approvalNote?: string | null;
  /** Distance from the point the browse was anchored at. Null when it had no location. */
  distanceKm?: number | null;
}

export interface AddonOption { id: string; label: string; price: number }
export interface AddonGroup { id: string; name: string; multi: boolean; required: boolean; options: AddonOption[] }

export interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  /** Vendor-defined grouping within the catalogue; also a promo target. */
  category?: string | null;
  price: number;
  available: boolean;
  groups?: AddonGroup[];
  /** Photo the vendor uploaded. Null falls back to the bundled catalogue imagery. */
  imageUrl?: string | null;
}

export interface Order {
  id: string;
  customerId: string;
  /** Who ordered — stamped at checkout so a vendor packs for a person, not a UUID. */
  customerName: string | null;
  customerPhone: string | null;
  restaurantId: string;
  restaurantName: string;
  mode: 'DELIVERY' | 'PICKUP' | 'WALKIN';
  status: string;
  /** Why a timeout ended this order. Null when someone cancelled it by hand. */
  cancelReason?: string | null;
  /**
   * No courier has taken the delivery and the search has run long enough to offer a way out.
   * The server reports the fact; choosing pickup or cancelling is the customer's call.
   */
  awaitingCourier?: boolean;
  total: number;
  deliveryFee: number;
  serviceFee: number;
  /** Money taken off by an applied discount promo (0 when none). */
  discount?: number;
  /** Snapshot of the applied discount promo's terms. */
  promoLabel?: string | null;
  /** Vendor-fulfilled promos in effect on this order. */
  promoNotes?: string | null;
  deliveryAddr?: string;
  /** Destination pin. Null on pickup/walk-in, and on orders placed before it was stored. */
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  /** Where the food comes from — sent with the order so tracking needs no second call. */
  restaurantLat?: number | null;
  restaurantLng?: number | null;
  createdAt: string;
  paymentStatus?: 'UNPAID' | 'AWAITING' | 'PAID';
  paymentMethod?: string | null;
  items: { menuItemId: string; name: string; qty: number; unitPrice: number }[];
}

export interface PlatformFees {
  serviceFeePct: number;
  deliveryBaseFee: number;
  deliveryPerKm: number;
}

export interface QueuePosition {
  entryId: string;
  position: number;
  status: string;
  orderId: string;
}

export interface Promo {
  id: string;
  title: string;
  subtitle?: string;
  /** Longer terms — shown for vendor-fulfilled promos. */
  description?: string | null;
  color: string;
  /** Background image for the card; falls back to `color` when absent. */
  imageUrl?: string | null;
  vendorId?: string | null;
  category?: string | null;
  menuItemId?: string | null;
  /** DISCOUNT is applied by the platform at checkout; the rest the vendor honours. */
  promoKind: 'DISCOUNT' | 'BOGO' | 'OTHER';
  discountType?: 'PERCENT' | 'AMOUNT' | null;
  discountValue?: number | null;
  /** What the promo covers, and where tapping the card takes you. */
  scope: 'VENDOR' | 'CATEGORY' | 'ITEM';
  active: boolean;
}

/** Short human label for a promo's terms, e.g. "20% off" or "GH¢5 off". */
export function promoTerms(p: Promo): string | null {
  if (p.promoKind !== 'DISCOUNT' || !p.discountValue) return null;
  return p.discountType === 'PERCENT' ? `${p.discountValue}% off` : `GH¢${p.discountValue} off`;
}

export const shopApi = {
  /**
   * Shops near a point. Always pass the customer's location — without it the server returns
   * every vendor on the platform, which is how a customer in Kumasi got a list of Accra
   * restaurants they could not order from.
   */
  listRestaurants: (near?: { lat: number; lng: number; radiusKm?: number }) =>
    api.get<Restaurant[]>('/food/restaurants', {
      params: near ? { lat: near.lat, lng: near.lng, radiusKm: near.radiusKm } : undefined,
    }).then(r => r.data),

  listPromos: () =>
    api.get<Promo[]>('/food/promos').then(r => r.data),

  getMenu: (restaurantId: string) =>
    api.get<MenuItem[]>(`/food/restaurants/${restaurantId}/menu`).then(r => r.data),

  getPlatformFees: () =>
    api.get<PlatformFees>('/food/platform-fees').then(r => r.data),

  placeOrder: (body: {
    restaurantId: string;
    mode: string;
    deliveryAddr?: string;
    deliveryLat?: number;
    deliveryLng?: number;
    items: { menuItemId: string; qty: number; addonOptionIds?: string[] }[];
  }) => api.post<Order>('/food/orders', body).then(r => r.data),

  /** When a walk-in customer should set off. Coordinates optional — omit for a ready time only. */
  leaveTime: (orderId: string, lat?: number, lng?: number) =>
    api.get<LeaveTime>(`/food/orders/${orderId}/leave-time`, {
      params: lat != null && lng != null ? { lat, lng } : undefined,
    }).then(r => r.data),

  getOrder: (orderId: string) =>
    api.get<Order>(`/food/orders/${orderId}`).then(r => r.data),

  payOrder: (orderId: string, method: string, reference?: string) =>
    api.post<Order>(`/food/orders/${orderId}/pay`, { method, reference }).then(r => r.data),

  /** Call off your own order. 409 once a courier has collected it. */
  cancelOrder: (orderId: string) =>
    api.post<Order>(`/food/orders/${orderId}/cancel`).then(r => r.data),

  /** Give up on a courier and collect the order yourself. 409 once a courier has taken it. */
  switchToPickup: (orderId: string) =>
    api.post<Order>(`/food/orders/${orderId}/switch-to-pickup`).then(r => r.data),

  myOrders: () =>
    api.get<Order[]>('/food/orders/mine').then(r => r.data),

  restaurantOrders: (restaurantId: string) =>
    api.get<Order[]>(`/food/restaurants/${restaurantId}/orders`).then(r => r.data),

  advanceStatus: (orderId: string, status: string) =>
    api.patch<Order>(`/food/orders/${orderId}/status`, { status }).then(r => r.data),

  queuePosition: (orderId: string) =>
    api.get<QueuePosition>(`/food/orders/${orderId}/queue-position`).then(r => r.data),

  getQueue: (restaurantId: string) =>
    api.get<QueuePosition[]>(`/food/restaurants/${restaurantId}/queue`).then(r => r.data),

  callNext: (restaurantId: string) =>
    api.post<QueuePosition>(`/food/restaurants/${restaurantId}/queue/call-next`).then(r => r.data),

  rateOrder: (orderId: string, score: number, comment?: string) =>
    api.post(`/food/orders/${orderId}/rate`, { score, comment }),
};
