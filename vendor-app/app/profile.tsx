import { useEffect } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../src/store/authStore';
import { useVendorStore } from '../src/store/vendorStore';
import { useProfileStore } from '../src/store/profileStore';
import { useBusiness, hoursSummary } from '../src/store/businessStore';
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
  const { logout } = useAuthStore();
  const { mode, setMode } = useTheme();
  const vendor = useVendorStore((s) => s.vendor);
  const business = useBusiness();
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const setFromServer = useProfileStore((s) => s.setFromServer);
  const profile = useProfileStore();

  // Refresh the owner's account details from the server so the rows below show what's
  // actually on the account (and not a stale cache from another device).
  useEffect(() => {
    fetchMe().then((me) => { if (me.name || me.phone || me.email) setFromServer(me); });
  }, [fetchMe, setFromServer]);

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

      {/* Identity */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar label={(vendor?.name?.[0] ?? 'V').toUpperCase()} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>{vendor?.name ?? 'Your business'}</Text>
            <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 2 }}>Vendor · GoZone</Text>
          </View>
        </View>
      </Card>

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
        <Row icon="person-outline" label="Your details" hint={profile.name || 'Add'} onPress={() => router.push('/account' as any)} c={c} />
        <Divider />
        {/* What customers see, as opposed to "Business details" below, which is your own record. */}
        <Row icon="image-outline" label="Storefront & location"
             hint={vendor?.address || (vendor?.description ? 'Edit' : 'Set up')}
             onPress={() => router.push('/storefront' as any)} c={c} />
        <Divider />
        <Row icon="storefront-outline" label="Business details" hint={business.address || 'Add'} onPress={() => router.push('/business' as any)} c={c} />
        <Divider />
        <Row icon="time-outline" label="Opening hours" hint={hoursSummary(business)} onPress={() => router.push('/hours' as any)} c={c} />
        <Divider />
        <Row icon="megaphone-outline" label="Promote my business" onPress={() => router.push('/promote' as any)} c={c} />
        <Divider />
        <Row icon="mail-outline" label="Sign-in email" hint={profile.email || 'Add'} onPress={() => router.push('/add-email' as any)} c={c} />
        <Divider />
        <Row icon="help-circle-outline" label="Help & support" onPress={() => router.push('/help' as any)} c={c} />
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
