import { useState } from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { Screen, Card, Divider, Row } from '../src/components/ui';

const SUPPORT_EMAIL = 'abankwa.ok@gmail.com';
const SUPPORT_PHONE = '+233302000000';

const FAQS: { q: string; a: string }[] = [
  { q: 'How do I start getting trips?',
    a: 'Go online from the Home screen — the hero turns green and nearby ride and parcel requests start coming in. Toggle offline anytime to stop receiving them.' },
  { q: 'How do accepting and counter-offers work?',
    a: 'Each request shows the passenger’s fare and a countdown. Accept it, decline it, or send a counter-offer — if the passenger accepts your counter, the trip starts at that fare.' },
  { q: 'How do I collect cash?',
    a: 'For a cash trip or delivery, collect the money on hand-off and tap “Confirm cash received”. The customer then sees the payment as settled.' },
  { q: 'When do I get paid?',
    a: 'Earnings land in your GoZone wallet as you complete trips. Cash out to your mobile money or bank account from the Earnings tab — the amount leaves your balance right away and is paid out shortly after. If a payout can’t be completed, it comes straight back to your wallet.' },
  { q: 'Why is my account pending?',
    a: 'New drivers finish a quick setup (licence, vehicle, documents) and an admin approves the account before you can go online. You’ll be notified once approved.' },
];

export default function DriverHelpScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Help & support</Text>
      </View>

      <Text style={{ fontSize: 14.5, color: c.textMuted, lineHeight: 21, marginBottom: 18 }}>
        Driver support — reach the team or browse common questions.
      </Text>

      <Text style={label(c)}>Contact us</Text>
      <Card>
        <LinkRow icon="mail-outline" text="Email driver support" hint={SUPPORT_EMAIL}
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=GoZone%20driver%20support`)} c={c} />
        <Divider />
        <LinkRow icon="call-outline" text="Call support" hint={SUPPORT_PHONE}
          onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)} c={c} />
        <Divider />
        <LinkRow icon="logo-whatsapp" text="Chat on WhatsApp"
          onPress={() => Linking.openURL(`https://wa.me/${SUPPORT_PHONE.replace('+', '')}`)} c={c} last />
      </Card>

      <Text style={label(c)}>Frequently asked</Text>
      <Card>
        {FAQS.map((item, i) => (
          <View key={i}>
            <TouchableOpacity onPress={() => setOpen(open === i ? null : i)} activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: c.text }}>{item.q}</Text>
              <Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={c.textMuted} />
            </TouchableOpacity>
            {open === i && <Text style={{ fontSize: 14, color: c.textMuted, lineHeight: 21, paddingBottom: 14 }}>{item.a}</Text>}
            {i < FAQS.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </Card>

      <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 20 }}>
        Support hours: 6am – 11pm daily.
      </Text>
    </Screen>
  );
}

function LinkRow({ icon, text, hint, onPress, last, c }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      <Ionicons name={icon} size={20} color={c.textMuted} />
      <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: c.text }}>{text}</Text>
      {hint ? <Text style={{ fontSize: 12.5, color: c.textMuted, marginRight: 4 }}>{hint}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
    </TouchableOpacity>
  );
}

const label = (c: any) => ({
  fontSize: 13, fontWeight: '700' as const, color: c.textMuted,
  textTransform: 'uppercase' as const, letterSpacing: 0.6, marginTop: 18, marginBottom: 8,
});
