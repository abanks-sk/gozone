import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { MapMarker, MapProps } from './mapTypes';

// Google Maps (react-native-maps + PROVIDER_GOOGLE) for the driver app. Metro picks this
// on iOS/Android; GoogleMap.tsx (a lightweight placeholder) is used on web.
export type { LatLng, MapMarker } from './mapTypes';

const DOT_COLOR: Record<string, string> = { pickup: '#22c55e', dest: '#ef4444', plain: '#64748b' };

function zoomToDelta(zoom: number) {
  const d = 360 / Math.pow(2, zoom);
  return { latitudeDelta: d, longitudeDelta: d };
}

/** Compass bearing (0–360°) from one coord to the next, so the car faces its travel direction. */
function bearing(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function Dot({ color }: { color: string }) {
  return <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: color, borderWidth: 2, borderColor: '#fff' }} />;
}

/** Top-down car marker (points "up" at 0°; the wrapper rotates it to the heading). */
function CarMarker({ color }: { color: string }) {
  return (
    <Svg width={34} height={34} viewBox="0 0 32 32">
      <Rect x="5.5" y="9" width="4" height="6" rx="1.5" fill="#111827" />
      <Rect x="22.5" y="9" width="4" height="6" rx="1.5" fill="#111827" />
      <Rect x="5.5" y="17" width="4" height="6" rx="1.5" fill="#111827" />
      <Rect x="22.5" y="17" width="4" height="6" rx="1.5" fill="#111827" />
      <Rect x="8" y="4.5" width="16" height="23" rx="5" fill={color} stroke="#fff" strokeWidth="1.5" />
      <Rect x="10.5" y="7" width="11" height="5" rx="2" fill="#DBEAFE" />
      <Rect x="10.5" y="20" width="11" height="4.5" rx="2" fill="#93C5FD" />
    </Svg>
  );
}

export function GoogleMap({
  style, center, zoom = 14, mode = 'view', markers = [],
  driver = null, userLocation = null, flyTo = null, route = [], onCenterChange, onReady,
}: MapProps) {
  const { colors } = useTheme();
  const mapRef = useRef<MapView>(null);

  const prevDriver = useRef<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading] = useState(0);
  useEffect(() => {
    if (!driver) { prevDriver.current = null; return; }
    const p = prevDriver.current;
    if (p && (p.lat !== driver.lat || p.lng !== driver.lng)) {
      setHeading(bearing(p.lat, p.lng, driver.lat, driver.lng));
    }
    prevDriver.current = { lat: driver.lat, lng: driver.lng };
  }, [driver?.lat, driver?.lng]);

  const initialRegion = useMemo<Region>(() => ({
    latitude: center.lat, longitude: center.lng, ...zoomToDelta(zoom),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const fitPoints = useMemo(
    () => [
      ...markers.map((m) => ({ latitude: m.lat, longitude: m.lng })),
      ...route.map((r) => ({ latitude: r.lat, longitude: r.lng })),
    ],
    [markers, route],
  );

  function handleReady() {
    if (mode === 'view' && fitPoints.length >= 2) {
      mapRef.current?.fitToCoordinates(fitPoints, {
        edgePadding: { top: 70, right: 50, bottom: 70, left: 50 }, animated: false,
      });
    }
    onReady?.();
  }

  useEffect(() => {
    if (!flyTo) return;
    mapRef.current?.animateToRegion({ latitude: flyTo.lat, longitude: flyTo.lng, ...zoomToDelta(16) }, 500);
  }, [flyTo?.lat, flyTo?.lng]);

  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        onMapReady={handleReady}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onRegionChangeComplete={
          mode === 'picker' && onCenterChange
            ? (r) => onCenterChange({ lat: r.latitude, lng: r.longitude })
            : undefined
        }
      >
        {markers.filter((m: MapMarker) => m.kind !== 'driver').map((m, i) => (
          <Marker key={`m${i}`} coordinate={{ latitude: m.lat, longitude: m.lng }} title={m.label} anchor={{ x: 0.5, y: 0.5 }}>
            <Dot color={DOT_COLOR[m.kind ?? 'plain'] ?? DOT_COLOR.plain} />
          </Marker>
        ))}

        {driver && (
          <Marker coordinate={{ latitude: driver.lat, longitude: driver.lng }} anchor={{ x: 0.5, y: 0.5 }} flat>
            <View style={{ transform: [{ rotate: `${heading}deg` }] }}>
              <CarMarker color={colors.primary} />
            </View>
          </Marker>
        )}

        {userLocation && (
          <Marker coordinate={{ latitude: userLocation.lat, longitude: userLocation.lng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#2563EB', borderWidth: 3, borderColor: '#fff' }} />
          </Marker>
        )}

        {route.length > 1 && (
          <Polyline coordinates={route.map((r) => ({ latitude: r.lat, longitude: r.lng }))} strokeColor={colors.primary} strokeWidth={5} />
        )}
      </MapView>

      {mode === 'picker' && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="location" size={42} color={colors.primary} style={{ marginBottom: 42 }} />
        </View>
      )}
    </View>
  );
}
