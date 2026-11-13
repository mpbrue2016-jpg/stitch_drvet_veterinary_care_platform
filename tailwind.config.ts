import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#153B50',
          green: '#13A88A',
          turquoise: '#35C6B0',
          ice: '#EAF5F8',
          floor: '#F5F8FA',
          ink: '#183344',
          muted: '#718096',
        },
        floor: {
          5: '#F5F8FA',
        },
        text: {
          344: '#183344',
        },
      },
      fontFamily: {
        sans: ['var(--font-plus-jakarta)', '"Plus Jakarta Sans"', 'Inter', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 12px 35px -8px rgba(15, 60, 90, 0.08), 0 4px 12px -2px rgba(15, 60, 90, 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;