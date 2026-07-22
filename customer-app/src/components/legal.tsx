import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { Row } from './ui';

export interface LegalSection { heading: string; body: string }

// Shared layout for the Terms and Privacy screens — header + intro + numbered sections.
export function LegalScreen({ title, updated, intro, sections }: {
  title: string; updated: string; intro: string; sections: LegalSection[];
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 28 }}>
        <Row style={{ gap: 12, marginBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color={c.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>{title}</Text>
        </Row>

        <Text style={{ fontSize: 12.5, color: c.textMuted, marginBottom: 14 }}>Last updated {updated}</Text>
        <Text style={{ fontSize: 14.5, color: c.textMuted, lineHeight: 22, marginBottom: 8 }}>{intro}</Text>

        {sections.map((s, i) => (
          <View key={i} style={{ marginTop: 18 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: c.text, marginBottom: 6 }}>{i + 1}. {s.heading}</Text>
            <Text style={{ fontSize: 14, color: c.textMuted, lineHeight: 22 }}>{s.body}</Text>
          </View>
        ))}

        <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 26, lineHeight: 18 }}>
          Questions? Contact us at legal@gozone.app. This is demo content for GoZone Inc.
        </Text>
      </ScrollView>
    </View>
  );
}
