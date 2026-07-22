import { ViewStyle } from 'react-native';

export interface LatLng { lat: number; lng: number }
export interface MapMarker extends LatLng { kind?: 'pickup' | 'dest' | 'driver' | 'plain'; label?: string }

export interface MapProps {
  style?: ViewStyle;
  center: LatLng;
  zoom?: number;
  mode?: 'picker' | 'view';
  markers?: MapMarker[];
  driver?: LatLng | null;      // live-updated driver/courier marker
  userLocation?: LatLng | null;
  flyTo?: LatLng | null;
  route?: LatLng[];
  onCenterChange?: (p: LatLng) => void;
  onReady?: () => void;
}
