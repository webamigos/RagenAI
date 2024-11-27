const defaultTheme = require('tailwindcss/defaultTheme');
const TailwindAnimate = require('tailwindcss-animate');
const TailwindTypography = require('@tailwindcss/typography');

module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx,mdx}',
    './.storybook/**/*.{js,jsx,ts,tsx,mdx}',
  ],
  darkMode: ['class'],
  theme: {
    extend: {
      width: {
        88: '22rem',
      },
      maxWidth: {
        '10/12': '83.3333%',
      },
      spacing: {
        92: '23rem',
        20: '5rem',
      },
      fontFamily: {
        sans: ['Poppins', ...defaultTheme.fontFamily.sans],
      },
      keyframes: {
        'slide-in': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'slide-in': 'slide-in 0.5s ease-out',
      },
      colors: {
        'salesyy-red': '#CB1D3D',
        'salesyy-blue': '#252D53',
        'primary-light': '#e2e8f3',
        'primary-dark': '#06141B',
        'secondary-dark': '#11212D',
        'accent-dark': {
          300: '#2b3740',
          500: '#253745',
          700: '#20303c',
        },
        'accent-dark-lightness': '#4A5C6A',
        'primary-blue': {
          400: '#6eacf0',
          500: '#589de8',
        },
        'primary-gray-200': '#F7F7F7',
        'success-green': '#5ae078',

        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: `var(--radius)`,
        md: `calc(var(--radius) - 2px)`,
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [TailwindAnimate, TailwindTypography],
};
