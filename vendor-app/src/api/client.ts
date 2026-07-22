import axios from 'axios';
import { storage } from '../lib/storage';
import { apiBaseUrl } from '../lib/host';

// Gateway URL derived live from the laptop's current IP (see lib/host).
const BASE_URL = apiBaseUrl();

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach stored access token to every request (guarded — never throws).
api.interceptors.request.use(async (config) => {
  const token = await storage.get('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, attempt silent refresh then retry once.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = await storage.get('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        await storage.set('accessToken', data.accessToken);
        await storage.set('refreshToken', data.refreshToken);

        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        await storage.remove('accessToken');
        await storage.remove('refreshToken');
      }
    }
    return Promise.reject(error);
  },
);

export default api;
