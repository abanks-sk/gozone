import api from './client';

export interface Me {
  id: string;
  phone: string;
  name?: string;
  role: string;
  status: string;
  /** Why the account is in this status — written by the admin who rejected it. */
  statusNote?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleColour?: string | null;
  vehiclePlate?: string | null;
}

export interface Kyc {
  id: string;
  userId: string;
  status: string;
  licenceNo: string;
  vehicleReg: string;
  /** Relative paths (`/auth/uploads/{id}`) — fetching one still requires being this driver or an admin. */
  idSelfieUrl?: string | null;
  licenceUrl?: string | null;
  vehiclePhotoUrl?: string | null;
  roadworthyUrl?: string | null;
}

export const authApi = {
  me: () => api.get<Me>('/auth/me').then((r) => r.data),

  /**
   * Correct the vehicle on the account. Answers 409 once the account is approved — from then on
   * the vehicle is part of what the admin verified, so changing it has to go back through review.
   */
  updateVehicle: (v: { vehicleMake?: string; vehicleModel?: string; vehicleColour?: string; vehiclePlate?: string }) =>
    api.patch<Me>('/auth/me/vehicle', v).then((r) => r.data),

  // Returns null when the driver hasn't submitted KYC yet (endpoint returns empty 200).
  myKyc: () => api.get<Kyc>('/auth/driver/kyc/mine').then((r) => r.data || null).catch(() => null),

  submitKyc: (body: {
    licenceNo: string; vehicleReg: string; roadworthyUrl?: string;
    idSelfieUrl: string; licenceUrl: string; vehiclePhotoUrl: string;
  }) =>
    api.post<Kyc>('/auth/driver/kyc', body).then((r) => r.data),
};
