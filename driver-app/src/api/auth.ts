import api from './client';

export interface Me {
  id: string;
  phone: string;
  name?: string;
  role: string;
  status: string;
}

export interface Kyc {
  id: string;
  userId: string;
  status: string;
  licenceNo: string;
  vehicleReg: string;
}

export const authApi = {
  me: () => api.get<Me>('/auth/me').then((r) => r.data),

  // Returns null when the driver hasn't submitted KYC yet (endpoint returns empty 200).
  myKyc: () => api.get<Kyc>('/auth/driver/kyc/mine').then((r) => r.data || null).catch(() => null),

  submitKyc: (body: { licenceNo: string; vehicleReg: string; roadworthyUrl: string; idSelfieUrl: string }) =>
    api.post<Kyc>('/auth/driver/kyc', body).then((r) => r.data),
};
