import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.ts', './src/**/*.tsx', './app/**/*.ts', './app/**/*.tsx'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;