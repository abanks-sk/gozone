import api from './client';

export interface LatLng { lat: number; lng: number }
export interface Directions { points: LatLng[]; distanceMeters: number; durationSeconds: number; enabled: boolean }

// Backend proxy for Google Directions (server key stays server-side). Falls back to
// empty points when the key isn't configured.
export const mapsApi = {
  directions: (o: LatLng, d: LatLng) =>
    api.get<Directions>(`/rides/maps/directions?originLat=${o.lat}&originLng=${o.lng}&destLat=${d.lat}&destLng=${d.lng}`)
      .then(r => r.data),
};
