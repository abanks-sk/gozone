import api from './client';

export interface LatLng { lat: number; lng: number }
export interface Directions { points: LatLng[]; distanceMeters: number; durationSeconds: number; enabled: boolean }

// Backend proxy for Google Directions (server key stays server-side). Falls back to
// empty points when the key isn't configured.
export const mapsApi = {
  // Coordinate -> place name via our own backend. Going direct to Nominatim gets "Access denied"
  // (its policy needs an identifying User-Agent, which app fetches don't send), so the lookup
  // belongs server-side where that header is set.
  reverseGeocode: (lat: number, lng: number) =>
    api.get<{ name?: string; address?: string }>(`/rides/maps/geocode/reverse?lat=${lat}&lng=${lng}`)
      .then(r => r.data),

  directions: (o: LatLng, d: LatLng) =>
    api.get<Directions>(`/rides/maps/directions?originLat=${o.lat}&originLng=${o.lng}&destLat=${d.lat}&destLng=${d.lng}`)
      .then(r => r.data),
};
