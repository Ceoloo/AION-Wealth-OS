import type { Config } from "tailwindcss";

/**
 * Calm navy/charcoal surfaces with restrained teal accents.
 * Mobile-first: the design baseline is a 390px viewport.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0b1220", // charcoal-navy base surface
          soft: "#111a2b",
          card: "#16223a",
          line: "#243350",
        },
        navy: {
          DEFAULT: "#122038",
          muted: "#1c2c47",
        },
        teal: {
          DEFAULT: "#2dd4bf",
          soft: "#134e4a",
          ring: "#0d9488",
        },
        cloud: {
          DEFAULT: "#e6ecf5", // primary text on dark
          muted: "#9fb0c9", // secondary text
          faint: "#6b7c98",
        },
        warn: "#f5b34a",
        danger: "#f2777a",
        ok: "#5fd08a",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      maxWidth: {
        app: "430px",
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.15rem",
      },
    },
  },
  plugins: [],
};

export default config;
