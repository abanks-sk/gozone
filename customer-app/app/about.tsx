import { Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useTheme } from '../src/theme/ThemeProvider';
import { BrandOrb } from '../src/components/brand';
import { Card, Divider, Row } from '../src/components/ui';

export default function AboutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>

        {/* Header */}
        <Row style={{ gap: 12, marginBottom: 18 }}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color={c.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>About</Text>
        </Row>

        {/* Brand */}
        <View style={{ alignItems: 'center', marginVertical: 18 }}>
          <BrandOrb size={88} />
          <Text style={{ fontSize: 26, fontWeight: '800', color: c.text, marginTop: 16 }}>GoZone</Text>
          <Text style={{ fontSize: 13.5, color: c.textMuted, marginTop: 4 }}>Version {version}</Text>
        </View>

        <Text style={{ fontSize: 14.5, color: c.textMuted, lineHeight: 21, textAlign: 'center', marginBottom: 22 }}>
          Ghana’s super-app for rides, food and parcels — one place to move, eat and send.
        </Text>

        <Card>
          <LinkRow icon="globe-outline" label="Website" onPress={() => Linking.openURL('https://gozone.app')} c={c} />
          <Divider />
          <LinkRow icon="mail-outline" label="Contact us" hint="help@gozone.app" onPress={() => Linking.openURL('mailto:help@gozone.app')} c={c} />
          <Divider />
          <LinkRow icon="document-text-outline" label="Terms of Service" onPress={() => router.push('/terms' as any)} c={c} />
          <Divider />
          <LinkRow icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => router.push('/privacy' as any)} c={c} last />
        </Card>

        <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 24 }}>
          © {new Date().getFullYear()} GoZone. All rights reserved.
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
