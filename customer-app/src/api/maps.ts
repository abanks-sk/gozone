import api from './client';

export interface LatLng { lat: number; lng: number }
export interface Directions { points: LatLng[]; distanceMeters: number; durationSeconds: number; enabled: boolean }
export interface PlaceSuggestion { placeId: string; description: string }
export interface PlaceDetails { lat: number; lng: number; name: string; address: string }

// All calls go through our backend proxy (the Google server key stays server-side).
// They degrade gracefully to empty results when the key isn't configured.
export const mapsApi = {
  directions: (o: LatLng, d: LatLng) =>
    api.get<Directions>(`/rides/maps/directions?originLat=${o.lat}&originLng=${o.lng}&destLat=${d.lat}&destLng=${d.lng}`)
      .then(r => r.data),

  /** Free-text place search returning coordinates in one call. */
  searchPlaces: (q: string) =>
    api.get<{ name: string; address: string; lat: number; lng: number }[]>(
      `/rides/maps/places/search?q=${encodeURIComponent(q)}`).then(r => r.data),

  autocomplete: (q: string) =>
    api.get<PlaceSuggestion[]>(`/rides/maps/places/autocomplete?q=${encodeURIComponent(q)}`).then(r => r.data),

  placeDetails: (placeId: string) =>
    api.get<PlaceDetails>(`/rides/maps/places/details?placeId=${encodeURIComponent(placeId)}`).then(r => r.data),

  reverseGeocode: (lat: number, lng: number) =>
    api.get<{ address?: string; name?: string }>(`/rides/maps/geocode/reverse?lat=${lat}&lng=${lng}`)
      .then(r => r.data),
};
