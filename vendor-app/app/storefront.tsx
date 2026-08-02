import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { foodApi } from '../src/api/food';
import { useVendorStore } from '../src/store/vendorStore';
import { usePickedLocation } from '../src/store/pickedLocationStore';
import { useTheme } from '../src/theme/ThemeProvider';
import { Row } from '../src/components/ui';

const TYPES = [
  { key: 'RESTAURANT', label: 'Restaurant', icon: 'fast-food' as const },
  { key: 'PHARMACY', label: 'Pharmacy', icon: 'medkit' as const },
  { key: 'GROCERY', label: 'Grocery', icon: 'basket' as const },
  { key: 'CONVENIENCE', label: 'Convenience', icon: 'storefront' as const },
  { key: 'OTHER', label: 'Other', icon: 'pricetag' as const },
];

/**
 * The page customers see — the only part of the business the vendor could not edit.
 *
 * Personal details and internal business info already had editors; the storefront did not, and
 * had nowhere to store one. So a real vendor's menu header showed whatever the seed said, over
 * stock food photography hardcoded in the customer app's bundled metadata, regardless of what
 * they actually sell.
 *
 * Location lives here too rather than in a separate screen: it is part of what a customer sees
 * ("where is this place?") and it was previously hardcoded to Accra at sign-up with no way back.
 */
export default function StorefrontScreen() {
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const router = useRouter();
  const vendor = useVendorStore((s) => s.vendor);
  const setVendor = useVendorStore((s) => s.setVendor);
  const consumePicked = usePickedLocation((s) => s.consume);

  const [name, setName] = useState('');
  const [vendorType, setVendorType] = useState('RESTAURANT');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Seed the form from the business we already hold.
  useEffect(() => {
    if (!vendor) return;
    setName(vendor.name ?? '');
    setVendorType(vendor.vendorType ?? 'RESTAURANT');
    setDescription(vendor.description ?? '');
    setImageUrl(vendor.imageUrl ?? '');
    setAddress(vendor.address ?? '');
    setCoords({ lat: Number(vendor.lat), lng: Number(vendor.lng) });
  }, [vendor?.id]);

  // Pick up a location chosen on the map. Consumed (not just read) so returning here later with
  // an untouched picker cannot silently re-apply an old pin.
  useFocusEffect(
    useCallback(() => {
      const picked = consumePicked();
      if (!picked) return;
      setCoords({ lat: picked.lat, lng: picked.lng });
      if (picked.label) setAddress(picked.label);
      setDirty(true);
    }, []),
  );

  const edit = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  async function save() {
    if (!vendor) return;
    if (!name.trim()) return Alert.alert('Name needed', 'Your business needs a name.');
    setSaving(true);
    try {
      // Send everything the form owns. Blank clears description/image/address, which is a
      // legitimate edit; the backend rejects only a blank name.
      const updated = await foodApi.updateVendor(vendor.id, {
        name: name.trim(),
        vendorType,
        description,
        imageUrl,
        address,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      });
      setVendor(updated);
      setDirty(false);
      Alert.alert('Saved', 'Your storefront has been updated.');
    } catch (e: any) {
      Alert.alert('Could not save', e?.response?.data?.message ?? 'Please try again.');
    } finally { setSaving(false); }
  }

  if (!vendor) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
        <Ionicons name="storefront-outline" size={34} color={c.textMuted} />
        <Text style={{ color: c.textMuted, marginTop: 10, textAlign: 'center' }}>
          Set up your business first, then you can edit how it looks to customers.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Row style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, gap: 12, marginBottom: 4 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '700', color: c.text, flex: 1 }}>Storefront</Text>
      </Row>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 16 }}>

        <Text style={{ fontSize: 13.5, color: c.textMuted, lineHeight: 20 }}>
          This is what customers see before they order. A clear photo and a line about what you
          sell make far more difference than anything else on this screen.
        </Text>

        {/* Cover preview — show them the thing they are editing. */}
        <View style={{ height: 150, borderRadius: 18, overflow: 'hidden', backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border }}>
          {imageUrl.trim() ? (
            <Image source={{ uri: imageUrl.trim() }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Ionicons name="image-outline" size={30} color={c.textMuted} />
              <Text style={{ fontSize: 12.5, color: c.textMuted }}>No cover photo yet</Text>
            </View>
          )}
        </View>

        <Field label="Business name" value={name} onChangeText={edit(setName)} placeholder="Kofi Kitchen" c={c} />

        <View>
          <Label c={c}>Business type</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
            {TYPES.map((t) => {
              const sel = vendorType === t.key;
              return (
                <TouchableOpacity key={t.key} onPress={() => edit(setVendorType)(t.key)} activeOpacity={0.85}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: sel ? c.primary : c.border, backgroundColor: sel ? c.primarySoft : c.surface }}>
                  <Ionicons name={t.icon} size={15} color={sel ? c.primary : c.textMuted} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: sel ? c.primary : c.text }}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Field label="About your business" value={description} onChangeText={edit(setDescription)} multiline
               placeholder="Home-style Ghanaian cooking — jollof, waakye and grilled tilapia, made fresh to order." c={c} />

        <Field label="Cover photo link" value={imageUrl} onChangeText={edit(setImageUrl)} autoCapitalize="none"
               placeholder="https://…" c={c}
               hint="Paste a link to a photo of your food or shopfront. Uploading from your phone is coming later." />

        {/* Location — the part that was hardcoded to Accra with no way to change it. */}
        <View>
          <Label c={c}>Location</Label>
          <TouchableOpacity onPress={() => router.push('/pick-location' as any)} activeOpacity={0.85}
            style={{ borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name="location" size={20} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14.5, fontWeight: '700', color: c.text }} numberOfLines={1}>
                {address.trim() || 'Set your location'}
              </Text>
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>
                {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'Not set'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.textMuted} />
          </TouchableOpacity>
          <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 6, lineHeight: 17 }}>
            Couriers collect from this pin, and it decides the delivery distance customers pay for.
          </Text>
        </View>

        <TouchableOpacity onPress={save} disabled={saving || !dirty} activeOpacity={0.9}
          style={{ marginTop: 4, backgroundColor: dirty ? c.primary : c.surfaceAlt, borderRadius: 999, paddingVertical: 15, alignItems: 'center' }}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: dirty ? '#fff' : c.textMuted, fontWeight: '800', fontSize: 15 }}>
                {dirty ? 'Save storefront' : 'Saved'}
              </Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Label({ children, c }: any) {
  return <Text style={{ fontSize: 12.5, fontWeight: '700', color: c.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</Text>;
}

function Field({ label, value, onChangeText, placeholder, multiline, autoCapitalize, hint, c }: any) {
  return (
    <View>
      <Label c={c}>{label}</Label>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.textMuted}
        multiline={multiline} autoCapitalize={autoCapitalize}
        style={{
          backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
          fontSize: 15, color: c.text,
          minHeight: multiline ? 86 : undefined, textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      {hint ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 6, lineHeight: 17 }}>{hint}</Text> : null}
    </View>
  );
}
