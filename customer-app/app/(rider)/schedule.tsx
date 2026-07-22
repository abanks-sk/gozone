import { useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useRideDraft } from '../../src/store/rideDraft';
import { Row } from '../../src/components/ui';

const MIN_LEAD_MS = 30 * 60 * 1000;            // 30 minutes ahead
const MAX_LEAD_MS = 90 * 24 * 60 * 60 * 1000;  // 90 days ahead

const midnight = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function tsFor(day: Date, minsOfDay: number) {
  const d = new Date(day);
  d.setHours(Math.floor(minsOfDay / 60), minsOfDay % 60, 0, 0);
  return d.getTime();
}

/** Parse manual 12-hour time entry → minutes-of-day, or null if invalid. */
function parseTime(hourStr: string, minStr: string, ampm: 'AM' | 'PM'): number | null {
  const h = Number(hourStr);
  const m = Number(minStr);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 1 || h > 12 || m < 0 || m > 59) return null;
  const h24 = ampm === 'PM' ? (h % 12) + 12 : h % 12;
  return h24 * 60 + m;
}

export default function ScheduleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const scheduledAt = useRideDraft((s) => s.scheduledAt);
  const setScheduledAt = useRideDraft((s) => s.setScheduledAt);

  const now = Date.now();
  const minTs = now + MIN_LEAD_MS;
  const maxTs = now + MAX_LEAD_MS;
  const minDay = useMemo(() => midnight(new Date(now)), []);
  const maxDay = useMemo(() => midnight(new Date(maxTs)), []);

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [hourStr, setHourStr] = useState('');
  const [minStr, setMinStr] = useState('');
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');

  const mins = parseTime(hourStr, minStr, ampm);
  const chosenTs = selectedDay != null && mins != null ? tsFor(selectedDay, mins) : null;

  const dateLabel = selectedDay
    ? selectedDay.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
    : 'Choose a date';

  function scheduleIt() {
    if (!selectedDay) return Alert.alert('Pick a date', 'Choose the day for your ride.');
    if (mins == null) return Alert.alert('Enter a time', 'Type a valid time, e.g. 8:30.');
    const ts = tsFor(selectedDay, mins);
    if (ts < minTs) return Alert.alert('Too soon', 'Scheduled rides must be at least 30 minutes ahead.');
    if (ts > maxTs) return Alert.alert('Too far out', 'You can schedule up to 90 days in advance.');
    setScheduledAt(ts);
    router.back();
  }

  function rideNow() { setScheduledAt(null); router.back(); }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Row style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, gap: 12, marginBottom: 6 }}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={c.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>Schedule a ride</Text>
      </Row>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: insets.bottom + 120 }}>
        <Text style={{ fontSize: 13.5, color: c.textMuted, lineHeight: 20, marginBottom: 16 }}>
          Book from <Text style={{ fontWeight: '700', color: c.text }}>30 minutes</Text> to{' '}
          <Text style={{ fontWeight: '700', color: c.text }}>90 days</Text> in advance.
        </Text>

        {/* Ride now */}
        <TouchableOpacity onPress={rideNow} activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, marginBottom: 20, backgroundColor: scheduledAt === null ? c.primarySoft : c.surface, borderWidth: 1.5, borderColor: scheduledAt === null ? c.primary : c.border }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="flash" size={20} color={scheduledAt === null ? c.primary : c.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15.5, fontWeight: '700', color: c.text }}>Ride now</Text>
            <Text style={{ fontSize: 12.5, color: c.textMuted, marginTop: 1 }}>A driver picks you up right away</Text>
          </View>
          <Ionicons name={scheduledAt === null ? 'radio-button-on' : 'radio-button-off'} size={22} color={scheduledAt === null ? c.primary : c.textMuted} />
        </TouchableOpacity>

        {/* Date — opens the pop-up calendar */}
        <Text style={label(c)}>Date</Text>
        <TouchableOpacity onPress={() => setCalOpen(true)} activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
          <Ionicons name="calendar-outline" size={20} color={c.primary} />
          <Text style={{ flex: 1, fontSize: 15.5, fontWeight: '600', color: selectedDay ? c.text : c.textMuted }}>{dateLabel}</Text>
          <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
        </TouchableOpacity>

        {/* Time — entered manually */}
        <Text style={[label(c), { marginTop: 20 }]}>Time</Text>
        <Row style={{ gap: 10, alignItems: 'center' }}>
          <TimeBox value={hourStr} onChangeText={(t) => setHourStr(t.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="8" c={c} />
          <Text style={{ fontSize: 24, fontWeight: '800', color: c.text }}>:</Text>
          <TimeBox value={minStr} onChangeText={(t) => setMinStr(t.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="30" c={c} />
          <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden', marginLeft: 4 }}>
            {(['AM', 'PM'] as const).map((p) => {
              const sel = ampm === p;
              return (
                <TouchableOpacity key={p} onPress={() => setAmpm(p)} activeOpacity={0.85}
                  style={{ paddingHorizontal: 16, paddingVertical: 13, backgroundColor: sel ? c.primary : 'transparent' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: sel ? '#fff' : c.textMuted }}>{p}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Row>
        <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 8 }}>Enter a time in your local timezone, e.g. 8:30.</Text>

        {/* Terms */}
        <Text style={[label(c), { marginTop: 22 }]}>Scheduling terms</Text>
        <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 16, gap: 10 }}>
          <Term c={c} text="We line up a driver near your pickup time — a scheduled ride confirms a driver shortly before, not instantly." />
          <Term c={c} text="Fares follow pricing at the time of the trip and may include peak-time pricing." />
          <Term c={c} text="Free cancellation until a driver is assigned; a fee may apply after that." />
          <Term c={c} text="Be ready 5 minutes before your slot — drivers wait a limited time." />
        </View>
      </ScrollView>

      {/* Confirm */}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 14 }}>
        {chosenTs != null && (
          <Text style={{ fontSize: 12.5, color: c.textMuted, textAlign: 'center', marginBottom: 8 }}>
            {new Date(chosenTs).toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </Text>
        )}
        <TouchableOpacity onPress={scheduleIt} disabled={chosenTs == null} activeOpacity={0.9}
          style={{ backgroundColor: chosenTs == null ? c.surfaceAlt : c.primary, borderRadius: 999, paddingVertical: 16, alignItems: 'center' }}>
          <Text style={{ color: chosenTs == null ? c.textMuted : '#fff', fontWeight: '800', fontSize: 16 }}>Schedule ride</Text>
        </TouchableOpacity>
      </View>

      <CalendarModal
        visible={calOpen}
        min={minDay}
        max={maxDay}
        selected={selectedDay}
        onSelect={(d) => { setSelectedDay(d); setCalOpen(false); }}
        onClose={() => setCalOpen(false)}
        c={c}
      />
    </View>
  );
}

/** Dependency-free month-grid calendar in a modal. Days outside [min, max] are disabled. */
function CalendarModal({ visible, min, max, selected, onSelect, onClose, c }: {
  visible: boolean; min: Date; max: Date; selected: Date | null;
  onSelect: (d: Date) => void; onClose: () => void; c: any;
}) {
  const [view, setView] = useState(() => new Date(min.getFullYear(), min.getMonth(), 1));

  const monthStart = new Date(view.getFullYear(), view.getMonth(), 1);
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const leading = monthStart.getDay(); // 0=Sun
  const cells: (Date | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i + 1)),
  ];

  const canPrev = new Date(view.getFullYear(), view.getMonth(), 1) > new Date(min.getFullYear(), min.getMonth(), 1);
  const canNext = new Date(view.getFullYear(), view.getMonth(), 1) < new Date(max.getFullYear(), max.getMonth(), 1);
  const step = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}
          style={{ backgroundColor: c.surface, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: c.border }}>
          {/* Month header */}
          <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <TouchableOpacity onPress={() => canPrev && step(-1)} disabled={!canPrev} activeOpacity={0.7}
              style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceAlt, opacity: canPrev ? 1 : 0.35 }}>
              <Ionicons name="chevron-back" size={20} color={c.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '800', color: c.text }}>
              {view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity onPress={() => canNext && step(1)} disabled={!canNext} activeOpacity={0.7}
              style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceAlt, opacity: canNext ? 1 : 0.35 }}>
              <Ionicons name="chevron-forward" size={20} color={c.text} />
            </TouchableOpacity>
          </Row>

          {/* Weekday header */}
          <Row style={{ marginBottom: 6 }}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: c.textMuted }}>{d}</Text>
            ))}
          </Row>

          {/* Day grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
              const dd = midnight(d);
              const disabled = dd < min || dd > max;
              const sel = selected != null && sameDay(dd, selected);
              return (
                <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 3 }}>
                  <TouchableOpacity onPress={() => !disabled && onSelect(dd)} disabled={disabled} activeOpacity={0.8}
                    style={{ flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? c.primary : 'transparent' }}>
                    <Text style={{ fontSize: 15, fontWeight: sel ? '800' : '600', color: disabled ? c.textMuted : sel ? '#fff' : c.text, opacity: disabled ? 0.3 : 1 }}>
                      {d.getDate()}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function TimeBox({ value, onChangeText, placeholder, c }: { value: string; onChangeText: (t: string) => void; placeholder: string; c: any }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.textMuted}
      keyboardType="number-pad"
      maxLength={2}
      style={{ width: 62, textAlign: 'center', fontSize: 22, fontWeight: '800', color: c.text, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingVertical: 12 }}
    />
  );
}

function Term({ text, c }: { text: string; c: any }) {
  return (
    <Row style={{ gap: 10, alignItems: 'flex-start' }}>
      <Ionicons name="checkmark-circle" size={16} color={c.primary} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 13, color: c.textMuted, lineHeight: 19 }}>{text}</Text>
    </Row>
  );
}

const label = (c: any) => ({
  fontSize: 13, fontWeight: '700' as const, color: c.textMuted,
  textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 10,
});
