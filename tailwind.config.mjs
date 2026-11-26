/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}-rgb) / <alpha-value>)`;

export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Archivo Variable"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      // Farverne følger hoodien (se src/styles/global.css): hvid bomuld eller sort, altid med blå tråd
      colors: {
        ground: token('ground'),
        surface: { DEFAULT: token('surface'), 2: token('surface-2') },
        ink: { DEFAULT: token('ink'), dim: token('ink-dim'), mute: token('ink-mute') },
        thread: token('thread'),
        amber: 'var(--warn)',
      },
      maxWidth: {
        site: '88rem',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
