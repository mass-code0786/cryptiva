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
          bg: "#061427",
          panel: "#0B1F3A",
          panelAlt: "#10284A",
          elevated: "#1B3D6B",
          accent: "#00C8FF",
          accentAlt: "#6C7CFF",
          text: "#EAF4FF",
          muted: "#8FA8C9",
          border: "#1B3D6B",
          success: "#67D7A7",
          warning: "#F4B860",
          danger: "#F57F7F"
        }
      }
    },
  },
  plugins: [],
};

