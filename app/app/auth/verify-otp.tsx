import { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform,
  StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { Btn, Colors, Input } from '../../src/components/ui';

export default function VerifyOtpScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const router = useRouter();
  const { verifyOtp, role } = useAuthStore();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleVerify() {
    if (code.length !== 6) return Alert.alert('Enter the 6-digit OTP');
    setLoading(true);
    try {
      await verifyOtp(phone, code);
      // Navigation handled by root layout auth gate
    } catch (e: any) {
      Alert.alert('Invalid code', e?.response?.data?.message ?? 'Try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Verify phone</Text>
        <Text style={styles.sub}>
          Enter the 6-digit code sent to {phone}.{'\n'}
          (Demo: check the auth-service logs.)
        </Text>

        <Input
          label="OTP code"
          placeholder="123456"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
        />

        <Btn label="Verify" onPress={handleVerify} loading={loading} />

        <Btn
          label="← Back"
          variant="ghost"
          onPress={() => router.back()}
          style={{ marginTop: 8 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 80 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  sub: { fontSize: 14, color: Colors.muted, marginBottom: 32, lineHeight: 20 },
});
