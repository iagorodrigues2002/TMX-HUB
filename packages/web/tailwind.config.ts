import type { Config } from 'tailwindcss';

// Tailwind v4 uses CSS-first config in globals.css.
// This file is kept for tooling compatibility (IDE plugins, lint rules) and to
// declare the same tokens for editor autocomplete/intellisense.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { base: '#04101A', elevated: '#0A1A24' },
        accent: {
          from: '#0E7C86',
          to: '#22D3EE',
          mid: '#14B8A6',
          deep: '#0B5057',
          on: '#031516',
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui'],
      },
      borderRadius: {
        sm: '10px',
        md: '14px',
        lg: '18px',
      },
      boxShadow: {
        glow: '0 0 12px rgba(34,211,238,0.25)',
        aura: '0 0 40px rgba(20,184,166,0.15), 0 0 80px rgba(20,184,166,0.05)',
        card: '0 20px 60px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(90deg, #0E7C86 0%, #22D3EE 100%)',
      },
      letterSpacing: {
        hud: '0.18em',
      },
    },
  },
  plugins: [],
};

export default config;
