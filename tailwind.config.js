const defaultTheme = require('tailwindcss/defaultTheme')


/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode:'class',
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter var', ...defaultTheme.fontFamily.sans],
        emojisans: ['Inter var', 'Noto Color Emoji', ...defaultTheme.fontFamily.sans],

      },
      // Aggie brand palette — the single source of truth for brand colors.
      // Add shades here as the styleguide grows so the app uses named tokens
      // (e.g. `bg-aggie-teal-10`, `text-aggie-teal-10`) instead of raw hex.
      colors: {
        aggie: {
          teal: {
            10: '#EAF6FA',
          },
          secondary: {
            200: '#A4D8EC',
            500: '#237F9E',
            650: '#1A5E75',
            900: '#21393D',
          },
          // Selected filter options and active-filter chips (filter bar redesign).
          lime: {
            400: '#C4CC00',
            500: '#B0B800',
          },
        },
      },
    },
  },
  plugins: [require('@headlessui/tailwindcss')],
}

