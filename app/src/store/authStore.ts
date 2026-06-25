import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import api from '../api/client';

interface AuthState {
  userId: string | null;
  role: string | null;
  isAuthenticated: boolean;

  register: (phone: string, role: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  role: null,
  isAuthenticated: false,

  register: async (phone, role) => {
    await api.post('/auth/register', { phone, role });
    // OTP will be in server logs (dev mock)
  },

  verifyOtp: async (phone, code) => {
    const { data } = await api.post('/auth/verify-otp', { phone, code });
    await SecureStore.setItemAsync('accessToken', data.accessToken);
    await SecureStore.setItemAsync('refreshToken', data.refreshToken);

    // Decode JWT to get userId (without verifying — server already verified)
    const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
    set({ userId: payload.sub, role: data.role, isAuthenticated: true });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    set({ userId: null, role: null, isAuthenticated: false });
  },
}));
