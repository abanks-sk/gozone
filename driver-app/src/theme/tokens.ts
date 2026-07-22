// Design tokens — a calm, professional blue system on slate neutrals.

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  primary: string;       // brand blue
  primaryStrong: string; // pressed / emphasis
  primarySoft: string;   // tinted surface (selected chips, soft buttons)
  onPrimary: string;     // text/icon on primary
  accent: string;
  success: string;
  danger: string;
  warning: string;
  bg: string;            // app background
  surface: string;       // cards
  surfaceAlt: string;    // inputs, secondary surfaces
  text: string;
  textMuted: string;
  border: string;
  shadow: string;
}

export const lightPalette: Palette = {
  primary: '#2563EB',
  primaryStrong: '#1D4ED8',
  primarySoft: '#EAF1FF',
  onPrimary: '#FFFFFF',
  accent: '#0EA5E9',
  success: '#16A34A',
  danger: '#DC2626',
  warning: '#D97706',
  bg: '#F5F7FB',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF2F8',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E3E9F2',
  shadow: '#0F172A',
};

export const darkPalette: Palette = {
  primary: '#3B82F6',
  primaryStrong: '#60A5FA',
  primarySoft: '#1B2A4A',
  onPrimary: '#FFFFFF',
  accent: '#38BDF8',
  success: '#22C55E',
  danger: '#F87171',
  warning: '#FBBF24',
  bg: '#0A0F1C',
  surface: '#141B2D',
  surfaceAlt: '#1C2740',
  text: '#E8EDF6',
  textMuted: '#94A3B8',
  border: '#273248',
  shadow: '#000000',
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const font = { h1: 30, h2: 24, h3: 19, body: 15, small: 13, tiny: 11 };

// Brand surface — always dark, used for splash / welcome / hero moments.
// Does NOT follow the light/dark toggle.
export const brand = {
  primary: '#2563EB',
  primaryBright: '#3B82F6',
  glow: '#2F6DF5',
  bg: '#070B18',
  bgElevated: '#0E1526',
  text: '#FFFFFF',
  textMuted: '#8A97B2',
  border: '#222B44',
  borderSoft: '#1E2740',
};
