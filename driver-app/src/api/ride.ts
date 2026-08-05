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
  /**
   * The passenger agreed to share the car. Worth knowing before accepting: the trip may gain a
   * second pickup on the way, and the fare will rise if it does.
   */
  shared?: boolean;
  parcelSize?: 'SMALL' | 'MEDIUM' | 'LARGE' | null;
  parcelDesc?: string | null;
  createdAt: string;
}

/** One person on a shared trip. Phone numbers are populated for the driver. */
export interface TripPassenger {
  riderId: string;
  requestId: string | null;
  /** Boarding order — 1 is whoever booked the ride. */
  pickupSeq: number;
  lockedFare: number;
  soloFare: number;
  paymentStatus: 'UNPAID' | 'AWAITING' | 'PAID';
  paymentMethod: string | null;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  riderPhone: string | null;
  /** Driver-only, same terms as the phone — how you identify somebody at a kerb. */
  riderName: string | null;
  /**
   * When you confirmed they were in the car. Null while they're still a pickup to make — and
   * while they can still walk away from the fare.
   */
  pickedUpAt: string | null;
  /**
   * Set when this passenger says they are not in your car. It does not un-board them — it is their
   * objection on the record, and while it is open you may undo the pickup at any time.
   */
  pickupDisputedAt: string | null;
  pickupDisputeNote: string | null;
}

export interface Trip {
  id: string;
  driverId: string;
  /** The whole trip's money — every passenger's share added up. This is what the driver earns. */
  agreedFare: number;
  /** This ride can pick up more passengers along its corridor. */
  shared?: boolean;
  /** How many people are aboard — 1 on an ordinary trip. */
  passengerCount?: number;
  status: string;
  startedAt?: string;
  completedAt?: string;
  paymentStatus?: 'UNPAID' | 'AWAITING' | 'PAID';
  paymentMethod?: string | null;
  /** The customer's phone (participant-guarded — only after a match). */
  riderPhone?: string | null;
  /** Parcels: which end the customer is at, and who the courier meets at the other end. */
  direction?: 'SEND' | 'RECEIVE' | null;
  partyName?: string | null;
  partyPhone?: string | null;
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

/**
 * One job in this driver's history.
 *
 * `cashToConfirm` is the field that matters: a passenger only sits at AWAITING when they chose
 * cash, so it counts handovers this driver still has to acknowledge — and until they do, the
 * customer is stuck watching "waiting for them to confirm".
 */
export interface DriverTripItem {
  tripId: string;
  requestId: string;
  status: string;
  /** The whole fare — on a shared trip, the sum of every passenger's share. */
  fare: number;
  kind: 'RIDE' | 'PARCEL';
  paymentStatus: 'UNPAID' | 'AWAITING' | 'PAID';
  paymentMethod: string | null;
  cashToConfirm: number;
  cashAmount: number;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  completedAt: string | null;
  createdAt: string;
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

  /**
   * This driver's own job history.
   *
   * <p>The store only ever held the *active* trip, and it is wiped on logout and on every fresh
   * OTP verify — so a trip left before its cash was confirmed became unreachable. The server knew
   * about it all along; this is the route back.
   */
  myTrips: () => api.get<DriverTripItem[]>('/rides/driver/trips').then(r => r.data),

  /**
   * Confirm cash was collected. Name the passenger on a shared trip — two people owe two
   * different amounts at two different kerbs, and confirming "the trip" would credit one
   * person's cash to everybody. Omitting it clears everyone awaiting cash, which is right on an
   * ordinary single-passenger trip.
   */
  confirmCash: (tripId: string, riderId?: string) =>
    api.post<Trip>(`/rides/trips/${tripId}/confirm-cash`, riderId ? { riderId } : {}).then(r => r.data),

  /** Everyone on this trip: the pickups to make and the fares to collect. */
  tripPassengers: (tripId: string) =>
    api.get<TripPassenger[]>(`/rides/trips/${tripId}/passengers`).then(r => r.data),

  /**
   * Confirm a shared passenger is in the car.
   *
   * <p>Your own protection: until you tap it they can still leave and owe nothing. Only needed for
   * people who joined en route — whoever booked is confirmed when you start the trip.
   */
  markPickedUp: (tripId: string, riderId: string) =>
    api.post<TripPassenger>(`/rides/trips/${tripId}/passengers/${riderId}/picked-up`).then(r => r.data),

  /**
   * Take back a pickup you confirmed by mistake, re-opening that passenger's exit.
   *
   * <p>Only for a short window after confirming — the server is the authority on that and says so
   * plainly when it has passed, rather than the app guessing from a phone's clock.
   */
  undoPickup: (tripId: string, riderId: string) =>
    api.delete<TripPassenger>(`/rides/trips/${tripId}/passengers/${riderId}/picked-up`).then(r => r.data),

  /** Tell the customer we're at the pickup point — sends them a push notification. */
  announceArrival: (tripId: string) =>
    api.post<Trip>(`/rides/trips/${tripId}/arrived`).then(r => r.data),

  pushLocation: (lat: number, lng: number) =>
    api.post('/rides/locations', { lat, lng }),

  rateTrip: (tripId: string, rateeId: string, score: number, comment?: string) =>
    api.post(`/rides/trips/${tripId}/rate`, { rateeId, score, comment }),

  /**
   * Someone's rating. `average` is the real mean of every score they have been given, and is
   * **0 when nobody has rated them** — never null. `count` is how many ratings that is, so a
   * screen can distinguish "unrated" from "rated badly" if it needs to.
   */
  rating: (userId?: string) =>
    api.get<{ userId: string; average: number; count: number }>(
      userId ? `/rides/ratings/${userId}` : '/rides/ratings/me').then((r) => r.data),

  sos: (tripId: string) =>
    api.post(`/rides/trips/${tripId}/sos`),

  poolCandidates: (tripId: string) =>
    api.post<RideRequest[]>(`/rides/trips/${tripId}/pool-candidates`)
      .then(r => r.data),
};
