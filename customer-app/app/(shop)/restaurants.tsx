import { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Image, ImageBackground, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { shopApi, Restaurant, Promo, promoTerms } from '../../src/api/shop';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useShopCart } from '../../src/store/shopCart';
import { useShopFilter, activeFilterCount } from '../../src/store/shopFilter';
import { useFavourites } from '../../src/store/favouritesStore';
import { restaurantMeta, distanceKm } from '../../src/data/shopCatalog';
import { imageSrc } from '../../src/lib/imageSrc';
import { getCurrentLocation } from '../../src/lib/location';
import { reverseGeocode } from '../../src/lib/geocode';
import { Row } from '../../src/components/ui';

function ratingFor(name: string) { return 4.3 + (name.length % 5) * 0.1; }
function countFor(name: string) {
  const n = 600 + (name.length * 317) % 5000;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k+` : `${Math.round(n / 100) * 100}+`;
}

// Vendor-type tabs for the shop hub. 'ALL' shows everything; the rest map to a vendorType.
const VENDOR_TYPES: { key: string; label: string; icon: any }[] = [
  { key: 'ALL', label: 'All', icon: 'apps-outline' },
  { key: 'RESTAURANT', label: 'Food', icon: 'fast-food-outline' },
  { key: 'PHARMACY', label: 'Pharmacy', icon: 'medkit-outline' },
  { key: 'GROCERY', label: 'Grocery', icon: 'basket-outline' },
  { key: 'CONVENIENCE', label: 'Convenience', icon: 'storefront-outline' },
  { key: 'OTHER', label: 'More', icon: 'ellipsis-horizontal' },
];
const TYPE_LABEL: Record<string, string> = {
  RESTAURANT: 'Food', PHARMACY: 'Pharmacy', GROCERY: 'Grocery', CONVENIENCE: 'Convenience', OTHER: 'Shop',
};

export default function RestaurantsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const deliveryPlace = useShopCart((s) => s.deliveryPlace);
  const placeChosen = useShopCart((s) => s.placeChosen);
  const setDeliveryPlaceAuto = useShopCart((s) => s.setDeliveryPlaceAuto);
  const filter = useShopFilter();

  /**
   * Open on where the customer actually is.
   *
   * The delivery address started on a hardcoded Osu for everybody, so someone in Tema was shown
   * Osu delivery fees and distances until they noticed and changed it. Only fills in while the
   * address is still a stand-in — once they pick one it is theirs, and the cart is cleared on every
   * sign-in, so the next person to use the phone starts from their own location rather than the
   * last person's.
   */
  useEffect(() => {
    if (placeChosen) return;
    let active = true;
    getCurrentLocation().then(async (loc) => {
      if (!active || !loc) return;
      // Coordinates first so fees and distances are right immediately, then the name once it
      // arrives — an address the customer cannot recognise is not much better than the wrong one.
      setDeliveryPlaceAuto({ label: 'Current location', sub: `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`, lat: loc.lat, lng: loc.lng });
      const geo = await reverseGeocode(loc.lat, loc.lng).catch(() => null);
      if (!active || !geo) return;
      if (useShopCart.getState().placeChosen) return;   // they picked one while we were asking
      setDeliveryPlaceAuto({ label: geo.label, sub: geo.sub, lat: loc.lat, lng: loc.lng });
    }).catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeChosen]);
  const [list, setList] = useState<Restaurant[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [q, setQ] = useState('');
  const [vType, setVType] = useState('ALL');
  const favIds = useFavourites((s) => s.ids);
  const toggleFav = useFavourites((s) => s.toggle);
  const [refreshing, setRefreshing] = useState(false);
  const cat = filter.category; // cuisine category now lives in the Filter page

  async function load() {
    // Anchored on wherever the customer is shopping from, so the list is shops they can
    // actually order from. Without it the server has to return every vendor on the platform.
    const near = deliveryPlace?.lat != null && deliveryPlace?.lng != null
      ? { lat: deliveryPlace.lat, lng: deliveryPlace.lng }
      : undefined;
    try { setList(await shopApi.listRestaurants(near)); } catch {}
    try { setPromos(await shopApi.listPromos()); } catch {}
  }
  // Re-runs when the delivery location changes — moving the pin should move the shop list.
  useEffect(() => { load(); }, [deliveryPlace?.lat, deliveryPlace?.lng]);

  /**
   * How far a shop is, preferring the server's answer.
   *
   * The local helper measures from a constant in `shopCatalog` — a fixed point in Accra — so
   * every distance on this screen was the same wherever the customer actually was.
   */
  const kmFor = (r: { lat: number; lng: number; distanceKm?: number | null }) =>
    r.distanceKm ?? distanceKm(r.lat, r.lng);

  // Promo tap → go to exactly what the promo covers: the item, the category
  // within that vendor's menu, or the vendor itself. A promo with no vendor is a
  // generic announcement and falls back to filtering the browse by cuisine.
  function onPromo(p: Promo) {
    const r = p.vendorId ? list.find((x) => x.id === p.vendorId) : undefined;
    if (r) {
      const base = {
        restaurantId: r.id, name: r.name,
        lat: String(r.lat), lng: String(r.lng), vendorType: r.vendorType,
      };
      if (p.scope === 'ITEM' && p.menuItemId) {
        // Via the menu, which already loads the items and opens the right one —
        // the item screen needs name and price, which the promo doesn't carry.
        router.push({ pathname: '/(shop)/menu', params: { ...base, focusItem: p.menuItemId } } as any);
        return;
      }
      if (p.scope === 'CATEGORY' && p.category) {
        // The menu screen scrolls to and highlights this category.
        router.push({ pathname: '/(shop)/menu', params: { ...base, focusCategory: p.category } } as any);
        return;
      }
      router.push({ pathname: '/(shop)/menu', params: base } as any);
      return;
    }
    if (p.category) { filter.setCategory(p.category); setVType('RESTAURANT'); }
  }

  // Only show type tabs for types that actually exist in the data (+ All).
  const typeTabs = VENDOR_TYPES.filter((t) => t.key === 'ALL' || list.some((r) => r.vendorType === t.key));
  // Cuisine category only applies to food vendors.
  const showCuisines = vType === 'ALL' || vType === 'RESTAURANT';
  function pickType(key: string) { setVType(key); filter.setCategory('All'); }

  let shown = list
    .filter((r) => r.name.toLowerCase().includes(q.toLowerCase()))
    .filter((r) => vType === 'ALL' || r.vendorType === vType)
    .filter((r) => !showCuisines || cat === 'All' || restaurantMeta(r.name, r.vendorType).categories.includes(cat));
  if (filter.openNow) shown = shown.filter((r) => r.status === 'OPEN');
  if (filter.freeDelivery) shown = shown.filter((r) => restaurantMeta(r.name, r.vendorType).deliveryFee <= 3);
  if (filter.favouritesOnly) shown = shown.filter((r) => favIds.includes(r.id));
  if (filter.sort === 'nearest') shown = [...shown].sort((a, b) => kmFor(a) - kmFor(b));
  if (filter.sort === 'rating') shown = [...shown].sort((a, b) => ratingFor(b.name) - ratingFor(a.name));
  if (filter.sort === 'fastest') shown = [...shown].sort((a, b) => a.prepMinutes - b.prepMinutes);

  const fCount = activeFilterCount(filter);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>

        {/* Location + Orders */}
        <Row style={{ paddingHorizontal: 16, justifyContent: 'space-between', marginBottom: 16 }}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/(shop)/address' as any)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Ionicons name="location-sharp" size={15} color={c.text} />
            <View style={{ flex: 1 }}>
              <Row style={{ gap: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }} numberOfLines={1}>{deliveryPlace.label}</Text>
                <Ionicons name="chevron-down" size={13} color={c.textMuted} />
              </Row>
              <Text style={{ fontSize: 11.5, color: c.textMuted }} numberOfLines={1}>{deliveryPlace.sub}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(shop)/orders' as any)} activeOpacity={0.8}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="receipt-outline" size={18} color={c.text} />
          </TouchableOpacity>
        </Row>

        {/* Promo cards — admin-controlled, clickable */}
        {showCuisines && promos.length > 0 && <DealsCarousel c={c} promos={promos} onPromo={onPromo} />}

        {/* Ride / Shop / Parcel */}
        <Row style={{ paddingHorizontal: 24, gap: 8, marginBottom: 18 }}>
          <Circle icon="car-sport" label="Ride" onPress={() => router.replace('/(rider)/home' as any)} c={c} />
          <Circle icon="storefront" label="Shop" active onPress={() => {}} c={c} />
          <Circle icon="cube" label="Parcel" onPress={() => router.replace('/(parcel)' as any)} c={c} />
        </Row>

        {/* Search + filter */}
        <Row style={{ paddingHorizontal: 16, gap: 10, marginBottom: 14 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surfaceAlt, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 }}>
            <Ionicons name="search" size={18} color={c.primary} />
            <TextInput value={q} onChangeText={setQ} placeholder="Search GoShop" placeholderTextColor={c.textMuted} style={{ flex: 1, fontSize: 15, color: c.text, padding: 0 }} />
          </View>
          <TouchableOpacity onPress={() => router.push('/(shop)/filter' as any)} activeOpacity={0.85}
            style={{ width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: fCount > 0 ? c.primary : c.surfaceAlt }}>
            <Ionicons name="options" size={20} color={fCount > 0 ? '#fff' : c.primary} />
            {fCount > 0 && (
              <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{fCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </Row>

        {/* Vendor-type tabs — beneath the search bar */}
        {typeTabs.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }} style={{ marginBottom: 16 }}>
            {typeTabs.map((t) => {
              const sel = vType === t.key;
              return (
                <TouchableOpacity key={t.key} onPress={() => pickType(t.key)} activeOpacity={0.85}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 15, paddingVertical: 10, borderRadius: 999, backgroundColor: sel ? c.primary : c.surface, borderWidth: 1, borderColor: sel ? c.primary : c.border }}>
                  <Ionicons name={t.icon} size={16} color={sel ? '#fff' : c.text} />
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: sel ? '#fff' : c.text }}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Vendor cards */}
        <View style={{ paddingHorizontal: 16 }}>
          {shown.length === 0 ? (
            <Text style={{ color: c.textMuted, fontSize: 15, textAlign: 'center', paddingVertical: 40 }}>
              {filter.favouritesOnly && favIds.length === 0
                ? 'No favourites yet — tap the heart on a vendor to save it.'
                : 'No vendors match'}
            </Text>
          ) : (
            shown.map((r) => {
              const meta = restaurantMeta(r.name, r.vendorType);
              return (
                <TouchableOpacity key={r.id} activeOpacity={0.9}
                  onPress={() => router.push({ pathname: '/(shop)/menu', params: { restaurantId: r.id, name: r.name, lat: String(r.lat), lng: String(r.lng), vendorType: r.vendorType } })}
                  style={{ marginBottom: 22 }}>
                  <View>
                    {/* The shop's own picture wins. This used to render `meta.banner` only —
                        bundled metadata keyed by name — so a vendor who uploaded a storefront
                        never saw it here, and every vendor not in that list (which, after the
                        Kumasi rename, was all of them) drew the same generic food photo. */}
                    <Image source={{ uri: imageSrc(r.imageUrl) || meta.banner }} style={{ width: '100%', height: 170, borderRadius: 18, backgroundColor: c.surfaceAlt }} />
                    {meta.promo ? (
                      <View style={{ position: 'absolute', top: 12, left: 12, backgroundColor: c.danger, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{meta.promo}</Text>
                      </View>
                    ) : null}
                    <TouchableOpacity onPress={() => toggleFav(r.id)} activeOpacity={0.8}
                      style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={favIds.includes(r.id) ? 'heart' : 'heart-outline'} size={19} color={favIds.includes(r.id) ? c.danger : '#111'} />
                    </TouchableOpacity>
                  </View>
                  <Row style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: c.text, flexShrink: 1 }} numberOfLines={1}>{r.name}</Text>
                    {r.vendorType !== 'RESTAURANT' && (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: c.primarySoft }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: c.primary }}>{TYPE_LABEL[r.vendorType] ?? 'Shop'}</Text>
                      </View>
                    )}
                  </Row>
                  <Row style={{ gap: 6, marginTop: 4 }}>
                    <Ionicons name="bicycle" size={14} color={c.textMuted} />
                    <Text style={{ fontSize: 13.5, color: c.textMuted }}>GH₵ {meta.deliveryFee.toFixed(2)} delivery · {r.prepMinutes} min</Text>
                  </Row>
                  <Row style={{ gap: 5, marginTop: 4 }}>
                    <Text style={{ fontSize: 13.5, color: c.text, fontWeight: '700' }}>{ratingFor(r.name).toFixed(1)}</Text>
                    <Ionicons name="star" size={13} color={c.text} />
                    <Text style={{ fontSize: 13.5, color: c.textMuted }}>({countFor(r.name)}) · {kmFor(r).toFixed(1)} km</Text>
                  </Row>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function DealsCarousel({ c, promos, onPromo }: any) {
  const screenW = Dimensions.get('window').width;
  const ref = useRef<ScrollView>(null);
  const idx = useRef(0);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (promos.length < 2) return;
    const t = setInterval(() => {
      idx.current = (idx.current + 1) % promos.length;
      ref.current?.scrollTo({ x: idx.current * screenW, animated: true });
      setActive(idx.current);
    }, 5000);
    return () => clearInterval(t);
  }, [screenW, promos.length]);

  return (
    <View style={{ marginBottom: 18 }}>
      <ScrollView
        ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => { const i = Math.round(e.nativeEvent.contentOffset.x / screenW); idx.current = i; setActive(i); }}
      >
        {promos.map((p: Promo) => {
          const terms = promoTerms(p);
          // Text sits on a dark scrim over an image so it stays readable on any
          // artwork; without an image the card falls back to its brand colour.
          const body = (
            <>
              <Row style={{ gap: 8, alignItems: 'center' }}>
                <Ionicons name="pricetags" size={20} color="#fff" />
                {terms ? (
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{terms}</Text>
                  </View>
                ) : null}
              </Row>
              <Text style={{ color: '#fff', fontSize: 23, fontWeight: '800', marginTop: 8 }} numberOfLines={1}>{p.title}</Text>
              {p.subtitle ? <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13.5, marginTop: 2 }} numberOfLines={1}>{p.subtitle}</Text> : null}
            </>
          );
          return (
            <View key={p.id} style={{ width: screenW, paddingHorizontal: 16 }}>
              <TouchableOpacity activeOpacity={0.9} onPress={() => onPromo(p)}
                style={{ height: 124, borderRadius: 22, overflow: 'hidden', backgroundColor: p.color || c.primary }}>
                {p.imageUrl ? (
                  <ImageBackground source={{ uri: p.imageUrl }} resizeMode="cover" style={{ flex: 1 }}>
                    <View style={{ flex: 1, padding: 20, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.42)' }}>
                      {body}
                    </View>
                  </ImageBackground>
                ) : (
                  <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>{body}</View>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
      {promos.length > 1 && (
        <Row style={{ justifyContent: 'center', gap: 6, marginTop: 10 }}>
          {promos.map((_: any, i: number) => (
            <View key={i} style={{ width: i === active ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === active ? c.primary : c.border }} />
          ))}
        </Row>
      )}
    </View>
  );
}

function Circle({ icon, label, onPress, active, c }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
      <View style={{ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.primary : c.surface, borderWidth: 1, borderColor: active ? c.primary : c.border }}>
        <Ionicons name={icon} size={24} color={active ? '#fff' : c.text} />
      </View>
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.text }}>{label}</Text>
    </TouchableOpacity>
  );
}
