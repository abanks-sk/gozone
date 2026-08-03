import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi, Kyc } from '../src/api/auth';
import api from '../src/api/client';
import { storage } from '../src/lib/storage';
import { apiBaseUrl } from '../src/lib/host';
import { useAuthStore } from '../src/store/authStore';
import { useTheme } from '../src/theme/ThemeProvider';
import { Screen, Card, Divider, Badge } from '../src/components/ui';

/**
 * The documents on file, and what has become of them.
 *
 * Reachable from Profile → Documents, which used to open an alert reading "Licence & roadworthy on
 * file (KYC mocked)" — written when the documents genuinely were a placeholder string, and left in
 * place after they became real photographs. A driver could not see what had been submitted on their
 * behalf, nor whether anyone had looked at it.
 *
 * Read-only on purpose. These are the details an admin verified an identity against, so changing
 * one after approval has to go back through review rather than being edited in place.
 */
export default function DocumentsScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const status = useAuthStore((s) => s.status);

  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi.myKyc().then(setKyc).finally(() => setLoading(false));
  }, []);

  const approved = kyc?.status === 'VERIFIED';
  const tone = kyc?.status === 'VERIFIED' ? c.success : kyc?.status === 'REJECTED' ? c.danger : c.warning;
  const label = !kyc ? 'Not submitted' : kyc.status === 'VERIFIED' ? 'Verified' : kyc.status === 'REJECTED' ? 'Rejected' : 'In review';

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Documents</Text>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : !kyc ? (
        <Card>
          <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>Nothing submitted yet</Text>
          <Text style={{ fontSize: 13.5, color: c.textMuted, marginTop: 6, lineHeight: 20 }}>
            You need a photo of yourself, your driving licence and your vehicle before you can take trips.
          </Text>
          <TouchableOpacity onPress={() => router.replace('/onboarding' as any)} activeOpacity={0.85}
            style={{ marginTop: 14, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Finish your setup</Text>
          </TouchableOpacity>
        </Card>
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>Verification</Text>
              <Badge label={label} color={tone} />
            </View>
            <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 8, lineHeight: 19 }}>
              {kyc.status === 'VERIFIED'
                ? 'An admin has checked these against your account.'
                : kyc.status === 'REJECTED'
                  ? 'Your documents were not accepted. Contact support to find out what to change.'
                  : 'An admin is reviewing these. You’ll be able to take trips once they’re accepted.'}
            </Text>
          </Card>

          <Text style={sectionLabel(c)}>Details</Text>
          <Card>
            <Field label="Licence number" value={kyc.licenceNo} c={c} />
            <Divider />
            <Field label="Vehicle registration" value={kyc.vehicleReg} c={c} />
          </Card>

          <Text style={sectionLabel(c)}>Photographs</Text>
          <DocImage label="You" url={kyc.idSelfieUrl} c={c} />
          <DocImage label="Driving licence" url={kyc.licenceUrl} c={c} />
          <DocImage label="Vehicle" url={kyc.vehiclePhotoUrl} c={c} />
          {kyc.roadworthyUrl ? <DocImage label="Roadworthy certificate" url={kyc.roadworthyUrl} c={c} /> : null}

          <Card style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Ionicons name={approved ? 'lock-closed-outline' : 'information-circle-outline'} size={18} color={c.textMuted} />
              <Text style={{ flex: 1, fontSize: 13, color: c.textMuted, lineHeight: 19 }}>
                {approved
                  ? 'These were verified against your identity, so they can’t be edited here. Ask for a change and an admin will review it — what’s on file stays in place until they approve it.'
                  : status === 'REJECTED'
                    ? 'You can resubmit from your setup screen.'
                    : 'You can’t edit these while they’re being reviewed.'}
              </Text>
            </View>
            {approved && (
              <TouchableOpacity onPress={() => router.push('/request-change' as any)} activeOpacity={0.9}
                style={{ marginTop: 14, backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.primary, borderRadius: 999, paddingVertical: 13, alignItems: 'center' }}>
                <Text style={{ color: c.primary, fontWeight: '800', fontSize: 14.5 }}>Request a change</Text>
              </TouchableOpacity>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

function Field({ label, value, c }: any) {
  return (
    <View style={{ paddingVertical: 11 }}>
      <Text style={{ fontSize: 11.5, color: c.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
      <Text style={{ fontSize: 15.5, fontWeight: '700', color: c.text, marginTop: 3 }}>{value || '—'}</Text>
    </View>
  );
}

/**
 * One stored document.
 *
 * The served copy is behind the same access check as everything else, so a plain `<Image src>` gets
 * a 401 — it sends no Authorization header. Native can be handed the header directly; the browser
 * cannot, so there the bytes are fetched through the API client (which attaches the token) and
 * turned into an object URL.
 */
function DocImage({ label, url, c }: { label: string; url?: string | null; c: any }) {
  const [src, setSrc] = useState<string | null>(null);
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!url) return;
    (async () => {
      if (Platform.OS === 'web') {
        try {
          const res = await api.get(url, { responseType: 'blob' });
          if (active) setSrc(URL.createObjectURL(res.data as Blob));
        } catch { if (active) setFailed(true); }
      } else {
        const token = await storage.get('accessToken');
        if (!active) return;
        setHeaders(token ? { Authorization: `Bearer ${token}` } : {});
        setSrc(`${apiBaseUrl()}${url}`);
      }
    })();
    return () => { active = false; };
  }, [url]);

  return (
    <Card style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 13.5, fontWeight: '700', color: c.text, marginBottom: 8 }}>{label}</Text>
      {!url ? (
        <Text style={{ fontSize: 13, color: c.textMuted }}>Not provided</Text>
      ) : failed || (!src && Platform.OS === 'web') ? (
        <View style={{ height: 160, borderRadius: 14, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          {failed ? <Text style={{ fontSize: 13, color: c.textMuted }}>Couldn’t load this document</Text> : <ActivityIndicator color={c.primary} />}
        </View>
      ) : (
        <Image
          source={headers ? { uri: src!, headers } : { uri: src! }}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: 200, borderRadius: 14, backgroundColor: c.surfaceAlt }}
          resizeMode="cover"
        />
      )}
    </Card>
  );
}

const sectionLabel = (c: any) => ({
  fontSize: 13, fontWeight: '700' as const, color: c.textMuted,
  textTransform: 'uppercase' as const, letterSpacing: 0.6, marginTop: 18, marginBottom: 8,
});
