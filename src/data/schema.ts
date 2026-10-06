// Datos estructurados LocalBusiness (schema.org) — S1-D-04.9
//
// Vive aqui y no dentro del layout por dos razones: se puede leer sin renderizar, y se
// puede auditar. Todo lo que se emite sale de una fuente del proyecto; lo que no esta
// confirmado NO se emite, y se deja escrito por que.
//
// LO QUE NO SE EMITE Y POR QUE (esta es la parte que importa):
//  - `openingHours` (horario): B-03 sigue abierto. docs/11 item 14 dice L-V 9-18 h pero
//    el operador no lo ha confirmado. Publicar un horario sin confirmar es exactamente el
//    tipo de dato inventado que este proyecto no hace. Se agrega en cuanto el operador
//    lo confirme: es una linea mas en `horario` de SITIO.
//  - `aggregateRating` / `reviewCount`: NO se emiten aunque exista el enlace de resenas.
//    Unavaloracion inventada rompe las directrices de datos estructurados de Google y
//    puede costar la visibilidad del perfil. El enlace a las resenas si se emite.
//  - `geo` (coordenadas): no hay coordenadas verificadas de la base. No se inventan.
//  - `priceRange`: el cliente no lo publico. No se inventa un rango.
//
// El tipo es `LocalBusiness` y no un subtipo mas estrecho a proposito: schema.org no tiene
// un tipo para "taller de maquinaria pesada" y un subtipo de automoviles (AutoRepair)
// seria incorrecto. Anadir `knowsAbout` describe lo que hacen sin mentir sobre el tipo.

import { SITIO } from './navegacion';
import cobertura from './cobertura.json';
import servicios from './servicios.json';

/** URL absoluta a partir de la ruta interna. Devuelve null si aun no hay `site` (B-02). */
function absoluta(sitio: URL | undefined, ruta: string): string | undefined {
  return sitio ? new URL(ruta, sitio).href : undefined;
}

/**
 * Objeto LocalBusiness. `sitio` es el valor de `site` de astro.config.mjs.
 * Se serializa en el layout con JSON.stringify y `</` escapado.
 */
export function datosEstructurados(sitio: URL | undefined) {
  const { calle, cp, municipio, estado } = SITIO.direccion;
  // Telefono en formato E.164, que es el que pide schema.org. El numero verificado es
  // 348 100 9869 (B-01) y wa.me ya lo usa como 523481009869.
  const telefonoE164 = `+${SITIO.whatsapp.numero}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: SITIO.nombre,
    legalName: SITIO.razonSocial,
    ...(absoluta(sitio, '/') ? { url: absoluta(sitio, '/') } : {}),
    telephone: telefonoE164,
    address: {
      '@type': 'PostalAddress',
      streetAddress: calle,
      addressLocality: municipio,
      addressRegion: estado,
      postalCode: cp,
      addressCountry: 'MX',
    },
    // Los 6 municipios de V-015. Los dos que quedaron fuera (San Julian, San Miguel el
    // Alto) NO aparecen: esta es la misma lista que publica la 03 Cobertura de la landing.
    areaServed: cobertura.municipios.map((m) => ({ '@type': 'Place', name: `${m.nombre}, Jalisco` })),
    // Las 6 lineas de servicio, leidas del mismo JSON que la pagina: no se duplican a mano.
    makesOffer: servicios.principales.map((s) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: s.titulo },
    })),
    knowsAbout: servicios.principales.map((s) => s.titulo),
    ...(absoluta(sitio, '/marca/logo-color-176.png')
      ? { logo: absoluta(sitio, '/marca/logo-color-176.png') }
      : {}),
    // Enlace verificado el 2026-09-29 (responde 200 y resuelve al place ID de Google Business).
    sameAs: [SITIO.resenas.url],
  };
}

/** Serializa a JSON listo para <script type="application/ld+json">.
 *  `</` se escapa como `<\/` porque un `</script>` dentro del JSON cerraria la etiqueta
 *  antes de tiempo. No es paranoia: es lo que evita que un texto con "</script>" rompa la pagina. */
export function jsonLd(datos: unknown): string {
  return JSON.stringify(datos).replace(/</g, '\\u003c');
}
