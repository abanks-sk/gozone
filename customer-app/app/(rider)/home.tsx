import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, LayoutChangeEvent, PanResponder, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useRideDraft } from '../../src/store/rideDraft';
import { reverseGeocode } from '../../src/lib/geocode';
import { useProfileStore, initial } from '../../src/store/profileStore';
import { useRecents } from '../../src/store/recentsStore';
import { Row, SearchBar, ListRow } from '../../src/components/ui';
import { LeafletMap } from '../../src/components/LeafletMap';
import { LatLng } from '../../src/components/mapTypes';
import { getCurrentLocation } from '../../src/lib/location';

/**
 * The passenger home: where you are, and where you'd like to go.
 *
 * The GoRide composer used to live here too, so a screen asking "where to?" simultaneously showed
 * a from/to panel, a ride class, a price and a Request button for a trip nobody had chosen yet. It
 * now lives on `request.tsx`, which the search screen opens the moment a destination is set. What
 * is left here is one question and the map behind it.
 */
export default function RiderHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();

  // One colour in both themes, on purpose: the map tiles stay light whichever theme is on, so
  // the greeting is always sitting on white and always wants dark ink. Flipping it to white in
  // dark mode also drew a hard white-on-black seam across the middle of the screen, which read
  // as two unrelated halves rather than one screen.
  const onMapText = '#0B1220';
  const onMapMuted = 'rgba(11,18,32,0.66)';
  const scrimColor = '#FFFFFF';

  const origin = useRideDraft((s) => s.origin);
  const setOrigin = useRideDraft((s) => s.setOrigin);
  const setDest = useRideDraft((s) => s.setDest);
  const scheduledAt = useRideDraft((s) => s.scheduledAt);
  const name = useProfileStore((s) => s.name);
  const recents = useRecents((s) => s.recents);
  const firstName = (name || '').trim().split(' ')[0] || 'there';
  const screenW = Dimensions.get('window').width;

  /**
   * The real height of this screen, measured rather than assumed.
   *
   * `Dimensions.get('window')` under Android edge-to-edge reports the area excluding the system
   * bars, but the app draws behind them — so a sheet sized from it stopped short of the bottom and
   * left a strip of map showing beneath the content, Google logo and all. onLayout gives the
   * container's true height, which is the number the sheet actually has to fill.
   */
  const [screenH, setScreenH] = useState(Dimensions.get('window').height);
  const onRootLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0 && Math.abs(h - screenH) > 1) setScreenH(h);
  };

  const heroH = Math.max(240, Math.round(screenH * 0.34)) + insets.top;

  // ── Pull-down sheet ────────────────────────────────────────────────────────
  // Drag the content out of the way and the map goes full screen, with the search bar and the
  // three destinations left docked at the bottom.
  //
  // Built on PanResponder + Animated rather than a bottom-sheet library: reanimated and
  // gesture-handler are not in this app, and adding native modules would cost the Expo Go
  // workflow everything here depends on.
  const EXPANDED_Y = heroH;                              // resting position — map on top, content below
  const PEEK = 210 + insets.bottom;                      // handle + search bar + the three circles

  /**
   * How far the sheet can travel, measured from its own laid-out height.
   *
   * The sheet is anchored `top: EXPANDED_Y, bottom: 0` — the same box as the map — instead of being
   * given a height computed from the window. That is what finally closes the gap along the bottom
   * edge: a computed height only matches the visible area if the number you computed it from is
   * the visible area, and under Android edge-to-edge it is not. Two things anchored to the same
   * bottom cannot leave one showing beneath the other, whatever the system bars are doing.
   */
  const [sheetH, setSheetH] = useState(0);
  const SLIDE = Math.max(0, sheetH - PEEK);
  // On a very short viewport (a small browser window, mostly) there is nowhere to slide to, and a
  // handle that cannot move should not invite a drag.
  const canCollapse = SLIDE > 80;
  const sheetY = useRef(new Animated.Value(0)).current;   // 0 = resting, SLIDE = pulled down
  // Where the sheet sits right now. Tracked in a ref rather than read off the Animated.Value,
  // because a native-driven value cannot be read synchronously from JS — `stopAnimation` hands
  // back the true position when a drag begins, which is the only moment we need it.
  const sheetAt = useRef(0);
  const [collapsed, setCollapsed] = useState(false);

  // React Native Web has no native animation module: `useNativeDriver: true` logs a warning on
  // every call and takes an unsupported path. Ask for the JS driver explicitly there and keep the
  // native one on device, where it is what makes the drag smooth.
  const useNative = Platform.OS !== 'web';

  const snapTo = (to: number) => {
    sheetAt.current = to;
    setCollapsed(to > 0);
    Animated.spring(sheetY, {
      toValue: to, useNativeDriver: useNative, bounciness: 2, speed: 14,
    }).start();
  };

  // Re-seat the sheet when its travel changes (first layout, or a rotation).
  useEffect(() => {
    const to = collapsed && canCollapse ? SLIDE : 0;
    sheetAt.current = to;
    sheetY.setValue(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SLIDE]);

  // The responder is built once, so it reads the live travel distance through a ref rather than
  // closing over the value it happened to see on the first render — before onLayout, that is 0.
  const slideRef = useRef(SLIDE);
  slideRef.current = SLIDE;

  const pan = useRef(
    PanResponder.create({
      // Claim only real vertical drags, so a tap still reaches the search bar underneath.
      onMoveShouldSetPanResponder: (_e, g) =>
        slideRef.current > 80 && Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => { sheetY.stopAnimation((v: number) => { if (typeof v === 'number') sheetAt.current = v; }); },
      onPanResponderMove: (_e, g) => {
        const next = Math.min(slideRef.current, Math.max(0, sheetAt.current + g.dy));
        sheetY.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        // A deliberate flick wins over position — releasing mid-way after throwing it downward
        // should finish the throw, not spring back because you let go too early.
        const max = slideRef.current;
        const y = Math.min(max, Math.max(0, sheetAt.current + g.dy));
        if (g.vy > 0.5) return snapTo(max);
        if (g.vy < -0.5) return snapTo(0);
        snapTo(y > max / 2 ? max : 0);
      },
    }),
  ).current;

  // Where the rider is, so the map opens on them rather than on a generic city view.
  const [myLoc, setMyLoc] = useState<LatLng | null>(null);
  // The draft's pickup starts as a seeded place (Kotoka), which is nobody's actual pickup. Note
  // what it was on mount so we can tell "still the default" from "the rider chose this".
  const untouchedOrigin = useRef(origin);
  useEffect(() => {
    let active = true;
    getCurrentLocation().then((l) => {
      if (!active || !l) return;
      setMyLoc(l);
      // Default the pickup to where they are — the same thing every ride app does, and better
      // than silently proposing the airport.
      const o = untouchedOrigin.current;
      if (origin.lat === o.lat && origin.lng === o.lng) {
        // Set the coordinates straight away so the map can move, then upgrade the label once the
        // name arrives. Defaulting someone's pickup is only helpful if it tells them WHERE it is —
        // "Current location" is not a place they can check.
        setOrigin({ label: 'Current location', sub: `${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}`, lat: l.lat, lng: l.lng });
        reverseGeocode(l.lat, l.lng).then((geo) => {
          if (!active || !geo) return;
          const cur = useRideDraft.getState().origin;
          // Only rename if the rider has not picked somewhere else in the meantime.
          if (cur.lat === l.lat && cur.lng === l.lng) {
            setOrigin({ label: geo.label, sub: geo.sub, lat: l.lat, lng: l.lng });
          }
        }).catch(() => {});
      }
    }).catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only the pickup. The destination belongs to the trip you are composing, and this screen is no
  // longer where you compose one — showing a leftover pin here made the map look like it was
  // describing a journey that had not been asked for.
  const mapMarkers = [{ lat: origin.lat, lng: origin.lng, kind: 'pickup' as const, label: origin.label }];

  const scheduledFuture = !!scheduledAt && scheduledAt > Date.now();
  const schedLabel = scheduledFuture
    ? new Date(scheduledAt!).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : 'Now';

  // Picking a recent is choosing a destination, so it goes where choosing one goes.
  function chooseRecent(p: Parameters<typeof setDest>[0]) {
    setDest(p);
    router.push('/(rider)/request' as any);
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} onLayout={onRootLayout}>
      <StatusBar style="light" />

      {/* ── The map is the screen, not a band across the top ── */}
      <LeafletMap
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        mode="view"
        center={{ lat: origin.lat, lng: origin.lng }}
        zoom={15}
        markers={mapMarkers}
        userLocation={myLoc}
      />

      {/* Scrim so the greeting stays readable over whatever the map is showing. */}
      <Svg width={screenW} height={140} style={{ position: 'absolute', top: 0 }} pointerEvents="none">
        <Defs>
          <SvgGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={scrimColor} stopOpacity="0.82" />
            <Stop offset="1" stopColor={scrimColor} stopOpacity="0" />
          </SvgGradient>
        </Defs>
        <Rect x="0" y="0" width={screenW} height={140} fill="url(#scrim)" />
      </Svg>

      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, paddingTop: insets.top + 14, paddingHorizontal: 22 }} pointerEvents="box-none">
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={{ color: onMapMuted, fontSize: 14 }}>Good to see you</Text>
            <Text style={{ color: onMapText, fontSize: 25, fontWeight: '800', letterSpacing: -0.6, marginTop: 3 }}>
              Where to, {firstName}?
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/profile' as any)} activeOpacity={0.8}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{initial(name)}</Text>
            </View>
          </TouchableOpacity>
        </Row>
      </View>

      {/* ── Draggable sheet: everything that isn't the map ── */}
      <Animated.View
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h > 0 && h !== sheetH) setSheetH(h);
        }}
        style={{
          // Anchored to the same box as the map rather than sized from the window: `bottom: 0`
          // resolves to wherever the map's own `bottom: 0` resolves, so there is no arithmetic
          // left for the system bars to invalidate. The layout height this produces is also the
          // real one, which keeps the inner ScrollView's viewport honest.
          position: 'absolute', left: 0, right: 0, top: EXPANDED_Y, bottom: 0,
          transform: [{ translateY: sheetY }],
          backgroundColor: c.bg,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: -4 },
          elevation: 16,
        }}
      >
        {/* Grab area. The drag lives on the handle, search row and circles rather than the whole
            sheet, so it never fights the scrolling content below it. The handle carries no caption:
            a grab bar reads as one without being told, and the label was just noise on the screen
            people look at most. */}
        <View {...pan.panHandlers}>
          <TouchableOpacity activeOpacity={0.7} disabled={!canCollapse}
            onPress={() => snapTo(collapsed ? 0 : SLIDE)}
            style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 8 }}>
            <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: c.border }} />
          </TouchableOpacity>

          {/* Search and the three surfaces stay reachable in both positions — with the sheet down
              this is all that is left on screen, and it is what you came to the app to use. */}
          <View style={{ paddingHorizontal: 16 }}>
            <SearchBar placeholder="Where are you going?" trailingLabel={schedLabel}
              onTrailingPress={() => router.push('/(rider)/schedule' as any)} elevated
              onPress={() => router.push('/search?next=request' as any)} />
          </View>

          <Row style={{ paddingHorizontal: 24, marginTop: 18, gap: 8 }}>
            <QuickCircle icon="car-sport" label="Ride" active onPress={() => {}} c={c} />
            <QuickCircle icon="storefront" label="Shop" onPress={() => router.replace('/(shop)/restaurants' as any)} c={c} />
            <QuickCircle icon="cube" label="Parcel" onPress={() => router.replace('/(parcel)' as any)} c={c} />
          </Row>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
          <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
            {recents.length > 0 ? (
              <>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    Recent
                  </Text>
                  {/* Only the newest few fit here; the search screen lists everything this account
                      has ever looked up. */}
                  {recents.length > 5 && (
                    <TouchableOpacity onPress={() => router.push('/search?next=request' as any)} activeOpacity={0.7}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>See all</Text>
                    </TouchableOpacity>
                  )}
                </Row>
                {recents.slice(0, 5).map((p, i, arr) => (
                  <ListRow key={i} icon="time" title={p.label} subtitle={p.sub}
                    onPress={() => chooseRecent(p)} last={i === arr.length - 1} />
                ))}
              </>
            ) : (
              <Row style={{ gap: 10, paddingVertical: 8 }}>
                <Ionicons name="search" size={16} color={c.textMuted} />
                <Text style={{ flex: 1, fontSize: 13.5, color: c.textMuted, lineHeight: 19 }}>
                  Search for where you're going and we'll show you the fare before you book.
                </Text>
              </Row>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function QuickCircle({ icon, label, onPress, active, c }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
      <View style={{
        width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center',
        backgroundColor: active ? c.primary : c.surface, borderWidth: 1, borderColor: active ? c.primary : c.border,
      }}>
        <Ionicons name={icon} size={24} color={active ? '#fff' : c.text} />
      </View>
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.text }}>{label}</Text>
    </TouchableOpacity>
  );
}
