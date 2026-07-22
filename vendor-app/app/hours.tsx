import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { Screen, Card, Row } from '../src/components/ui';
import { useBusiness } from '../src/store/businessStore';

const PRESETS = [
  { label: '8am – 10pm', open: '8:00 AM', close: '10:00 PM' },
  { label: '9am – 9pm', open: '9:00 AM', close: '9:00 PM' },
  { label: '24 hours', open: '12:00 AM', close: '11:59 PM' },
];

export default function HoursScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const b = useBusiness();
  const setBusiness = useBusiness((s) => s.setBusiness);
  const [opensAt, setOpensAt] = useState(b.opensAt);
  const [closesAt, setClosesAt] = useState(b.closesAt);

  function save() {
    setBusiness({ opensAt: opensAt.trim(), closesAt: closesAt.trim() });
    router.back();
  }

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Opening hours</Text>
      </View>

      <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>Quick presets</Text>
      <Row style={{ gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <TouchableOpacity key={p.label} onPress={() => { setOpensAt(p.open); setClosesAt(p.close); }} activeOpacity={0.85}
            style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: c.text }}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </Row>

      <Card>
        <Field label="Opens at" value={opensAt} onChangeText={setOpensAt} placeholder="8:00 AM" c={c} />
        <Field label="Closes at" value={closesAt} onChangeText={setClosesAt} placeholder="10:00 PM" c={c} last />
      </Card>

      <TouchableOpacity onPress={save} activeOpacity={0.9}
        style={{ marginTop: 18, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Save hours</Text>
      </TouchableOpacity>
    </Screen>
  );
}

function Field({ label, value, onChangeText, placeholder, last, c }: any) {
  return (
    <View style={{ marginBottom: last ? 0 : 14 }}>
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.textMuted, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.textMuted}
        style={{ backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: c.text }}
      />
    </View>
  );
}
