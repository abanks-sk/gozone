import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MapProps } from './mapTypes';

// Web fallback — react-native-maps has no web build. Native uses GoogleMap.native.tsx.
export type { LatLng, MapMarker } from './mapTypes';

export function GoogleMap({ style }: MapProps) {
  const { colors } = useTheme();
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt }, style]}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>Map is available on the mobile app.</Text>
    </View>
  );
}
