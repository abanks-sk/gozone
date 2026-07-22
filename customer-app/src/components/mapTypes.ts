import { ViewStyle } from 'react-native';

// Shared map contract so the Leaflet (web) and Google (native) implementations stay in sync.
export interface LatLng { lat: number; lng: number }
export interface MapMarker extends LatLng { kind?: 'pickup' | 'dest' | 'driver' | 'plain'; label?: string }

export interface MapProps {
  style?: ViewStyle;
  center: LatLng;
  zoom?: number;
  mode?: 'picker' | 'view';
  markers?: MapMarker[];
  driver?: LatLng | null;      // live-updated driver/courier marker
  userLocation?: LatLng | null; // the device's own location (blue dot)
  flyTo?: LatLng | null;        // recenter when this changes
  route?: LatLng[];
  onCenterChange?: (p: LatLng) => void; // picker mode: reports the centre coord
  onReady?: () => void;
}
