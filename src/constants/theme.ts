/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import "@/global.css";

import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#000000",
    background: "#ffffff",
    backgroundElement: "#F0F0F3",
    backgroundSelected: "#E0E1E6",
    textSecondary: "#60646C",
    iconActive: "#2563eb",
    subtext: "#64748b",
    border: "#e2e8f0",
    borderStrong: "#cbd5e1",
    surface: "#f8fafc",
    surfaceRaised: "#ffffff",
    bgActive: "#f8fafc",
    sidebarBg: "#ffffff",
    primary: "#2563eb",
    primaryText: "#ffffff",
    primaryDisabled: "#93c5fd",
    primarySubtleText: "#dbeafe",
    dangerBg: "#fef2f2",
    dangerBorder: "#fecaca",
    dangerText: "#b91c1c",
    mode: "light",
  },
  dark: {
    text: "#ffffff",
    background: "#000000",
    backgroundElement: "#212225",
    backgroundSelected: "#2E3135",
    textSecondary: "#B0B4BA",
    iconActive: "#60a5fa",
    subtext: "#94a3b8",
    border: "#334155",
    borderStrong: "#475569",
    surface: "#111827",
    surfaceRaised: "#1f2937",
    bgActive: "#111827",
    sidebarBg: "#020617",
    primary: "#60a5fa",
    primaryText: "#f8fafc",
    primaryDisabled: "#475569",
    primarySubtleText: "#bfdbfe",
    dangerBg: "#450a0a",
    dangerBorder: "#7f1d1d",
    dangerText: "#fecaca",
    mode: "dark",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "var(--font-display)",
    serif: "var(--font-serif)",
    rounded: "var(--font-rounded)",
    mono: "var(--font-mono)",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
