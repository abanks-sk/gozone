import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { useRideDraft } from '../src/store/rideDraft';
import { useShopCart } from '../src/store/shopCart';
import { useRecents } from '../src/store/recentsStore';
import { useSavedPlaces } from '../src/store/savedPlacesStore';
import { LeafletMap, LatLng } from '../src/components/LeafletMap';
import { reverseGeocode } from '../src/lib/geocode';
import { getCurrentLocation } from '../src/lib/location';
import { signalPicked } from '../src/lib/pickerSignal';
import { Place, ACCRA_CENTER } from '../src/data/places';

type Target = 'origin' | 'dest' | 'shop' | 'home' | 'work' | 'saved';
const TITLES: Record<Target, string> = {
  origin: 'Set pickup', dest: 'Set destination', shop: 'Set delivery location',
  home: 'Set home address', work: 'Set work address', saved: 'Save a place',
};

export default function MapPicker() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const { target, field, from, via } = useLocalSearchParams<{ target?: string; field?: string; from?: string; via?: string }>();
  const tgt: Target = (['origin', 'shop', 'home', 'work', 'saved'] as const).includes(target as any)
    ? (target as Target) : 'dest';

  const origin = useRideDraft((s) => s.origin);
  const dest = useRideDraft((s) => s.dest);
  const setOrigin = useRideDraft((s) => s.setOrigin);
  const setDest = useRideDraft((s) => s.setDest);
  const deliveryPlace = useShopCart((s) => s.deliveryPlace);
  const setDeliveryPlace = useShopCart((s) => s.setDeliveryPlace);
  const addRecent = useRecents((s) => s.add);
  const savedHome = useSavedPlaces((s) => s.home);
  const savedWork = useSavedPlaces((s) => s.work);
  const setHome = useSavedPlaces((s) => s.setHome);
  const setWork = useSavedPlaces((s) => s.setWork);
  const addCustom = useSavedPlaces((s) => s.addCustom);

  // Where the pin starts: the existing value for that target, or Accra centre.
  const current: Place =
    tgt === 'origin' ? origin
    : tgt === 'shop' ? deliveryPlace
    : tgt === 'home' ? (savedHome ?? ACCRA_CENTER)
    : tgt === 'work' ? (savedWork ?? ACCRA_CENTER)
    : tgt === 'saved' ? ACCRA_CENTER
    : dest;
  const [coord, setCoord] = useState<LatLng>({ lat: current.lat, lng: current.lng });
  const [label, setLabel] = useState(current.label);
  const [sub, setSub] = useState(current.sub);
  const [geocoding, setGeocoding] = useState(false);
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [flyTarget, setFlyTarget] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show where the user actually is as soon as the map opens (blue dot), even
  // though the pin they're placing may be somewhere else entirely. Silent: no
  // alert if permission is refused — the "locate me" button reports that.
  useEffect(() => {
    let active = true;
    getCurrentLocation().then((loc) => { if (active && loc) setUserLoc(loc); }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function locateMe() {
    setLocating(true);
    const loc = await getCurrentLocation();
    setLocating(false);
    if (!loc) return Alert.alert('Location unavailable', 'Turn on location access to use your current position.');
    setUserLoc(loc);
    setFlyTarget({ ...loc }); // recenter the pin on the user; moveend updates the address
  }

  function onCenter(p: LatLng) {
    setCoord(p);
    setGeocoding(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await reverseGeocode(p.lat, p.lng);
      if (r) { setLabel(r.label); setSub(r.sub); }
      else { setLabel('Pinned location'); setSub(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`); }
      setGeocoding(false);
    }, 650);
  }

  /**
   * Close the picker. When it was opened from the search / delivery-address
   * screen (`via`), signal that screen to close itself too, so the user lands
   * back on the composer with the field already filled — otherwise they're
   * dropped on the search list where the only visible change is a new "Recent"
   * row, and choosing on the map feels like it did nothing.
   */
  function close() {
    if (via) signalPicked();
    router.back();
  }

  function confirm() {
    const rawLabel = label || 'Pinned location';
    const subText = sub || `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`;
    const place: Place = { label: rawLabel, sub: subText, lat: coord.lat, lng: coord.lng };

    if (tgt === 'origin') { setOrigin(place); addRecent(place); }
    else if (tgt === 'shop') { setDeliveryPlace(place); addRecent(place); }
    else if (tgt === 'dest') { setDest(place); addRecent(place); }
    else if (tgt === 'saved') { addCustom(place); }
    else if (tgt === 'home' || tgt === 'work') {
      // A Home/Work address keeps its shortcut label but remembers the real address.
      const named: Place = { ...place, label: tgt === 'home' ? 'Home' : 'Work', sub: rawLabel };
      (tgt === 'home' ? setHome : setWork)(named);
      // If we came here to fill a field too, do it and drop the user back where they were.
      if (field === 'origin') { setOrigin(named); addRecent(named); }
      else if (field === 'dest') { setDest(named); addRecent(named); }
      else if (from === 'shop') { setDeliveryPlace(named); addRecent(named); }
    }
    close();
  }

  const confirmLabel =
    tgt === 'home' ? 'Save home'
    : tgt === 'work' ? 'Save work'
    : tgt === 'saved' ? 'Save place'
    : 'Confirm location';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <LeafletMap style={{ flex: 1 }} mode="picker" center={{ lat: current.lat, lng: current.lng }} zoom={15}
        onCenterChange={onCenter} userLocation={userLoc} flyTo={flyTarget} />

      {/* Header */}
      <View style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </TouchableOpacity>
        <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>{TITLES[tgt]}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={locateMe} activeOpacity={0.8}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
          {locating ? <ActivityIndicator size="small" color={c.primary} /> : <Ionicons name="locate" size={20} color={c.primary} />}
        </TouchableOpacity>
      </View>

      {/* Bottom confirm card */}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 16 }}>
        <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 22, padding: 16, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="location" size={20} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }} numberOfLines={1}>{label}</Text>
              <Text style={{ fontSize: 12.5, color: c.textMuted }} numberOfLines={1}>
                {geocoding ? 'Finding address…' : sub}
              </Text>
            </View>
            {geocoding ? <ActivityIndicator color={c.primary} /> : null}
          </View>
          <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 10 }}>
            Drag the map to move the pin to your exact spot.{userLoc ? ' The blue dot is where you are now.' : ''}
          </Text>
          <TouchableOpacity onPress={confirm} activeOpacity={0.9}
            style={{ marginTop: 12, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{confirmLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
