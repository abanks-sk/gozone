// Free OSM reverse-geocoding (Nominatim) — turn coords into a readable place name.
const BASE = 'https://nominatim.openstreetmap.org';

/**
 * Naming a coordinate is a nicety, never a blocker. A bare fetch has no timeout, so a slow or
 * unreachable geocoder leaves the caller waiting indefinitely on a label it can manage without —
 * the same trap that left the customer app's "use current location" spinning forever.
 */
const GEOCODE_TIMEOUT_MS = 5000;

function bounded<T>(p: Promise<T>, ms = GEOCODE_TIMEOUT_MS): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function reverseGeocode(lat: number, lng: number): Promise<{ label: string; sub: string } | null> {
  try {
    const r = await bounded(fetch(
      `${BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      { headers: { Accept: 'application/json' } },
    ));
    if (!r) return null;
    const d = await r.json();
    if (!d || !d.display_name) return null;
    const a = d.address ?? {};
    const label = a.suburb || a.neighbourhood || a.road || a.city || d.name || 'Your area';
    const parts: string[] = String(d.display_name).split(',').map((s: string) => s.trim());
    return { label, sub: parts.slice(0, 2).join(', ') };
  } catch {
    return null;
  }
}
