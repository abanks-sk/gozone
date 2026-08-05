import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BrandScreen, BrandInput, PillButton } from '../src/components/brand';
import { brand } from '../src/theme/tokens';
import { apiBaseUrl, apiBaseOverride, setApiBase } from '../src/lib/host';

/**
 * Point the app at a backend.
 *
 * <p>Reachable from the welcome screen, which is the only place it can usefully live: without a
 * working backend you cannot sign in, so anything behind the login wall would be unreachable
 * exactly when it is needed.
 *
 * <p>This is what stops an installed build being welded to one server. In Expo Go the address is
 * derived from the Metro host and none of this is needed; in a standalone APK there is no dev
 * server, the fallback is `localhost` — which on a phone means the phone — and every request
 * fails. Setting it here, once, is the difference between an APK that works against a laptop
 * today and the same APK working against a hosted backend tomorrow.
 */
export default function ServerSettingsScreen() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => { setUrl(apiBaseOverride() ?? apiBaseUrl()); }, []);

  /** Prove the address before saving it — a typo here looks exactly like "the app is broken". */
  async function saveAndTest() {
    const clean = url.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(clean)) {
      return Alert.alert('Check the address', 'It should start with http:// or https://');
    }
    setChecking(true);
    try {
      await setApiBase(clean);
    } catch (e: any) {
      // Saving is best-effort: the address is already live for this session (setApiBase sets it
      // in memory before touching storage), it just will not survive a restart. This used to be
      // uncaught — the exception escaped, no alert appeared, the spinner stopped, and the screen
      // looked completely dead. Silence is the worst possible answer here.
      Alert.alert('Couldn’t save the address',
        `It will work until you close the app, but won’t be remembered.

${e?.message ?? e}`);
    }

    try {
      // /rides/ping answers 401 unauthenticated — a perfectly good sign of life: the gateway is
      // up and enforcing auth. A wrong address fails at the network layer instead.
      const res = await fetch(`${clean}/rides/ping`);
      Alert.alert('Connected', `Reached the server (HTTP ${res.status}).`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      // Show the real reason. "Nothing responded" told you nothing you could act on; the
      // underlying message distinguishes a blocked cleartext request from a wrong IP from a
      // firewall drop, and those have completely different fixes.
      Alert.alert('No answer from that address',
        `Tried: ${clean}/rides/ping

${e?.message ?? e}

Check the phone and computer are on the same network and that the address includes the port.`);
    } finally {
      setChecking(false);
    }
  }

  async function useDefault() {
    await setApiBase(null);
    setUrl(apiBaseUrl());
    Alert.alert('Reset', 'Back to the built-in default.');
  }

  return (
    <BrandScreen>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 26 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}
          style={{ position: 'absolute', top: 8, left: 20 }}>
          <Ionicons name="chevron-back" size={28} color={brand.text} />
        </TouchableOpacity>

        <Text style={{ fontSize: 26, fontWeight: '800', color: brand.text, marginBottom: 6 }}>Server address</Text>
        <Text style={{ fontSize: 14, color: brand.textMuted, marginBottom: 22, lineHeight: 20 }}>
          Where this app looks for GoZone. Use your computer's network address while the backend
          runs locally, or the hosted address once it's deployed.
        </Text>

        <BrandInput
          label="Backend URL"
          value={url}
          onChangeText={setUrl}
          placeholder="http://192.168.1.5:8080"
          autoCapitalize="none"
          keyboardType="url"
        />

        <View style={{ height: 18 }} />
        {checking
          ? <ActivityIndicator color={brand.text} />
          : <PillButton label="Save and test" onPress={saveAndTest} />}

        <TouchableOpacity onPress={useDefault} activeOpacity={0.7} style={{ marginTop: 16 }}>
          <Text style={{ color: brand.textMuted, fontSize: 13, textAlign: 'center' }}>
            Reset to default
          </Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 11.5, color: brand.textMuted, textAlign: 'center', marginTop: 22, lineHeight: 17 }}>
          Currently using{'\n'}
          <Text style={{ color: brand.text, fontWeight: '600' }}>{apiBaseOverride() ?? apiBaseUrl()}</Text>
        </Text>
      </View>
    </BrandScreen>
  );
}
