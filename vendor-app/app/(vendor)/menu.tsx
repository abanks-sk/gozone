import { useEffect, useState } from 'react';
import { Alert, Modal, RefreshControl, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { foodApi, MenuItem } from '../../src/api/food';
import { useVendorStore } from '../../src/store/vendorStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Row } from '../../src/components/ui';

export default function VendorMenuScreen() {
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const vendor = useVendorStore((s) => s.vendor);
  const isFood = (vendor?.vendorType ?? 'RESTAURANT') === 'RESTAURANT';
  const title = isFood ? 'Menu' : 'Catalogue';

  const [items, setItems] = useState<MenuItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [prep, setPrep] = useState('');
  const [prepItem, setPrepItem] = useState<MenuItem | null>(null);
  const [prepDraft, setPrepDraft] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  type OptDraft = { label: string; price: string };
  type GroupDraft = { name: string; multi: boolean; required: boolean; options: OptDraft[] };
  const [groups, setGroups] = useState<GroupDraft[]>([]);

  /** Save (or clear) a dish's prep time. Blank means "use the business default" — not zero. */
  async function savePrep() {
    if (!prepItem) return;
    const n = parseInt(prepDraft, 10);
    if (prepDraft.trim() && (!n || n <= 0)) return Alert.alert('Prep time', 'Enter a number of minutes, or leave it blank to use your default.');
    try {
      await foodApi.updateMenuItem(prepItem.id, { prepMinutes: prepDraft.trim() ? n : 0 });
      setPrepItem(null); await load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not save the prep time');
    }
  }

  const addGroup = () => setGroups((g) => [...g, { name: '', multi: false, required: false, options: [{ label: '', price: '' }] }]);
  const removeGroup = (i: number) => setGroups((g) => g.filter((_, x) => x !== i));
  const patchGroup = (i: number, patch: Partial<GroupDraft>) => setGroups((g) => g.map((grp, x) => (x === i ? { ...grp, ...patch } : grp)));
  const addOption = (i: number) => setGroups((g) => g.map((grp, x) => (x === i ? { ...grp, options: [...grp.options, { label: '', price: '' }] } : grp)));
  const patchOption = (i: number, j: number, patch: Partial<OptDraft>) => setGroups((g) => g.map((grp, x) => (x === i ? { ...grp, options: grp.options.map((o, y) => (y === j ? { ...o, ...patch } : o)) } : grp)));
  const removeOption = (i: number, j: number) => setGroups((g) => g.map((grp, x) => (x === i ? { ...grp, options: grp.options.filter((_, y) => y !== j) } : grp)));

  async function load() {
    if (!vendor) return;
    // Vendor sees the full catalogue (incl. sold-out); falls back to the public menu.
    try { setItems(await foodApi.getCatalogue(vendor.id)); setLoadError(null); }
    catch (e: any) {
      try { setItems(await foodApi.getMenu(vendor.id)); setLoadError(null); }
      catch (e2: any) {
        // Both of these used to be `catch {}`, so a failed load rendered as "no items yet" —
        // identical to an genuinely empty catalogue. "I can't add items" and "I have no items"
        // must not be the same screen.
        setLoadError(e2?.response?.data?.message ?? e?.response?.data?.message
          ?? 'Could not load your catalogue. Check your connection and try again.');
      }
    }
  }
  useEffect(() => { load(); }, [vendor?.id]);

  async function submitItem() {
    const p = parseFloat(price.replace(/[^0-9.]/g, ''));
    if (!name.trim()) return Alert.alert('Name needed', 'Enter an item name.');
    if (!p || p <= 0) return Alert.alert('Price needed', 'Enter a valid price.');
    // Never fail silently. This was `return` with no message, so with no business selected the
    // Add button did nothing at all — no error, no spinner — and looked like a broken app.
    if (!vendor) {
      return Alert.alert('No business selected',
        'We could not tell which of your businesses to add this to. Open the Orders tab, pick your business, then try again.');
    }
    const groupsPayload = groups
      .filter((gr) => gr.name.trim() && gr.options.some((o) => o.label.trim()))
      .map((gr) => ({
        name: gr.name.trim(), multi: gr.multi, required: gr.required,
        options: gr.options.filter((o) => o.label.trim())
          .map((o) => ({ label: o.label.trim(), price: parseFloat(o.price.replace(/[^0-9.]/g, '')) || 0 })),
      }));
    setBusy(true);
    try {
      await foodApi.createMenuItem(vendor.id, {
        name: name.trim(), description: description.trim() || undefined,
        category: category.trim() || undefined, price: Math.round(p * 100) / 100,
        // Blank leaves it unset, and the business's overall prep time applies to this dish.
        prepMinutes: parseInt(prep, 10) > 0 ? parseInt(prep, 10) : undefined,
        groups: groupsPayload.length ? groupsPayload : undefined,
      });
      setName(''); setDescription(''); setCategory(''); setPrice(''); setPrep(''); setGroups([]); setAdding(false);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not add the item');
    } finally { setBusy(false); }
  }

  async function toggleAvailable(it: MenuItem, v: boolean) {
    setItems((prev) => prev.map((i) => (i.id === it.id ? { ...i, available: v } : i))); // optimistic
    try { await foodApi.updateMenuItem(it.id, { available: v }); }
    catch { await load(); Alert.alert('Error', 'Could not update availability'); }
  }

  function confirmDelete(it: MenuItem) {
    Alert.alert('Remove item', `Remove "${it.name}" from your catalogue?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await foodApi.deleteMenuItem(it.id); await load(); }
        catch { Alert.alert('Error', 'Could not remove the item'); }
      } },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>

        <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ fontSize: 27, fontWeight: '800', color: c.text, letterSpacing: -0.5 }}>{title}</Text>
          <TouchableOpacity onPress={() => setAdding(true)} activeOpacity={0.85}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.primarySoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Ionicons name="add" size={17} color={c.primary} />
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: c.primary }}>Add item</Text>
          </TouchableOpacity>
        </Row>
        <Text style={{ fontSize: 13.5, color: c.textMuted, marginBottom: 18 }}>{vendor?.name ?? 'Your business'} · {items.length} items</Text>

        {loadError ? (
          <View style={{ alignItems: 'center', paddingVertical: 36, gap: 10, paddingHorizontal: 20 }}>
            <Ionicons name="alert-circle-outline" size={34} color={c.danger} />
            <Text style={{ color: c.text, fontSize: 14.5, fontWeight: '700' }}>Couldn't load your {isFood ? 'menu' : 'catalogue'}</Text>
            <Text style={{ color: c.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>{loadError}</Text>
            <TouchableOpacity onPress={load} activeOpacity={0.85}
              style={{ marginTop: 6, backgroundColor: c.primarySoft, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 }}>
              <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13.5 }}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : !vendor ? (
          <View style={{ alignItems: 'center', paddingVertical: 36, gap: 10 }}>
            <Ionicons name="storefront-outline" size={34} color={c.textMuted} />
            <Text style={{ color: c.textMuted, fontSize: 14 }}>Loading your business…</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 36, gap: 10 }}>
            <Ionicons name={isFood ? 'fast-food-outline' : 'pricetags-outline'} size={34} color={c.textMuted} />
            <Text style={{ color: c.textMuted, fontSize: 14 }}>No items in your {isFood ? 'menu' : 'catalogue'} yet</Text>
            <Text style={{ color: c.textMuted, fontSize: 12.5 }}>Tap “Add item” to create your first one.</Text>
          </View>
        ) : (
          items.map((it) => {
            const on = it.available;
            return (
              <View key={it.id} style={{ backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14, marginBottom: 10 }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ fontSize: 15.5, fontWeight: '700', color: on ? c.text : c.textMuted }}>{it.name}</Text>
                    {it.description ? <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 3, lineHeight: 17 }} numberOfLines={2}>{it.description}</Text> : null}
                    <Text style={{ fontSize: 14, fontWeight: '700', color: on ? c.primary : c.textMuted, marginTop: 4 }}>GH₵ {it.price.toFixed(2)}</Text>
                    <Text style={{ fontSize: 12, color: on ? c.success : c.danger, marginTop: 3 }}>{on ? 'Available' : 'Sold out'}</Text>
                    {/* Editable here because every dish that existed before prep times were added
                        has none, and the add-item form only helps with new ones. */}
                    <TouchableOpacity onPress={() => { setPrepItem(it); setPrepDraft(it.prepMinutes != null ? String(it.prepMinutes) : ''); }}
                      activeOpacity={0.7} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                      <Row style={{ gap: 5, alignItems: 'center', backgroundColor: c.surfaceAlt, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 }}>
                        <Ionicons name="time-outline" size={13} color={c.textMuted} />
                        <Text style={{ fontSize: 12, color: c.textMuted, fontWeight: '600' }}>
                          {it.prepMinutes != null ? `${it.prepMinutes} min prep` : 'Set prep time'}
                        </Text>
                      </Row>
                    </TouchableOpacity>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 10 }}>
                    <Switch value={on} onValueChange={(v) => toggleAvailable(it, v)}
                      trackColor={{ true: c.primary, false: c.border }} thumbColor="#fff" />
                    <TouchableOpacity onPress={() => confirmDelete(it)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={17} color={c.danger} />
                    </TouchableOpacity>
                  </View>
                </Row>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Add item modal */}
      <Modal visible={adding} transparent animationType="slide" onRequestClose={() => setAdding(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: insets.bottom + 16, maxHeight: '90%' }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 8 }}>
              <Text style={{ fontSize: 19, fontWeight: '800', color: c.text }}>Add an item</Text>
              <TouchableOpacity onPress={() => setAdding(false)} hitSlop={8}><Ionicons name="close" size={24} color={c.textMuted} /></TouchableOpacity>
            </Row>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, gap: 14, paddingBottom: 14 }}>
              <Field label="Item name" value={name} onChangeText={setName} placeholder="Jollof Rice" c={c} />
              <Field label="Description" value={description} onChangeText={setDescription} placeholder="Smoky party jollof with grilled chicken" multiline c={c} />
              <Field label="Category" value={category} onChangeText={setCategory} placeholder="Mains · Drinks · Sides — groups your items and lets you run a promo on just this group" c={c} />
              <Field label="Price (GH₵)" value={price} onChangeText={setPrice} placeholder="35.00" keyboardType="decimal-pad" c={c} />
              {/* Drives how long a walk-in customer is told to wait, and when to set off for you.
                  Optional — left blank, your overall prep time is used for this dish. */}
              <Field label="Prep time (minutes, optional)" value={prep} onChangeText={setPrep}
                     placeholder="e.g. 20" keyboardType="number-pad" c={c} />

              {/* Add-on groups */}
              <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: c.text }}>Add-ons (optional)</Text>
                <TouchableOpacity onPress={addGroup} hitSlop={8}><Text style={{ fontSize: 13.5, fontWeight: '700', color: c.primary }}>+ Group</Text></TouchableOpacity>
              </Row>
              {groups.length === 0 ? (
                <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: -6 }}>
                  e.g. “Choose protein” (pick one) or “Extras” (pick many). Customers select these when ordering.
                </Text>
              ) : null}
              {groups.map((gr, i) => (
                <View key={i} style={{ backgroundColor: c.surfaceAlt, borderRadius: 16, padding: 12, gap: 10 }}>
                  <Row style={{ gap: 8 }}>
                    <TextInput value={gr.name} onChangeText={(t) => patchGroup(i, { name: t })} placeholder="Group name (e.g. Protein)" placeholderTextColor={c.textMuted}
                      style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.text }} />
                    <TouchableOpacity onPress={() => removeGroup(i)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={c.danger} /></TouchableOpacity>
                  </Row>
                  <Row style={{ gap: 8 }}>
                    <Toggle label="Pick many" on={gr.multi} onPress={() => patchGroup(i, { multi: !gr.multi })} c={c} />
                    <Toggle label="Required" on={gr.required} onPress={() => patchGroup(i, { required: !gr.required })} c={c} />
                  </Row>
                  {gr.options.map((o, j) => (
                    <Row key={j} style={{ gap: 8 }}>
                      <TextInput value={o.label} onChangeText={(t) => patchOption(i, j, { label: t })} placeholder="Option" placeholderTextColor={c.textMuted}
                        style={{ flex: 2, backgroundColor: c.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: c.text }} />
                      <TextInput value={o.price} onChangeText={(t) => patchOption(i, j, { price: t })} placeholder="+ GH₵" placeholderTextColor={c.textMuted} keyboardType="decimal-pad"
                        style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: c.text }} />
                      <TouchableOpacity onPress={() => removeOption(i, j)} hitSlop={8}><Ionicons name="close-circle" size={18} color={c.textMuted} /></TouchableOpacity>
                    </Row>
                  ))}
                  <TouchableOpacity onPress={() => addOption(i)} hitSlop={6}><Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>+ Option</Text></TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity onPress={submitItem} disabled={busy} activeOpacity={0.9}
                style={{ backgroundColor: c.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center', marginTop: 6 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{busy ? 'Adding…' : 'Add to catalogue'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Prep time for one dish */}
      <Modal visible={!!prepItem} transparent animationType="fade" onRequestClose={() => setPrepItem(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: c.bg, borderRadius: 22, padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: c.text }}>Prep time</Text>
            <Text style={{ fontSize: 13, color: c.textMuted, lineHeight: 18 }}>
              How long {prepItem?.name} takes to make. This is what tells a walk-in customer when to
              set off. Leave it blank to use your business default.
            </Text>
            <TextInput value={prepDraft} onChangeText={setPrepDraft} keyboardType="number-pad"
              placeholder="e.g. 20" placeholderTextColor={c.textMuted}
              style={{ backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: c.text, fontSize: 16 }} />
            <Row style={{ gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <TouchableOpacity onPress={() => setPrepItem(null)} style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
                <Text style={{ color: c.textMuted, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={savePrep} style={{ backgroundColor: c.primary, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 22 }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Save</Text>
              </TouchableOpacity>
            </Row>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Toggle({ label, on, onPress, c }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
        backgroundColor: on ? c.primarySoft : c.surface, borderWidth: 1, borderColor: on ? c.primary : c.border }}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={16} color={on ? c.primary : c.textMuted} />
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? c.primary : c.text }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, c }: any) {
  return (
    <View>
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.textMuted, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.textMuted}
        keyboardType={keyboardType} multiline={multiline}
        style={{ backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: c.text, minHeight: multiline ? 64 : undefined, textAlignVertical: multiline ? 'top' : 'center' }}
      />
    </View>
  );
}
