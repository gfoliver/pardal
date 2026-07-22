import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        elevated: "var(--bg-elevated)",
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        hairline: "var(--hairline)",
        ring: "var(--primary)",
        fg: {
          DEFAULT: "var(--text)",
          muted: "var(--text-muted)",
          faint: "var(--text-faint)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          soft: "var(--primary-soft)",
          foreground: "var(--text-on-accent)",
        },
        accent: "var(--accent)",
        gold: "var(--gold)",
        danger: "var(--danger)",
        info: "var(--info)",
        pos: {
          gk: "var(--pos-gk)",
          def: "var(--pos-def)",
          mid: "var(--pos-mid)",
          att: "var(--pos-att)",
        },
      },
      fontFamily: {
        sans: "var(--font-sans)",
        display: "var(--font-display)",
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.8125rem", { lineHeight: "1.15rem" }],
        base: ["0.9375rem", { lineHeight: "1.5rem" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 3px)",
      },
      letterSpacing: {
        caps: "0.09em",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
        "select-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms cubic-bezier(0.2,0.7,0.2,1)",
        "select-in": "select-in 120ms cubic-bezier(0.2,0.7,0.2,1)",
      },
    },
  },
  plugins: [animate],
};
