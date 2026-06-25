import { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { Btn, Colors, Input } from '../../src/components/ui';

const ROLES = ['RIDER', 'DRIVER', 'RESTAURANT_OWNER', 'COURIER'];

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuthStore();
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('RIDER');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!phone.trim()) return Alert.alert('Enter a phone number');
    setLoading(true);
    try {
      await register(phone.trim(), role);
      router.push({ pathname: '/auth/verify-otp', params: { phone: phone.trim() } });
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.logo}>GoZone</Text>
          <Text style={styles.tagline}>Your city, connected.</Text>
        </View>

        <Text style={styles.title}>Get started</Text>

        <Input
          label="Phone number"
          placeholder="+233 50 123 4567"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
        />

        <Text style={styles.roleLabel}>I am a…</Text>
        <View style={styles.roleRow}>
          {ROLES.map(r => (
            <Btn
              key={r}
              label={r.replace('_', ' ')}
              variant={role === r ? 'primary' : 'outline'}
              onPress={() => setRole(r)}
              style={styles.roleBtn}
            />
          ))}
        </View>

        <Btn label="Send OTP" onPress={handleSubmit} loading={loading} style={{ marginTop: 8 }} />

        <Text style={styles.hint}>
          A 6-digit code will be shown in the service logs (OTP is mocked for demo).
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 80 },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 42, fontWeight: '800', color: Colors.primary },
  tagline: { fontSize: 16, color: Colors.muted, marginTop: 4 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 24 },
  roleLabel: {
    fontSize: 13, fontWeight: '500', color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  roleBtn: { flex: 1, minWidth: 120, marginBottom: 0 },
  hint: { marginTop: 16, fontSize: 12, color: Colors.muted, textAlign: 'center', lineHeight: 18 },
});
