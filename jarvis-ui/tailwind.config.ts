import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        genesis: {
          bg: '#050508',
          surface: '#0d0d1a',
          green: '#00ff88',
          red: '#ff3366',
          blue: '#4a9eff',
          amber: '#ffaa00',
          purple: '#a855f7',
          gold: '#ffd700',
          'border-dim': 'rgba(0,255,136,0.15)',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-green': 'pulse-green 2s ease-in-out infinite',
        'pulse-red': 'pulse-red 1.5s ease-in-out infinite',
        'blink': 'blink 1s step-end infinite',
        'dash-flow': 'dash-flow 1.5s linear infinite',
        'new-block': 'new-block 0.5s ease-out forwards',
      },
      keyframes: {
        'pulse-green': {
          '0%, 100%': { boxShadow: '0 0 4px #00ff88, 0 0 8px rgba(0,255,136,0.3)' },
          '50%': { boxShadow: '0 0 20px #00ff88, 0 0 40px #00ff88, 0 0 60px rgba(0,255,136,0.5)' },
        },
        'pulse-red': {
          '0%, 100%': { boxShadow: '0 0 4px #ff3366, 0 0 8px rgba(255,51,102,0.3)' },
          '50%': { boxShadow: '0 0 20px #ff3366, 0 0 40px #ff3366, 0 0 60px rgba(255,51,102,0.5)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'dash-flow': {
          '0%': { strokeDashoffset: '100' },
          '100%': { strokeDashoffset: '0' },
        },
        'new-block': {
          '0%': { backgroundColor: 'rgba(0,255,136,0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
      boxShadow: {
        'glow-green': '0 0 10px rgba(0,255,136,0.3)',
        'glow-red': '0 0 10px rgba(255,51,102,0.4)',
        'glow-blue': '0 0 10px rgba(74,158,255,0.3)',
        'glow-amber': '0 0 10px rgba(255,170,0,0.3)',
      },
    },
  },
  plugins: [],
}

export default config
