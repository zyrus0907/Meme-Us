"use client";

import { useTheme } from "@/lib/theme";

export function ThemeToggle({ size = 16 }: { size?: number }) {
  const { theme, toggle, colors } = useTheme();

  return (
    <button
      onClick={toggle}
      className="sticker-sm"
      style={{
        padding: 8,
        background: colors.bgCard,
        borderRadius: 12,
        borderColor: colors.border,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 0.15s, background 0.3s",
        cursor: "pointer",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.9) rotate(-20deg)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
    >
      <span style={{ fontSize: size, lineHeight: 1 }}>
        {theme === "light" ? "🌙" : "☀️"}
      </span>
    </button>
  );
}
