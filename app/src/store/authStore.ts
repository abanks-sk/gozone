import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import api from '../api/client';

interface AuthState {
  userId: string | null;
  role: string | null;
  accessToken: string | null;
  isAuthenticated: boolean;

  register: (phone: string, role: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Called once on app start to rehydrate tokens from secure storage. */
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  role: null,
  accessToken: null,
  isAuthenticated: false,

  register: async (phone, role) => {
    await api.post('/auth/register', { phone, role });
    // OTP printed to server logs in dev
  },

  verifyOtp: async (phone, code) => {
    const { data } = await api.post('/auth/verify-otp', { phone, code });
    await SecureStore.setItemAsync('accessToken', data.accessToken);
    await SecureStore.setItemAsync('refreshToken', data.refreshToken);
    const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
    set({
      userId: payload.sub,
      role: data.role,
      accessToken: data.accessToken,
      isAuthenticated: true,
    });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    set({ userId: null, role: null, accessToken: null, isAuthenticated: false });
  },

  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (!token) return;
      const payload = JSON.parse(atob(token.split('.')[1]));
      // Token expired check
      if (payload.exp * 1000 < Date.now()) {
        // Try refresh
        const refresh = await SecureStore.getItemAsync('refreshToken');
        if (!refresh) return;
        const { data } = await api.post('/auth/refresh', { refreshToken: refresh });
        await SecureStore.setItemAsync('accessToken', data.accessToken);
        await SecureStore.setItemAsync('refreshToken', data.refreshToken);
        const newPayload = JSON.parse(atob(data.accessToken.split('.')[1]));
        set({
          userId: newPayload.sub,
          role: data.role,
          accessToken: data.accessToken,
          isAuthenticated: true,
        });
      } else {
        set({
          userId: payload.sub,
          role: payload.role,
          accessToken: token,
          isAuthenticated: true,
        });
      }
    } catch {
      // If hydration fails, user stays logged out
    }
  },
}));
