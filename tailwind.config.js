/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#E8542E', light: '#FF7A59' },
        ink: '#1F2430',
      },
      keyframes: {
        ring: {
          '0%': { transform: 'scale(1)', opacity: '0.55' },
          '100%': { transform: 'scale(1.55)', opacity: '0' },
        },
      },
      animation: {
        ring: 'ring 1.6s ease-out infinite',
        'ring-slow': 'ring 2.4s ease-out infinite',
      },
    },
  },
  plugins: [],
}
