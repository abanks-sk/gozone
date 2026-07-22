import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { Screen, Card } from '../src/components/ui';
import { useVehicle } from '../src/store/vehicleStore';

export default function VehicleScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const v = useVehicle();
  const setVehicle = useVehicle((s) => s.setVehicle);
  const [make, setMake] = useState(v.make);
  const [model, setModel] = useState(v.model);
  const [plate, setPlate] = useState(v.plate);
  const [color, setColor] = useState(v.color);

  function save() {
    setVehicle({ make: make.trim(), model: model.trim(), plate: plate.trim().toUpperCase(), color: color.trim() });
    router.back();
  }

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Vehicle</Text>
      </View>

      <Card>
        <Field label="Make" value={make} onChangeText={setMake} placeholder="Toyota" c={c} />
        <Field label="Model" value={model} onChangeText={setModel} placeholder="Vitz" c={c} />
        <Field label="Number plate" value={plate} onChangeText={setPlate} placeholder="GR-2244-22" autoCapitalize="characters" c={c} />
        <Field label="Colour" value={color} onChangeText={setColor} placeholder="Silver" c={c} last />
      </Card>

      <TouchableOpacity onPress={save} activeOpacity={0.9}
        style={{ marginTop: 18, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Save vehicle</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 14, lineHeight: 18 }}>
        Vehicle details are stored on your device for the demo.
      </Text>
    </Screen>
  );
}

function Field({ label, value, onChangeText, placeholder, autoCapitalize, last, c }: any) {
  return (
    <View style={{ marginBottom: last ? 0 : 14 }}>
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.textMuted, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.textMuted}
        autoCapitalize={autoCapitalize ?? 'words'}
        style={{ backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: c.text }}
      />
    </View>
  );
}
