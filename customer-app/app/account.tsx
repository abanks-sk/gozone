import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { useProfileStore, initial } from '../src/store/profileStore';
import { useAuthStore } from '../src/store/authStore';
import { Avatar, Btn, Row } from '../src/components/ui';

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const profile = useProfileStore();
  const setFromServer = useProfileStore((s) => s.setFromServer);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [saving, setSaving] = useState(false);
  // Phone and email are login credentials — read live from the cached server profile,
  // since they only change through their own verify-by-code flows.
  const { email, phone } = profile;

  // Set as soon as either text field is touched, so a server refresh landing mid-edit
  // can't wipe what's being typed.
  const edited = useRef(false);

  // Refresh from the server whenever this screen comes into focus (also catches a
  // phone/email that was just verified on the screens below).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchMe().then((me) => {
        if (cancelled || !(me.name || me.phone || me.email)) return;
        setFromServer(me);
      });
      return () => { cancelled = true; };
    }, [fetchMe, setFromServer])
  );

  // Follow the refreshed cache into the editable fields, but never over an edit in progress.
  useEffect(() => { if (!edited.current) setName(profile.name); }, [profile.name]);
  useEffect(() => { if (!edited.current) setUsername(profile.username); }, [profile.username]);

  const dirty = name.trim() !== profile.name || username.trim() !== profile.username;

  async function save() {
    const nextName = name.trim();
    const nextUsername = username.trim();
    if (!nextName) return Alert.alert('Name required', 'Your name can’t be empty.');
    setSaving(true);
    try {
      // Send only what changed, so an untouched field is never revalidated.
      const me = await updateProfile({
        ...(nextName !== profile.name ? { name: nextName } : {}),
        ...(nextUsername !== profile.username ? { username: nextUsername } : {}),
      });
      edited.current = false;
      setFromServer(me);
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e?.response?.data?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>

        {/* Header */}
        <Row style={{ gap: 12, marginBottom: 18 }}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color={c.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Your account</Text>
        </Row>

        {/* Avatar */}
        <View style={{ alignItems: 'center', marginBottom: 22 }}>
          <Avatar label={initial(name)} size={84} />
          <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 10 }}>Passenger · GoZone</Text>
        </View>

        <Text style={section(c)}>Full name</Text>
        <Field value={name} onChangeText={(t: string) => { edited.current = true; setName(t); }}
          placeholder="Your name" icon="person-outline" c={c} />

        <Text style={section(c)}>Username</Text>
        <Field value={username} onChangeText={(t: string) => { edited.current = true; setUsername(t); }}
          placeholder="username" icon="at-outline" autoCapitalize="none" c={c} />

        {/* Email is a login credential, so it's verified — not free text. */}
        <Text style={section(c)}>Email</Text>
        <CredentialRow
          icon="mail-outline"
          value={email}
          placeholder="Add an email to sign in with"
          action={email ? 'Change' : 'Add'}
          onPress={() => router.push('/add-email' as any)}
          c={c}
        />

        {/* Same for the phone number — changing it means verifying the new one by SMS. */}
        <Text style={section(c)}>Phone number</Text>
        <CredentialRow
          icon="call-outline"
          value={phone}
          placeholder="Add a phone number"
          action={phone ? 'Change' : 'Add'}
          onPress={() => router.push('/add-phone' as any)}
          c={c}
        />

        <View style={{ height: 24 }} />
        <Btn label={saving ? 'Saving…' : 'Save changes'} onPress={save} loading={saving} disabled={!dirty || saving} />
      </ScrollView>
    </View>
  );
}

/** A verified login credential: shown, not typed — edited through its own code flow. */
function CredentialRow({ icon, value, placeholder, action, onPress, c }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 14 }}>
      <Ionicons name={icon} size={17} color={c.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: value ? c.text : c.textMuted }}>{value || placeholder}</Text>
        {!!value && (
          <Row style={{ gap: 4, marginTop: 2 }}>
            <Ionicons name="checkmark-circle" size={12} color={c.success} />
            <Text style={{ fontSize: 12, color: c.success, fontWeight: '600' }}>Verified</Text>
          </Row>
        )}
      </View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: c.primary }}>{action}</Text>
    </TouchableOpacity>
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
