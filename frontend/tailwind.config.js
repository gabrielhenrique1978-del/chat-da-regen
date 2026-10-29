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
        regen: {
          bg: '#0A0D14',       // Dark Obsidian (Fundo Principal)
          card: '#121824',     // Dark Navy (Cards / Containers / Sidebar)
          hover: '#1B2333',    // Superfícies Elevadas / Hover
          cyan: '#00D2FF',     // Primária / Glow (Ciano Neon)
          cyanHover: '#38BDF8',
          blue: '#0072FF',     // Secundária (Azul Elétrico)
          indigo: '#6366F1',   // Acento / Gradientes (Índigo Neon)
          deepIndigo: '#4C1D95',
          text: '#F8FAFC',     // Texto Principal
          muted: '#94A3B8',    // Texto Secundário
        },
        brand: {
          50: '#ECFEFF',
          100: '#CFFAFE',
          500: '#00D2FF',
          600: '#0072FF',
          700: '#4C1D95',
        },
      },
      boxShadow: {
        neon: '0 0 15px rgba(0, 210, 255, 0.3)',
        'neon-strong': '0 0 24px rgba(0, 210, 255, 0.5)',
        'neon-indigo': '0 0 18px rgba(99, 102, 241, 0.35)',
      },
    },
  },
  plugins: [],
};
