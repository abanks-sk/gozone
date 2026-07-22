import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { Screen, Card } from '../src/components/ui';
import { useBusiness } from '../src/store/businessStore';
import { useVendorStore } from '../src/store/vendorStore';

export default function BusinessScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const vendor = useVendorStore((s) => s.vendor);
  const b = useBusiness();
  const setBusiness = useBusiness((s) => s.setBusiness);
  const [address, setAddress] = useState(b.address);
  const [phone, setPhone] = useState(b.phone);

  function save() {
    setBusiness({ address: address.trim(), phone: phone.trim() });
    router.back();
  }

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Business details</Text>
      </View>

      <Card>
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.textMuted, marginBottom: 6 }}>Business name</Text>
          <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13 }}>
            <Text style={{ fontSize: 15, color: c.text }}>{vendor?.name ?? '—'}</Text>
          </View>
          <Text style={{ fontSize: 11.5, color: c.textMuted, marginTop: 5 }}>Set at sign-up · contact support to change your registered name.</Text>
        </View>
        <Field label="Address / location" value={address} onChangeText={setAddress} placeholder="Osu, Oxford Street, Accra" c={c} />
        <Field label="Contact phone" value={phone} onChangeText={setPhone} placeholder="+233 50 123 4567" keyboardType="phone-pad" c={c} last />
      </Card>

      <TouchableOpacity onPress={save} activeOpacity={0.9}
        style={{ marginTop: 18, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Save details</Text>
      </TouchableOpacity>
    </Screen>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, last, c }: any) {
  return (
    <View style={{ marginBottom: last ? 0 : 14 }}>
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.textMuted, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.textMuted}
        keyboardType={keyboardType}
        style={{ backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: c.text }}
      />
    </View>
  );
}
