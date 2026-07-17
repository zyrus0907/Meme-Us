"use client";

import { useTheme } from "@/lib/theme";

// Shared styled components that adapt to light/dark mode
export function useStyles() {
  const { colors, theme } = useTheme();

  return {
    colors,
    theme,
    card: {
      background: colors.bgCard,
      border: `2px solid ${colors.border}`,
      borderRadius: 20,
      boxShadow: `4px 4px 0 ${colors.shadow}`,
    },
    cardSm: {
      background: colors.bgCard,
      border: `2px solid ${colors.border}`,
      borderRadius: 20,
      boxShadow: `2px 2px 0 ${colors.shadow}`,
    },
    cardLg: {
      background: colors.bgCard,
      border: `2px solid ${colors.border}`,
      borderRadius: 20,
      boxShadow: `6px 6px 0 ${colors.shadow}`,
    },
    pill: {
      border: `2px solid ${colors.border}`,
      borderRadius: 999,
      boxShadow: `2px 2px 0 ${colors.shadow}`,
    },
    input: {
      width: "100%",
      padding: "14px 18px",
      fontSize: 15,
      fontWeight: 700,
      color: colors.ink,
      background: colors.bgCard,
      border: `2px solid ${colors.border}`,
      borderRadius: 16,
      boxShadow: `2px 2px 0 ${colors.shadow}`,
      outline: "none",
    },
    btn: (bg: string, textColor = "#fff") => ({
      padding: "16px 24px",
      fontSize: 15,
      fontWeight: 700,
      color: textColor,
      background: bg,
      border: `2px solid ${colors.border}`,
      borderRadius: 18,
      boxShadow: `4px 4px 0 ${colors.shadow}`,
      cursor: "pointer",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      transition: "transform 0.15s",
    }),
    backBtn: {
      padding: 10,
      background: colors.bgCard,
      border: `2px solid ${colors.border}`,
      borderRadius: 14,
      boxShadow: `2px 2px 0 ${colors.shadow}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
    },
    overlay: {
      position: "fixed" as const,
      inset: 0,
      zIndex: 100,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      background: "rgba(0,0,0,0.5)",
    },
    modal: {
      width: "100%",
      maxWidth: 380,
      background: colors.bg,
      border: `2px solid ${colors.border}`,
      borderRadius: 28,
      padding: 24,
      boxShadow: `6px 6px 0 ${colors.shadow}`,
    },
    bottomSheet: {
      width: "100%",
      maxWidth: 430,
      background: colors.bg,
      borderRadius: "24px 24px 0 0",
      borderTop: `2px solid ${colors.border}`,
      padding: 24,
    },
    title: { fontSize: 24, fontWeight: 700, color: colors.ink, margin: 0 },
    subtitle: { fontSize: 13, color: colors.muted, margin: 0 },
    ink: colors.ink,
    muted: colors.muted,
    press: (e: any) => (e.currentTarget.style.transform = "scale(0.96)"),
    release: (e: any) => (e.currentTarget.style.transform = "scale(1)"),
  };
}
