/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mayor: '#7c3aed',
        opposition: '#ea580c',
      },
    },
  },
  plugins: [],
}
