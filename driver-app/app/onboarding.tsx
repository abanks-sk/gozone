import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi, Kyc } from '../src/api/auth';
import { useAuthStore } from '../src/store/authStore';
import { useDriverSetup } from '../src/store/driverSetupStore';
import { BrandScreen, GlowOrb, BrandInput, PillButton, GzHero } from '../src/components/brand';
import { brand } from '../src/theme/tokens';

type Stage = 'loading' | 'setup' | 'awaiting' | 'rejected';

export default function DriverOnboarding() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const draft = useDriverSetup();
  const [view, setView] = useState<Stage>('loading');
  const [goFeed, setGoFeed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    const me = await authApi.me().catch(() => null);
    if (!me) { setView('setup'); return; }
    if (me.status === 'ACTIVE') { setGoFeed(true); return; }
    if (me.status === 'REJECTED') { setView('rejected'); return; }
    // PENDING — submitted already?
    const kyc: Kyc | null = await authApi.myKyc();
    if (kyc && kyc.status !== 'REJECTED') setView('awaiting');
    else setView('setup');
  }
  useEffect(() => { refresh(); }, []);

  // While awaiting, poll for approval and auto-advance.
  useEffect(() => {
    if (view !== 'awaiting') return;
    pollRef.current = setInterval(async () => {
      const me = await authApi.me().catch(() => null);
      if (me?.status === 'ACTIVE') setGoFeed(true);
      if (me?.status === 'REJECTED') setView('rejected');
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [view]);

  async function submit() {
    if (!draft.licenceNo.trim() || !draft.vehicleReg.trim()) {
      return Alert.alert('Almost there', 'Add your licence number and vehicle registration.');
    }
    setSubmitting(true);
    try {
      await authApi.submitKyc({
        licenceNo: draft.licenceNo.trim(),
        vehicleReg: draft.vehicleReg.trim(),
        roadworthyUrl: draft.roadworthyUrl,
        idSelfieUrl: draft.idSelfieUrl,
      });
      setView('awaiting');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not submit for approval');
    } finally { setSubmitting(false); }
  }

  async function signOut() { await logout(); router.replace('/welcome'); }

  if (goFeed) return <Redirect href="/(driver)/feed" />;

  if (view === 'loading') {
    return (
      <BrandScreen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.text} />
        </View>
      </BrandScreen>
    );
  }

  if (view === 'awaiting') {
    return (
      <BrandScreen>
        <GlowOrb size={360} style={{ position: 'absolute', top: -100, right: -120 }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
          <GzHero size={130} />
          <Text style={{ fontSize: 26, fontWeight: '800', color: brand.text, marginTop: 22, textAlign: 'center' }}>
            Application submitted
          </Text>
          <Text style={{ fontSize: 14.5, color: brand.textMuted, marginTop: 12, textAlign: 'center', lineHeight: 21 }}>
            An admin is reviewing your details. You’ll be able to start driving as soon as you’re
            approved — this screen updates automatically.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 }}>
            <ActivityIndicator color={brand.textMuted} />
            <Text style={{ fontSize: 13, color: brand.textMuted }}>Waiting for approval…</Text>
          </View>
          <TouchableOpacity onPress={signOut} style={{ marginTop: 28 }}>
            <Text style={{ fontSize: 13, color: brand.textMuted }}>Log out</Text>
          </TouchableOpacity>
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
          <Text style={{ fontSize: 24, fontWeight: '800', color: brand.text, marginTop: 20, textAlign: 'center' }}>Application not approved</Text>
          <Text style={{ fontSize: 14.5, color: brand.textMuted, marginTop: 12, textAlign: 'center', lineHeight: 21 }}>
            Your details couldn’t be verified. Update your documents and try again, or contact support.
          </Text>
          <PillButton label="Update & resubmit" onPress={() => setView('setup')} style={{ marginTop: 24, alignSelf: 'stretch' }} />
          <TouchableOpacity onPress={signOut} style={{ marginTop: 18 }}>
            <Text style={{ fontSize: 13, color: brand.textMuted }}>Log out</Text>
          </TouchableOpacity>
        </View>
      </BrandScreen>
    );
  }

  // setup form
  return (
    <BrandScreen>
      <GlowOrb size={260} style={{ position: 'absolute', top: -90, right: -110 }} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 56, paddingBottom: 40 }}>
        <Text style={{ fontSize: 27, fontWeight: '800', color: brand.text, letterSpacing: -0.5 }}>Finish your setup</Text>
        <Text style={{ fontSize: 14, color: brand.textMuted, marginTop: 8, marginBottom: 22, lineHeight: 20 }}>
          Add your driver details. Your progress is saved — you can come back any time before submitting.
        </Text>

        <BrandInput label="Driver licence number" placeholder="GH-LIC-2025" value={draft.licenceNo} onChangeText={(v: string) => draft.set({ licenceNo: v })} autoCapitalize="characters" />
        <BrandInput label="Vehicle registration" placeholder="GR-1234-25" value={draft.vehicleReg} onChangeText={(v: string) => draft.set({ vehicleReg: v })} autoCapitalize="characters" />

        <Text style={{ fontSize: 13, fontWeight: '700', color: brand.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 10 }}>Documents</Text>
        <DocRow label="Roadworthy certificate" done={!!draft.roadworthyUrl}
          onPress={() => draft.set({ roadworthyUrl: draft.roadworthyUrl ? '' : 'https://placeholder.example/kyc/roadworthy.pdf' })} />
        <DocRow label="ID / selfie" done={!!draft.idSelfieUrl}
          onPress={() => draft.set({ idSelfieUrl: draft.idSelfieUrl ? '' : 'https://placeholder.example/kyc/id-selfie.jpg' })} />

        <PillButton label={submitting ? 'Submitting…' : 'Submit for approval'} onPress={submit} loading={submitting} style={{ marginTop: 22 }} />
        <Text style={{ fontSize: 12, color: brand.textMuted, textAlign: 'center', marginTop: 12, lineHeight: 18 }}>
          An admin will review and approve your account before you can take trips.
        </Text>

        <TouchableOpacity onPress={signOut} style={{ marginTop: 20, alignSelf: 'center' }}>
          <Text style={{ fontSize: 13, color: brand.textMuted }}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
    </BrandScreen>
  );
}

function DocRow({ label, done, onPress }: { label: string; done: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: done ? '#22c55e' : brand.borderSoft, backgroundColor: 'rgba(255,255,255,0.04)' }}>
      <Ionicons name={done ? 'checkmark-circle' : 'cloud-upload-outline'} size={22} color={done ? '#22c55e' : brand.textMuted} />
      <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: brand.text }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color: done ? '#22c55e' : brand.primary }}>{done ? 'Uploaded' : 'Upload'}</Text>
    </TouchableOpacity>
  );
}
