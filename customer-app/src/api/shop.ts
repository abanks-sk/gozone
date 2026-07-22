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

export interface AddonOption { id: string; label: string; price: number }
export interface AddonGroup { id: string; name: string; multi: boolean; required: boolean; options: AddonOption[] }

export interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  available: boolean;
  groups?: AddonGroup[];
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
  serviceFee: number;
  deliveryAddr?: string;
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
  color: string;
  vendorId?: string | null;
  category?: string | null;
  active: boolean;
}

export const shopApi = {
  listRestaurants: () =>
    api.get<Restaurant[]>('/food/restaurants').then(r => r.data),

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

  getOrder: (orderId: string) =>
    api.get<Order>(`/food/orders/${orderId}`).then(r => r.data),

  payOrder: (orderId: string, method: string, reference?: string) =>
    api.post<Order>(`/food/orders/${orderId}/pay`, { method, reference }).then(r => r.data),

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
