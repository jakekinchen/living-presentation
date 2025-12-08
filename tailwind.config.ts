import type { Config } from 'tailwindcss'

export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand color - Electric Coral
        coral: {
          50: '#fff5f3',
          100: '#ffe8e3',
          200: '#ffd0c6',
          300: '#ffb3a3',
          400: '#ff8a6d',
          500: '#ff6347',
          600: '#f04a2f',
          700: '#d63820',
          800: '#b52f1b',
          900: '#942918',
        },
        // Supporting neutral - Warm Slate
        warmslate: {
          50: '#fafaf9',
          100: '#f5f4f2',
          200: '#eae8e4',
          300: '#d9d6cf',
          400: '#b4afa4',
          500: '#8e8780',
          600: '#6d675e',
          700: '#54504a',
          800: '#3d3a36',
          900: '#2a2825',
        },
        // Dark UI backgrounds - Canvas
        canvas: {
          950: '#0f0f0e',
          900: '#1a1918',
          800: '#2d2b28',
          700: '#423f3b',
          600: '#5a5651',
          500: '#78746e',
          400: '#9a958f',
          300: '#bfbbb6',
          200: '#e0ddd9',
          100: '#f5f3f1',
        },
        // Slide template colors
        slide: {
          ocean: '#1e40af',
          forest: '#047857',
          sunset: '#ea580c',
          plum: '#7c3aed',
          rose: '#e11d48',
          teal: '#0d9488',
        },
      },
      boxShadow: {
        'coral': '0 8px 20px rgba(255, 99, 71, 0.25)',
        'coral-lg': '0 12px 32px rgba(255, 99, 71, 0.35)',
        'warm': '0 4px 6px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(255, 99, 71, 0.05)',
        'warm-lg': '0 8px 16px rgba(0, 0, 0, 0.25), 0 4px 8px rgba(255, 99, 71, 0.08)',
        'warm-xl': '0 16px 32px rgba(0, 0, 0, 0.3), 0 8px 16px rgba(255, 99, 71, 0.12)',
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'modal-enter': 'modal-enter 0.2s ease-out',
        'slide-enter': 'slide-enter 0.3s ease-out',
      },
      keyframes: {
        'modal-enter': {
          from: { opacity: '0', transform: 'scale(0.95) translateY(10px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'slide-enter': {
          from: { opacity: '0', transform: 'translateX(-20px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
