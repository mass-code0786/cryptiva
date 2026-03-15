/** @type {import("tailwindcss").Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          500: "#0ea5e9",
          700: "#0369a1"
        }
      }
    },
  },
  plugins: [],
};

