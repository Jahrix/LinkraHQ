import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"] ,
  theme: {
    extend: {
      colors: {
        ink: "#0a0c12",
        glass: "rgba(255,255,255,0.06)",
        glassStrong: "rgba(255,255,255,0.12)",
        stroke: "rgba(255,255,255,0.14)",
        accent: "#8b5cf6"
      },
      boxShadow: {
        glass: "0 20px 60px rgba(0,0,0,0.45)",
        lift: "0 8px 22px rgba(0,0,0,0.35)"
      },
      borderRadius: {
        xl: "18px",
        lg: "14px"
      }
    }
  },
  plugins: []
} satisfies Config;
