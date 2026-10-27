/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#EAF2ED',
          100: '#D3E2D8',
          500: '#365945',
          600: '#243E30',
          700: '#1A2B21',
        },
      },
    },
  },
  plugins: [],
};
