/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      animation: {
        'mesh-drift': 'meshDrift 22s ease-in-out infinite alternate',
        'mesh-drift-reverse': 'meshDriftReverse 26s ease-in-out infinite alternate',
        'pulse-soft': 'pulseSoft 3s ease-in-out infinite',
      },
      keyframes: {
        meshDrift: {
          '0%': { transform: 'translate3d(0%, 0%, 0) scale(1)' },
          '50%': { transform: 'translate3d(4%, -5%, 0) scale(1.06)' },
          '100%': { transform: 'translate3d(-3%, 4%, 0) scale(0.96)' },
        },
        meshDriftReverse: {
          '0%': { transform: 'translate3d(0%, 0%, 0) scale(1.03)' },
          '50%': { transform: 'translate3d(-5%, 4%, 0) scale(0.95)' },
          '100%': { transform: 'translate3d(4%, -3%, 0) scale(1.05)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.85' },
          '50%': { opacity: '0.45' },
        },
      },
    },
  },
  plugins: [],
};
