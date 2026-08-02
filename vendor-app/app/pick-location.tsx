import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { LeafletMap, LatLng } from '../src/components/LeafletMap';
import { getCurrentLocation } from '../src/lib/location';
import { forwardSearch, reverseGeocode } from '../src/lib/geocode';
import { usePickedLocation } from '../src/store/pickedLocationStore';

/** Accra, only as an opening view when we have nothing better to centre on. */
const ACCRA: LatLng = { lat: 5.6037, lng: -0.187 };

/**
 * Where the business actually is.
 *
 * Vendor coordinates used to be **hardcoded to Accra** at sign-up (`DEFAULT_LAT/DEFAULT_LNG` in
 * onboarding), which is not a detail a vendor could ever correct — there was no editor. Every
 * business therefore sat on the same pin, which quietly breaks the things that depend on it:
 * distance-based delivery fees, the courier's route, and "how far away is this shop".
 *
 * Deliberately a purpose-built screen rather than a port of the customer's `map-picker`, which is
 * wired into ride drafts, shop carts, recents and saved places — none of which exist here.
 *
 * Uses the WebView/iframe Leaflet map, not `react-native-maps`, so it keeps working in Expo Go.
 */
export default function PickLocationScreen() {
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const router = useRouter();
  const setPicked = usePickedLocation((s) => s.set);

  const [centre, setCentre] = useState<LatLng>(ACCRA);
  const [flyTo, setFlyTo] = useState<LatLng | null>(null);
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [label, setLabel] = useState<string>('');
  const [resolving, setResolving] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ label: string; sub: string; lat: number; lng: number }[]>([]);
  const nameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open on the vendor's actual position where we can get it, silently. A denied permission is
  // not worth an alert here — the map still works, you just drag to your shop instead.
  useEffect(() => {
    getCurrentLocation()
      .then((p) => { if (p) { setUserLoc(p); setCentre(p); setFlyTo(p); } })
      .catch(() => {});
  }, []);

  // Name the pin as it settles, debounced — one lookup per pause, not one per frame of a drag.
  function onCentreChange(p: LatLng) {
    setCentre(p);
    if (nameTimer.current) clearTimeout(nameTimer.current);
    setResolving(true);
    nameTimer.current = setTimeout(async () => {
      const name = await reverseGeocode(p.lat, p.lng);
      setLabel(name ?? '');
      setResolving(false);
    }, 600);
  }

  function onQuery(q: string) {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => setResults(await forwardSearch(q)), 450);
  }

  async function locateMe() {
    const p = await getCurrentLocation().catch(() => null);
    if (!p) return Alert.alert('Location unavailable', 'Allow location access, or drag the map to your shop.');
    setUserLoc(p); setCentre(p); setFlyTo({ ...p });
    onCentreChange(p);
  }

  function confirm() {
    // The label is decoration; the coordinates are the point. Never block on the name resolving.
    setPicked({ lat: centre.lat, lng: centre.lng, label: label || query.trim() || '' });
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <LeafletMap
        style={{ flex: 1 }}
        mode="picker"
        center={centre}
        zoom={16}
        flyTo={flyTo}
        userLocation={userLoc}
        onCenterChange={onCentreChange}
      />

      {/* Search + back, floating over the map */}
      <View style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.85}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={24} color={c.text} />
          </TouchableOpacity>
          <TextInput
            value={query}
            onChangeText={onQuery}
            placeholder="Search for your area"
            placeholderTextColor={c.textMuted}
            style={{ flex: 1, height: 42, borderRadius: 21, paddingHorizontal: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, color: c.text, fontSize: 14.5 }}
          />
        </View>
        {results.length > 0 && (
          <View style={{ backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
            {results.slice(0, 5).map((r, i) => (
              <TouchableOpacity key={i} activeOpacity={0.8}
                onPress={() => {
                  const p = { lat: r.lat, lng: r.lng };
                  setCentre(p); setFlyTo(p); setLabel(r.label);
                  setResults([]); setQuery(r.label);
                }}
                style={{ paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: i < Math.min(results.length, 5) - 1 ? 1 : 0, borderBottomColor: c.border }}>
                <Text style={{ fontSize: 14.5, color: c.text, fontWeight: '600' }} numberOfLines={1}>{r.label}</Text>
                {r.sub ? <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 2 }} numberOfLines={1}>{r.sub}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Locate me */}
      <TouchableOpacity onPress={locateMe} activeOpacity={0.85}
        style={{ position: 'absolute', right: 14, bottom: 190, width: 46, height: 46, borderRadius: 23, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="locate" size={22} color={c.primary} />
      </TouchableOpacity>

      {/* Confirm card */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: c.border, padding: 20, paddingBottom: insets.bottom + 18 }}>
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 }}>Your business is here</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <Ionicons name="location" size={18} color={c.primary} />
          <Text style={{ flex: 1, fontSize: 15.5, fontWeight: '700', color: c.text }} numberOfLines={1}>
            {resolving ? 'Finding the address…' : (label || 'Dropped pin')}
          </Text>
          {resolving && <ActivityIndicator color={c.textMuted} />}
        </View>
        <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 6 }}>
          Drag the map so the pin sits on your shop. This is where couriers collect from, and it
          sets the delivery distance customers are charged for.
        </Text>
        <TouchableOpacity onPress={confirm} activeOpacity={0.9}
          style={{ marginTop: 16, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Use this location</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
