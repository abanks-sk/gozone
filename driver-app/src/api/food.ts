import api from './client';

export interface Restaurant {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: string;
  prepMinutes: number;
}

export interface MenuItem {
  id: string;
  name: string;
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
  items: { menuItemId: string; name: string; qty: number; unitPrice: number }[];
}

export interface QueuePosition {
  entryId: string;
  position: number;
  status: string;
  orderId: string;
}

export interface Delivery {
  id: string;
  orderId: string;
  vendorName: string;
  dropoffAddr?: string;
  /** Collection point. */
  vendorLat?: number | null;
  vendorLng?: number | null;
  /** Where it's going. Null on orders placed before the destination was stored. */
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  total: number;
  status: 'ASSIGNED' | 'PICKED_UP' | 'ENROUTE' | 'DELIVERED';
  courierId?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: 'UNPAID' | 'AWAITING' | 'PAID';
}

export const deliveryApi = {
  available: () =>
    api.get<Delivery[]>('/food/deliveries/available').then(r => r.data),
  mine: () =>
    api.get<Delivery[]>('/food/deliveries/mine').then(r => r.data),
  accept: (id: string) =>
    api.post<Delivery>(`/food/deliveries/${id}/accept`).then(r => r.data),
  advanceStatus: (id: string, status: string) =>
    api.patch(`/food/deliveries/${id}/status`, { status }),
  confirmCash: (id: string) =>
    api.post<Delivery>(`/food/deliveries/${id}/confirm-cash`).then(r => r.data),
  pushLocation: (deliveryId: string, lat: number, lng: number) =>
    api.post('/food/deliveries/location', { deliveryId, lat, lng }),
};

export const foodApi = {
  listRestaurants: () =>
    api.get<Restaurant[]>('/food/restaurants').then(r => r.data),

  getMenu: (restaurantId: string) =>
    api.get<MenuItem[]>(`/food/restaurants/${restaurantId}/menu`).then(r => r.data),

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

  queuePosition: (orderId: string) =>
    api.get<QueuePosition>(`/food/orders/${orderId}/queue-position`).then(r => r.data),

  getQueue: (restaurantId: string) =>
    api.get<QueuePosition[]>(`/food/restaurants/${restaurantId}/queue`).then(r => r.data),

  callNext: (restaurantId: string) =>
    api.post<QueuePosition>(`/food/restaurants/${restaurantId}/queue/call-next`).then(r => r.data),

  rateOrder: (orderId: string, score: number, comment?: string) =>
    api.post(`/food/orders/${orderId}/rate`, { score, comment }),
};
