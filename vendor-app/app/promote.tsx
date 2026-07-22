import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { foodApi, MenuItem, Promo, PromoApplication } from '../src/api/food';
import { useVendorStore } from '../src/store/vendorStore';
import { useTheme } from '../src/theme/ThemeProvider';
import { Row, Badge } from '../src/components/ui';

type Kind = 'DISCOUNT' | 'BOGO' | 'OTHER';
type Scope = 'VENDOR' | 'CATEGORY' | 'ITEM';

const KINDS: { key: Kind; label: string; hint: string; icon: any }[] = [
  { key: 'DISCOUNT', label: 'Discount',   icon: 'pricetag',  hint: 'GoZone takes it off the customer’s total automatically at checkout.' },
  { key: 'BOGO',     label: 'Buy 1 get 1', icon: 'gift',     hint: 'You honour this when you prepare the order. GoZone shows it to the customer but does not change the price.' },
  { key: 'OTHER',    label: 'Other offer', icon: 'sparkles', hint: 'Anything else you run yourself — describe it and GoZone will show it on the order.' },
];

export default function PromoteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const vendor = useVendorStore((s) => s.vendor);
  const isFood = (vendor?.vendorType ?? 'RESTAURANT') === 'RESTAURANT';
  const catalogueWord = isFood ? 'menu' : 'catalogue';

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<Kind>('DISCOUNT');
  const [discType, setDiscType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [discValue, setDiscValue] = useState('');
  const [scope, setScope] = useState<Scope>('VENDOR');
  const [category, setCategory] = useState('');
  const [itemId, setItemId] = useState('');

  const [items, setItems] = useState<MenuItem[]>([]);
  const [mine, setMine] = useState<Promo[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const categories = Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[];

  async function load() {
    if (!vendor) return;
    try { setItems(await foodApi.getCatalogue(vendor.id)); } catch {}
    try { setMine(await foodApi.myPromos(vendor.id)); } catch {}
    finally { setLoaded(true); }
  }
  useEffect(() => { load(); }, [vendor?.id]);

  async function submit() {
    if (!vendor) return Alert.alert('No business selected', 'Pick a business on the Orders tab first.');
    if (!title.trim()) return Alert.alert('Give it a title', 'e.g. “20% off this weekend”.');

    if (kind === 'DISCOUNT') {
      const v = Number(discValue);
      if (!v || v <= 0) return Alert.alert('Enter the discount', discType === 'PERCENT' ? 'e.g. 20 for 20% off.' : 'e.g. 5 for GH₵5 off.');
      if (discType === 'PERCENT' && v > 90) return Alert.alert('Too high', 'A percentage discount cannot exceed 90%.');
    }
    if (scope === 'CATEGORY' && !category) return Alert.alert('Choose a category', `Pick which part of your ${catalogueWord} this covers.`);
    if (scope === 'ITEM' && !itemId) return Alert.alert('Choose an item', 'Pick the item this promotion covers.');

    const body: PromoApplication = {
      vendorId: vendor.id,
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      description: description.trim() || undefined,
      promoKind: kind,
      scope,
      ...(kind === 'DISCOUNT' ? { discountType: discType, discountValue: Number(discValue) } : {}),
      ...(scope === 'CATEGORY' ? { category } : {}),
      ...(scope === 'ITEM' ? { menuItemId: itemId } : {}),
    };

    setSubmitting(true);
    try {
      await foodApi.applyPromo(body);
      setTitle(''); setSubtitle(''); setDescription(''); setDiscValue(''); setCategory(''); setItemId('');
      setScope('VENDOR'); setKind('DISCOUNT');
      await load();
      Alert.alert('Application sent',
        'The GoZone team will review your promotion. Once approved it appears on the customer app.');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not submit');
    } finally { setSubmitting(false); }
  }

  const kindMeta = KINDS.find((k) => k.key === kind)!;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Row style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, gap: 12, marginBottom: 8 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Promote my business</Text>
          <Text style={{ fontSize: 13, color: c.textMuted }} numberOfLines={1}>{vendor?.name ?? 'No business selected'}</Text>
        </View>
      </Row>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 16 }}>

          {/* 1 — what kind of promotion */}
          <Label c={c}>Type of promotion</Label>
          <Row style={{ gap: 8, marginBottom: 8 }}>
            {KINDS.map((k) => {
              const sel = kind === k.key;
              return (
                <TouchableOpacity key={k.key} onPress={() => setKind(k.key)} activeOpacity={0.85}
                  style={{ flex: 1, alignItems: 'center', gap: 5, paddingVertical: 12, borderRadius: 14,
                           backgroundColor: sel ? c.primarySoft : c.surfaceAlt, borderWidth: 1.5, borderColor: sel ? c.primary : 'transparent' }}>
                  <Ionicons name={k.icon} size={19} color={sel ? c.primary : c.textMuted} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? c.primary : c.text, textAlign: 'center' }}>{k.label}</Text>
                </TouchableOpacity>
              );
            })}
          </Row>
          <Text style={{ fontSize: 12.5, color: c.textMuted, lineHeight: 18, marginBottom: 16 }}>{kindMeta.hint}</Text>

          {/* 2 — discount terms (only when GoZone has to compute money) */}
          {kind === 'DISCOUNT' && (
            <>
              <Label c={c}>How much off</Label>
              <Row style={{ gap: 10, marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 3 }}>
                  {(['PERCENT', 'AMOUNT'] as const).map((t) => {
                    const sel = discType === t;
                    return (
                      <TouchableOpacity key={t} onPress={() => setDiscType(t)} activeOpacity={0.85}
                        style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: sel ? c.surface : 'transparent' }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: sel ? c.primary : c.textMuted }}>{t === 'PERCENT' ? '%' : 'GH₵'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surfaceAlt, borderRadius: 12, paddingHorizontal: 14 }}>
                  <TextInput value={discValue} onChangeText={setDiscValue} keyboardType="numeric"
                    placeholder={discType === 'PERCENT' ? '20' : '5.00'} placeholderTextColor={c.textMuted}
                    style={{ flex: 1, paddingVertical: 12, color: c.text, fontSize: 16, fontWeight: '700' }} />
                  <Text style={{ fontSize: 13, color: c.textMuted }}>{discType === 'PERCENT' ? 'percent off' : 'off'}</Text>
                </View>
              </Row>
            </>
          )}

          {/* 3 — what it covers */}
          <Label c={c}>What it applies to</Label>
          <View style={{ gap: 8, marginBottom: 14 }}>
            <ScopeRow c={c} sel={scope === 'VENDOR'} icon="storefront" label={`My entire ${catalogueWord}`}
              sub="Every item you sell" onPress={() => setScope('VENDOR')} />
            <ScopeRow c={c} sel={scope === 'CATEGORY'} icon="albums" label="One category"
              sub={categories.length ? categories.join(', ') : `Add categories to your ${catalogueWord} items first`}
              disabled={categories.length === 0} onPress={() => setScope('CATEGORY')} />
            <ScopeRow c={c} sel={scope === 'ITEM'} icon="fast-food" label="One item"
              sub={items.length ? `${items.length} to choose from` : 'No items yet'}
              disabled={items.length === 0} onPress={() => setScope('ITEM')} />
          </View>

          {scope === 'CATEGORY' && (
            <Row style={{ flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {categories.map((cat) => {
                const sel = category === cat;
                return (
                  <TouchableOpacity key={cat} onPress={() => setCategory(cat)} activeOpacity={0.85}
                    style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                             backgroundColor: sel ? c.primary : c.surfaceAlt }}>
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: sel ? '#fff' : c.text }}>{cat}</Text>
                  </TouchableOpacity>
                );
              })}
            </Row>
          )}

          {scope === 'ITEM' && (
            <View style={{ marginBottom: 14, gap: 6 }}>
              {items.map((it) => {
                const sel = itemId === it.id;
                return (
                  <TouchableOpacity key={it.id} onPress={() => setItemId(it.id)} activeOpacity={0.85}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12,
                             backgroundColor: sel ? c.primarySoft : c.surfaceAlt, borderWidth: 1.5, borderColor: sel ? c.primary : 'transparent' }}>
                    <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={18} color={sel ? c.primary : c.textMuted} />
                    <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '600', color: c.text }} numberOfLines={1}>{it.name}</Text>
                    <Text style={{ fontSize: 13.5, color: c.textMuted }}>GH₵ {it.price.toFixed(2)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* 4 — the words on the card */}
          <Label c={c}>Card text</Label>
          <Input value={title} onChangeText={setTitle} placeholder='Title — e.g. "20% off this weekend"' icon="megaphone-outline" c={c} />
          <Input value={subtitle} onChangeText={setSubtitle} placeholder={`Subtitle (optional) — defaults to "${vendor?.name ?? 'your business'}"`} icon="text-outline" c={c} />
          {kind !== 'DISCOUNT' && (
            <Input value={description} onChangeText={setDescription} multiline
              placeholder="Terms the customer should know — e.g. “On any main, dine-in only”"
              icon="information-circle-outline" c={c} />
          )}

          <TouchableOpacity onPress={submit} disabled={submitting} activeOpacity={0.9}
            style={{ marginTop: 6, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 14, alignItems: 'center', opacity: submitting ? 0.6 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{submitting ? 'Submitting…' : 'Apply to promote'}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 10, lineHeight: 17 }}>
            GoZone reviews every promotion before it goes live.
          </Text>
        </View>

        {/* Existing applications */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 10 }}>
          Your promotions
        </Text>
        {!loaded ? null : mine.length === 0 ? (
          <Text style={{ fontSize: 14, color: c.textMuted }}>No applications yet.</Text>
        ) : (
          mine.map((p) => (
            <View key={p.id} style={{ backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14, marginBottom: 10 }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }} numberOfLines={1}>{p.title}</Text>
                  <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 2 }} numberOfLines={1}>{termsOf(p)}</Text>
                </View>
                <Badge label={p.active ? 'Live' : 'Pending review'} color={p.active ? c.success : c.warning} />
              </Row>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

/** One-line summary of a promo's terms for the list. */
function termsOf(p: Promo): string {
  const what = p.promoKind === 'DISCOUNT'
    ? (p.discountType === 'PERCENT' ? `${p.discountValue}% off` : `GH₵${p.discountValue} off`)
    : p.promoKind === 'BOGO' ? 'Buy 1 get 1 — you honour it' : 'Offer — you honour it';
  const where = p.scope === 'ITEM' ? 'one item' : p.scope === 'CATEGORY' ? (p.category ?? 'a category') : 'everything';
  return `${what} · ${where}`;
}

function Label({ children, c }: any) {
  return (
    <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
      {children}
    </Text>
  );
}

function ScopeRow({ c, sel, icon, label, sub, onPress, disabled }: any) {
  return (
    <TouchableOpacity onPress={disabled ? undefined : onPress} activeOpacity={disabled ? 1 : 0.85}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 14,
               backgroundColor: sel ? c.primarySoft : c.surfaceAlt, borderWidth: 1.5,
               borderColor: sel ? c.primary : 'transparent', opacity: disabled ? 0.45 : 1 }}>
      <Ionicons name={icon} size={19} color={sel ? c.primary : c.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: '700', color: c.text }}>{label}</Text>
        <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 1 }} numberOfLines={1}>{sub}</Text>
      </View>
      <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={18} color={sel ? c.primary : c.textMuted} />
    </TouchableOpacity>
  );
}

function Input({ icon, c, ...props }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, marginBottom: 10 }}>
      <Ionicons name={icon} size={17} color={c.textMuted} style={{ marginTop: 13 }} />
      <TextInput {...props} placeholderTextColor={c.textMuted}
        style={{ flex: 1, paddingVertical: 13, color: c.text, fontSize: 14.5, minHeight: 44 }} />
    </View>
  );
}
