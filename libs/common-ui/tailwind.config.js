const { createGlobPatternsForDependencies } = require('@nx/react/tailwind');
const { join } = require('path');

const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    join(
      __dirname,
      '{src,pages,components,app}/**/*!(*.stories|*.spec).{ts,tsx,html}'
    ),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter var', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        transparent: 'transparent',
        current: 'currentColor',
        'salesyy-red': '#CB1D3D',
        'salesyy-blue': '#252D53',
      },
    },
  },
  plugins: [],
};
