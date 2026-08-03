import { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { roleHome, goBack } from '../../src/lib/routes';
import { normalizeGhPhone } from '../../src/lib/phone';
import { BrandScreen, GlowOrb, BrandInput, PillButton } from '../../src/components/brand';
import { brand } from '../../src/theme/tokens';

type Channel = 'phone' | 'email';

export default function AuthEntryScreen() {
  const router = useRouter();
  const { mode, ch } = useLocalSearchParams<{ mode?: string; ch?: string }>();
  const isSignup = mode !== 'login';
  const { register, login, loginEmailPassword } = useAuthStore();
  // Sign-up is phone-only (an email is added later in Settings); login supports both.
  const [channel, setChannel] = useState<Channel>(!isSignup && ch === 'email' ? 'email' : 'phone');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [vehicle, setVehicle] = useState<'okada' | 'car' | 'truck'>('car');
  // The vehicle itself. It used to be typed in later on the Vehicle screen and kept only on the
  // phone, so the description a passenger saw on a bid had never been checked by anybody and the
  // admin grading the car Standard or Luxe did not know what the car was.
  const [vMake, setVMake] = useState('');
  const [vModel, setVModel] = useState('');
  const [vColour, setVColour] = useState('');
  const [vPlate, setVPlate] = useState('');
  const [loading, setLoading] = useState(false);

  const isEmail = !isSignup && channel === 'email';
  const noun = isEmail ? 'email' : 'number';
  // Okada/Truck classes are set now; a car is left null so an admin assigns Standard/Luxe.
  const vehicleClass = vehicle === 'okada' ? 'OKADA' : vehicle === 'truck' ? 'CARGO' : undefined;

  async function handleSubmit() {
    // Login with email = email + password → straight in, no OTP.
    if (isEmail) {
      const e = email.trim().toLowerCase();
      if (!e) return Alert.alert('Enter your email');
      if (!password) return Alert.alert('Enter your password');
      setLoading(true);
      try {
        await loginEmailPassword(e, password);
        // Same landing logic as the OTP flow (drivers finish onboarding/approval first).
        router.replace(roleHome(useAuthStore.getState().role) as any);
      } catch (err: any) {
        const status = err?.response?.status;
        Alert.alert(
          status === 403 || status === 401 ? 'Incorrect details' : 'Could not sign in',
          status === 403 || status === 401
            ? 'That email and password don’t match an account.'
            : err?.response?.data?.message ?? 'Please try again.');
      } finally { setLoading(false); }
      return;
    }

    let id = phone.trim();
    if (isSignup && !name.trim()) return Alert.alert('Enter your name');
    if (isSignup && username.trim().length < 3) return Alert.alert('Choose a username', 'Your username must be at least 3 characters.');
    // Same rule the server enforces, so a bad character is caught before the round-trip.
    // The plate is what ties a driver to a vehicle on the road, so it is the one detail that has
    // to be there. Make and model help an admin grade the class; colour helps a passenger find it.
    if (isSignup && !vPlate.trim()) return Alert.alert('Add your number plate', 'We need the registration of the vehicle you’ll be driving.');
    if (isSignup && !vMake.trim()) return Alert.alert('Add your vehicle', 'Tell us the make — an admin needs it to grade your vehicle.');
    if (isSignup && !/^[a-z0-9._]{3,30}$/.test(username.trim().toLowerCase()))
      return Alert.alert('Choose a username', 'Use only letters, numbers, dots and underscores.');
    if (!id) return Alert.alert('Enter a phone number');
    // Ghanaian mobile numbers only — validate + canonicalise to +233… before sending.
    const gh = normalizeGhPhone(id);
    if (!gh) return Alert.alert('Invalid number', 'Please enter a valid Ghanaian mobile number, e.g. 024 123 4567.');
    id = gh;
    setLoading(true);
    try {
      if (isSignup) await register(id, 'DRIVER', name.trim(), vehicleClass, username.trim().toLowerCase(), {
        vehicleMake: vMake.trim(), vehicleModel: vModel.trim(),
        vehicleColour: vColour.trim(), vehiclePlate: vPlate.trim(),
      });
      else await login(id);
      router.push({
        pathname: '/auth/verify-otp',
        params: { channel: 'phone', phone: id, email: '', name: isSignup ? name.trim() : '' },
      });
    } catch (e: any) {
      if (!isSignup && e?.response?.status === 404) {
        Alert.alert('No account found', `That ${noun} isn’t registered yet. Create an account to get started.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign up', onPress: () => router.replace(`/auth/register?mode=signup&ch=${channel}` as any) },
        ]);
        return;
      }
      if (isSignup && e?.response?.status === 409) {
        Alert.alert('Account already exists', `That ${noun} already has an account. Log in instead.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log in', onPress: () => router.replace(`/auth/register?mode=login&ch=${channel}` as any) },
        ]);
        return;
      }
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not send the code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <BrandScreen>
      <GlowOrb size={280} style={{ position: 'absolute', top: -80, right: -100 }} />
      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <TouchableOpacity onPress={() => goBack(router, '/welcome')} style={{ marginTop: 4, width: 40 }}>
          <Ionicons name="chevron-back" size={26} color={brand.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: brand.text, letterSpacing: -0.5, marginBottom: 8 }}>
            {isSignup ? 'Become a driver' : 'Welcome back'}
          </Text>
          <Text style={{ fontSize: 14, color: brand.textMuted, marginBottom: 22, lineHeight: 20 }}>
            {isSignup
              ? 'Start with your name, username and number. You’ll finish setup and get approved before driving.'
              : isEmail
                ? 'Sign in with the email and password you added in Settings.'
                : 'Enter your number and we’ll send you a 6-digit code.'}
          </Text>

          {/* Login can use phone or email; sign-up is phone-only (add an email later in Settings). */}
          {!isSignup && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
              <ChannelTab label="Phone" icon="call" active={!isEmail} onPress={() => setChannel('phone')} />
              <ChannelTab label="Email" icon="mail" active={isEmail} onPress={() => setChannel('email')} />
            </View>
          )}

          {isSignup && (
            <>
              <BrandInput label="Full name" placeholder="Kwame Mensah" value={name} onChangeText={setName} autoCapitalize="words" />
              <BrandInput label="Username" placeholder="kwamem" value={username} onChangeText={setUsername} autoCapitalize="none" />
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: brand.textMuted, marginBottom: 8, marginTop: 2 }}>YOUR VEHICLE</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <VehicleTab label="Okada" icon="bicycle" active={vehicle === 'okada'} onPress={() => setVehicle('okada')} />
                <VehicleTab label="Car" icon="car-sport" active={vehicle === 'car'} onPress={() => setVehicle('car')} />
                <VehicleTab label="Truck" icon="cube" active={vehicle === 'truck'} onPress={() => setVehicle('truck')} />
              </View>
              <Text style={{ fontSize: 11.5, color: brand.textMuted, marginBottom: 14, lineHeight: 16 }}>
                {vehicle === 'okada' ? 'Okada: okada rides, food & small parcels.'
                  : vehicle === 'truck' ? 'Truck/Pickup: large parcel deliveries.'
                  : 'Car: rides + medium parcels. An admin sets Standard/Luxe after reviewing your vehicle.'}
              </Text>
              <BrandInput label="Number plate" placeholder="GR 1234-24" value={vPlate}
                onChangeText={setVPlate} autoCapitalize="characters" />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <BrandInput label="Make" placeholder={vehicle === 'okada' ? 'Haojue' : 'Toyota'}
                    value={vMake} onChangeText={setVMake} autoCapitalize="words" />
                </View>
                <View style={{ flex: 1 }}>
                  <BrandInput label="Model" placeholder={vehicle === 'okada' ? 'DK150' : 'Vitz'}
                    value={vModel} onChangeText={setVModel} autoCapitalize="words" />
                </View>
              </View>
              <BrandInput label="Colour" placeholder="Silver" value={vColour}
                onChangeText={setVColour} autoCapitalize="words" />
            </>
          )}

          {isEmail ? (
            <>
              <BrandInput
                label="Email address"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
              <BrandInput
                label="Password"
                placeholder="Your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </>
          ) : (
            <BrandInput
              label="Phone number"
              placeholder="+233 50 123 4567"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
          )}

          <PillButton
            label={isSignup ? 'Create account' : isEmail ? 'Sign in' : 'Send code'}
            onPress={handleSubmit} loading={loading} style={{ marginTop: 6 }} />

          <TouchableOpacity onPress={() => router.replace(`/auth/register?mode=${isSignup ? 'login' : 'signup'}&ch=${channel}` as any)} style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 13, color: brand.textMuted, textAlign: 'center' }}>
              {isSignup ? 'Already have an account? Log in' : 'New here? Create an account'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </BrandScreen>
  );
}

function ChannelTab({ label, icon, active, onPress }: { label: string; icon: any; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={{
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
        paddingVertical: 11, borderRadius: 999,
        backgroundColor: active ? '#2563EB' : 'transparent',
        borderWidth: 1, borderColor: active ? '#2563EB' : 'rgba(255,255,255,0.16)',
      }}>
      <Ionicons name={icon} size={16} color={active ? '#fff' : brand.textMuted} />
      <Text style={{ fontSize: 13.5, fontWeight: '700', color: active ? '#fff' : brand.textMuted }}>{label}</Text>
    </TouchableOpacity>
  );
}

function VehicleTab({ label, icon, active, onPress }: { label: string; icon: any; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={{
        flex: 1, alignItems: 'center', gap: 5, paddingVertical: 12, borderRadius: 16,
        backgroundColor: active ? 'rgba(37,99,235,0.18)' : 'transparent',
        borderWidth: 1.5, borderColor: active ? '#2563EB' : 'rgba(255,255,255,0.16)',
      }}>
      <Ionicons name={icon} size={22} color={active ? '#fff' : brand.textMuted} />
      <Text style={{ fontSize: 12.5, fontWeight: '700', color: active ? '#fff' : brand.textMuted }}>{label}</Text>
    </TouchableOpacity>
  );
}
