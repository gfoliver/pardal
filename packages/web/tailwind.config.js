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
        /*
         * `ink` used to live here as a colour key, for text on a SATURATED fill — a position badge, a
         * form pill, a shirt number. It is now written as `text-[var(--text-on-accent)]` at the call
         * sites instead, because a theme key that the dev server does not reload without a restart
         * fails SILENTLY and badly: with `text-ink` undefined the badges inherited the surrounding
         * cell's `text-fg-muted` and became grey text on a bright fill, illegible in dark mode. A
         * variable cannot be missing.
         */
        tier: {
          elite: "var(--tier-elite)",
          good: "var(--tier-good)",
          solid: "var(--tier-solid)",
          weak: "var(--tier-weak)",
          poor: "var(--tier-poor)",
        },
        // Aliases so shadcn chart.tsx classes resolve to our tokens
        background: "var(--bg-elevated)",
        foreground: "var(--text)",
        muted: "var(--surface-2)",
        "muted-foreground": "var(--text-muted)",
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
      /*
       * Every step derives from `--radius`, including the two that used to fall
       * through to stock Tailwind: a bare `rounded` and `rounded-xl` were fixed
       * pixel values, so turning the dial sharpened most of the app and left
       * those behind. The offsets are chosen so the current 6px radius
       * reproduces the stock values exactly — this changes nothing on screen
       * today, it just makes the dial real.
       */
      borderRadius: {
        DEFAULT: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 3px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 6px)",
        "2xl": "calc(var(--radius) + 10px)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-md)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        "2xl": "var(--shadow-2xl)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        DEFAULT: "var(--dur-base)",
        slow: "var(--dur-slow)",
      },
      transitionTimingFunction: {
        DEFAULT: "var(--ease-emphasized)",
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
        "fade-in": "fade-in var(--dur-slow) var(--ease-emphasized)",
        "select-in": "select-in var(--dur-fast) var(--ease-emphasized)",
      },
    },
  },
  plugins: [animate],
};
