import { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { useProfileStore, initial } from '../src/store/profileStore';
import { Avatar, Btn, Row } from '../src/components/ui';

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const profile = useProfileStore();
  const setProfile = useProfileStore((s) => s.setProfile);

  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [phone, setPhone] = useState(profile.phone);
  // Email is set by the verified add-email flow, so read it live from the store.
  const email = profile.email;

  function save() {
    setProfile({ name: name.trim(), username: username.trim(), phone: phone.trim() });
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
        <Row style={{ gap: 12, marginBottom: 18 }}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color={c.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Your account</Text>
        </Row>

        <View style={{ alignItems: 'center', marginBottom: 22 }}>
          <Avatar label={initial(name)} size={84} />
          <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 10 }}>Driver · GoZone</Text>
        </View>

        <Text style={section(c)}>Full name</Text>
        <Field value={name} onChangeText={setName} placeholder="Your name" icon="person-outline" c={c} />

        <Text style={section(c)}>Username</Text>
        <Field value={username} onChangeText={setUsername} placeholder="username" icon="at-outline" autoCapitalize="none" c={c} />

        {/* Email is a login credential, so it's verified — not free text. */}
        <Text style={section(c)}>Email</Text>
        <TouchableOpacity onPress={() => router.push('/add-email' as any)} activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 14 }}>
          <Ionicons name="mail-outline" size={17} color={c.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, color: email ? c.text : c.textMuted }}>
              {email || 'Add an email to sign in with'}
            </Text>
            {!!email && (
              <Row style={{ gap: 4, marginTop: 2 }}>
                <Ionicons name="checkmark-circle" size={12} color={c.success} />
                <Text style={{ fontSize: 12, color: c.success, fontWeight: '600' }}>Verified</Text>
              </Row>
            )}
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>{email ? 'Change' : 'Add'}</Text>
        </TouchableOpacity>

        <Text style={section(c)}>Phone number</Text>
        <Field value={phone} onChangeText={setPhone} placeholder="+233 …" icon="call-outline" keyboardType="phone-pad" c={c} />

        <View style={{ height: 24 }} />
        <Btn label="Save changes" onPress={save} />
      </ScrollView>
    </View>
  );
}

function Field({ icon, c, ...props }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, marginBottom: 14 }}>
      <Ionicons name={icon} size={17} color={c.textMuted} />
      <TextInput {...props} placeholderTextColor={c.textMuted} style={{ flex: 1, paddingVertical: 14, color: c.text, fontSize: 15 }} />
    </View>
  );
}

const section = (c: any) => ({ fontSize: 13, fontWeight: '700' as const, color: c.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 8 });
