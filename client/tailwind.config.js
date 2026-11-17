/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Segoe UI', 'Tahoma', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        arabic: ['Tahoma', 'Noto Sans Arabic', 'ui-sans-serif', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
