# SIEMDES — sitio

Landing del taller: elevación, maquinaria pesada y diésel en Arandas, Jalisco.

Astro 7 + Tailwind 4 + React (islas puntuales). Sin backend: el contacto es
WhatsApp directo y redirecciones `/ir/*`.

## Desarrollo

```bash
pnpm install
pnpm dev        # :4321
pnpm build      # valida contenido + Astro + guardia de marca
pnpm check      # tipos (astro check)
pnpm mapa       # regenera el mapa del sitio (docs, fuera de este repo)
pnpm verificar:guardia  # 26 pruebas negativas de la guardia
```

El `build` falla si el contenido no trae fuente, si el HTML/CSS rompe el kit
de marca o si alguna prueba negativa deja de detectar su defecto.

## Deploy (Cloudflare Workers + Assets)

Adapter `@astrojs/cloudflare`: el build publica en `dist/client/`.

- Proyecto: **`siemdes`** → `https://siemdes.jazzfatale.workers.dev`
  (+ `https://siemdes.pages.dev` y dominio `siemdes.mx` cuando se conecten).
- `pnpm run deploy` = `pnpm run build` + `wrangler deploy`.
- `wrangler.jsonc` vive en el repo (sin secretos); `.wrangler/` no.
- El sitio sale con `noindex` hasta el corte a producción.
