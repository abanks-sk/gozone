import { mapsApi } from '../api/maps';

/**
 * Turn coordinates into something a human recognises.
 *
 * Routed through our own backend proxy rather than calling OpenStreetMap directly. Nominatim's
 * usage policy requires an identifying User-Agent and refuses a plain `fetch` from an app with
 * `Access denied` — a trap the customer and driver apps both fell into, where the fallback looked
 * fine on web (the browser sends a real UA) and silently returned nothing on a device.
 *
 * Best-effort by design: a pin with no name is still a usable pin, so every failure resolves to
 * null and the caller keeps the coordinates.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const r = await mapsApi.reverseGeocode(lat, lng);
    const label = r?.name || r?.address;
    return label && label.trim() ? label.trim() : null;
  } catch {
    return null;
  }
}

/** Free-text search for a place, used by the vendor location picker's search box. */
export async function forwardSearch(query: string): Promise<{ label: string; sub: string; lat: number; lng: number }[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  try {
    const results = await mapsApi.searchPlaces(q);
    return results.map((r) => ({ label: r.name || r.address, sub: r.address ?? '', lat: r.lat, lng: r.lng }));
  } catch {
    return [];
  }
}
