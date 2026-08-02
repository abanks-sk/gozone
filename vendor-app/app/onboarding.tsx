import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '../src/api/auth';
import { useAuthStore } from '../src/store/authStore';
import { useVendorSetup } from '../src/store/vendorSetupStore';
import { useVendorStore } from '../src/store/vendorStore';
import { usePickedLocation } from '../src/store/pickedLocationStore';
import { BrandScreen, GlowOrb, BrandInput, PillButton } from '../src/components/brand';
import { brand } from '../src/theme/tokens';

/**
 * Business setup — no longer the gate for the whole app.
 *
 * This screen used to decide whether a vendor got in at all, and parked anyone unapproved on a
 * full-screen "awaiting approval" page with nothing but a Log out button. Approval state now
 * lives in `VendorGate` on the operational tabs, so an unapproved owner can still use their
 * profile. What is left here is the form itself, reached from the gate.
 */
type Stage = 'loading' | 'setup' | 'rejected';

const TYPES = [
  { key: 'RESTAURANT', label: 'Restaurant', icon: 'fast-food' as const },
  { key: 'PHARMACY', label: 'Pharmacy', icon: 'medkit' as const },
  { key: 'GROCERY', label: 'Grocery', icon: 'basket' as const },
  { key: 'CONVENIENCE', label: 'Convenience', icon: 'storefront' as const },
  { key: 'OTHER', label: 'Other', icon: 'pricetag' as const },
];
// Fallback only. Every vendor used to be created on this exact pin with no way to correct it,
// which quietly broke delivery pricing and courier routing for anyone not in central Accra.
// The map picker below is the real answer; this stands in only if it is skipped.
const DEFAULT_LAT = 5.6037;
const DEFAULT_LNG = -0.187;

export default function VendorOnboarding() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const draft = useVendorSetup();
  const setVendor = useVendorStore((s) => s.setVendor);
  const [view, setView] = useState<Stage>('loading');
  const [goApp, setGoApp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Location chosen on the map picker, if they used it. Peeked rather than consumed so it
  // survives re-renders of this form; it is cleared when the vendor is actually created.
  const picked = usePickedLocation((s) => s.picked);
  const clearPicked = usePickedLocation((s) => s.consume);

  // Only two reasons to be here: you have no business yet, or yours was turned down and you are
  // resubmitting. Anything else belongs in the app, where the gate does the explaining.
  async function refresh() {
    const me = await authApi.me().catch(() => null);
    if (me?.status === 'REJECTED') { setView('rejected'); return; }
    const vendors = await authApi.myVendors().catch(() => []);
    if (vendors.length > 0) { setGoApp(true); return; }
    setView('setup');
  }
  useEffect(() => { refresh(); }, []);

  async function submit() {
    if (!draft.name.trim()) return Alert.alert('Business name needed', 'What’s your business called?');
    setSubmitting(true);
    try {
      const v = await authApi.createVendor({
        name: draft.name.trim(),
        vendorType: draft.vendorType,
        lat: picked?.lat ?? DEFAULT_LAT,
        lng: picked?.lng ?? DEFAULT_LNG,
      });
      setVendor(v);
      clearPicked(); // spent — it belongs to this business now
      // Straight into the app rather than onto a waiting screen. The gate on each operational tab
      // reports the approval state, and profile/settings stay usable throughout.
      setGoApp(true);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not submit for approval');
    } finally { setSubmitting(false); }
  }

  async function signOut() { await logout(); router.replace('/welcome'); }

  if (goApp) return <Redirect href="/(vendor)/orders" />;

  if (view === 'loading') {
    return <BrandScreen><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={brand.text} /></View></BrandScreen>;
  }

  if (view === 'rejected') {
    return (
      <BrandScreen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(239,68,68,0.16)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close-circle-outline" size={44} color="#ef4444" />
          </View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: brand.text, marginTop: 20, textAlign: 'center' }}>Not approved</Text>
          <Text style={{ fontSize: 14.5, color: brand.textMuted, marginTop: 12, textAlign: 'center', lineHeight: 21 }}>
            Your business couldn’t be verified. Update your details and try again, or contact support.
          </Text>
          <PillButton label="Update & resubmit" onPress={() => setView('setup')} style={{ marginTop: 24, alignSelf: 'stretch' }} />
          <TouchableOpacity onPress={signOut} style={{ marginTop: 18 }}><Text style={{ fontSize: 13, color: brand.textMuted }}>Log out</Text></TouchableOpacity>
        </View>
      </BrandScreen>
    );
  }

  // setup
  return (
    <BrandScreen>
      <GlowOrb size={260} style={{ position: 'absolute', top: -90, right: -110 }} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 56, paddingBottom: 40 }}>
        <Text style={{ fontSize: 27, fontWeight: '800', color: brand.text, letterSpacing: -0.5 }}>Set up your business</Text>
        <Text style={{ fontSize: 14, color: brand.textMuted, marginTop: 8, marginBottom: 22, lineHeight: 20 }}>
          Tell us about your business. Your progress is saved — finish whenever you’re ready.
        </Text>

        <BrandInput label="Business name" placeholder="Kofi Kitchen" value={draft.name} onChangeText={(v: string) => draft.set({ name: v })} autoCapitalize="words" />

        <Text style={{ fontSize: 13, fontWeight: '700', color: brand.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 10 }}>Business type</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
          {TYPES.map((t) => {
            const sel = draft.vendorType === t.key;
            return (
              <TouchableOpacity key={t.key} onPress={() => draft.set({ vendorType: t.key })} activeOpacity={0.85}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: sel ? brand.primary : brand.borderSoft, backgroundColor: sel ? 'rgba(37,99,235,0.16)' : 'rgba(255,255,255,0.04)' }}>
                <Ionicons name={t.icon} size={16} color={sel ? brand.primaryBright : brand.textMuted} />
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: sel ? brand.text : brand.textMuted }}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <BrandInput label="Location / address" placeholder="Osu, Accra" value={draft.locationLabel} onChangeText={(v: string) => draft.set({ locationLabel: v })} />

        {/* Drop a real pin. Typing "Osu, Accra" gives us a string, not a location — couriers need
            coordinates, and the delivery fee is charged on distance from them. */}
        <TouchableOpacity onPress={() => router.push('/pick-location' as any)} activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, borderColor: picked ? brand.primary : brand.borderSoft, backgroundColor: 'rgba(255,255,255,0.04)', padding: 14, marginTop: 4 }}>
          <Ionicons name={picked ? 'location' : 'map-outline'} size={20} color={picked ? brand.primaryBright : brand.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '700', color: brand.text }} numberOfLines={1}>
              {picked ? (picked.label || 'Pin dropped') : 'Pin your shop on the map'}
            </Text>
            <Text style={{ fontSize: 12, color: brand.textMuted, marginTop: 2 }}>
              {picked ? `${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}` : 'Optional now — you can set it later'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={brand.textMuted} />
        </TouchableOpacity>

        <PillButton label={submitting ? 'Submitting…' : 'Submit for approval'} onPress={submit} loading={submitting} style={{ marginTop: 22 }} />
        <Text style={{ fontSize: 12, color: brand.textMuted, textAlign: 'center', marginTop: 12, lineHeight: 18 }}>
          An admin will review and approve your business before it goes live.
        </Text>
        <TouchableOpacity onPress={signOut} style={{ marginTop: 20, alignSelf: 'center' }}><Text style={{ fontSize: 13, color: brand.textMuted }}>Log out</Text></TouchableOpacity>
      </ScrollView>
    </BrandScreen>
  );
}
