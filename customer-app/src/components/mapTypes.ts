import { ViewStyle } from 'react-native';

// Shared map contract so the Leaflet (web) and Google (native) implementations stay in sync.
export interface LatLng { lat: number; lng: number }
export interface MapMarker extends LatLng { kind?: 'pickup' | 'dest' | 'driver' | 'plain'; label?: string }

/**
 * What the moving marker should look like. A courier on an okada shouldn't show up as a car —
 * on a Ghanaian street that's the difference between looking for a saloon and looking for a
 * motorbike weaving through traffic.
 */
export type VehicleKind = 'car' | 'bike' | 'truck';

/** Map a free-text vehicle description (from the driver's profile) onto a marker shape. */
export function vehicleKindOf(vehicle?: string | null): VehicleKind {
  const v = (vehicle ?? '').toLowerCase();
  if (/okada|bike|motor|scooter/.test(v)) return 'bike';
  if (/truck|cargo|van|pickup/.test(v)) return 'truck';
  return 'car';
}

export interface MapProps {
  style?: ViewStyle;
  center: LatLng;
  zoom?: number;
  mode?: 'picker' | 'view';
  markers?: MapMarker[];
  driver?: LatLng | null;      // live-updated driver/courier marker
  vehicleKind?: VehicleKind;   // what that marker is drawn as (defaults to a car)
  userLocation?: LatLng | null; // the device's own location (blue dot)
  flyTo?: LatLng | null;        // recenter when this changes
  route?: LatLng[];
  onCenterChange?: (p: LatLng) => void; // picker mode: reports the centre coord
  onReady?: () => void;
}
