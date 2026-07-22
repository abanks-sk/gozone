import axios from 'axios';
import { getToken, clearAuth } from '../lib/auth';

// Admin web talks to the same gateway as the mobile apps.
const baseURL = (import.meta as any).env?.VITE_API_BASE_URL ?? 'http://localhost:8080';

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      clearAuth();
      // Let the app re-render to the login screen.
      window.dispatchEvent(new Event('gozone-auth-changed'));
    }
    return Promise.reject(err);
  },
);

export default api;
