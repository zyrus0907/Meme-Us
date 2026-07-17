import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#241B4D",
        paper: "#FFF8EC",
        pink: { DEFAULT: "#FF5C8A", light: "#FFE9F0" },
        grape: { DEFAULT: "#6C5CE7", light: "#EFEAFF" },
        mustard: { DEFAULT: "#F5B301", light: "#FFF4D6" },
        mint: { DEFAULT: "#2FC98C", light: "#E4F8EE" },
        sky: { DEFAULT: "#3FB6FF", light: "#E3F3FF" },
        cream: "#FFEFD0",
        muted: "#8A84A3",
      },
      fontFamily: {
        display: ["'Fredoka'", "sans-serif"],
        body: ["'DM Sans'", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sticker: "20px",
      },
      boxShadow: {
        sticker: "4px 4px 0 #241B4D",
        "sticker-sm": "2px 2px 0 #241B4D",
        "sticker-lg": "6px 6px 0 #241B4D",
      },
      keyframes: {
        "pop-in": {
          from: { opacity: "0", transform: "scale(0.92) translateY(10px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-6deg)" },
          "50%": { transform: "rotate(6deg)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.7)" },
        },
      },
      animation: {
        "pop-in": "pop-in 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        wiggle: "wiggle 1.6s ease-in-out infinite",
        "pulse-dot": "pulse-dot 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
