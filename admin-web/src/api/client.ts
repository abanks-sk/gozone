import axios from 'axios';
import { getToken, getRefreshToken, setTokens, clearAuth } from '../lib/auth';

// Admin web talks to the same gateway as the mobile apps.
const baseURL = (import.meta as any).env?.VITE_API_BASE_URL ?? 'http://localhost:8080';

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, swap the refresh token for a new access token once and retry — access tokens are
// short-lived, so without this an operator would be bounced to the login screen every hour.
// Only if that fails do we clear the session and let the app re-render to Login.
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err?.config;
    if (err?.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
          setTokens(data.accessToken, data.refreshToken);
          original.headers = { ...original.headers, Authorization: `Bearer ${data.accessToken}` };
          return api(original);
        } catch {
          // fall through to sign-out
        }
      }
      clearAuth();
      window.dispatchEvent(new Event('gozone-auth-changed'));
    }
    return Promise.reject(err);
  },
);

export default api;
