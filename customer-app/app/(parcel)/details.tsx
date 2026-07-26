import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { rideApi, Quote } from '../../src/api/ride';
import { useRideDraft } from '../../src/store/rideDraft';
import { useProfileStore } from '../../src/store/profileStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Row } from '../../src/components/ui';

const SIZES = [
  { key: 'Small', icon: 'document-outline' as const, sub: 'Documents, keys', fee: 0,
    desc: 'Fits a ~50 cm box — documents, keys, small items. Carried by Okada riders.' },
  { key: 'Medium', icon: 'cube-outline' as const, sub: 'Shoebox size', fee: 3,
    desc: 'Too big for a bike but not truck-sized — up to a small carton. Carried by car drivers.' },
  { key: 'Large', icon: 'bag-handle-outline' as const, sub: 'Backpack and up', fee: 6,
    desc: 'Bulky/heavy — needs a pickup or truck.' },
];

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Step 2 of the parcel flow: size, contents and the other party, then request.
export default function ParcelDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const { direction = 'send' } = useLocalSearchParams<{ direction: 'send' | 'receive' }>();
  const sending = direction === 'send';
  const origin = useRideDraft((s) => s.origin);
  const dest = useRideDraft((s) => s.dest);
  const myPhone = useProfileStore((s) => s.phone);

  const [size, setSize] = useState('Medium');
  const [contents, setContents] = useState('');
  const [otherName, setOtherName] = useState('');
  const [otherPhone, setOtherPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const distance = km(origin, dest);
  const sizeMeta = SIZES.find((s) => s.key === size);
  const sizeFee = sizeMeta?.fee ?? 0;

  // Server-authoritative base fare (same pricing engine as rides, incl. surge);
  // small parcels price like Okada, bigger ones like a Standard car. The size
  // fee is added on top; the local formula is only a fallback if the call fails.
  const [quote, setQuote] = useState<Quote | null>(null);
  const quoteType = size === 'Small' ? 'OKADA' : 'STANDARD';
  useEffect(() => {
    let active = true;
    rideApi.quote({ originLat: origin.lat, originLng: origin.lng, destLat: dest.lat, destLng: dest.lng, rideType: quoteType })
      .then((q) => { if (active) setQuote(q); })
      .catch(() => { if (active) setQuote(null); });
    return () => { active = false; };
  }, [origin.lat, origin.lng, dest.lat, dest.lng, quoteType]);

  const fare = quote != null
    ? Math.max(5, Math.round(quote.fare + sizeFee))
    : Math.max(5, Math.round(5 + distance * 2 + sizeFee));

  // "Other party" = recipient when sending, sender when receiving.
  const partyLabel = sending ? 'Recipient' : 'Sender';

  async function findCourier() {
    if (!contents.trim()) {
      return Alert.alert(
        sending ? 'What are you sending?' : 'What are you receiving?',
        'Describe the parcel so the courier knows what to expect.');
    }
    if (!otherName.trim() || !otherPhone.trim()) {
      return Alert.alert(`${partyLabel} needed`, `Add the ${partyLabel.toLowerCase()}’s name and phone.`);
    }
    setLoading(true);
    try {
      const req = await rideApi.createRequest({
        originLat: origin.lat, originLng: origin.lng, destLat: dest.lat, destLng: dest.lng,
        proposedFare: fare, kind: 'PARCEL',
        parcelSize: size.toUpperCase() as 'SMALL' | 'MEDIUM' | 'LARGE',
        parcelDesc: contents.trim(),
        // The courier needs the other end of the handover: who they're meeting, on which
        // number, and which end we're standing at. Persisted, not just passed to the next
        // screen, so it survives a reload and reaches the courier's app.
        direction: sending ? 'SEND' : 'RECEIVE',
        partyName: otherName.trim(),
        partyPhone: otherPhone.trim(),
        riderPhone: myPhone || undefined,
      });
      router.push({ pathname: '/(parcel)/live', params: {
        requestId: req.id, direction, size, party: otherName.trim(), fare: String(fare),
      } } as any);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not request a courier');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Row style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, gap: 12, marginBottom: 8 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Parcel details</Text>
          <Text style={{ fontSize: 13, color: c.textMuted }}>
            {sending ? `${origin.label} → ${dest.label}` : `From ${origin.label} to you`}
          </Text>
        </View>
      </Row>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 120 }}>
        {/* Size */}
        <Text style={section(c)}>Parcel size</Text>
        <Row style={{ gap: 10 }}>
          {SIZES.map((s) => {
            const sel = size === s.key;
            return (
              <TouchableOpacity key={s.key} onPress={() => setSize(s.key)} activeOpacity={0.85}
                style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 14, borderRadius: 16, backgroundColor: sel ? c.primarySoft : c.surface, borderWidth: 1.5, borderColor: sel ? c.primary : c.border }}>
                <Ionicons name={s.icon} size={22} color={sel ? c.primary : c.textMuted} />
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: c.text, marginTop: 2 }}>{s.key}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>{s.fee > 0 ? `+ GH₵ ${s.fee}` : 'Free'}</Text>
              </TouchableOpacity>
            );
          })}
        </Row>
        {sizeMeta?.desc ? (
          <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 8, lineHeight: 18 }}>{sizeMeta.desc}</Text>
        ) : null}

        {/* Contents */}
        <Text style={[section(c), { marginTop: 22 }]}>{sending ? 'What are you sending?' : 'What are you receiving?'}</Text>
        <Input value={contents} onChangeText={setContents}
          placeholder={sending ? 'e.g. A4 documents in an envelope' : 'e.g. A phone in its box'}
          icon="reader-outline" c={c} />

        {/* Other party */}
        <Text style={[section(c), { marginTop: 12 }]}>{partyLabel}</Text>
        <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: -4, marginBottom: 8 }}>
          {sending
            ? 'Who should the courier hand the parcel to?'
            : 'Who is the courier collecting the parcel from?'}
        </Text>
        <Input value={otherName} onChangeText={setOtherName} placeholder={`${partyLabel} name`} icon="person-outline" c={c} />
        <Input value={otherPhone} onChangeText={setOtherPhone} placeholder={`${partyLabel} phone`} icon="call-outline" keyboardType="phone-pad" c={c} />

        {/* Fare */}
        <Row style={{ justifyContent: 'space-between', marginTop: 12, backgroundColor: c.surfaceAlt, borderRadius: 16, padding: 16 }}>
          <View>
            <Text style={{ fontSize: 13, color: c.textMuted, fontWeight: '600' }}>Estimated fare</Text>
            <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{distance.toFixed(1)} km · {size} parcel</Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>GH₵ {fare}</Text>
        </Row>
        {quote?.surge ? (
          <Row style={{ gap: 6, marginTop: 8, alignItems: 'center' }}>
            <Ionicons name="trending-up" size={14} color={c.warning} />
            <Text style={{ fontSize: 12.5, color: c.warning, fontWeight: '600' }}>Peak-time pricing is in effect</Text>
          </Row>
        ) : null}
        <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 8, lineHeight: 17 }}>
          Couriers can accept your fare or counter it — you choose who carries the parcel.
        </Text>
      </ScrollView>

      {/* Find a courier */}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 14 }}>
        <TouchableOpacity onPress={findCourier} disabled={loading} activeOpacity={0.9}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.primary, borderRadius: 999, paddingVertical: 16, paddingHorizontal: 24, opacity: loading ? 0.7 : 1, shadowColor: c.primary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{loading ? 'Requesting…' : 'Find a courier'}</Text>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>GH₵ {fare}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Input({ icon, c, ...props }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, marginBottom: 10 }}>
      <Ionicons name={icon} size={17} color={c.textMuted} />
      <TextInput {...props} placeholderTextColor={c.textMuted} style={{ flex: 1, paddingVertical: 13, color: c.text, fontSize: 15 }} />
    </View>
  );
}

const section = (c: any) => ({ fontSize: 13, fontWeight: '700' as const, color: c.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 8 });
