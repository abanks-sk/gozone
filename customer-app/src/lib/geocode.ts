import { Place } from '../data/places';
import { mapsApi } from '../api/maps';

// Free OSM geocoding (Nominatim). Biased to Ghana. Low-volume/demo use; respects
// the ~1 req/s guidance by being debounced at the call sites.
const BASE = 'https://nominatim.openstreetmap.org';

/** Address → matching places (autocomplete-style). */
export async function forwardSearch(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  // Prefer Google Places via our backend proxy (real POI names + coords in one call).
  try {
    const g = await mapsApi.searchPlaces(q);
    if (g?.length) {
      return g.map((p) => ({
        label: p.name || String(p.address).split(',')[0],
        sub: p.address,
        lat: p.lat,
        lng: p.lng,
      })) as Place[];
    }
  } catch { /* fall through to OSM */ }

  try {
    const r = await fetch(
      `${BASE}/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=6&addressdetails=1&countrycodes=gh`,
      { headers: { Accept: 'application/json' } },
    );
    const d = await r.json();
    if (!Array.isArray(d)) return [];
    return d.map((item: any) => {
      const a = item.address ?? {};
      const parts: string[] = String(item.display_name).split(',').map((s: string) => s.trim());
      const label = item.name || a.road || a.suburb || a.neighbourhood || a.amenity || parts[0];
      const sub = parts.slice(1, 3).join(', ') || parts[0];
      return { label, sub, lat: parseFloat(item.lat), lng: parseFloat(item.lon) } as Place;
    });
  } catch {
    return [];
  }
}

/**
 * Coordinates → a readable address.
 * Prefers our backend Google proxy (accurate place names, server-side key); falls back
 * to Nominatim if the proxy is unavailable or the Maps key isn't authorised.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<{ label: string; sub: string } | null> {
  try {
    const g = await mapsApi.reverseGeocode(lat, lng);
    if (g?.address) {
      const parts = String(g.address).split(',').map((s) => s.trim());
      return { label: g.name || parts[0], sub: parts.slice(0, 3).join(', ') };
    }
  } catch { /* fall through to OSM */ }

  try {
    const r = await fetch(
      `${BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`,
      { headers: { Accept: 'application/json' } },
    );
    const d = await r.json();
    if (!d || !d.display_name) return null;
    const a = d.address ?? {};
    const label = d.name || a.road || a.suburb || a.neighbourhood || a.city || 'Pinned location';
    const parts: string[] = String(d.display_name).split(',').map((s: string) => s.trim());
    return { label, sub: parts.slice(0, 3).join(', ') };
  } catch {
    return null;
  }
}
