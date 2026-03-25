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
          bg: "#071326",
          panel: "#0B1D39",
          panelAlt: "#10284D",
          elevated: "#123B63",
          accent: "#00C2FF",
          accentSoft: "#4DD9FF",
          text: "#EAF4FF",
          muted: "#94A9C9",
          border: "#27466D",
          success: "#79D9A7",
          warning: "#F5B74F",
          danger: "#F37C7C"
        }
      }
    },
  },
  plugins: [],
};

