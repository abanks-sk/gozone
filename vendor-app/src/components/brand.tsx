import React, { useState } from 'react';
import {
  ActivityIndicator, Image, ImageStyle, Text, TextInput, TextInputProps,
  TouchableOpacity, View, ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { brand } from '../theme/tokens';

// ── GzMark ────────────────────────────────────────────────────────────────────
// The official GoZone "GZ" logo (assets/gz-logo.png — background removed, so the
// road's dashed centreline shows the surface through). `color` tints the whole
// mark (white on dark surfaces); omit it to keep the original navy. `dash` is
// accepted for API compatibility but unused with the bitmap asset.

const GZ_LOGO = require('../../assets/gz-logo.png');
const GZ_ASPECT = 681 / 985; // cleaned asset height / width

export function GzMark({
  size = 120,
  color,
  style,
}: {
  size?: number;
  color?: string;
  dash?: string;
  style?: ImageStyle;
}) {
  return (
    <Image
      source={GZ_LOGO}
      resizeMode="contain"
      tintColor={color}
      style={[{ width: size, height: size * GZ_ASPECT }, style]}
    />
  );
}

// ── GzHero ────────────────────────────────────────────────────────────────────
// Splash/onboarding hero: the GZ mark in white, floating on the signature glow.

export function GzHero({ size = 170, glowScale = 2.6, style }: { size?: number; glowScale?: number; style?: ViewStyle }) {
  // How far the glow spreads beyond the mark. At the old 2.1 the mark overhung its own halo and
  // read as sitting in front of the light rather than lit by it; a wider orb puts the GZ inside it.
  const canvas = size * glowScale;
  return (
    <View
      pointerEvents="none"
      style={[{ width: canvas, height: canvas * 0.85, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <GlowOrb size={canvas} style={{ position: 'absolute', top: -(canvas * 0.075) }} />
      <GzMark size={size} color="#F2F7FF" dash={brand.bg} />
    </View>
  );
}

// ── GlowOrb ───────────────────────────────────────────────────────────────────
// Signature radial glow, faked with stacked translucent circles so it renders on
// web, iOS and Android with no extra dependency.

export function GlowOrb({
  size = 220,
  color = brand.glow,
  style,
}: {
  size?: number;
  color?: string;
  style?: ViewStyle;
}) {
  // Unique gradient id so multiple orbs never collide.
  const [id] = useState(() => 'glow' + Math.random().toString(36).slice(2));
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity="0.95" />
            <Stop offset="32%" stopColor={color} stopOpacity="0.55" />
            <Stop offset="62%" stopColor={color} stopOpacity="0.18" />
            <Stop offset="100%" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

// ── BrandOrb ──────────────────────────────────────────────────────────────────
// A solid, lit sphere surrounded by a glow halo — the splash hero.
// `size` is the diameter of the solid ball; the halo extends beyond it.

export function BrandOrb({ size = 160, style }: { size?: number; style?: ViewStyle }) {
  const [id] = useState(() => 'orb' + Math.random().toString(36).slice(2));
  const canvas = size * 2.5;
  const c = canvas / 2;
  return (
    <View
      pointerEvents="none"
      style={[{ width: canvas, height: canvas, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Svg width={canvas} height={canvas}>
        <Defs>
          <RadialGradient id={`${id}h`} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={brand.glow} stopOpacity="0.6" />
            <Stop offset="34%" stopColor={brand.glow} stopOpacity="0.32" />
            <Stop offset="64%" stopColor={brand.glow} stopOpacity="0.1" />
            <Stop offset="100%" stopColor={brand.glow} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={`${id}b`} cx="40%" cy="34%" r="72%">
            <Stop offset="0%" stopColor="#A8CCFF" stopOpacity="1" />
            <Stop offset="42%" stopColor="#3B82F6" stopOpacity="1" />
            <Stop offset="82%" stopColor="#2563EB" stopOpacity="1" />
            <Stop offset="100%" stopColor="#1B4FC4" stopOpacity="1" />
          </RadialGradient>
          <RadialGradient id={`${id}s`} cx="70%" cy="80%" r="62%">
            <Stop offset="0%" stopColor="#06122B" stopOpacity="0.5" />
            <Stop offset="45%" stopColor="#06122B" stopOpacity="0.16" />
            <Stop offset="100%" stopColor="#06122B" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={c} cy={c} r={canvas / 2} fill={`url(#${id}h)`} />
        <Circle cx={c} cy={c} r={size / 2} fill={`url(#${id}b)`} />
        <Circle cx={c} cy={c} r={size / 2} fill={`url(#${id}s)`} />
      </Svg>
    </View>
  );
}

// ── Logo ──────────────────────────────────────────────────────────────────────
// Squircle with "Go" centered.

export function Logo({ size = 76 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: brand.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <GzMark size={size * 0.74} color="#fff" dash={brand.primary} />
    </View>
  );
}

// ── BrandScreen ───────────────────────────────────────────────────────────────
// Full-screen always-dark wrapper for brand/onboarding surfaces.

export function BrandScreen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={{ flex: 1, backgroundColor: brand.bg }}>
      <StatusBar style="light" />
      <SafeAreaView style={[{ flex: 1 }, style]}>{children}</SafeAreaView>
    </View>
  );
}

// ── PillButton ────────────────────────────────────────────────────────────────

type PillVariant = 'filled' | 'outline' | 'ghost';

export function PillButton({
  label,
  onPress,
  variant = 'filled',
  icon,
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: PillVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  let bg = brand.primary;
  let border = 'transparent';
  let txt = '#fff';
  if (variant === 'outline') { bg = 'transparent'; border = brand.border; txt = '#fff'; }
  if (variant === 'ghost')   { bg = 'transparent'; border = 'transparent'; txt = brand.textMuted; }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderRadius: 999,
          paddingVertical: 15,
          paddingHorizontal: 20,
        },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={txt} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={txt} /> : null}
          <Text style={{ color: txt, fontSize: 15, fontWeight: '700' }}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ── BrandInput ────────────────────────────────────────────────────────────────

export function BrandInput(props: TextInputProps & { label?: string }) {
  const { label, style, onFocus, onBlur, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? (
        <Text
          style={{
            fontSize: 11, fontWeight: '600', color: brand.textMuted,
            marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.5,
          }}
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        {...rest}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        placeholderTextColor={brand.textMuted}
        style={[
          {
            borderWidth: 1.5,
            borderColor: focused ? brand.primaryBright : brand.border,
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 15,
            fontSize: 16,
            color: '#fff',
            backgroundColor: brand.bgElevated,
          },
          style as any,
        ]}
      />
    </View>
  );
}
