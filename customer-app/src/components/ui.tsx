import React, { useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  ScrollView,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';

// Static fallback palette for any screen not yet migrated to useTheme().
// Keeps the old shape so legacy `Colors.x` references still compile.
export const Colors = {
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  accent: '#0EA5E9',
  danger: '#DC2626',
  bg: '#F5F7FB',
  card: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E3E9F2',
};

// ── Screen ───────────────────────────────────────────────────────────────────
// Themed page wrapper with safe-area padding. Optionally scrollable.

export function Screen({
  children,
  scroll = false,
  padded = true,
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = padded ? { paddingHorizontal: 16 } : null;

  if (scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: c.bg }, style]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
            pad,
            contentStyle,
          ]}
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[{ flex: 1, backgroundColor: c.bg }, style]}>
      <View
        style={[
          { flex: 1, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
          pad,
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

// ── AppHeader ─────────────────────────────────────────────────────────────────

export function AppHeader({
  title,
  subtitle,
  right,
  showToggle = true,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  showToggle?: boolean;
}) {
  const { colors: c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 18,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 27, fontWeight: '800', color: c.text, letterSpacing: -0.6 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 2 }}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {right}
        {showToggle ? <ThemeToggle /> : null}
      </View>
    </View>
  );
}

// ── ThemeToggle ───────────────────────────────────────────────────────────────

export function ThemeToggle() {
  const { scheme, toggle, colors: c } = useTheme();
  return (
    <TouchableOpacity
      onPress={toggle}
      activeOpacity={0.8}
      style={{
        width: 40,
        height: 40,
        borderRadius: 999,
        backgroundColor: c.surfaceAlt,
        borderWidth: 1,
        borderColor: c.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 17 }}>{scheme === 'dark' ? '☀️' : '🌙'}</Text>
    </TouchableOpacity>
  );
}

// ── Button ────────────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'outline' | 'danger' | 'ghost' | 'soft';

export function Btn({
  label,
  onPress,
  loading = false,
  variant = 'primary',
  disabled = false,
  size = 'md',
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  variant?: BtnVariant;
  disabled?: boolean;
  size?: 'md' | 'sm';
  style?: ViewStyle;
}) {
  const { colors: c } = useTheme();
  const isDisabled = disabled || loading;

  let bg = 'transparent';
  let borderColor = 'transparent';
  let borderWidth = 0;
  let txt = c.onPrimary;

  switch (variant) {
    case 'primary': bg = c.primary; txt = c.onPrimary; break;
    case 'danger':  bg = c.danger;  txt = '#FFFFFF'; break;
    case 'soft':    bg = c.primarySoft; txt = c.primary; break;
    case 'outline': bg = 'transparent'; txt = c.text; borderColor = c.border; borderWidth = 1.5; break;
    case 'ghost':   bg = 'transparent'; txt = c.primary; break;
  }

  const shadow =
    variant === 'primary'
      ? { shadowColor: c.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 }
      : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      style={[
        {
          borderRadius: 999,
          paddingVertical: size === 'sm' ? 10 : 15,
          paddingHorizontal: size === 'sm' ? 16 : 20,
          minHeight: size === 'sm' ? 38 : 52,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          backgroundColor: bg,
          borderColor,
          borderWidth,
        },
        shadow,
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={txt} />
      ) : (
        <Text style={{ color: txt, fontSize: size === 'sm' ? 14 : 16, fontWeight: '700', letterSpacing: 0.2 }}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────

export function Input(props: TextInputProps & { label?: string }) {
  const { label, style, onFocus, onBlur, ...rest } = props;
  const { colors: c, radius } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ marginBottom: 14 }}>
      {label ? (
        <Text
          style={{
            fontSize: 12, fontWeight: '600', color: c.textMuted,
            marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
          }}
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        {...rest}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        placeholderTextColor={c.textMuted}
        style={[
          {
            borderWidth: 1.5,
            borderColor: focused ? c.primary : c.border,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            paddingVertical: 13,
            fontSize: 15,
            color: c.text,
            backgroundColor: c.surface,
          },
          style as any,
        ]}
      />
    </View>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { colors: c } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: 22,
          padding: 16,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: c.border,
          shadowColor: c.shadow,
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

// ── Badge ─────────────────────────────────────────────────────────────────────

export function Badge({ label, color }: { label: string; color?: string }) {
  const { colors: c, radius } = useTheme();
  const col = color || c.primary;
  return (
    <View
      style={{
        backgroundColor: col + '22',
        borderColor: col + '55',
        borderWidth: 1,
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: col, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ marginBottom: 20 }}>
      <Text
        style={{
          fontSize: 12, fontWeight: '700', color: c.textMuted,
          textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

// ── Empty ─────────────────────────────────────────────────────────────────────

export function Empty({ message }: { message: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
      <Text style={{ color: c.textMuted, fontSize: 15 }}>{message}</Text>
    </View>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

export function Divider() {
  const { colors: c } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.border, marginVertical: 12 }} />;
}

// ── Avatar ────────────────────────────────────────────────────────────────────

export function Avatar({ label, onPress, size = 40 }: { label: string; onPress?: () => void; size?: number }) {
  const { colors: c } = useTheme();
  const body = (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.primary, fontWeight: '700', fontSize: size * 0.4 }}>{label}</Text>
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.8}>{body}</TouchableOpacity> : body;
}

// ── SearchBar ─────────────────────────────────────────────────────────────────

export function SearchBar({
  placeholder, onPress, trailingLabel, onTrailingPress, elevated = false,
}: { placeholder: string; onPress?: () => void; trailingLabel?: string; onTrailingPress?: () => void; elevated?: boolean }) {
  const { colors: c } = useTheme();
  const Pill: any = onTrailingPress ? TouchableOpacity : View;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      focusable={false}
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 16 },
        elevated
          ? { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, shadowColor: c.shadow, shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 }
          : { backgroundColor: c.surfaceAlt },
      ]}
    >
      <Ionicons name="search" size={20} color={c.primary} />
      <Text style={{ flex: 1, color: c.textMuted, fontSize: 16 }}>{placeholder}</Text>
      {trailingLabel ? (
        <Pill onPress={onTrailingPress} activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.surfaceAlt, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, borderWidth: onTrailingPress ? 1 : 0, borderColor: c.border }}>
          <Ionicons name="time-outline" size={13} color={c.text} />
          <Text style={{ fontSize: 12, color: c.text, fontWeight: '600' }}>{trailingLabel}</Text>
          {onTrailingPress ? <Ionicons name="chevron-down" size={12} color={c.textMuted} /> : null}
        </Pill>
      ) : null}
    </TouchableOpacity>
  );
}

// ── QuickActionTile ───────────────────────────────────────────────────────────

export function QuickActionTile({
  icon, label, onPress, active = false,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; active?: boolean }) {
  const { colors: c } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        flex: 1, alignItems: 'center', gap: 9, paddingVertical: 14, borderRadius: 18,
        backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
      }}
    >
      <View style={{
        width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
        backgroundColor: active ? c.primary : c.primarySoft,
      }}>
        <Ionicons name={icon} size={23} color={active ? '#fff' : c.primary} />
      </View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── ListRow ───────────────────────────────────────────────────────────────────

export function ListRow({
  icon, title, subtitle, onPress, last = false,
}: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string; onPress?: () => void; last?: boolean }) {
  const { colors: c } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border }}
    >
      <Ionicons name={icon} size={20} color={c.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: c.text, fontWeight: '500' }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 1 }}>{subtitle}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={c.textMuted} /> : null}
    </TouchableOpacity>
  );
}

/**
 * Star rating you can drag across or tap directly.
 *
 * Every rating screen used to be five separate buttons that each submitted on the spot: your first
 * touch was your answer, and if your thumb landed on the wrong star that was the rating the driver
 * got. This one only *selects* — the screen decides when to send it — and the fill follows your
 * finger, so you can slide from the first star along to the one you meant and let go there.
 *
 * The row measures itself in window coordinates and converts `pageX` into a star. Doing it from the
 * geometry rather than from per-star touch handlers is what allows a drag to cross the gaps between
 * the stars without the value dropping out.
 */
export function StarRating({
  value, onChange, size = 34, disabled = false,
}: { value: number; onChange: (n: number) => void; size?: number; disabled?: boolean }) {
  const { colors: c } = useTheme();
  const GAP = 10;
  const step = size + GAP;
  const rowRef = React.useRef<View>(null);
  const originX = React.useRef(0);

  const measure = () => {
    rowRef.current?.measureInWindow?.((x) => { originX.current = x; });
  };

  const starAt = (pageX: number) => {
    const rel = pageX - originX.current;
    return Math.min(5, Math.max(1, Math.ceil(rel / step)));
  };

  const pan = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Both of these are load-bearing, and their absence is why a rating "locked" on the first
      // star touched. Every rating screen sits inside a ScrollView, and termination requests
      // default to granted — so the scroll view took the responder back on the first move, the
      // grant's value stood, and no amount of dragging changed it. Refusing termination keeps the
      // gesture, and blocking the native responder stops the scroll view reacting underneath.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      // Re-measure as the gesture starts: onLayout can fire while a bottom sheet is still
      // animating in, and a stale origin maps every touch to the wrong star.
      onPanResponderGrant: (e) => { measure(); onChangeRef.current(starAt(e.nativeEvent.pageX)); },
      onPanResponderMove: (e) => { onChangeRef.current(starAt(e.nativeEvent.pageX)); },
    }),
  ).current;

  // The responder is created once, so it reaches the current callback through a ref rather than
  // capturing whichever one existed on the first render.
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = disabled ? () => {} : onChange;

  return (
    <View
      ref={rowRef}
      onLayout={measure}
      {...(disabled ? {} : pan.panHandlers)}
      style={{ flexDirection: 'row', gap: GAP, alignSelf: 'center', paddingVertical: 6 }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name={n <= value ? 'star' : 'star-outline'} size={size} color={c.warning} />
      ))}
    </View>
  );
}
