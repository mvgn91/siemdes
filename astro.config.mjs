// Configuracion del micrositio SIEMDES (workstream SITIO — docs/15)
// Stack: Astro 7 + React 19 (islas) + Tailwind 4, salida estatica a dist/ (ADR-W01, ADR-W02, ADR-W03)
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  // B-02 ABIERTO: siemdes.mx aparece "por verificar" en docs/11.
  // Este valor alimenta canonicas, sitemap.xml y el QR; cambiarlo aqui cambia todo el sitio.
  site: 'https://siemdes.mx',

  output: 'static',

  // Las redirecciones (`/ir/*`) no van al sitemap: son destinos de QR, no contenido.
  // Cuando se publique, Google solo debe ver las 7 paginas.
  integrations: [
    react(),
    sitemap({
      filter: (page) => !/\/ir\//.test(page) && !/404/.test(page),
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  build: {
    inlineStylesheets: 'auto',
  },

  adapter: cloudflare(),
});