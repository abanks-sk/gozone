import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../src/store/authStore';
import { useProfileStore, initial } from '../src/store/profileStore';
import { useTheme } from '../src/theme/ThemeProvider';
import { Screen, Card, Avatar, Divider } from '../src/components/ui';

const MODES: { key: 'system' | 'light' | 'dark'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { key: 'light', label: 'Light', icon: 'sunny-outline' },
  { key: 'dark', label: 'Dark', icon: 'moon-outline' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const { role, logout } = useAuthStore();
  const { mode, setMode } = useTheme();
  const name = useProfileStore((s) => s.name);
  const username = useProfileStore((s) => s.username);

  function confirmLogout() {
    Alert.alert('Log out', 'Sign out of GoZone?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: async () => { await logout(); router.replace('/welcome'); } },
    ]);
  }

  return (
    <Screen scroll>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Profile</Text>
      </View>

      {/* Identity → account editor */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/account' as any)}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar label={initial(name)} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>{name || 'Your account'}</Text>
              <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 2 }}>
                {username ? `@${username}` : 'Passenger'} · GoZone
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.textMuted} />
          </View>
        </Card>
      </TouchableOpacity>

      {/* Appearance */}
      <Text style={sectionLabel(c)}>Appearance</Text>
      <Card>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {MODES.map((m) => {
            const selected = mode === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                onPress={() => setMode(m.key)}
                activeOpacity={0.85}
                style={{
                  flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 14,
                  backgroundColor: selected ? c.primarySoft : c.surfaceAlt,
                  borderWidth: 1.5, borderColor: selected ? c.primary : 'transparent',
                }}
              >
                <Ionicons name={m.icon} size={22} color={selected ? c.primary : c.textMuted} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: selected ? c.primary : c.text }}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* Account */}
      <Text style={sectionLabel(c)}>Account</Text>
      <Card>
        <Row icon="time-outline" label="Your rides" onPress={() => router.push('/(rider)/rides' as any)} c={c} />
        <Divider />
        <Row icon="card-outline" label="Payment" onPress={() => router.push('/wallet' as any)} c={c} />
        <Divider />
        <Row icon="location-outline" label="Saved places" onPress={() => router.push('/saved-places' as any)} c={c} />
        <Divider />
        <Row icon="help-circle-outline" label="Help & support" onPress={() => router.push('/help' as any)} c={c} />
        <Divider />
        <Row icon="information-circle-outline" label="About" onPress={() => router.push('/about' as any)} c={c} />
        <Divider />
        <Row icon="log-out-outline" label="Log out" danger onPress={confirmLogout} c={c} last />
      </Card>
    </Screen>
  );
}

function Row({ icon, label, hint, onPress, danger, last, c }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      <Ionicons name={icon} size={20} color={danger ? c.danger : c.textMuted} />
      <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: danger ? c.danger : c.text }}>{label}</Text>
      {hint ? <Text style={{ fontSize: 12, color: c.textMuted }}>{hint}</Text> : null}
      {!danger ? <Ionicons name="chevron-forward" size={18} color={c.textMuted} /> : null}
    </TouchableOpacity>
  );
}

const sectionLabel = (c: any) => ({
  fontSize: 13, fontWeight: '700' as const, color: c.textMuted,
  textTransform: 'uppercase' as const, letterSpacing: 0.6, marginTop: 18, marginBottom: 8,
});
