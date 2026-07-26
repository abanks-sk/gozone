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
  parcelSize?: 'SMALL' | 'MEDIUM' | 'LARGE' | null;
  parcelDesc?: string | null;
  /** Parcels: which end the customer is at. */
  direction?: 'SEND' | 'RECEIVE' | null;
  /** The other person in a handover — only returned to the request's owner. */
  partyName?: string | null;
  partyPhone?: string | null;
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
  riderPhone?: string | null;
  direction?: 'SEND' | 'RECEIVE' | null;
  partyName?: string | null;
  partyPhone?: string | null;
}

export interface BidResponse {
  bidId: string;
  status: string;
  tripId?: string;
}

export interface BidOffer {
  id: string;
  driverId: string;
  amount: number;
  type: 'ACCEPT' | 'COUNTER';
  status: string;
  createdAt: string;
  driverName: string | null;
  driverPhone: string | null;
  vehicle: string | null;
  plate: string | null;
  /** Driver → pickup straight-line km at offer time (null if unknown). */
  distanceKm: number | null;
  /** Where they were when they offered — lets the map show the vehicle before the first GPS ping. */
  lat?: number | null;
  lng?: number | null;
}

export interface RideStatus {
  request: RideRequest;
  trip: Trip | null;
  /** The winning driver's details (from the accepted offer); null until matched. */
  driver: BidOffer | null;
}

export interface RideHistoryItem {
  requestId: string;
  tripId: string | null;
  status: string;
  fare: number;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  scheduledAt: string | null;
  createdAt: string;
}

export interface Quote {
  distanceKm: number;
  fare: number;
  baseFare: number;
  rideType: string;
  typeMultiplier: number;
  surgeMultiplier: number;
  surge: boolean;
  currency: string;
  ruleVersion: string;
}

export const rideApi = {
  // Server-authoritative fare quote (base + per-km × distance × type × surge).
  quote: (body: {
    originLat: number; originLng: number;
    destLat: number; destLng: number; rideType?: string;
  }) => api.post<Quote>('/rides/quote', body).then(r => r.data),

  createRequest: (body: {
    originLat: number; originLng: number;
    destLat: number; destLng: number;
    proposedFare: number; seats?: number; scheduledAt?: string;
    kind?: 'RIDE' | 'PARCEL'; rideType?: 'STANDARD' | 'LUXE' | 'OKADA';
    parcelSize?: 'SMALL' | 'MEDIUM' | 'LARGE'; parcelDesc?: string;
    // Parcels: who is at the other end, and which end the customer is at. The backend
    // rejects a parcel without them — a courier can't complete a handover blind.
    direction?: 'SEND' | 'RECEIVE'; partyName?: string; partyPhone?: string;
    riderPhone?: string;
  }) => api.post<RideRequest>('/rides/requests', body).then(r => r.data),

  myRides: () => api.get<RideHistoryItem[]>('/rides/trips/mine').then(r => r.data),

  payTrip: (tripId: string, method: string, reference?: string) =>
    api.post<Trip>(`/rides/trips/${tripId}/pay`, { method, reference }).then(r => r.data),

  // Rider polls their own request: status + matched trip (null until accepted).
  requestStatus: (requestId: string) =>
    api.get<RideStatus>(`/rides/requests/${requestId}/status`).then(r => r.data),

  nearbyRequests: (lat: number, lng: number, radiusKm = 5) =>
    api.get<RideRequest[]>(`/rides/requests/nearby?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`)
      .then(r => r.data),

  placeBid: (requestId: string, type: 'ACCEPT' | 'COUNTER', amount: number) =>
    api.post<BidResponse>(`/rides/requests/${requestId}/bid`, { type, amount })
      .then(r => r.data),

  // Rider-side bargaining: list pending driver offers, accept one → creates the trip.
  listBids: (requestId: string) =>
    api.get<BidOffer[]>(`/rides/requests/${requestId}/bids`).then(r => r.data),

  acceptBid: (requestId: string, bidId: string) =>
    api.post<Trip>(`/rides/requests/${requestId}/bids/${bidId}/accept`).then(r => r.data),

  updateTripStatus: (tripId: string, status: string) =>
    api.patch<Trip>(`/rides/trips/${tripId}/status`, { status })
      .then(r => r.data),

  pushLocation: (lat: number, lng: number) =>
    api.post('/rides/locations', { lat, lng }),

  rateTrip: (tripId: string, rateeId: string, score: number, comment?: string) =>
    api.post(`/rides/trips/${tripId}/rate`, { rateeId, score, comment }),

  sos: (tripId: string, coords?: { lat: number; lng: number }) =>
    api.post(`/rides/trips/${tripId}/sos`, coords ?? {}),

  poolCandidates: (tripId: string) =>
    api.post<RideRequest[]>(`/rides/trips/${tripId}/pool-candidates`)
      .then(r => r.data),
};
