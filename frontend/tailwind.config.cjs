/** @type {import("tailwindcss").Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          500: "#0ea5e9",
          700: "#0369a1"
        },
        wallet: {
          bg: "#0B0F1A",
          panel: "#111827",
          panelAlt: "#0F172A",
          elevated: "#1F2937",
          accent: "#3B82F6",
          accentAlt: "#60A5FA",
          text: "#F9FAFB",
          muted: "#9CA3AF",
          border: "#1F2937",
          success: "#22C55E",
          warning: "#F59E0B",
          danger: "#EF4444"
        }
      }
    },
  },
  plugins: [],
};

