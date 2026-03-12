/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef3f9',
          100: '#d4e1f0',
          200: '#a9c3e1',
          300: '#7ea5d2',
          400: '#5387c3',
          500: '#2d6aae',
          600: '#1e3a5f',
          700: '#172d4a',
          800: '#102035',
          900: '#091320',
        }
      }
    },
  },
  plugins: [],
}
