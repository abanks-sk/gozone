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
  /** The passenger is willing to share the car for a cheaper fare (Standard rides only). */
  shared?: boolean;
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
  /**
   * The whole trip's money — everybody's share added up. On a shared ride this is NOT what you
   * owe; `myFare` is. Anything the passenger is asked to pay must read `myFare`.
   */
  agreedFare: number;
  driverId: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  /** Your own payment, not the trip's, whenever you are a passenger on it. */
  paymentStatus?: 'UNPAID' | 'AWAITING' | 'PAID';
  paymentMethod?: string | null;
  riderPhone?: string | null;
  direction?: 'SEND' | 'RECEIVE' | null;
  partyName?: string | null;
  partyPhone?: string | null;
  /** This ride can pick up more passengers along the way. */
  shared?: boolean;
  /** How many people are aboard — 1 on an ordinary trip. */
  passengerCount?: number;
  /** What you personally owe. Absent when the caller isn't a passenger. */
  myFare?: number | null;
  /** What you'd have paid alone, so the app can show what sharing saved. */
  mySoloFare?: number | null;
  /**
   * Your boarding position: 1 if you booked this ride, higher if you joined it. Only a joiner may
   * leave; only the booker may cancel.
   */
  myPickupSeq?: number | null;
  /** The driver has confirmed you're in the car. Once true, you can no longer leave. */
  myPickedUp?: boolean | null;
  /** You've already objected to that — so the app doesn't offer it a second time. */
  myPickupDisputed?: boolean | null;
}

/** A shared ride already on the road that you could get into instead of waiting. */
export interface PoolOffer {
  tripId: string;
  driverId: string;
  driverName: string | null;
  vehicle: string | null;
  plate: string | null;
  driverLat: number | null;
  driverLng: number | null;
  destLat: number;
  destLng: number;
  /** What you'd pay by joining — the price the join actually executes at. */
  yourFare: number;
  yourSoloFare: number;
  /** What the passenger already aboard pays now, and what they'd pay once you join. */
  currentFare: number;
  newFare: number;
  savingPct: number;
  passengerCount: number;
  detourKm: number;
  destGapKm: number;
  ruleVersion: string;
}

/** One person on a shared trip. */
export interface TripPassenger {
  riderId: string;
  requestId: string | null;
  pickupSeq: number;
  lockedFare: number;
  soloFare: number;
  paymentStatus: 'UNPAID' | 'AWAITING' | 'PAID';
  paymentMethod: string | null;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  /** Only ever populated for the driver. */
  riderPhone: string | null;
  /** When the driver confirmed they were in the car. Null while they're still a pickup to make. */
  pickedUpAt: string | null;
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
    // Ride sharing. The backend rejects it on anything but a Standard ride, so the toggle is
    // only ever offered there.
    shared?: boolean;
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

  /**
   * Someone's rating. `average` is null until enough people have rated them — the app shows
   * "New" rather than a number computed from one or two scores.
   */
  rating: (userId?: string) =>
    api.get<{ userId: string; average: number | null; count: number }>(
      userId ? `/rides/ratings/${userId}` : '/rides/ratings/me').then((r) => r.data),

  sos: (tripId: string, coords?: { lat: number; lng: number }) =>
    api.post(`/rides/trips/${tripId}/sos`, coords ?? {}),

  // ── Ride sharing ──────────────────────────────────────────────────────────
  /**
   * Shared rides already on the road that this request could join. Polled while waiting for
   * drivers, so a join sits beside the driver offers as an alternative. Empty when nothing is
   * going your way — the ordinary case, not an error.
   */
  poolOffers: (requestId: string) =>
    api.get<PoolOffer[]>(`/rides/requests/${requestId}/pool-offers`).then(r => r.data),

  /** Step into one. Re-checked server-side, so a stale offer fails rather than mis-seating anyone. */
  poolJoin: (tripId: string, requestId: string) =>
    api.post<{ tripId: string; lockedFare: number; soloFare: number; passengerCount: number; ruleVersion: string }>(
      `/rides/trips/${tripId}/pool-join`, { requestId }).then(r => r.data),

  /**
   * Get out of a shared ride you joined.
   *
   * <p>Not cancelling: the ride belongs to whoever booked it and carries on without you. Only a
   * joiner can do this (`myPickupSeq > 1`), and only before they have paid.
   */
  leavePool: (tripId: string) =>
    api.post(`/rides/trips/${tripId}/leave-pool`).then(() => undefined),

  /**
   * Say you're not in that car after the driver marked you as being in it.
   *
   * <p>Doesn't un-board you — that would let anyone ride the whole way and object at the
   * drop-off. It records the objection and tells the driver, who can then correct it at any time.
   */
  disputePickup: (tripId: string, note?: string) =>
    api.post<TripPassenger>(`/rides/trips/${tripId}/dispute-pickup`, { note }).then(r => r.data),

  /** Who else is in the car. */
  tripPassengers: (tripId: string) =>
    api.get<TripPassenger[]>(`/rides/trips/${tripId}/passengers`).then(r => r.data),

  poolCandidates: (tripId: string) =>
    api.post<RideRequest[]>(`/rides/trips/${tripId}/pool-candidates`)
      .then(r => r.data),
};
