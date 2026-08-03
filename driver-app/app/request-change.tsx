import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi, EditRequest } from '../src/api/auth';
import { useAuthStore } from '../src/store/authStore';
import { useTheme } from '../src/theme/ThemeProvider';
import { Screen, Card, Divider, Badge } from '../src/components/ui';

/** How each field reads to a human. Anything not listed is a document and shown as "replaced". */
const LABEL: Record<string, string> = {
  name: 'Name',
  vehicleMake: 'Make',
  vehicleModel: 'Model',
  vehicleColour: 'Colour',
  vehiclePlate: 'Number plate',
  licenceNo: 'Licence number',
  idSelfieUrl: 'Your photo',
  licenceUrl: 'Licence photo',
  vehiclePhotoUrl: 'Vehicle photo',
  roadworthyUrl: 'Roadworthy certificate',
};
const IS_DOC = (k: string) => k.endsWith('Url');

/**
 * Ask for a change to details that were verified.
 *
 * Name, vehicle and documents are locked once an admin approves the account — they are what was
 * checked. Until now "locked" meant a dead end that told the driver to contact support, which is a
 * request nobody could act on inside the system. This is the route back in: propose the change,
 * an admin sees the old and new values side by side, and only their approval applies it.
 */
export default function RequestChangeScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const fetchMe = useAuthStore((s) => s.fetchMe);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [latest, setLatest] = useState<EditRequest | null>(null);

  const [name, setName] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [colour, setColour] = useState('');
  const [plate, setPlate] = useState('');
  const [reason, setReason] = useState('');

  async function load() {
    const [me, reqs] = await Promise.all([fetchMe(), authApi.myEditRequests()]);
    setName(me.name ?? '');
    setMake(me.vehicleMake ?? '');
    setModel(me.vehicleModel ?? '');
    setColour(me.vehicleColour ?? '');
    setPlate(me.vehiclePlate ?? '');
    setLatest(reqs[0] ?? null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const pending = latest?.status === 'PENDING';

  async function submit() {
    if (!reason.trim()) {
      return Alert.alert('Say why', 'An admin is being asked to approve a change to details they checked — tell them what happened.');
    }
    setSending(true);
    try {
      // Everything is sent; the server keeps only what actually differs from today's values, so an
      // untouched field never becomes part of the request.
      const req = await authApi.requestEdit({
        name: name.trim(), vehicleMake: make.trim(), vehicleModel: model.trim(),
        vehicleColour: colour.trim(), vehiclePlate: plate.trim(), reason: reason.trim(),
      });
      setLatest(req);
      setReason('');
      Alert.alert('Sent for review', 'An admin will look at this. Your current details stay in place until they approve it.');
    } catch (e: any) {
      Alert.alert('Could not send', e?.response?.data?.message ?? 'Please try again.');
    } finally { setSending(false); }
  }

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Request a change</Text>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
      ) : (
        <>
          {latest && (
            <Card style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>Your last request</Text>
                <Badge
                  label={latest.status === 'PENDING' ? 'In review' : latest.status === 'APPROVED' ? 'Approved' : 'Not approved'}
                  color={latest.status === 'PENDING' ? c.warning : latest.status === 'APPROVED' ? c.success : c.danger}
                />
              </View>
              <View style={{ marginTop: 10 }}>
                {Object.keys(latest.proposed).map((k) => (
                  <View key={k} style={{ marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, color: c.textMuted, fontWeight: '600' }}>{LABEL[k] ?? k}</Text>
                    <Text style={{ fontSize: 14, color: c.text }}>
                      {IS_DOC(k) ? 'New photo submitted' : `${latest.current[k] || '—'}  →  ${latest.proposed[k]}`}
                    </Text>
                  </View>
                ))}
              </View>
              {latest.reviewNote ? (
                <>
                  <Divider />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.danger, textTransform: 'uppercase', letterSpacing: 0.4 }}>Why it wasn’t approved</Text>
                  <Text style={{ fontSize: 13.5, color: c.text, marginTop: 4, lineHeight: 19 }}>{latest.reviewNote}</Text>
                </>
              ) : null}
            </Card>
          )}

          {pending ? (
            <Card>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Ionicons name="hourglass-outline" size={18} color={c.textMuted} />
                <Text style={{ flex: 1, fontSize: 13.5, color: c.textMuted, lineHeight: 19 }}>
                  You have a change waiting to be reviewed. You can send another once this one has
                  been decided — your current details stay in place until then.
                </Text>
              </View>
            </Card>
          ) : (
            <>
              <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 12, lineHeight: 19 }}>
                Change what’s different and say why. An admin sees your current details next to the
                new ones, and nothing takes effect until they approve it.
              </Text>
              <Card>
                <Field label="Name" value={name} onChangeText={setName} c={c} />
                <Field label="Make" value={make} onChangeText={setMake} c={c} />
                <Field label="Model" value={model} onChangeText={setModel} c={c} />
                <Field label="Colour" value={colour} onChangeText={setColour} c={c} />
                <Field label="Number plate" value={plate} onChangeText={setPlate} autoCapitalize="characters" c={c} />
                <Field label="Why is it changing?" value={reason} onChangeText={setReason}
                  placeholder="Resprayed and re-registered after an accident" multiline c={c} last />
              </Card>

              <TouchableOpacity onPress={submit} activeOpacity={0.9} disabled={sending}
                style={{ marginTop: 18, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center', opacity: sending ? 0.7 : 1 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{sending ? 'Sending…' : 'Send for review'}</Text>
              </TouchableOpacity>

              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 14, lineHeight: 18 }}>
                To replace a document, go to Documents.
              </Text>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function Field({ label, value, onChangeText, placeholder, autoCapitalize, multiline, last, c }: any) {
  return (
    <View style={{ marginBottom: last ? 0 : 14 }}>
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.textMuted, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.textMuted}
        autoCapitalize={autoCapitalize ?? 'words'} multiline={multiline}
        style={{
          backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
          fontSize: 15, color: c.text, minHeight: multiline ? 76 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}
