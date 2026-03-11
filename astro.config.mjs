import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  integrations: [tailwind(), sitemap()],
  site: 'https://bolgenstudio.dk',
  compressHTML: true,
  vite: {
    optimizeDeps: {
      include: ['gsap', 'three'],
    },
    server: {
      hmr: {
        overlay: false,
      },
    },
  },
});
