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
  createdAt: string;
}

export interface Trip {
  id: string;
  driverId: string;
  agreedFare: number;
  status: string;
  startedAt?: string;
  completedAt?: string;
}

export interface BidResponse {
  bidId: string;
  status: string;
  tripId?: string;
}

export const rideApi = {
  createRequest: (body: {
    originLat: number; originLng: number;
    destLat: number; destLng: number;
    proposedFare: number; seats?: number;
  }) => api.post<RideRequest>('/rides/requests', body).then(r => r.data),

  nearbyRequests: (lat: number, lng: number, radiusKm = 5) =>
    api.get<RideRequest[]>(`/rides/requests/nearby?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`)
      .then(r => r.data),

  placeBid: (requestId: string, type: 'ACCEPT' | 'COUNTER', amount: number) =>
    api.post<BidResponse>(`/rides/requests/${requestId}/bid`, { type, amount })
      .then(r => r.data),

  updateTripStatus: (tripId: string, status: string) =>
    api.patch<Trip>(`/rides/trips/${tripId}/status`, { status })
      .then(r => r.data),

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
