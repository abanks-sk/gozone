import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '../src/api/auth';
import { useAuthStore } from '../src/store/authStore';
import { useVendorSetup } from '../src/store/vendorSetupStore';
import { useVendorStore } from '../src/store/vendorStore';
import { BrandScreen, GlowOrb, BrandInput, PillButton, GzHero } from '../src/components/brand';
import { brand } from '../src/theme/tokens';

type Stage = 'loading' | 'setup' | 'awaiting' | 'rejected';

const TYPES = [
  { key: 'RESTAURANT', label: 'Restaurant', icon: 'fast-food' as const },
  { key: 'PHARMACY', label: 'Pharmacy', icon: 'medkit' as const },
  { key: 'GROCERY', label: 'Grocery', icon: 'basket' as const },
  { key: 'CONVENIENCE', label: 'Convenience', icon: 'storefront' as const },
  { key: 'OTHER', label: 'Other', icon: 'pricetag' as const },
];
// Demo default location (Accra) — a real "choose on map" picker is on the backlog.
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    const me = await authApi.me().catch(() => null);
    if (!me) { setView('setup'); return; }
    if (me.status === 'ACTIVE') { setGoApp(true); return; }
    if (me.status === 'REJECTED') { setView('rejected'); return; }
    const vendors = await authApi.myVendors();
    setView(vendors.length > 0 ? 'awaiting' : 'setup');
  }
  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (view !== 'awaiting') return;
    pollRef.current = setInterval(async () => {
      const me = await authApi.me().catch(() => null);
      if (me?.status === 'ACTIVE') setGoApp(true);
      if (me?.status === 'REJECTED') setView('rejected');
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [view]);

  async function submit() {
    if (!draft.name.trim()) return Alert.alert('Business name needed', 'What’s your business called?');
    setSubmitting(true);
    try {
      const v = await authApi.createVendor({ name: draft.name.trim(), vendorType: draft.vendorType, lat: DEFAULT_LAT, lng: DEFAULT_LNG });
      setVendor(v); // open the vendor app on this business once approved
      setView('awaiting');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not submit for approval');
    } finally { setSubmitting(false); }
  }

  async function signOut() { await logout(); router.replace('/welcome'); }

  if (goApp) return <Redirect href="/(vendor)/orders" />;

  if (view === 'loading') {
    return <BrandScreen><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={brand.text} /></View></BrandScreen>;
  }

  if (view === 'awaiting') {
    return (
      <BrandScreen>
        {/* GzHero carries its own glow — a corner orb on top of it read as a stray light. */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
          <GzHero size={130} />
          <Text style={{ fontSize: 26, fontWeight: '800', color: brand.text, marginTop: 22, textAlign: 'center' }}>Business submitted</Text>
          <Text style={{ fontSize: 14.5, color: brand.textMuted, marginTop: 12, textAlign: 'center', lineHeight: 21 }}>
            An admin is reviewing your business. You’ll be able to start taking orders as soon as you’re
            approved — this screen updates automatically.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 }}>
            <ActivityIndicator color={brand.textMuted} />
            <Text style={{ fontSize: 13, color: brand.textMuted }}>Waiting for approval…</Text>
          </View>
          <TouchableOpacity onPress={signOut} style={{ marginTop: 28 }}><Text style={{ fontSize: 13, color: brand.textMuted }}>Log out</Text></TouchableOpacity>
        </View>
      </BrandScreen>
    );
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

        <PillButton label={submitting ? 'Submitting…' : 'Submit for approval'} onPress={submit} loading={submitting} style={{ marginTop: 22 }} />
        <Text style={{ fontSize: 12, color: brand.textMuted, textAlign: 'center', marginTop: 12, lineHeight: 18 }}>
          An admin will review and approve your business before it goes live.
        </Text>
        <TouchableOpacity onPress={signOut} style={{ marginTop: 20, alignSelf: 'center' }}><Text style={{ fontSize: 13, color: brand.textMuted }}>Log out</Text></TouchableOpacity>
      </ScrollView>
    </BrandScreen>
  );
}
