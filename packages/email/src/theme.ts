import { pixelBasedPreset } from "react-email";
import type { TailwindConfig } from "react-email";

/**
 * Default-theme tokens from `packages/ui` + `projects/baby-outlet/web/src/styles/app.css`,
 * converted to hex so email clients that skip `oklch` still match the app.
 */
export const emailTheme = {
  accent: "#FCDE83",
  background: "#FDFBF7",
  border: "#EBE7E0",
  card: "#FDFBF7",
  fontFamily: "Nunito, ui-rounded, system-ui, sans-serif",
  foreground: "#020817",
  mutedForeground: "#64748B",
  popShadow: "6px 6px 0 0 rgba(244, 157, 37, 0.3)",
  primary: "#F49D25",
  primaryForeground: "#FFFFFF",
  primarySoft: "#FDE8C8",
  radiusCard: "32px",
  radiusPill: "999px",
} as const;

export const emailTailwindConfig = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      borderRadius: {
        card: emailTheme.radiusCard,
        pill: emailTheme.radiusPill,
      },
      colors: {
        accent: emailTheme.accent,
        background: emailTheme.background,
        border: emailTheme.border,
        card: emailTheme.card,
        foreground: emailTheme.foreground,
        muted: emailTheme.mutedForeground,
        primary: emailTheme.primary,
        "primary-foreground": emailTheme.primaryForeground,
        "primary-soft": emailTheme.primarySoft,
      },
      fontFamily: {
        sans: ["Nunito", "ui-rounded", "system-ui", "sans-serif"],
      },
      maxWidth: {
        email: "420px",
      },
    },
  },
} satisfies TailwindConfig;
