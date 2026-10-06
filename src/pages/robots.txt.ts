// robots.txt — S1-D-01.2
//
// Se genera como endpoint y no como archivo estatico en public/ por una razon concreta:
// la linea `Sitemap:` necesita la URL ABSOLUTA del sitio, y esa vive en astro.config.mjs
// (`site`). Un robots.txt escrito a mano en public/ se queda viejo en cuanto cambia el
// dominio (B-02) y nadie se acuerda de actualizarlo.
//
// DECISION IMPORTANTE — por que NO se bloquea el rastreo mientras el sitio no este publicado:
// con `publicado: false` cada pagina ya sale con <meta name="robots" content="noindex">
// (ver src/layouts/Base.astro). Un `Disallow: /` en robots.txt impediria al buscador LEER esa
// etiqueta: un sitio bloqueado puede quedarse indexado con su URL y sin poder quitarse, y
// nunca se leeria el noindex. La combinacion correcta antes de publicar es permitir el
// rastreo + noindex en el HTML. El interruptor es SITIO.publicado, no este archivo.
//
// Uso: pnpm build  ->  dist/robots.txt

import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  // `import.meta.env.SITE` lo inyecta Astro desde `site` de astro.config.mjs.
  const sitio = import.meta.env.SITE ?? '';
  const sitemap = sitio ? `Sitemap: ${new URL('sitemap-index.xml', sitio).href}` : null;

  const lineas = [
    'User-agent: *',
    'Allow: /',
    // Sin Disallow: mientras no se publique manda el noindex del HTML, no el bloqueo (ver cabecera).
    ...(sitemap ? [sitemap] : []),
    '',
  ];

  return new Response(lineas.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
