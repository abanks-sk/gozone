import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { foodApi, Promo } from '../src/api/food';
import { useVendorStore } from '../src/store/vendorStore';
import { useTheme } from '../src/theme/ThemeProvider';
import { Row, Badge } from '../src/components/ui';

// Self-serve promotion: the vendor applies with a short pitch; the promo is
// created inactive and goes live on the customer app once an admin approves it.
export default function PromoteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const vendor = useVendorStore((s) => s.vendor);

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState<Promo[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    if (!vendor) return;
    try { setMine(await foodApi.myPromos(vendor.id)); } catch {}
    finally { setLoaded(true); }
  }
  useEffect(() => { load(); }, [vendor?.id]);

  async function submit() {
    if (!vendor) return Alert.alert('No business selected', 'Pick a business on the Orders tab first.');
    if (!title.trim()) return Alert.alert('Give it a title', 'e.g. "20% off this weekend".');
    setSubmitting(true);
    try {
      await foodApi.applyPromo(vendor.id, title.trim(), subtitle.trim() || undefined);
      setTitle(''); setSubtitle('');
      await load();
      Alert.alert('Application sent', 'The GoZone team will review your promotion. Once approved it appears on the customer app.');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not submit');
    } finally { setSubmitting(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Row style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, gap: 12, marginBottom: 8 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Promote my business</Text>
          <Text style={{ fontSize: 13, color: c.textMuted }}>{vendor?.name ?? 'No business selected'}</Text>
        </View>
      </Row>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
            New promotion
          </Text>
          <Text style={{ fontSize: 13, color: c.textMuted, marginBottom: 12, lineHeight: 19 }}>
            Your promotion appears on the customer app's home carousel once the GoZone team approves it.
          </Text>
          <Input value={title} onChangeText={setTitle} placeholder='Title — e.g. "20% off this weekend"' icon="megaphone-outline" c={c} />
          <Input value={subtitle} onChangeText={setSubtitle} placeholder={`Subtitle (optional) — defaults to "${vendor?.name ?? 'your business'}"`} icon="text-outline" c={c} />
          <TouchableOpacity onPress={submit} disabled={submitting} activeOpacity={0.9}
            style={{ marginTop: 4, backgroundColor: c.primary, borderRadius: 999, paddingVertical: 14, alignItems: 'center', opacity: submitting ? 0.6 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{submitting ? 'Submitting…' : 'Apply to promote'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 10 }}>
          Your applications
        </Text>
        {!loaded ? null : mine.length === 0 ? (
          <Text style={{ fontSize: 14, color: c.textMuted }}>No applications yet.</Text>
        ) : (
          mine.map((p) => (
            <View key={p.id} style={{ backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14, marginBottom: 10 }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }} numberOfLines={1}>{p.title}</Text>
                  {p.subtitle ? <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 2 }} numberOfLines={1}>{p.subtitle}</Text> : null}
                </View>
                <Badge label={p.active ? 'Live' : 'Pending review'} color={p.active ? c.success : c.warning} />
              </Row>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function Input({ icon, c, ...props }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, marginBottom: 10 }}>
      <Ionicons name={icon} size={17} color={c.textMuted} />
      <TextInput {...props} placeholderTextColor={c.textMuted} style={{ flex: 1, paddingVertical: 13, color: c.text, fontSize: 14.5 }} />
    </View>
  );
}
