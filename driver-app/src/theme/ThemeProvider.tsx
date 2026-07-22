import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import {
  ColorScheme, Palette, lightPalette, darkPalette, radius, space, font,
} from './tokens';

type Mode = 'system' | 'light' | 'dark';

interface ThemeValue {
  scheme: ColorScheme;
  mode: Mode;
  colors: Palette;
  radius: typeof radius;
  space: typeof space;
  font: typeof font;
  setMode: (m: Mode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = (useColorScheme() ?? 'light') as ColorScheme;
  const [mode, setMode] = useState<Mode>('system');

  const scheme: ColorScheme = mode === 'system' ? system : mode;
  const colors = scheme === 'dark' ? darkPalette : lightPalette;

  // Quick light <-> dark flip, taking the system value as the starting point.
  const toggle = useCallback(() => {
    setMode((prev) => {
      const current = prev === 'system' ? system : prev;
      return current === 'dark' ? 'light' : 'dark';
    });
  }, [system]);

  const value = useMemo<ThemeValue>(
    () => ({ scheme, mode, colors, radius, space, font, setMode, toggle }),
    [scheme, mode, colors, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
