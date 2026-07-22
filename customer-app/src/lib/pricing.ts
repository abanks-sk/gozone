// Central pricing (frontend). One place to tune fares instead of magic numbers.
// Ride fare = (base + perKm × distance) × ride-type multiplier, floored at minFare.
// Parcel fare = base + perKm × distance + size fee.
export const PRICING = {
  ride: { base: 5, perKm: 2.2, minFare: 5 },
  parcel: { base: 5, perKm: 2, minFare: 5 },
};

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function rideFare(distanceKm: number, typeMult = 1): number {
  const { base, perKm, minFare } = PRICING.ride;
  return Math.max(minFare, Math.round((base + perKm * distanceKm) * typeMult));
}

export function parcelFare(distanceKm: number, sizeFee = 0): number {
  const { base, perKm, minFare } = PRICING.parcel;
  return Math.max(minFare, Math.round(base + perKm * distanceKm + sizeFee));
}
