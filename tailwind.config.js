/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#FF6B35',
          'orange-dark': '#E55100',
          'orange-light': '#FFF0EB',
          blue: '#3B82F6',
          'blue-dark': '#1D4ED8',
          green: '#10B981',
          yellow: '#F59E0B',
          red: '#EF4444',
        },
        dark: {
          900: '#0A0E1A',
          800: '#0F1629',
          700: '#1A2340',
          600: '#1E2A47',
          500: '#252F4A',
          400: '#2D3A55',
          300: '#3D4E6E',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { transform: 'translateY(16px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        slideInLeft: { from: { transform: 'translateX(-16px)', opacity: 0 }, to: { transform: 'translateX(0)', opacity: 1 } },
        glow: { from: { boxShadow: '0 0 10px rgba(255,107,53,0.3)' }, to: { boxShadow: '0 0 25px rgba(255,107,53,0.7)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #FF6B35, #3B82F6)',
        'gradient-dark': 'linear-gradient(180deg, #0A0E1A, #0F1629)',
        'gradient-card': 'linear-gradient(135deg, rgba(255,107,53,0.08), rgba(59,130,246,0.08))',
      },
    },
  },
  plugins: [],
}
