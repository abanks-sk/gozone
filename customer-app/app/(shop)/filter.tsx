import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useShopFilter, SORTS } from '../../src/store/shopFilter';
import { CATEGORIES } from '../../src/data/shopCatalog';
import { Row } from '../../src/components/ui';

export default function FilterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const f = useShopFilter();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Row style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, justifyContent: 'space-between', marginBottom: 8 }}>
        <Row style={{ gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color={c.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Filters</Text>
        </Row>
        <TouchableOpacity onPress={() => f.reset()} activeOpacity={0.7}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: c.primary }}>Reset</Text>
        </TouchableOpacity>
      </Row>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 120 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Sort by</Text>
        {SORTS.map((s) => {
          const sel = f.sort === s.key;
          return (
            <TouchableOpacity key={s.key} onPress={() => f.setSort(s.key)} activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ fontSize: 15, color: c.text, fontWeight: sel ? '600' : '400' }}>{s.label}</Text>
              <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={22} color={sel ? c.primary : c.textMuted} />
            </TouchableOpacity>
          );
        })}

        <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 24, marginBottom: 10 }}>Food category</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CATEGORIES.map((cat) => {
            const sel = f.category === cat;
            return (
              <TouchableOpacity key={cat} onPress={() => f.setCategory(cat)} activeOpacity={0.85}
                style={{ paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999, backgroundColor: sel ? c.primary : c.surface, borderWidth: 1, borderColor: sel ? c.primary : c.border }}>
                <Text style={{ fontSize: 13.5, fontWeight: '600', color: sel ? '#fff' : c.text }}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 24, marginBottom: 4 }}>Options</Text>
        <ToggleRow label="Favourites only" value={f.favouritesOnly} onToggle={() => f.setFavouritesOnly(!f.favouritesOnly)} c={c} />
        <ToggleRow label="Open now" value={f.openNow} onToggle={() => f.setOpenNow(!f.openNow)} c={c} />
        <ToggleRow label="Free / low delivery fee" value={f.freeDelivery} onToggle={() => f.setFreeDelivery(!f.freeDelivery)} c={c} last />
      </ScrollView>

      <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 14 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.9}
          style={{ backgroundColor: c.primary, borderRadius: 999, paddingVertical: 16, alignItems: 'center', shadowColor: c.primary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Show results</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ToggleRow({ label, value, onToggle, c, last }: any) {
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border }}>
      <Text style={{ fontSize: 15, color: c.text }}>{label}</Text>
      <View style={{ width: 46, height: 28, borderRadius: 14, padding: 3, backgroundColor: value ? c.primary : c.border, justifyContent: 'center' }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignSelf: value ? 'flex-end' : 'flex-start' }} />
      </View>
    </TouchableOpacity>
  );
}
