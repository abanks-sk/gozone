import api from './client';

export interface RideRequest {
  id: string;
  riderId: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  seats: number;
  proposedFare: number;
  status: string;
  kind?: 'RIDE' | 'PARCEL';
  rideType?: 'STANDARD' | 'LUXE' | 'OKADA';
  parcelSize?: 'SMALL' | 'MEDIUM' | 'LARGE' | null;
  parcelDesc?: string | null;
  createdAt: string;
}

export interface Trip {
  id: string;
  driverId: string;
  agreedFare: number;
  status: string;
  startedAt?: string;
  completedAt?: string;
  paymentStatus?: 'UNPAID' | 'AWAITING' | 'PAID';
  paymentMethod?: string | null;
  /** The customer's phone (participant-guarded — only after a match). */
  riderPhone?: string | null;
}

export interface BidResponse {
  bidId: string;
  status: string;
  tripId?: string;
}

/** Extra info sent with an offer so the passenger can compare drivers. */
export interface BidExtras {
  driverName?: string;
  driverPhone?: string;
  vehicle?: string;
  plate?: string;
  lat?: number;
  lng?: number;
}

/** Driver polls their offer: PENDING → ACCEPTED (+tripId) / REJECTED. */
export interface BidStatus {
  bidId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  requestStatus: 'OPEN' | 'MATCHED' | 'EXPIRED' | 'CANCELLED';
  tripId: string | null;
}

export const rideApi = {
  createRequest: (body: {
    originLat: number; originLng: number;
    destLat: number; destLng: number;
    proposedFare: number; seats?: number;
  }) => api.post<RideRequest>('/rides/requests', body).then(r => r.data),

  nearbyRequests: (lat: number, lng: number, radiusKm = 5, vehicleClass?: string | null, serviceMode?: string | null) => {
    const q = new URLSearchParams({ lat: String(lat), lng: String(lng), radiusKm: String(radiusKm) });
    if (vehicleClass) q.set('vehicleClass', vehicleClass);
    if (serviceMode) q.set('serviceMode', serviceMode);
    return api.get<RideRequest[]>(`/rides/requests/nearby?${q.toString()}`).then(r => r.data);
  },

  placeBid: (requestId: string, type: 'ACCEPT' | 'COUNTER', amount: number, extras?: BidExtras) =>
    api.post<BidResponse>(`/rides/requests/${requestId}/bid`, { type, amount, ...extras })
      .then(r => r.data),

  getBid: (bidId: string) =>
    api.get<BidStatus>(`/rides/bids/${bidId}`).then(r => r.data),

  withdrawBid: (bidId: string) =>
    api.delete(`/rides/bids/${bidId}`),

  updateTripStatus: (tripId: string, status: string) =>
    api.patch<Trip>(`/rides/trips/${tripId}/status`, { status })
      .then(r => r.data),

  getTrip: (tripId: string) =>
    api.get<Trip>(`/rides/trips/${tripId}`).then(r => r.data),

  confirmCash: (tripId: string) =>
    api.post<Trip>(`/rides/trips/${tripId}/confirm-cash`).then(r => r.data),

  pushLocation: (lat: number, lng: number) =>
    api.post('/rides/locations', { lat, lng }),

  rateTrip: (tripId: string, rateeId: string, score: number, comment?: string) =>
    api.post(`/rides/trips/${tripId}/rate`, { rateeId, score, comment }),

  sos: (tripId: string) =>
    api.post(`/rides/trips/${tripId}/sos`),

  poolCandidates: (tripId: string) =>
    api.post<RideRequest[]>(`/rides/trips/${tripId}/pool-candidates`)
      .then(r => r.data),
};
