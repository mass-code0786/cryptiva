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
          bg: "rgb(var(--wallet-bg) / <alpha-value>)",
          panel: "rgb(var(--wallet-panel) / <alpha-value>)",
          panelAlt: "rgb(var(--wallet-panel-alt) / <alpha-value>)",
          elevated: "rgb(var(--wallet-elevated) / <alpha-value>)",
          accent: "rgb(var(--wallet-accent) / <alpha-value>)",
          accentAlt: "rgb(var(--wallet-accent-alt) / <alpha-value>)",
          premium: "rgb(var(--wallet-premium) / <alpha-value>)",
          text: "rgb(var(--wallet-text) / <alpha-value>)",
          muted: "rgb(var(--wallet-muted) / <alpha-value>)",
          border: "rgb(var(--wallet-border) / <alpha-value>)",
          success: "rgb(var(--wallet-success) / <alpha-value>)",
          warning: "rgb(var(--wallet-warning) / <alpha-value>)",
          danger: "rgb(var(--wallet-danger) / <alpha-value>)"
        }
      }
    },
  },
  plugins: [],
};

