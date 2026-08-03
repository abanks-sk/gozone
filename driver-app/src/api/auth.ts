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

/** A proposed change to details an admin already verified. */
export interface EditRequest {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  /** Only the fields being changed, so the two can be read side by side. */
  current: Record<string, string | null>;
  proposed: Record<string, string | null>;
  reason?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
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

  /** Propose a change to details that were verified. Only for an approved account. */
  requestEdit: (body: Record<string, string>) =>
    api.post<EditRequest>('/auth/me/edit-requests', body).then((r) => r.data),

  /** This driver's change requests, newest first. */
  myEditRequests: () =>
    api.get<EditRequest[]>('/auth/me/edit-requests').then((r) => r.data).catch(() => [] as EditRequest[]),

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
