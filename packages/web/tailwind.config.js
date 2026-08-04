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
         * Dark ink for text sitting on a SATURATED fill — a position badge, a
         * form pill, a shirt number on the pitch. Same token as
         * `primary.foreground`, under a name that does not claim the background
         * is the primary colour; `text-white` was being used for this and
         * measured under 3:1 on every one of them.
         */
        ink: "var(--text-on-accent)",
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
      /*
       * A layer order instead of `z-50` everywhere. It was a single value for
       * overlays, modals and menus alike, which left the stacking up to DOM
       * order — a tooltip or select raised from inside a dialog was a coin flip.
       *
       * Toasts are absent on purpose: sonner renders its own container with its
       * own z-index, above everything, which is where a toast belongs.
       */
      zIndex: {
        overlay: "40",
        modal: "50",
        popover: "60",
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
