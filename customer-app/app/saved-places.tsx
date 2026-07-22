import { useState } from 'react';
import { Alert, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeProvider';
import { Screen, Card, Divider, Row } from '../src/components/ui';
import { useSavedPlaces, SavedPlace } from '../src/store/savedPlacesStore';

export default function SavedPlacesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const home = useSavedPlaces((s) => s.home);
  const work = useSavedPlaces((s) => s.work);
  const custom = useSavedPlaces((s) => s.custom);
  const removeHome = useSavedPlaces((s) => s.removeHome);
  const removeWork = useSavedPlaces((s) => s.removeWork);
  const removeCustom = useSavedPlaces((s) => s.removeCustom);
  const renameCustom = useSavedPlaces((s) => s.renameCustom);
  const [renaming, setRenaming] = useState<SavedPlace | null>(null);
  const [newName, setNewName] = useState('');

  function startRename(s: SavedPlace) { setRenaming(s); setNewName(s.place.label); }
  function saveRename() {
    if (renaming && newName.trim()) renameCustom(renaming.id, newName.trim());
    setRenaming(null); setNewName('');
  }

  function confirmRemove(label: string, onYes: () => void) {
    Alert.alert('Remove place', `Remove ${label} from your saved places?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onYes },
    ]);
  }

  return (
    <Screen scroll>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Saved places</Text>
      </View>

      {/* Shortcuts */}
      <Text style={sectionLabel(c)}>Shortcuts</Text>
      <Card>
        <Shortcut
          icon="home" label="Home" place={home} c={c}
          onSet={() => router.push('/map-picker?target=home' as any)}
          onRemove={() => confirmRemove('Home', removeHome)}
        />
        <Divider />
        <Shortcut
          icon="briefcase" label="Work" place={work} c={c}
          onSet={() => router.push('/map-picker?target=work' as any)}
          onRemove={() => confirmRemove('Work', removeWork)}
          last
        />
      </Card>

      {/* Custom places */}
      <Text style={sectionLabel(c)}>Other places</Text>
      <Card>
        {custom.length === 0 ? (
          <Text style={{ fontSize: 14, color: c.textMuted, paddingVertical: 6 }}>
            No other saved places yet. Add spots you visit often for one-tap booking.
          </Text>
        ) : (
          custom.map((s, i) => (
            <View key={s.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                <Ionicons name="bookmark" size={20} color={c.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }} numberOfLines={1}>{s.place.label}</Text>
                  <Text style={{ fontSize: 12.5, color: c.textMuted }} numberOfLines={1}>{s.place.sub}</Text>
                </View>
                <TouchableOpacity onPress={() => startRename(s)} hitSlop={8} style={{ marginRight: 14 }}>
                  <Ionicons name="pencil" size={18} color={c.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => confirmRemove(s.place.label, () => removeCustom(s.id))} hitSlop={8}>
                  <Ionicons name="trash-outline" size={19} color={c.danger} />
                </TouchableOpacity>
              </View>
              {i < custom.length - 1 ? <Divider /> : null}
            </View>
          ))
        )}
      </Card>

      <TouchableOpacity onPress={() => router.push('/map-picker?target=saved' as any)} activeOpacity={0.9}
        style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 15 }}>
        <Ionicons name="add" size={20} color={c.primary} />
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.primary }}>Add a place</Text>
      </TouchableOpacity>

      {/* Rename modal */}
      <Modal visible={renaming !== null} transparent animationType="slide" onRequestClose={() => setRenaming(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: insets.bottom + 20, gap: 14 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 19, fontWeight: '800', color: c.text }}>Rename place</Text>
              <TouchableOpacity onPress={() => setRenaming(null)} hitSlop={8}>
                <Ionicons name="close" size={24} color={c.textMuted} />
              </TouchableOpacity>
            </Row>
            <TextInput
              autoFocus value={newName} onChangeText={setNewName}
              placeholder="Place name" placeholderTextColor={c.textMuted}
              style={{ backgroundColor: c.surfaceAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: c.text }}
            />
            <TouchableOpacity onPress={saveRename} activeOpacity={0.9}
              style={{ backgroundColor: c.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function Shortcut({ icon, label, place, onSet, onRemove, last, c }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      <Ionicons name={icon} size={20} color={c.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>{label}</Text>
        <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 1 }} numberOfLines={1}>
          {place ? place.sub : 'Not set'}
        </Text>
      </View>
      {place ? (
        <>
          <TouchableOpacity onPress={onSet} hitSlop={8} style={{ marginRight: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.primary }}>Change</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onRemove} hitSlop={8}>
            <Ionicons name="trash-outline" size={19} color={c.danger} />
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity onPress={onSet} hitSlop={8}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.primary }}>Add</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const sectionLabel = (c: any) => ({
  fontSize: 13, fontWeight: '700' as const, color: c.textMuted,
  textTransform: 'uppercase' as const, letterSpacing: 0.6, marginTop: 18, marginBottom: 8,
});
