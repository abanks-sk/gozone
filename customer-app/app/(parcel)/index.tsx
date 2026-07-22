import { useState } from 'react';
import { Dimensions, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRideDraft } from '../../src/store/rideDraft';
import { useProfileStore, initial } from '../../src/store/profileStore';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Row } from '../../src/components/ui';

// Step 1 of the parcel flow: direction + route only. Size, contents and the
// other party live on the next page ((parcel)/details) so nothing is crammed.
export default function ParcelComposeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const origin = useRideDraft((s) => s.origin);
  const dest = useRideDraft((s) => s.dest);
  const swap = useRideDraft((s) => s.swap);
  const name = useProfileStore((s) => s.name);
  const screenW = Dimensions.get('window').width;
  const heroH = 168 + insets.top;

  const [direction, setDirection] = useState<'send' | 'receive'>('send');
  const sending = direction === 'send';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* ── Deep gradient hero (matches the ride screen) ── */}
        <View style={{ height: heroH, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: 'hidden' }}>
          <Svg width={screenW} height={heroH} style={{ position: 'absolute' }}>
            <Defs>
              <SvgGradient id="phero" x1="0" y1="0" x2="0.25" y2="1">
                <Stop offset="0" stopColor="#2A56C6" />
                <Stop offset="0.55" stopColor="#13234A" />
                <Stop offset="1" stopColor="#080C18" />
              </SvgGradient>
            </Defs>
            <Rect x="0" y="0" width={screenW} height={heroH} fill="url(#phero)" />
          </Svg>

          <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 22 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text style={{ color: 'rgba(255,255,255,0.62)', fontSize: 14 }}>GoZone Parcel</Text>
                <Text style={{ color: '#fff', fontSize: 25, fontWeight: '800', letterSpacing: -0.6, marginTop: 3 }}>
                  {sending ? 'Send a parcel' : 'Receive a parcel'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/profile' as any)} activeOpacity={0.8}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{initial(name)}</Text>
                </View>
              </TouchableOpacity>
            </Row>
          </View>
        </View>

        {/* ── Circular quick actions (same spot as ride/food) ── */}
        <Row style={{ paddingHorizontal: 24, marginTop: 20, gap: 8 }}>
          <Circle icon="car-sport" label="Ride" onPress={() => router.replace('/(rider)/home' as any)} c={c} />
          <Circle icon="storefront" label="Shop" onPress={() => router.replace('/(shop)/restaurants' as any)} c={c} />
          <Circle icon="cube" label="Parcel" active onPress={() => {}} c={c} />
        </Row>

        <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
          {/* Send / Receive segmented toggle */}
          <View style={{ flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: 999, padding: 4 }}>
            {(['send', 'receive'] as const).map((d) => {
              const sel = direction === d;
              return (
                <TouchableOpacity key={d} onPress={() => setDirection(d)} activeOpacity={0.85}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 999, backgroundColor: sel ? c.surface : 'transparent', borderWidth: sel ? 1 : 0, borderColor: c.border }}>
                  <Ionicons name={d === 'send' ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'} size={17} color={sel ? c.primary : c.textMuted} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: sel ? c.text : c.textMuted }}>{d === 'send' ? 'Send' : 'Receive'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 10, marginBottom: 22, lineHeight: 19 }}>
            {sending
              ? 'A courier picks the parcel up from you and delivers it to your recipient.'
              : 'A courier collects the parcel from the sender and brings it to you.'}
          </Text>

          {/* Route */}
          <Text style={section(c)}>Route</Text>
          <View style={{ position: 'relative' }}>
            <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 18, paddingHorizontal: 14 }}>
              <Field icon="ellipse" iconColor={c.primary}
                label={sending ? 'Pickup — your location' : 'Pickup — sender’s location'}
                value={origin.label} onPress={() => router.push('/search?field=origin' as any)} c={c} />
              <View style={{ height: 1, backgroundColor: c.border, marginLeft: 28 }} />
              <Field icon="location" iconColor={c.danger}
                label={sending ? 'Drop-off — recipient' : 'Drop-off — your location'}
                value={dest.label} onPress={() => router.push('/search?field=dest' as any)} c={c} />
            </View>
            <TouchableOpacity onPress={swap} activeOpacity={0.8} style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="swap-vertical" size={18} color={c.primary} />
              </View>
            </TouchableOpacity>
          </View>

          {/* How it works — fills the freed-up space with orientation, not inputs */}
          <Text style={[section(c), { marginTop: 24 }]}>How it works</Text>
          <View style={{ backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 16, gap: 14 }}>
            <Step n={1} text={sending ? 'Tell us the size and what’s inside.' : 'Tell us the size and what to collect.'} c={c} />
            <Step n={2} text="Nearby couriers offer to carry it — you pick one." c={c} />
            <Step n={3} text={sending ? 'Track it live until your recipient has it.' : 'Track it live until it reaches you.'} c={c} />
          </View>
        </View>
      </ScrollView>

      {/* Continue → details */}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 14 }}>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/(parcel)/details', params: { direction } } as any)}
          activeOpacity={0.9}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 16, shadowColor: c.primary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Circle({ icon, label, onPress, active, c }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
      <View style={{ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.primary : c.surface, borderWidth: 1, borderColor: active ? c.primary : c.border }}>
        <Ionicons name={icon} size={24} color={active ? '#fff' : c.text} />
      </View>
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.text }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Field({ icon, iconColor, label, value, onPress, c }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 }}>
      <Ionicons name={icon} size={12} color={iconColor} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: c.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, marginTop: 1 }}>{value}</Text>
      </View>
    </TouchableOpacity>
  );
}

function Step({ n, text, c }: any) {
  return (
    <Row style={{ gap: 12, alignItems: 'center' }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: c.primary }}>{n}</Text>
      </View>
      <Text style={{ flex: 1, fontSize: 13.5, color: c.text, lineHeight: 19 }}>{text}</Text>
    </Row>
  );
}

const section = (c: any) => ({ fontSize: 13, fontWeight: '700' as const, color: c.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 8 });
