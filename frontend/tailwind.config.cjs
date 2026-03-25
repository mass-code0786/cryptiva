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
          bg: "#0A0A0A",
          panel: "#141414",
          panelAlt: "#1A1A1A",
          elevated: "#2A2A2A",
          accent: "#FF3B3B",
          accentAlt: "#FFD700",
          text: "#F5F5F5",
          muted: "#A0A0A0",
          border: "#2A2A2A",
          success: "#4CAF50",
          warning: "#FFC107",
          danger: "#FF5252"
        }
      }
    },
  },
  plugins: [],
};

