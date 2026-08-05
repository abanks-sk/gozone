import { useState } from 'react';
import { Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { Card, Divider, Row } from '../src/components/ui';

const SUPPORT_EMAIL = 'abankwa.ok@gmail.com';
const SUPPORT_PHONE = '+233302000000';

const FAQS: { q: string; a: string }[] = [
  { q: 'How do I request a ride?',
    a: 'From the home screen, set your pickup and destination, choose a ride type, set your fare and tap Request ride. Nearby drivers can accept or send you an offer.' },
  { q: 'How does fare bargaining work?',
    a: 'On Standard and Okada rides you set your own fare. Drivers may counter with an offer — you’ll see them on the live screen and can accept the one you like. Luxe rides use a fixed fare.' },
  { q: 'How do I track my order or parcel?',
    a: 'Open the order or parcel from its screen — you’ll see live status and, once a courier is on the way, their location on the map until it’s delivered.' },
  { q: 'What payment methods can I use?',
    a: 'Wallet, Mobile Money, card, or cash. Pick your default under Profile → Payment. For cash, the driver or vendor confirms the payment in person.' },
  { q: 'How do I set Home and Work shortcuts?',
    a: 'Go to Profile → Saved places to set Home, Work and other spots. You can also tap an unset Home/Work pill while searching to set it on the map.' },
  { q: 'How do I become a driver or list my business?',
    a: 'Drivers use the GoZone Driver app and vendors use the GoZone Vendor app. Sign up there, complete setup, and an admin approves your account before you go live.' },
];

export default function HelpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>

        {/* Header */}
        <Row style={{ gap: 12, marginBottom: 18 }}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color={c.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Help & support</Text>
        </Row>

        <Text style={{ fontSize: 14.5, color: c.textMuted, lineHeight: 21, marginBottom: 18 }}>
          We’re here to help. Reach the team directly, or browse the answers below.
        </Text>

        {/* Contact */}
        <Text style={sectionLabel(c)}>Contact us</Text>
        <Card>
          <LinkRow icon="mail-outline" label="Email support" hint={SUPPORT_EMAIL}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=GoZone%20support`)} c={c} />
          <Divider />
          <LinkRow icon="call-outline" label="Call support" hint={SUPPORT_PHONE}
            onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)} c={c} />
          <Divider />
          <LinkRow icon="logo-whatsapp" label="Chat on WhatsApp"
            onPress={() => Linking.openURL(`https://wa.me/${SUPPORT_PHONE.replace('+', '')}`)} c={c} last />
        </Card>

        {/* FAQ */}
        <Text style={sectionLabel(c)}>Frequently asked</Text>
        <Card>
          {FAQS.map((item, i) => (
            <View key={i}>
              <TouchableOpacity onPress={() => setOpen(open === i ? null : i)} activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: c.text }}>{item.q}</Text>
                <Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={c.textMuted} />
              </TouchableOpacity>
              {open === i && (
                <Text style={{ fontSize: 14, color: c.textMuted, lineHeight: 21, paddingBottom: 14 }}>{item.a}</Text>
              )}
              {i < FAQS.length - 1 ? <Divider /> : null}
            </View>
          ))}
        </Card>

        {/* Report a problem */}
        <TouchableOpacity
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=GoZone%20problem%20report`)}
          activeOpacity={0.9}
          style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 15 }}>
          <Ionicons name="flag-outline" size={19} color={c.primary} />
          <Text style={{ fontSize: 15, fontWeight: '700', color: c.primary }}>Report a problem</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 20, lineHeight: 18 }}>
          Support hours: 7am – 10pm daily. In an emergency, contact local services directly.
        </Text>
      </ScrollView>
    </View>
  );
}

function LinkRow({ icon, label, hint, onPress, last, c }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      <Ionicons name={icon} size={20} color={c.textMuted} />
      <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: c.text }}>{label}</Text>
      {hint ? <Text style={{ fontSize: 12.5, color: c.textMuted, marginRight: 4 }}>{hint}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
    </TouchableOpacity>
  );
}

const sectionLabel = (c: any) => ({
  fontSize: 13, fontWeight: '700' as const, color: c.textMuted,
  textTransform: 'uppercase' as const, letterSpacing: 0.6, marginTop: 18, marginBottom: 8,
});
