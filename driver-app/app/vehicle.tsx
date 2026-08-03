import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { Screen, Card } from '../src/components/ui';
import { authApi } from '../src/api/auth';
import { useAuthStore } from '../src/store/authStore';
import { useVehicle } from '../src/store/vehicleStore';

/**
 * The vehicle on the account.
 *
 * It used to live only on this device — typed in here, persisted to local storage, sent to nobody.
 * The description a passenger saw attached to a bid came from that, so it had never been checked;
 * the admin grading the car Standard or Luxe could not see what the car was; and it disappeared on
 * reinstall. It is collected at sign-up now and stored on the account.
 *
 * Editable only while the account is still unapproved. Once an admin has cleared it, the vehicle is
 * part of what they cleared — a driver who could rewrite their own plate afterwards could put a
 * different vehicle on the road under a verified identity. The re-review flow for changing it after
 * approval is not built, so this says so plainly rather than offering a button that fails.
 */
export default function VehicleScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const cache = useVehicle();
  const setCache = useVehicle((s) => s.setVehicle);
  const status = useAuthStore((s) => s.status);
  const fetchMe = useAuthStore((s) => s.fetchMe);

  // Start from the local cache so the fields are never briefly blank, then correct from the server.
  const [make, setMake] = useState(cache.make);
  const [model, setModel] = useState(cache.model);
  const [plate, setPlate] = useState(cache.plate);
  const [color, setColor] = useState(cache.color);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMe().then((me) => {
      setMake(me.vehicleMake ?? '');
      setModel(me.vehicleModel ?? '');
      setPlate(me.vehiclePlate ?? '');
      setColor(me.vehicleColour ?? '');
      setCache({
        make: me.vehicleMake ?? '', model: me.vehicleModel ?? '',
        plate: me.vehiclePlate ?? '', color: me.vehicleColour ?? '',
      });
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locked = status === 'ACTIVE';

  async function save() {
    if (!plate.trim()) return Alert.alert('Number plate needed', 'This is what ties you to the vehicle you drive.');
    setSaving(true);
    try {
      const me = await authApi.updateVehicle({
        vehicleMake: make.trim(), vehicleModel: model.trim(),
        vehicleColour: color.trim(), vehiclePlate: plate.trim(),
      });
      setCache({
        make: me.vehicleMake ?? '', model: me.vehicleModel ?? '',
        plate: me.vehiclePlate ?? '', color: me.vehicleColour ?? '',
      });
      router.back();
    } catch (e: any) {
      Alert.alert(
        e?.response?.status === 409 ? 'Verified with your account' : 'Could not save',
        e?.response?.data?.message ?? 'Please try again.',
      );
    } finally { setSaving(false); }
  }

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Vehicle</Text>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
      ) : (
        <>
          <Card>
            <Field label="Make" value={make} onChangeText={setMake} placeholder="Toyota" editable={!locked} c={c} />
            <Field label="Model" value={model} onChangeText={setModel} placeholder="Vitz" editable={!locked} c={c} />
            <Field label="Number plate" value={plate} onChangeText={setPlate} placeholder="GR-2244-22"
              autoCapitalize="characters" editable={!locked} c={c} />
            <Field label="Colour" value={color} onChangeText={setColor} placeholder="Silver" editable={!locked} c={c} last />
          </Card>

          {locked ? (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, paddingHorizontal: 4 }}>
              <Ionicons name="lock-closed-outline" size={18} color={c.textMuted} />
              <Text style={{ flex: 1, fontSize: 13, color: c.textMuted, lineHeight: 19 }}>
                Your vehicle was verified along with your account, so it can’t be edited here. To
                change it, contact support — the new details have to be reviewed before they take
                effect.
              </Text>
            </View>
          ) : (
            <>
              <TouchableOpacity onPress={save} activeOpacity={0.9} disabled={saving}
                style={{ marginTop: 18, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center', opacity: saving ? 0.7 : 1 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{saving ? 'Saving…' : 'Save vehicle'}</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 14, lineHeight: 18 }}>
                You can correct these until an admin approves your account.
              </Text>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function Field({ label, value, onChangeText, placeholder, autoCapitalize, editable = true, last, c }: any) {
  return (
    <View style={{ marginBottom: last ? 0 : 14 }}>
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.textMuted, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.textMuted}
        autoCapitalize={autoCapitalize ?? 'words'}
        editable={editable}
        style={{
          backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
          fontSize: 15, color: editable ? c.text : c.textMuted,
        }}
      />
    </View>
  );
}
