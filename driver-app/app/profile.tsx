import { useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi, Kyc } from '../src/api/auth';
import { useAuthStore } from '../src/store/authStore';
import { useDriverStore } from '../src/store/driverStore';
import { useVehicle, vehicleSummary } from '../src/store/vehicleStore';
import { useProfileStore, initial } from '../src/store/profileStore';
import { useTheme } from '../src/theme/ThemeProvider';
import { Screen, Card, Avatar, Divider, Row as URow } from '../src/components/ui';

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
  const trips = useDriverStore((s) => s.acceptedToday);
  const vehicle = useVehicle();
  const name = useProfileStore((s) => s.name);
  const username = useProfileStore((s) => s.username);
  const vehicleClass = useAuthStore((s) => s.vehicleClass);
  const serviceMode = useAuthStore((s) => s.serviceMode);
  const setServiceMode = useAuthStore((s) => s.setServiceMode);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const accountStatus = useAuthStore((s) => s.status);
  useEffect(() => { fetchMe(); }, []);

  /**
   * What the account and its documents are actually worth.
   *
   * Both of these read "Verified" no matter what, and the Documents row opened an alert that said
   * "(KYC mocked)" — written when the documents really were a placeholder string. They are real
   * photographs now, and a driver waiting on an admin was being told they were already approved.
   */
  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [kycLoaded, setKycLoaded] = useState(false);
  useEffect(() => {
    authApi.myKyc().then((k) => { setKyc(k); }).finally(() => setKycLoaded(true));
  }, []);

  const accountLabel =
    accountStatus === 'ACTIVE' ? 'Verified'
    : accountStatus === 'REJECTED' ? 'Rejected'
    : accountStatus === 'SUSPENDED' ? 'Suspended'
    : accountStatus ? 'In review' : '—';
  const accountTone =
    accountStatus === 'ACTIVE' ? c.success
    : accountStatus === 'REJECTED' || accountStatus === 'SUSPENDED' ? c.danger
    : c.warning;

  // Documents are their own thing: an account can be approved while a later document submission is
  // still being looked at, so this must not just mirror the account status.
  const docLabel = !kycLoaded ? '…'
    : !kyc ? 'Not submitted'
    : kyc.status === 'VERIFIED' ? 'Verified'
    : kyc.status === 'REJECTED' ? 'Rejected'
    : 'In review';

  const SERVICE_MODES: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'BOTH', label: 'Both', icon: 'swap-horizontal-outline' },
    { key: 'RIDES', label: 'Rides', icon: 'car-outline' },
    { key: 'DELIVERIES', label: 'Deliveries', icon: 'cube-outline' },
  ];
  const CLASS_LABEL: Record<string, string> = { OKADA: 'Okada', STANDARD: 'Standard', LUXE: 'Luxe', CARGO: 'Truck / Cargo' };

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
      <Card>
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/account' as any)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar label={initial(name)} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>{name || 'Your account'}</Text>
            <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 2 }}>{username ? `@${username}` : 'Driver'} · GoZone</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.textMuted} />
        </TouchableOpacity>
        <Divider />
        <URow style={{ justifyContent: 'space-around' }}>
          <Stat label="Trips today" value={String(trips)} c={c} />
          <View style={{ width: 1, height: 28, backgroundColor: c.border }} />
          <Stat label="Acceptance" value="95%" c={c} />
          <View style={{ width: 1, height: 28, backgroundColor: c.border }} />
          <Stat label="Status" value={accountLabel} tone={accountTone} c={c} />
        </URow>
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

      {/* Service — vehicle class + what you accept */}
      <Text style={sectionLabel(c)}>Driving</Text>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 }}>
          <Ionicons name="ribbon-outline" size={20} color={c.textMuted} />
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: c.text }}>Vehicle class</Text>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: vehicleClass ? c.primary : c.warning }}>
            {vehicleClass ? (CLASS_LABEL[vehicleClass] ?? vehicleClass) : 'Awaiting admin'}
          </Text>
        </View>
        <Divider />
        <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 12, marginBottom: 10 }}>What you want to accept</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {SERVICE_MODES.map((m) => {
            const sel = (serviceMode ?? 'BOTH') === m.key;
            return (
              <TouchableOpacity key={m.key} onPress={() => setServiceMode(m.key).catch(() => {})} activeOpacity={0.85}
                style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 14,
                  backgroundColor: sel ? c.primarySoft : c.surfaceAlt, borderWidth: 1.5, borderColor: sel ? c.primary : 'transparent' }}>
                <Ionicons name={m.icon} size={20} color={sel ? c.primary : c.textMuted} />
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: sel ? c.primary : c.text }}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* Account */}
      <Text style={sectionLabel(c)}>Account</Text>
      <Card>
        <Row icon="car-outline" label="Vehicle" hint={vehicleSummary(vehicle)} onPress={() => router.push('/vehicle' as any)} c={c} />
        <Divider />
        <Row icon="document-text-outline" label="Documents" hint={docLabel} onPress={() => router.push('/documents' as any)} c={c} />
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

function Stat({ label, value, tone, c }: any) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: tone ?? c.text }}>{value}</Text>
      <Text style={{ fontSize: 11.5, color: c.textMuted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const sectionLabel = (c: any) => ({
  fontSize: 13, fontWeight: '700' as const, color: c.textMuted,
  textTransform: 'uppercase' as const, letterSpacing: 0.6, marginTop: 18, marginBottom: 8,
});
