// Free OSM reverse-geocoding (Nominatim) — turn coords into a readable place name.
const BASE = 'https://nominatim.openstreetmap.org';

export async function reverseGeocode(lat: number, lng: number): Promise<{ label: string; sub: string } | null> {
  try {
    const r = await fetch(
      `${BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      { headers: { Accept: 'application/json' } },
    );
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
