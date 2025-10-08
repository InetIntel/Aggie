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
    },
  },
  plugins: [require('@headlessui/tailwindcss')],
}

