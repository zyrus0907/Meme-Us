"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeColors {
  bg: string;
  bgCard: string;
  bgCardAlt: string;
  ink: string;
  muted: string;
  border: string;
  shadow: string;
  cream: string;
  pink: string;
  pinkLight: string;
  grape: string;
  grapeLight: string;
  mustard: string;
  mustardLight: string;
  mint: string;
  mintLight: string;
}

const LIGHT: ThemeColors = {
  bg: "#FFF8EC",
  bgCard: "#fff",
  bgCardAlt: "#FFEFD0",
  ink: "#241B4D",
  muted: "#8A84A3",
  border: "#241B4D",
  shadow: "#241B4D",
  cream: "#FFEFD0",
  pink: "#FF5C8A",
  pinkLight: "#FFE9F0",
  grape: "#6C5CE7",
  grapeLight: "#EFEAFF",
  mustard: "#F5B301",
  mustardLight: "#FFF4D6",
  mint: "#2FC98C",
  mintLight: "#E4F8EE",
};

const DARK: ThemeColors = {
  bg: "#0E0A1A",
  bgCard: "#1C1535",
  bgCardAlt: "#2A2050",
  ink: "#FFFFFF",
  muted: "#A9A3C0",
  border: "#4A3D7A",
  shadow: "#000000",
  cream: "#2A2050",
  pink: "#FF6B95",
  pinkLight: "#3D1A2E",
  grape: "#9B8FFF",
  grapeLight: "#2A2050",
  mustard: "#FFD04A",
  mustardLight: "#2D2510",
  mint: "#3DDBA0",
  mintLight: "#152D20",
};

interface ThemeContextType {
  theme: Theme;
  colors: ThemeColors;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  colors: LIGHT,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = localStorage.getItem("meme-us-theme") as Theme | null;
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("meme-us-theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "light" ? "dark" : "light"));
  const colors = theme === "dark" ? DARK : LIGHT;

  return (
    <ThemeContext.Provider value={{ theme, colors, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
