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
            500: '#237F9E',
          },
        },
      },
    },
  },
  plugins: [require('@headlessui/tailwindcss')],
}

