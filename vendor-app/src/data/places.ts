export interface Place {
  label: string;
  sub: string;
  lat: number;
  lng: number;
}

// Demo locations around Accra, Ghana.
export const KOTOKA: Place = { label: 'Kotoka Airport', sub: 'Airport City, Accra', lat: 5.6052, lng: -0.1674 };
export const OSU: Place = { label: 'Osu, Oxford Street', sub: 'Accra Central', lat: 5.6120, lng: -0.1950 };

export const HOME_PLACE: Place = { label: 'Home', sub: 'East Legon, Accra', lat: 5.6360, lng: -0.1660 };
export const WORK_PLACE: Place = { label: 'Work', sub: 'Airport City, Accra', lat: 5.6050, lng: -0.1700 };

const ACCRA_MALL: Place = { label: 'Accra Mall', sub: 'Tetteh Quarshie', lat: 5.6206, lng: -0.1726 };

export const PLACES: Place[] = [
  OSU,
  KOTOKA,
  ACCRA_MALL,
  { label: 'University of Ghana', sub: 'Legon', lat: 5.6505, lng: -0.1869 },
  { label: 'Labadi Beach', sub: 'La, Accra', lat: 5.5586, lng: -0.1486 },
  { label: 'Makola Market', sub: 'Accra Central', lat: 5.5460, lng: -0.2070 },
  { label: 'West Hills Mall', sub: 'Weija', lat: 5.5560, lng: -0.3360 },
  { label: '37 Military Hospital', sub: 'Cantonments', lat: 5.5870, lng: -0.1830 },
];

export const RECENTS: Place[] = [OSU, ACCRA_MALL, KOTOKA];

export function searchPlaces(query: string): Place[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PLACES.filter((p) => p.label.toLowerCase().includes(q) || p.sub.toLowerCase().includes(q));
}
