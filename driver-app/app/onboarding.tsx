import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi, Kyc } from '../src/api/auth';
import { useAuthStore } from '../src/store/authStore';
import { useDriverSetup, SetupDraft } from '../src/store/driverSetupStore';
import { capturePhoto, uploadPhoto, captureFailureMessage } from '../src/lib/photo';
import { BrandScreen, GlowOrb, BrandInput, PillButton, GzHero } from '../src/components/brand';
import { brand } from '../src/theme/tokens';

type Stage = 'loading' | 'setup' | 'awaiting' | 'rejected';

export default function DriverOnboarding() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const draft = useDriverSetup();
  const [view, setView] = useState<Stage>('loading');
  const [goFeed, setGoFeed] = useState(false);
  // What the reviewer said. A refusal used to be a status and nothing else, so the screen could
  // only offer to "contact support" — which meant asking a person to read back a decision the
  // system had already written down.
  const [reason, setReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  type DocKey = 'selfie' | 'licence' | 'vehicle' | 'roadworthy';
  const FIELD: Record<DocKey, keyof SetupDraft> = {
    selfie: 'idSelfieUrl', licence: 'licenceUrl', vehicle: 'vehiclePhotoUrl', roadworthy: 'roadworthyUrl',
  };
  const [busyDoc, setBusyDoc] = useState<DocKey | null>(null);
  // Local thumbnails only — deliberately not persisted. A cached file URI from a previous session
  // may no longer exist, and a broken image is worse than none.
  const [previews, setPreviews] = useState<Partial<Record<DocKey, string>>>({});

  async function pickDoc(key: DocKey, useCamera: boolean) {
    setBusyDoc(key);
    try {
      const res = await capturePhoto(useCamera);
      if (!res.ok) {
        // Backing out is silent; anything else gets a reason. Doing nothing without a word was
        // indistinguishable from the button being broken.
        const msg = captureFailureMessage(res.reason);
        if (msg) Alert.alert(useCamera ? 'Can’t open the camera' : 'Can’t open your photos', msg);
        return;
      }
      const photo = res.photo;
      setPreviews((p) => ({ ...p, [key]: photo.uri }));
      const url = await uploadPhoto(photo);
      draft.set({ [FIELD[key]]: url } as Partial<SetupDraft>);
    } catch (e: any) {
      // Drop the preview again: showing a thumbnail for something the server rejected would tell
      // the driver they are done when they are not.
      setPreviews((p) => ({ ...p, [key]: undefined }));
      Alert.alert('Upload failed', e?.response?.data?.message ?? 'Could not upload that photo. Please try again.');
    } finally { setBusyDoc(null); }
  }

  async function refresh() {
    const me = await authApi.me().catch(() => null);
    if (!me) { setView('setup'); return; }
    if (me.status === 'ACTIVE') { setGoFeed(true); return; }
    if (me.status === 'REJECTED') { setReason(me.statusNote ?? null); setView('rejected'); return; }
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
      if (me?.status === 'REJECTED') { setReason(me.statusNote ?? null); setView('rejected'); }
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [view]);

  async function submit() {
    if (!draft.licenceNo.trim() || !draft.vehicleReg.trim()) {
      return Alert.alert('Almost there', 'Add your licence number and vehicle registration.');
    }
    // Checked here as well as on the server, so the driver is told what is missing before a
    // round-trip rather than after one.
    const missing = [
      !draft.idSelfieUrl && 'a photo of yourself',
      !draft.licenceUrl && 'a photo of your driving licence',
      !draft.vehiclePhotoUrl && 'a photo of your vehicle',
    ].filter(Boolean) as string[];
    if (missing.length) {
      return Alert.alert('Photos needed', `Please add ${missing.join(', ')}.`);
    }
    setSubmitting(true);
    try {
      await authApi.submitKyc({
        licenceNo: draft.licenceNo.trim(),
        vehicleReg: draft.vehicleReg.trim(),
        roadworthyUrl: draft.roadworthyUrl || undefined,
        idSelfieUrl: draft.idSelfieUrl,
        licenceUrl: draft.licenceUrl,
        vehiclePhotoUrl: draft.vehiclePhotoUrl,
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
        {/* GzHero carries its own glow — a corner orb on top of it read as a stray light. */}
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
            {reason
              ? 'The reviewer left you a note about what to change.'
              : 'Your details couldn’t be verified. Update your documents and try again, or contact support.'}
          </Text>
          {reason ? (
            <View style={{ marginTop: 16, alignSelf: 'stretch', backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 16, padding: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#ef4444', textTransform: 'uppercase', letterSpacing: 0.5 }}>Why</Text>
              <Text style={{ fontSize: 14, color: brand.text, marginTop: 6, lineHeight: 20 }}>{reason}</Text>
            </View>
          ) : null}
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

        <Text style={{ fontSize: 13, fontWeight: '700', color: brand.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 4 }}>Photos</Text>
        <Text style={{ fontSize: 12.5, color: brand.textMuted, marginBottom: 12, lineHeight: 18 }}>
          An admin checks these before you can take trips. Make sure the licence is readable and
          the number plate is visible.
        </Text>
        <PhotoRow label="Your photo" hint="A clear picture of your face"
          url={draft.idSelfieUrl} preview={previews.selfie} busy={busyDoc === 'selfie'}
          onPick={(cam) => pickDoc('selfie', cam)}
          onClear={() => draft.set({ idSelfieUrl: '' })} />
        <PhotoRow label="Driving licence" hint="All four corners in frame"
          url={draft.licenceUrl} preview={previews.licence} busy={busyDoc === 'licence'}
          onPick={(cam) => pickDoc('licence', cam)}
          onClear={() => draft.set({ licenceUrl: '' })} />
        <PhotoRow label="Your vehicle" hint="Show the number plate"
          url={draft.vehiclePhotoUrl} preview={previews.vehicle} busy={busyDoc === 'vehicle'}
          onPick={(cam) => pickDoc('vehicle', cam)}
          onClear={() => draft.set({ vehiclePhotoUrl: '' })} />
        <PhotoRow label="Roadworthy certificate" hint="Optional" optional
          url={draft.roadworthyUrl} preview={previews.roadworthy} busy={busyDoc === 'roadworthy'}
          onPick={(cam) => pickDoc('roadworthy', cam)}
          onClear={() => draft.set({ roadworthyUrl: '' })} />

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

/**
 * One document. Shows a thumbnail once uploaded, because "Uploaded ✓" next to a document you
 * cannot see is how the placeholder version managed to look finished while holding nothing —
 * seeing the actual photo is the only way a driver knows they photographed the right thing.
 */
function PhotoRow({ label, hint, url, preview, busy, optional, onPick, onClear }: {
  label: string; hint: string; url: string; preview?: string; busy: boolean; optional?: boolean;
  onPick: (useCamera: boolean) => void; onClear: () => void;
}) {
  const done = !!url;
  return (
    <View style={{ padding: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1,
                   borderColor: done ? '#22c55e' : brand.borderSoft, backgroundColor: 'rgba(255,255,255,0.04)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {preview ? (
          // The freshly-picked local file, not a re-fetch: the served copy needs an auth header,
          // which <Image> cannot send on web. On a resumed session there is no local file left,
          // so a tick stands in rather than a broken thumbnail.
          <Image source={{ uri: preview }}
                 style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' }} />
        ) : (
          <Ionicons name={done ? 'checkmark-circle' : 'camera-outline'} size={24}
                    color={done ? '#22c55e' : brand.textMuted} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: brand.text }}>
            {label}{optional ? '' : ' *'}
          </Text>
          <Text style={{ fontSize: 12, color: brand.textMuted, marginTop: 2 }}>
            {busy ? 'Uploading…' : done ? 'Uploaded' : hint}
          </Text>
        </View>
        {busy && <ActivityIndicator color={brand.textMuted} />}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <SmallBtn icon="camera" label={done ? 'Retake' : 'Take photo'} disabled={busy} onPress={() => onPick(true)} />
        <SmallBtn icon="images-outline" label="Choose" disabled={busy} onPress={() => onPick(false)} />
        {done && <SmallBtn icon="trash-outline" label="Remove" disabled={busy} danger onPress={onClear} />}
      </View>
    </View>
  );
}

function SmallBtn({ icon, label, onPress, disabled, danger }: any) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
               borderRadius: 999, borderWidth: 1, borderColor: brand.borderSoft, opacity: disabled ? 0.5 : 1 }}>
      <Ionicons name={icon} size={14} color={danger ? '#ef4444' : brand.textMuted} />
      <Text style={{ fontSize: 12.5, fontWeight: '700', color: danger ? '#ef4444' : brand.text }}>{label}</Text>
    </TouchableOpacity>
  );
}
