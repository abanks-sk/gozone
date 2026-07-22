import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { shopApi } from '../../src/api/shop';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useShopCart, CartOption } from '../../src/store/shopCart';
import { itemMeta, MODE_LABEL } from '../../src/data/shopCatalog';
import { Row } from '../../src/components/ui';

// Unified add-on shape (backend options carry an id; catalog fallback ones don't).
type UiOption = { id?: string; label: string; price: number };
type UiGroup = { name: string; multi: boolean; required: boolean; options: UiOption[] };

export default function ItemScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const p = useLocalSearchParams<{ restaurantId: string; restaurantName: string; menuItemId: string; name: string; price: string; description?: string }>();
  const add = useShopCart((s) => s.add);

  const meta = itemMeta(p.name);
  const basePrice = Number(p.price) || 0;

  // Start with the catalog fallback add-ons; swap to the vendor's real backend add-ons once loaded.
  const fallbackGroups: UiGroup[] = useMemo(
    () => meta.addOns.map((g) => ({ name: g.name, multi: g.type === 'multi', required: !!g.required, options: g.options.map((o) => ({ label: o.label, price: o.price })) })),
    [p.name],
  );
  const [groups, setGroups] = useState<UiGroup[]>(fallbackGroups);

  useEffect(() => {
    shopApi.getMenu(p.restaurantId).then((menu) => {
      const it = menu.find((m) => m.id === p.menuItemId);
      if (it?.groups && it.groups.length) {
        setGroups(it.groups.map((g) => ({ name: g.name, multi: g.multi, required: g.required, options: g.options.map((o) => ({ id: o.id, label: o.label, price: o.price })) })));
      }
    }).catch(() => {});
  }, [p.restaurantId, p.menuItemId]);

  // selections: group name -> chosen labels. Required single groups default to first.
  const [sel, setSel] = useState<Record<string, string[]>>({});
  useEffect(() => {
    const init: Record<string, string[]> = {};
    groups.forEach((g) => { init[g.name] = !g.multi && g.required && g.options[0] ? [g.options[0].label] : []; });
    setSel(init);
  }, [groups]);
  const [qty, setQty] = useState(1);

  function toggle(group: UiGroup, opt: UiOption) {
    setSel((prev) => {
      const cur = prev[group.name] ?? [];
      if (!group.multi) return { ...prev, [group.name]: [opt.label] };
      const has = cur.includes(opt.label);
      return { ...prev, [group.name]: has ? cur.filter((l) => l !== opt.label) : [...cur, opt.label] };
    });
  }

  const chosen: CartOption[] = groups.flatMap((g) =>
    (sel[g.name] ?? []).map((label) => {
      const opt = g.options.find((o) => o.label === label);
      return { group: g.name, label, price: opt?.price ?? 0, optionId: opt?.id };
    }),
  );
  const addOnSum = chosen.reduce((s, o) => s + o.price, 0);
  const lineTotal = (basePrice + addOnSum) * qty;

  function addToCart() {
    add(p.restaurantId, p.restaurantName, { menuItemId: p.menuItemId, name: p.name, basePrice, options: chosen, qty });
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Hero image */}
        <View>
          <Image source={{ uri: meta.image }} style={{ width: '100%', height: 240, backgroundColor: c.surfaceAlt }} />
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}
            style={{ position: 'absolute', top: insets.top + 8, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: c.text }}>{p.name}</Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.primary, marginTop: 4 }}>GH₵ {basePrice.toFixed(2)}</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 10, lineHeight: 21 }}>{p.description || meta.description}</Text>

          {/* Availability */}
          <Row style={{ gap: 6, marginTop: 14 }}>
            {meta.modes.map((m) => (
              <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.surfaceAlt, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 }}>
                <Ionicons name="checkmark-circle" size={14} color={c.success} />
                <Text style={{ fontSize: 12.5, color: c.text, fontWeight: '600' }}>{MODE_LABEL[m]}</Text>
              </View>
            ))}
          </Row>

          {/* Add-on groups */}
          {groups.map((g) => (
            <View key={g.name} style={{ marginTop: 22 }}>
              <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{g.name}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted }}>{g.required ? 'Required' : g.multi ? 'Optional · pick many' : 'Optional'}</Text>
              </Row>
              {g.options.map((opt) => {
                const selected = (sel[g.name] ?? []).includes(opt.label);
                return (
                  <TouchableOpacity key={opt.label} onPress={() => toggle(g, opt)} activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 }}>
                    <Ionicons
                      name={!g.multi ? (selected ? 'radio-button-on' : 'radio-button-off') : (selected ? 'checkbox' : 'square-outline')}
                      size={22} color={selected ? c.primary : c.textMuted}
                    />
                    <Text style={{ flex: 1, fontSize: 15, color: c.text, fontWeight: selected ? '600' : '400' }}>{opt.label}</Text>
                    {opt.price > 0 ? <Text style={{ fontSize: 14, color: c.textMuted }}>+ GH₵ {opt.price.toFixed(2)}</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Add to cart bar */}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Row style={{ gap: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 }}>
          <TouchableOpacity onPress={() => setQty((q) => Math.max(1, q - 1))} activeOpacity={0.7}>
            <Ionicons name="remove" size={20} color={c.primary} />
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.text, minWidth: 16, textAlign: 'center' }}>{qty}</Text>
          <TouchableOpacity onPress={() => setQty((q) => q + 1)} activeOpacity={0.7}>
            <Ionicons name="add" size={20} color={c.primary} />
          </TouchableOpacity>
        </Row>
        <TouchableOpacity onPress={addToCart} activeOpacity={0.9}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.primary, borderRadius: 999, paddingVertical: 15, paddingHorizontal: 20, shadowColor: c.primary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Add to cart</Text>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>GH₵ {lineTotal.toFixed(2)}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
