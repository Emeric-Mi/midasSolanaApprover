/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Sampled from midas.app's stylesheet.
        midas: {
          navy: '#2A3E6E',
          navyHover: '#3A5290',
          ink: '#25272A',
          inkDeep: '#0D1424',
          muted: '#7C828B',
          border: '#E8EAED',
          borderStrong: '#DAE1EE',
          canvas: '#F4F6FA',
          tint: '#EBF0FF',
          accent: '#3864FF',
        },
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};
