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
  /** Storefront — what a customer reads before ordering. Null until the vendor fills it in. */
  description?: string | null;
  imageUrl?: string | null;
  /** Square shop mark, uploaded through the app. The banner is imageUrl. */
  logoUrl?: string | null;
  address?: string | null;
  /** Whether an admin has cleared this business to trade. Customers only ever see APPROVED. */
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  /** Why it was refused. Null unless rejected. */
  approvalNote?: string | null;
}

export interface MenuItem {
  id: string;
  name: string;
  /** Minutes to prepare. Null = not set; the vendor's overall prep time applies. */
  prepMinutes?: number | null;
  description?: string | null;
  /** Grouping within the catalogue; also what a CATEGORY promo targets. */
  category?: string | null;
  price: number;
  available: boolean;
  /** Photo of the dish. Null falls back to the customer app's bundled imagery. */
  imageUrl?: string | null;
}

export interface Order {
  id: string;
  customerId: string;
  restaurantId: string;
  restaurantName: string;
  mode: 'DELIVERY' | 'PICKUP' | 'WALKIN';
  status: string;
  total: number;
  deliveryFee: number;
  deliveryAddr?: string;
  createdAt: string;
  paymentStatus?: 'UNPAID' | 'AWAITING' | 'PAID';
  paymentMethod?: string | null;
  items: { menuItemId: string; name: string; qty: number; unitPrice: number }[];
}

export interface QueuePosition {
  entryId: string;
  position: number;
  status: string;
  orderId: string;
}

/** A promo card (self-serve application: created inactive, admin activates). */
export interface Promo {
  id: string;
  title: string;
  subtitle: string | null;
  description?: string | null;
  color?: string | null;
  imageUrl?: string | null;
  vendorId: string | null;
  category?: string | null;
  menuItemId?: string | null;
  /** DISCOUNT is applied by GoZone at checkout; BOGO/OTHER you honour in store. */
  promoKind: 'DISCOUNT' | 'BOGO' | 'OTHER';
  discountType?: 'PERCENT' | 'AMOUNT' | null;
  discountValue?: number | null;
  /** What it covers: the whole catalogue, one category, or one item. */
  scope: 'VENDOR' | 'CATEGORY' | 'ITEM';
  active: boolean;
}

/** What the vendor sends when applying to run a promotion. */
export interface PromoApplication {
  vendorId: string;
  title: string;
  subtitle?: string;
  description?: string;
  promoKind: 'DISCOUNT' | 'BOGO' | 'OTHER';
  discountType?: 'PERCENT' | 'AMOUNT';
  discountValue?: number;
  scope: 'VENDOR' | 'CATEGORY' | 'ITEM';
  category?: string;
  menuItemId?: string;
}

export const foodApi = {
  listRestaurants: () =>
    api.get<Restaurant[]>('/food/restaurants').then(r => r.data),

  // Self-serve promotion: apply (pending admin approval) + list my applications.
  applyPromo: (body: PromoApplication) =>
    api.post<Promo>('/food/promos/apply', body).then(r => r.data),

  myPromos: (vendorId: string) =>
    api.get<Promo[]>(`/food/promos/mine?vendorId=${vendorId}`).then(r => r.data),

  /**
   * Edit your own business, storefront included. Partial: send only what changed — null/omitted
   * leaves a field alone, so two screens editing different fields cannot clobber each other.
   */
  updateVendor: (vendorId: string, body: {
    name?: string; vendorType?: string;
    lat?: number; lng?: number;
    address?: string; description?: string; imageUrl?: string; logoUrl?: string;
    prepMinutes?: number; status?: string;
  }) => api.patch<Restaurant>(`/food/vendors/${vendorId}`, body).then(r => r.data),

  getMenu: (restaurantId: string) =>
    api.get<MenuItem[]>(`/food/restaurants/${restaurantId}/menu`).then(r => r.data),

  // Vendor catalogue management (owner-authorised) — full list incl. sold-out items.
  getCatalogue: (restaurantId: string) =>
    api.get<MenuItem[]>(`/food/restaurants/${restaurantId}/catalogue`).then(r => r.data),

  createMenuItem: (restaurantId: string, body: {
    name: string; description?: string; category?: string; price: number; available?: boolean;
    prepMinutes?: number; imageUrl?: string;
    groups?: { name: string; multi: boolean; required: boolean; options: { label: string; price: number }[] }[];
  }) => api.post<MenuItem>(`/food/restaurants/${restaurantId}/menu`, body).then(r => r.data),

  /**
   * Edit an item. Answers 409 while the shop is OPEN for anything except `available` — a price
   * that changes mid-service is not the price the customer is reading.
   */
  updateMenuItem: (itemId: string, body: { name?: string; description?: string; category?: string; price?: number; available?: boolean; prepMinutes?: number; imageUrl?: string }) =>
    api.patch<MenuItem>(`/food/menu-items/${itemId}`, body).then(r => r.data),

  deleteMenuItem: (itemId: string) =>
    api.delete(`/food/menu-items/${itemId}`),

  placeOrder: (body: {
    restaurantId: string;
    mode: string;
    deliveryAddr?: string;
    items: { menuItemId: string; qty: number }[];
  }) => api.post<Order>('/food/orders', body).then(r => r.data),

  getOrder: (orderId: string) =>
    api.get<Order>(`/food/orders/${orderId}`).then(r => r.data),

  myOrders: () =>
    api.get<Order[]>('/food/orders/mine').then(r => r.data),

  restaurantOrders: (restaurantId: string) =>
    api.get<Order[]>(`/food/restaurants/${restaurantId}/orders`).then(r => r.data),

  advanceStatus: (orderId: string, status: string) =>
    api.patch<Order>(`/food/orders/${orderId}/status`, { status }).then(r => r.data),

  awaitingCash: (restaurantId: string) =>
    api.get<Order[]>(`/food/restaurants/${restaurantId}/awaiting-cash`).then(r => r.data),

  confirmOrderCash: (orderId: string) =>
    api.post<Order>(`/food/orders/${orderId}/confirm-cash`).then(r => r.data),

  queuePosition: (orderId: string) =>
    api.get<QueuePosition>(`/food/orders/${orderId}/queue-position`).then(r => r.data),

  getQueue: (restaurantId: string) =>
    api.get<QueuePosition[]>(`/food/restaurants/${restaurantId}/queue`).then(r => r.data),

  callNext: (restaurantId: string) =>
    api.post<QueuePosition>(`/food/restaurants/${restaurantId}/queue/call-next`).then(r => r.data),

  rateOrder: (orderId: string, score: number, comment?: string) =>
    api.post(`/food/orders/${orderId}/rate`, { score, comment }),
};
