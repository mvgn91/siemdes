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

## Deploy (Cloudflare Pages)

- Proyecto: `siemdes` → `https://siemdes.pages.dev` (+ dominio `siemdes.mx`).
- Framework: Astro. Build: `pnpm build`. Salida: `dist`. Node 22.
- El sitio sale con `noindex` hasta el corte a producción.
