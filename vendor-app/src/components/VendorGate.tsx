import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { useVendorStore } from '../store/vendorStore';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Wraps the parts of the vendor app that only an approved business may use.
 *
 * Previously an unapproved vendor never got in at all: `onboarding.tsx` parked them on a
 * full-screen "awaiting approval" page whose only control was Log out. They could not reach their
 * profile, add an email, or correct anything while they waited — which is the opposite of what
 * the wait is for. The driver app lets its users in; this brings the vendor app into line.
 *
 * So the tab bar is always available. Orders, Queue, Catalogue and Earnings wrap themselves in
 * this and explain their state; **Profile is deliberately not gated**, because updating your
 * details is exactly what should still work while approval is pending.
 *
 * The four states are distinguishable on purpose — "we're checking", "you haven't told us about
 * your business yet", "we're reviewing it" and "it was turned down" call for different actions,
 * and collapsing them into one empty screen is what made the old flow a dead end.
 */
export function VendorGate({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const vendor = useVendorStore((s) => s.vendor);
  const loaded = useVendorStore((s) => s.loaded);

  // Approved and set up — get out of the way.
  //
  // Both halves have to be clear. The account is a decision about the person and the business is a
  // decision about the shop; an approved owner opening a second shop has the first and not yet the
  // second, and letting that through would put an unreviewed business straight in front of
  // customers. Businesses that predate this are grandfathered in as APPROVED, so nothing that was
  // trading stops.
  const businessApproved = !vendor || (vendor.approvalStatus ?? 'APPROVED') === 'APPROVED';
  if (status === 'ACTIVE' && vendor && businessApproved) return <>{children}</>;

  // Every gated state carries a way to Profile.
  //
  // Without it this whole change would be pointless: the only route to the profile screen is an
  // avatar inside the orders board, and the gate replaces that board — so "let them in but
  // restrict them to settings" would have left settings unreachable.
  const wrap = (node: React.ReactNode) => (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 40, paddingHorizontal: 24 }}>
      <View style={{ alignItems: 'center', gap: 12 }}>{node}</View>
      <TouchableOpacity onPress={() => router.push('/profile' as any)} activeOpacity={0.8}
        style={{ marginTop: 26, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="person-circle-outline" size={19} color={c.textMuted} />
        <Text style={{ fontSize: 14, color: c.textMuted, fontWeight: '600' }}>Profile & settings</Text>
      </TouchableOpacity>
    </View>
  );

  // Still asking the server. Showing "you have no business" here would be a lie told to every
  // established vendor on every cold start.
  if (!loaded || status == null) {
    return wrap(<ActivityIndicator color={c.primary} />);
  }

  if (status === 'REJECTED') {
    return wrap(
      <>
        <Badge icon="close-circle-outline" tint="#ef4444" bg="rgba(239,68,68,0.16)" />
        <Title c={c}>Business not approved</Title>
        <Body c={c}>
          Your business couldn’t be verified. Update your details and submit again, or contact
          support from your profile.
        </Body>
        <Action c={c} label="Update & resubmit" onPress={() => router.push('/onboarding' as any)} />
      </>,
    );
  }

  if (!vendor) {
    return wrap(
      <>
        <Badge icon="storefront-outline" tint={c.primary} bg={c.primarySoft} />
        <Title c={c}>Tell us about your business</Title>
        <Body c={c}>
          Add your business name, type and location and we’ll send it for approval. You can edit
          your personal details under Profile in the meantime.
        </Body>
        <Action c={c} label="Set up my business" onPress={() => router.push('/onboarding' as any)} />
      </>,
    );
  }

  // The account is fine; this particular shop is not.
  if (status === 'ACTIVE' && vendor && vendor.approvalStatus === 'REJECTED') {
    return wrap(
      <>
        <Badge icon="close-circle-outline" tint="#ef4444" bg="rgba(239,68,68,0.16)" />
        <Title c={c}>{vendor.name} wasn’t approved</Title>
        <Body c={c}>
          {vendor.approvalNote
            ? vendor.approvalNote
            : 'This business couldn’t be verified. Update its details and submit again.'}
        </Body>
        <Action c={c} label="Update business" onPress={() => router.push('/storefront' as any)} />
      </>,
    );
  }

  // PENDING (or anything else that isn't active) with a business on file.
  return wrap(
    <>
      <Badge icon="hourglass-outline" tint={c.primary} bg={c.primarySoft} />
      <Title c={c}>{vendor.name} is being reviewed</Title>
      <Body c={c}>
        An admin is checking your business. You’ll be able to take orders as soon as it’s approved —
        this updates on its own. Your profile and settings work in the meantime.
      </Body>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <ActivityIndicator color={c.textMuted} />
        <Text style={{ fontSize: 13, color: c.textMuted }}>Waiting for approval…</Text>
      </View>
      <Action c={c} label="Check again" onPress={() => fetchMe()} outline />
    </>,
  );
}

function Badge({ icon, tint, bg }: { icon: any; tint: string; bg: string }) {
  return (
    <View style={{ width: 78, height: 78, borderRadius: 39, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={38} color={tint} />
    </View>
  );
}
function Title({ children, c }: any) {
  return <Text style={{ fontSize: 21, fontWeight: '800', color: c.text, textAlign: 'center', marginTop: 6 }}>{children}</Text>;
}
function Body({ children, c }: any) {
  return <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 21 }}>{children}</Text>;
}
function Action({ c, label, onPress, outline }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={{
        marginTop: 10, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 28,
        backgroundColor: outline ? 'transparent' : c.primary,
        borderWidth: outline ? 1.5 : 0, borderColor: c.border,
      }}>
      <Text style={{ color: outline ? c.text : '#fff', fontWeight: '800', fontSize: 14.5 }}>{label}</Text>
    </TouchableOpacity>
  );
}
