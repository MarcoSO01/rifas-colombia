import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1280px" } },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        // Paleta de marca (rojo Iñistare). Ajusta aquí si cambia el logo.
        brand: {
          50: "#fff1f1", 100: "#ffe0e0", 200: "#ffc6c6", 300: "#ff8f8f", 400: "#ff4747",
          500: "#f51b1b", 600: "#e10600", 700: "#bd0500", 800: "#940400", 900: "#5e0300",
        },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      boxShadow: {
        brand: "0 0 0 1px rgba(255,71,71,.45), 0 8px 30px -6px rgba(225,6,0,.6)",
        emerald: "0 0 0 1px rgba(52,211,153,.45), 0 8px 30px -8px rgba(16,185,129,.5)",
      },
      keyframes: {
        pop: { "0%": { transform: "scale(.85)" }, "60%": { transform: "scale(1.12)" }, "100%": { transform: "scale(1.05)" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "float-up": { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        stripes: { "0%": { backgroundPosition: "0 0" }, "100%": { backgroundPosition: "28px 0" } },
        glow: { "0%,100%": { opacity: ".55" }, "50%": { opacity: "1" } },
      },
      animation: {
        pop: "pop .28s cubic-bezier(.34,1.56,.64,1) forwards",
        shimmer: "shimmer 3s linear infinite",
        "float-up": "float-up .45s ease-out both",
        stripes: "stripes 1.2s linear infinite",
        glow: "glow 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
