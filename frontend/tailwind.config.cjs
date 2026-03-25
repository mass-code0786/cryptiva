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
          bg: "#061A23",
          panel: "#0B2B3A",
          panelAlt: "#0F3A4A",
          elevated: "#1F5C6E",
          accent: "#00D4FF",
          accentAlt: "#00FFA3",
          text: "#E6F7FF",
          muted: "#8FB8C6",
          border: "#1F5C6E",
          success: "#22C55E",
          warning: "#F59E0B",
          danger: "#FB7185"
        }
      }
    },
  },
  plugins: [],
};

