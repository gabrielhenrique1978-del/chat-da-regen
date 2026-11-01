/** @type {import('tailwindcss').Config} */
/**
 * REGEN FLOW — Design Tokens
 * Paleta estrita. Toda cor da interface deve sair daqui.
 * Bordas ("line") são derivadas do texto secundário #94A3B8 com transparência,
 * mantendo-se dentro da paleta oficial.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        canvas: '#0A0D14', // Fundo principal
        surface: '#121824', // Cards, sidebar, painéis
        elevated: '#1B2333', // Hover, selecionado, superfícies elevadas
        primary: {
          DEFAULT: '#00D2FF', // Ação principal, não lido, seleção ativa
          hover: '#38BDF8',
        },
        secondary: '#0072FF', // Saída da empresa (balões), destaques
        accent: {
          DEFAULT: '#6366F1', // Supervisão, interno, bloqueado
          deep: '#4C1D95', // Confirmação destrutiva
        },
        fg: '#F8FAFC', // Texto principal
        muted: '#94A3B8', // Texto secundário, legendas, horários
        line: {
          DEFAULT: 'rgba(148, 163, 184, 0.10)',
          strong: 'rgba(148, 163, 184, 0.18)',
          primary: 'rgba(0, 210, 255, 0.08)',
        },

        // Aliases legados (mantidos para compatibilidade)
        regen: {
          bg: '#0A0D14',
          card: '#121824',
          hover: '#1B2333',
          cyan: '#00D2FF',
          cyanHover: '#38BDF8',
          blue: '#0072FF',
          indigo: '#6366F1',
          deepIndigo: '#4C1D95',
          text: '#F8FAFC',
          muted: '#94A3B8',
        },
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px' }],
      },
      borderRadius: {
        DEFAULT: '6px',
      },
      boxShadow: {
        subtle: '0 1px 2px rgba(0, 0, 0, 0.32)',
        card: '0 8px 24px -8px rgba(0, 0, 0, 0.5)',
        popover: '0 12px 32px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(148, 163, 184, 0.10)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(2px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out',
      },
    },
  },
  plugins: [],
};
