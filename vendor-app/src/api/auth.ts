import api from './client';
import { Restaurant } from './food';

export interface Me {
  id: string;
  phone: string;
  name?: string;
  role: string;
  status: string;
}

export const authApi = {
  me: () => api.get<Me>('/auth/me').then((r) => r.data),

  // The owner's businesses (empty until they finish setup).
  myVendors: () => api.get<Restaurant[]>('/food/vendors/mine').then((r) => r.data).catch(() => []),

  createVendor: (body: { name: string; vendorType: string; lat: number; lng: number }) =>
    api.post<Restaurant>('/food/vendors', body).then((r) => r.data),
};
