/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#1E1440',
          soft: '#4A3E72',
          mute: '#7A6FA0',
        },
        grape: {
          50: '#F3EEFF',
          100: '#E5DBFF',
          200: '#CDBAFF',
          300: '#AE90FF',
          400: '#8F66FF',
          500: '#6C41F5',
          600: '#5A2FD8',
          700: '#4724AC',
          800: '#341A7E',
          900: '#231155',
        },
        bubble: {
          50: '#FFF0F7',
          100: '#FFDCEC',
          200: '#FFB6D6',
          300: '#FF89BC',
          400: '#FF5CA3',
          500: '#F5348A',
          600: '#D71D71',
          700: '#A81357',
        },
        lemon: {
          100: '#FFF6D6',
          200: '#FFE99B',
          300: '#FFDA5E',
          400: '#FFC93C',
          500: '#F5AE10',
        },
        mint: {
          100: '#DCFFF4',
          200: '#A8F7E0',
          300: '#6FEDC8',
          400: '#2BD9A8',
          500: '#12B98B',
        },
        sky: {
          100: '#DFF4FF',
          200: '#B0E6FF',
          300: '#77D6FF',
          400: '#3FC6FF',
          500: '#149FE0',
        },
        coral: {
          200: '#FFD3C6',
          300: '#FFA98D',
          400: '#FF7A59',
          500: '#EE5533',
        },
        cream: '#FFFBF5',
        canvasbg: '#F6F1FF',
      },
      fontFamily: {
        display: ['"Baloo 2"', '"Trebuchet MS"', 'system-ui', 'sans-serif'],
        body: ['Nunito', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        '4xl': '2.75rem',
        blob: '42% 58% 55% 45% / 48% 44% 56% 52%',
      },
      boxShadow: {
        soft: '0 10px 30px -12px rgba(52, 26, 126, 0.25)',
        card: '0 18px 45px -20px rgba(52, 26, 126, 0.35)',
        pop: '0 8px 0 0 rgba(52, 26, 126, 0.18)',
        'pop-sm': '0 4px 0 0 rgba(52, 26, 126, 0.18)',
        glow: '0 0 0 6px rgba(143, 102, 255, 0.18)',
        'glow-mint': '0 0 0 6px rgba(43, 217, 168, 0.22)',
        inset: 'inset 0 2px 0 0 rgba(255,255,255,0.55)',
      },
      backgroundImage: {
        'grid-dots':
          'radial-gradient(rgba(108, 65, 245, 0.14) 1.4px, transparent 1.4px)',
        'brand-gradient':
          'linear-gradient(120deg, #6C41F5 0%, #FF5CA3 45%, #FFC93C 100%)',
        'mint-gradient': 'linear-gradient(120deg, #2BD9A8 0%, #3FC6FF 100%)',
        'sunset-gradient': 'linear-gradient(120deg, #FF7A59 0%, #FF5CA3 100%)',
      },
      backgroundSize: {
        dots: '22px 22px',
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%': { transform: 'translateY(-14px) rotate(2deg)' },
        },
        'float-slow': {
          '0%,100%': { transform: 'translateY(0) rotate(-2deg)' },
          '50%': { transform: 'translateY(-24px) rotate(3deg)' },
        },
        wiggle: {
          '0%,100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
        'pop-in': {
          '0%': { transform: 'scale(0.86)', opacity: '0' },
          '60%': { transform: 'scale(1.04)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'bounce-soft': {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'gradient-pan': {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.55' },
          '70%': { transform: 'scale(1.35)', opacity: '0' },
          '100%': { transform: 'scale(1.35)', opacity: '0' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'blob-morph': {
          '0%,100%': { borderRadius: '42% 58% 55% 45% / 48% 44% 56% 52%' },
          '50%': { borderRadius: '58% 42% 40% 60% / 55% 60% 40% 45%' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(18px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'ticker-flash': {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'float-slow': 'float-slow 9s ease-in-out infinite',
        wiggle: 'wiggle 1.6s ease-in-out infinite',
        'pop-in': 'pop-in 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'bounce-soft': 'bounce-soft 2.4s ease-in-out infinite',
        shimmer: 'shimmer 2.2s linear infinite',
        'gradient-pan': 'gradient-pan 8s ease infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.24, 0, 0.38, 1) infinite',
        'spin-slow': 'spin-slow 18s linear infinite',
        'blob-morph': 'blob-morph 12s ease-in-out infinite',
        'slide-up': 'slide-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'ticker-flash': 'ticker-flash 1s ease-in-out infinite',
      },
      transitionTimingFunction: {
        pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
