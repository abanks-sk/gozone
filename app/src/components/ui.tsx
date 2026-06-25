import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

export const Colors = {
  primary: '#1d6e3a',
  primaryDark: '#155229',
  accent: '#f5a623',
  danger: '#e74c3c',
  bg: '#f7f9f8',
  card: '#ffffff',
  text: '#1a1a1a',
  muted: '#6b7280',
  border: '#e2e8f0',
};

// ── Button ──────────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'outline' | 'danger' | 'ghost';

export function Btn({
  label,
  onPress,
  loading = false,
  variant = 'primary',
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  variant?: BtnVariant;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      style={[styles.btn, styles[`btn_${variant}`], isDisabled && styles.btnDisabled, style]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator color={variant === 'outline' ? Colors.primary : '#fff'} />
        : <Text style={[styles.btnText, styles[`btnText_${variant}`]]}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

// ── Input ────────────────────────────────────────────────────────────────────

export function Input(props: TextInputProps & { label?: string }) {
  const { label, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...rest}
        style={[styles.input, props.style]}
        placeholderTextColor={Colors.muted}
      />
    </View>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ── Row ──────────────────────────────────────────────────────────────────────

export function Row({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

// ── Badge ────────────────────────────────────────────────────────────────────

export function Badge({ label, color = Colors.primary }: { label: string; color?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ── Empty ────────────────────────────────────────────────────────────────────

export function Empty({ message }: { message: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

// ── Divider ──────────────────────────────────────────────────────────────────

export function Divider() {
  return <View style={styles.divider} />;
}

// ── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  btn: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  btn_primary: { backgroundColor: Colors.primary },
  btn_outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  btn_danger: { backgroundColor: Colors.danger },
  btn_ghost: { backgroundColor: 'transparent' },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 16, fontWeight: '600' },
  btnText_primary: { color: '#fff' },
  btnText_outline: { color: Colors.primary },
  btnText_danger: { color: '#fff' },
  btnText_ghost: { color: Colors.primary },

  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.card,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.muted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },

  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: Colors.muted, fontSize: 15 },

  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
} as Record<string, any>);
