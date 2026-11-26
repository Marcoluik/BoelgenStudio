import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  integrations: [
    tailwind({ applyBaseStyles: false }),
    // Admin og kvitteringssiden skal ikke i sitemappet
    sitemap({ filter: (page) => !/\/(admin|tak)\/?$/.test(page) }),
  ],
  site: 'https://bolgenstudio.com',
  compressHTML: true,
  vite: {
    server: {
      hmr: {
        overlay: false,
      },
    },
  },
});
