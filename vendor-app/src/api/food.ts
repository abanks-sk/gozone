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
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  available: boolean;
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
  color?: string | null;
  vendorId: string | null;
  category?: string | null;
  active: boolean;
  createdAt: string;
}

export const foodApi = {
  listRestaurants: () =>
    api.get<Restaurant[]>('/food/restaurants').then(r => r.data),

  // Self-serve promotion: apply (pending admin approval) + list my applications.
  applyPromo: (vendorId: string, title: string, subtitle?: string) =>
    api.post<Promo>('/food/promos/apply', { vendorId, title, subtitle }).then(r => r.data),

  myPromos: (vendorId: string) =>
    api.get<Promo[]>(`/food/promos/mine?vendorId=${vendorId}`).then(r => r.data),

  getMenu: (restaurantId: string) =>
    api.get<MenuItem[]>(`/food/restaurants/${restaurantId}/menu`).then(r => r.data),

  // Vendor catalogue management (owner-authorised) — full list incl. sold-out items.
  getCatalogue: (restaurantId: string) =>
    api.get<MenuItem[]>(`/food/restaurants/${restaurantId}/catalogue`).then(r => r.data),

  createMenuItem: (restaurantId: string, body: {
    name: string; description?: string; price: number; available?: boolean;
    groups?: { name: string; multi: boolean; required: boolean; options: { label: string; price: number }[] }[];
  }) => api.post<MenuItem>(`/food/restaurants/${restaurantId}/menu`, body).then(r => r.data),

  updateMenuItem: (itemId: string, body: { name?: string; description?: string; price?: number; available?: boolean }) =>
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
