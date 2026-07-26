import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { useRideDraft } from '../src/store/rideDraft';
import { useRecents } from '../src/store/recentsStore';
import { useSavedPlaces } from '../src/store/savedPlacesStore';
import { forwardSearch, reverseGeocode } from '../src/lib/geocode';
import { getCurrentLocation } from '../src/lib/location';
import { consumePicked } from '../src/lib/pickerSignal';
import { Place, searchPlaces } from '../src/data/places';
import { Row, Empty } from '../src/components/ui';

type Field = 'origin' | 'dest';

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const params = useLocalSearchParams<{ field?: string }>();

  const origin = useRideDraft((s) => s.origin);
  const dest = useRideDraft((s) => s.dest);
  const setOrigin = useRideDraft((s) => s.setOrigin);
  const setDest = useRideDraft((s) => s.setDest);
  const recents = useRecents((s) => s.recents);
  const addRecent = useRecents((s) => s.add);
  const home = useSavedPlaces((s) => s.home);
  const work = useSavedPlaces((s) => s.work);
  const custom = useSavedPlaces((s) => s.custom);

  const [field, setField] = useState<Field>(params.field === 'origin' ? 'origin' : 'dest');
  const [q, setQ] = useState('');
  const [online, setOnline] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live map-backed suggestions (debounced) merged with the built-in places.
  useEffect(() => {
    const term = q.trim();
    if (timer.current) clearTimeout(timer.current);
    if (term.length < 3) { setOnline([]); setSearching(false); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const res = await forwardSearch(term);
      setOnline(res);
      setSearching(false);
    }, 450);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  const local = searchPlaces(q);
  const results = [...local];
  online.forEach((o) => { if (!results.some((m) => m.label === o.label && m.sub === o.sub)) results.push(o); });

  // The map picker already filled the field — close this list too so the user
  // lands back on the composer instead of having to tap the new "Recent" row.
  useFocusEffect(useCallback(() => {
    if (consumePicked()) router.back();
  }, []));

  function activate(f: Field) {
    setField(f);
    setQ('');
  }

  const [locating, setLocating] = useState(false);

  function pick(p: Place) {
    if (field === 'origin') setOrigin(p);
    else setDest(p);
    addRecent(p);
    router.back();
  }

  async function useCurrentLocation() {
    setLocating(true);
    const loc = await getCurrentLocation();
    if (!loc) {
      setLocating(false);
      return Alert.alert('Location unavailable', 'Turn on location access to use your current position.');
    }

    // The coordinates ARE the answer — the street name is decoration. Set the field and leave
    // immediately instead of holding the user on a spinner while a geocoder is consulted:
    // waiting on the name is what made this button look like it never finished.
    setLocating(false);
    pick({
      label: 'Current location',
      sub: `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`,
      lat: loc.lat, lng: loc.lng,
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8 }}>
      {/* Header */}
      <Row style={{ paddingHorizontal: 16, gap: 12, marginBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: c.text }}>Plan your ride</Text>
      </Row>

      {/* From / To panel — tap a row to edit it */}
      <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
        <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 18, paddingHorizontal: 14 }}>
          <FieldRow
            active={field === 'origin'} icon="ellipse" iconColor={c.primary}
            value={origin.label} placeholder="Search pickup"
            q={q} setQ={setQ} onActivate={() => activate('origin')} c={c}
          />
          <View style={{ height: 1, backgroundColor: c.border, marginLeft: 26 }} />
          <FieldRow
            active={field === 'dest'} icon="location" iconColor={c.danger}
            value={dest.label} placeholder="Search destination"
            q={q} setQ={setQ} onActivate={() => activate('dest')} c={c}
          />
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
      >
        {q.trim() ? (
          <>
            {results.map((p, i) => <PlaceRow key={i} p={p} c={c} onPress={() => pick(p)} />)}
            {searching && (
              <Row style={{ gap: 10, paddingVertical: 14 }}>
                <ActivityIndicator color={c.primary} />
                <Text style={{ fontSize: 14, color: c.textMuted }}>Searching places…</Text>
              </Row>
            )}
            {!searching && results.length === 0 && <Empty message="No places match that search" />}
          </>
        ) : (
          <>
            {/* Use current location */}
            <TouchableOpacity activeOpacity={0.7} onPress={useCurrentLocation} disabled={locating}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="locate" size={18} color={c.primary} />
              </View>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: c.text }}>Use current location</Text>
              {locating ? <ActivityIndicator size="small" color={c.primary} /> : <Ionicons name="chevron-forward" size={18} color={c.textMuted} />}
            </TouchableOpacity>

            {/* Choose on map */}
            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push(`/map-picker?target=${field}&via=search` as any)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="map" size={18} color={c.primary} />
              </View>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: c.text }}>Choose on map</Text>
              <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
            </TouchableOpacity>

            {/* Saved pills + add shortcut. Tapping an unset Home/Work opens the map
                picker to set it (and fills the current field), then it's a one-tap
                shortcut from then on. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16, marginBottom: 18 }}>
              <SavedPill icon="home" label="Home" c={c}
                onPress={() => home ? pick(home) : router.push(`/map-picker?target=home&field=${field}&via=search` as any)} />
              <SavedPill icon="briefcase" label="Work" c={c}
                onPress={() => work ? pick(work) : router.push(`/map-picker?target=work&field=${field}&via=search` as any)} />
              {custom.map((s) => (
                <SavedPill key={s.id} icon="bookmark" label={s.place.label} c={c} onPress={() => pick(s.place)} />
              ))}
              <TouchableOpacity onPress={() => router.push('/saved-places' as any)} activeOpacity={0.85}
                style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.border }}>
                <Ionicons name="add" size={20} color={c.primary} />
              </TouchableOpacity>
            </View>

            {recents.length > 0 && (
              <>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 }}>
                  Recent
                </Text>
                {recents.map((p, i) => (
                  <PlaceRow key={i} p={p} c={c} icon="time-outline" onPress={() => pick(p)} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function FieldRow({ active, icon, iconColor, value, placeholder, q, setQ, onActivate, c }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }}>
      <Ionicons name={icon} size={11} color={iconColor} />
      {active ? (
        <TextInput
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder={placeholder}
          placeholderTextColor={c.textMuted}
          style={{ flex: 1, fontSize: 15, fontWeight: '600', color: c.text, padding: 0 }}
        />
      ) : (
        <TouchableOpacity style={{ flex: 1 }} onPress={onActivate} activeOpacity={0.7}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }} numberOfLines={1}>{value}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function PlaceRow({ p, c, onPress, icon = 'location-outline' }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={c.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>{p.label}</Text>
        <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 1 }}>{p.sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
    </TouchableOpacity>
  );
}

function SavedPill({ icon, label, onPress, c }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
      <Ionicons name={icon} size={16} color={c.primary} />
      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: c.text, maxWidth: 140 }}>{label}</Text>
    </TouchableOpacity>
  );
}
