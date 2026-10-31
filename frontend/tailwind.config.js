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
          bg: '#0A0D14',       // Dark Obsidian (Fundo Principal / Canvas)
          card: '#121824',     // Dark Navy (Superfícies / Cards / Sidebar)
          hover: '#1B2333',    // Superfícies Elevadas / Hover
          cyan: '#00D2FF',     // Primária / Ação Principal
          cyanHover: '#38BDF8',// Hover da Primária
          blue: '#0072FF',     // Secundária / Destaques
          indigo: '#6366F1',   // Acento / Gradientes
          deepIndigo: '#4C1D95',
          text: '#F8FAFC',     // Texto Principal
          muted: '#94A3B8',    // Texto Secundário / Metadados
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
        subtle: '0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.24)',
        card: '0 4px 12px rgba(0, 0, 0, 0.35)',
        accent: '0 2px 8px rgba(0, 210, 255, 0.12)',
        neon: '0 1px 6px rgba(0, 210, 255, 0.16)',
        'neon-strong': '0 2px 10px rgba(0, 210, 255, 0.25)',
        'neon-indigo': '0 2px 10px rgba(99, 102, 241, 0.2)',
      },
    },
  },
  plugins: [],
};
