import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { shopApi, MenuItem } from '../../src/api/shop';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useShopCart, cartCount, cartTotal } from '../../src/store/shopCart';
import { useFavourites } from '../../src/store/favouritesStore';
import { itemMeta, restaurantMeta, distanceKm } from '../../src/data/shopCatalog';
import { Empty, Row } from '../../src/components/ui';

const PILLS_H = 60;
function ratingFor(name: string) { return (4.3 + (name.length % 5) * 0.1).toFixed(1); }
function countFor(name: string) { const n = 600 + (name.length * 317) % 5000; return n >= 1000 ? `${(n / 1000).toFixed(1)}k+` : `${Math.round(n / 100) * 100}+`; }

export default function MenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const { restaurantId, name, lat, lng, vendorType } = useLocalSearchParams<{ restaurantId: string; name: string; lat?: string; lng?: string; vendorType?: string }>();
  const isFood = (vendorType ?? 'RESTAURANT') === 'RESTAURANT';
  const catalogTitle = isFood ? 'Menu' : 'Products';
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [active, setActive] = useState('Featured');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const isFav = useFavourites((s) => s.ids.includes(restaurantId));
  const toggleFav = useFavourites((s) => s.toggle);
  const cartRestId = useShopCart((s) => s.restaurantId);
  const lines = useShopCart((s) => s.lines);
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});

  useEffect(() => { shopApi.getMenu(restaurantId).then(setMenu).catch(() => {}); }, [restaurantId]);

  const meta = restaurantMeta(name);
  const dist = lat && lng ? distanceKm(Number(lat), Number(lng)) : null;
  const myLines = cartRestId === restaurantId ? lines : [];
  const count = cartCount(myLines);

  const grouped = useMemo(() => {
    const g: Record<string, MenuItem[]> = {};
    menu.forEach((it) => { const cat = itemMeta(it.name).category; (g[cat] ||= []).push(it); });
    return g;
  }, [menu]);
  const cats = Object.keys(grouped);
  const pills = ['Featured', ...cats];

  function jump(cat: string) {
    setActive(cat);
    const y = cat === 'Featured' ? (sectionY.current[cats[0]] ?? 0) : sectionY.current[cat];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - PILLS_H), animated: true });
  }

  function openItem(item: MenuItem) {
    router.push({ pathname: '/(shop)/item', params: { restaurantId, restaurantName: name, menuItemId: item.id, name: item.name, price: String(item.price), description: item.description ?? '' } });
  }

  // In-page search across this vendor's items (name + description).
  const searchResults = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return menu;
    return menu.filter((it) => it.name.toLowerCase().includes(t) || (it.description || itemMeta(it.name).description).toLowerCase().includes(t));
  }, [query, menu]);

  function closeSearch() { setSearching(false); setQuery(''); }
  function openFromSearch(item: MenuItem) { closeSearch(); openItem(item); }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}
        contentContainerStyle={{ paddingBottom: count > 0 ? 110 : insets.bottom + 24 }}>

        {/* 0 — cover + info + Menu title */}
        <View>
          <Image source={{ uri: meta.banner }} style={{ width: '100%', height: 200, backgroundColor: c.surfaceAlt }} />
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}
            style={[coverBtn, { position: 'absolute', top: insets.top + 8, left: 16 }]}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Row style={{ position: 'absolute', top: insets.top + 8, right: 16, gap: 10 }}>
            <TouchableOpacity onPress={() => setSearching(true)} activeOpacity={0.8} style={coverBtn}>
              <Ionicons name="search" size={19} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => toggleFav(restaurantId)} activeOpacity={0.8} style={coverBtn}>
              <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={19} color={isFav ? '#FF4D67' : '#fff'} />
            </TouchableOpacity>
          </Row>

          {/* Info card overlapping the cover */}
          <View style={{ marginTop: -26, backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 18 }}>
            <Row style={{ gap: 14, alignItems: 'flex-start' }}>
              <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: meta.logoColor, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>{name?.[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 23, fontWeight: '800', color: c.text }}>{name}</Text>
                <Row style={{ gap: 5, marginTop: 5 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: c.text }}>{ratingFor(name)}</Text>
                  <Ionicons name="star" size={13} color={c.text} />
                  <Text style={{ fontSize: 13.5, color: c.textMuted }}>({countFor(name)})</Text>
                  {dist != null && <Text style={{ fontSize: 13.5, color: c.textMuted }}> · {dist.toFixed(1)} km</Text>}
                </Row>
                <Row style={{ gap: 5, marginTop: 4 }}>
                  <Ionicons name="location-outline" size={13} color={c.textMuted} />
                  <Text style={{ fontSize: 13, color: c.textMuted, flex: 1 }} numberOfLines={1}>{meta.address}</Text>
                </Row>
              </View>
            </Row>
            <Row style={{ gap: 8, marginTop: 12 }}>
              {isFood ? (
                <Row style={{ gap: 5, backgroundColor: `${c.warning}1A`, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 }}>
                  <Ionicons name="flame" size={14} color={c.warning} />
                  <Text style={{ color: c.warning, fontWeight: '700', fontSize: 12.5 }}>Busy now</Text>
                </Row>
              ) : (
                <Row style={{ gap: 5, backgroundColor: `${c.success}1A`, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 }}>
                  <Ionicons name="time-outline" size={14} color={c.success} />
                  <Text style={{ color: c.success, fontWeight: '700', fontSize: 12.5 }}>Open now</Text>
                </Row>
              )}
              <Row style={{ gap: 5, backgroundColor: c.surfaceAlt, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 }}>
                <Ionicons name="bicycle" size={14} color={c.textMuted} />
                <Text style={{ color: c.text, fontWeight: '600', fontSize: 12.5 }}>GH₵ {meta.deliveryFee.toFixed(2)} delivery</Text>
              </Row>
            </Row>

            <Text style={{ fontSize: 24, fontWeight: '800', color: c.text, marginTop: 22 }}>{catalogTitle}</Text>
          </View>
        </View>

        {/* 1 — sticky category pills */}
        <View style={{ backgroundColor: c.bg, paddingTop: 10, paddingBottom: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {pills.map((p) => {
              const sel = active === p;
              return (
                <TouchableOpacity key={p} onPress={() => jump(p)} activeOpacity={0.85}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999, backgroundColor: sel ? c.text : c.surfaceAlt }}>
                  {p === 'Featured' && <Ionicons name="star" size={13} color={sel ? c.bg : c.text} />}
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: sel ? c.bg : c.text }}>{p}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* 2 — sections */}
        <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
          {menu.length === 0 ? (
            <Empty message="No items available" />
          ) : (
            cats.map((cat) => (
              <View key={cat} onLayout={(e) => { sectionY.current[cat] = e.nativeEvent.layout.y; }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: c.text, marginTop: 18, marginBottom: 6 }}>{cat}</Text>
                {grouped[cat].map((item) => {
                  const im = itemMeta(item.name);
                  return (
                    <TouchableOpacity key={item.id} activeOpacity={0.85} onPress={() => openItem(item)}
                      style={{ flexDirection: 'row', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{item.name}</Text>
                        <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 3, lineHeight: 18 }} numberOfLines={2}>{item.description || im.description}</Text>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, marginTop: 6 }}>GH₵ {item.price.toFixed(2)}</Text>
                      </View>
                      <View>
                        <Image source={{ uri: im.image }} style={{ width: 96, height: 96, borderRadius: 16, backgroundColor: c.surfaceAlt }} />
                        <View style={{ position: 'absolute', right: 6, bottom: 6, width: 30, height: 30, borderRadius: 15, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="add" size={18} color={c.primary} />
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Cart bar */}
      {count > 0 && (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 14 }}>
          <TouchableOpacity onPress={() => router.push('/(shop)/checkout' as any)} activeOpacity={0.9}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.primary, borderRadius: 999, paddingVertical: 15, paddingHorizontal: 22, shadowColor: c.primary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
            <Row style={{ gap: 10 }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{count}</Text>
              </View>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>View cart</Text>
            </Row>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>GH₵ {cartTotal(myLines).toFixed(2)}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* In-page search overlay */}
      {searching && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.bg, paddingTop: insets.top + 8 }}>
          <Row style={{ paddingHorizontal: 16, gap: 10, marginBottom: 12 }}>
            <TouchableOpacity onPress={closeSearch} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={26} color={c.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surfaceAlt, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 }}>
              <Ionicons name="search" size={18} color={c.primary} />
              <TextInput autoFocus value={query} onChangeText={setQuery}
                placeholder={`Search ${catalogTitle.toLowerCase()}`} placeholderTextColor={c.textMuted}
                style={{ flex: 1, fontSize: 15, color: c.text, padding: 0 }} />
              {query ? <TouchableOpacity onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={c.textMuted} /></TouchableOpacity> : null}
            </View>
          </Row>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
            {searchResults.length === 0 ? (
              <Empty message={`No items match “${query.trim()}”`} />
            ) : (
              searchResults.map((item) => {
                const im = itemMeta(item.name);
                return (
                  <TouchableOpacity key={item.id} activeOpacity={0.85} onPress={() => openFromSearch(item)}
                    style={{ flexDirection: 'row', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{item.name}</Text>
                      <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 3, lineHeight: 18 }} numberOfLines={2}>{im.description}</Text>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, marginTop: 6 }}>GH₵ {item.price.toFixed(2)}</Text>
                    </View>
                    <Image source={{ uri: im.image }} style={{ width: 84, height: 84, borderRadius: 16, backgroundColor: c.surfaceAlt }} />
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const coverBtn = { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center' as const, justifyContent: 'center' as const };
