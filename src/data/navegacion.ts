// Identidad y navegacion del sitio — S1-D-01.1 (docs/15 seccion 3)
// Los datos de identidad NO son contenido editable: vienen fijados por
// docs/06 (V-002 razon social, V-013 sigla) y docs/14 seccion 1 (kit de marca).

export const SITIO = {
  /** Sigla comercial autorizada (V-013, confirmada 2026-09-29). Nunca "SIEMES" (L4). */
  nombre: 'SIEMDES',
  /** Razon social LITERAL: mayusculas, sin acentos, sin siglas (L6, docs/14 1.1). */
  razonSocial:
    'SERVICIOS INTEGRALES DE ELEVACION Y MAQUINARIA PESADA DEL ESPIRITU SANTO',
  /** Descriptor de apoyo: lista de lineas de servicio, NO parte del nombre (L7). */
  descriptor: 'ESTRUCTURA · ELEVACIÓN · MAQUINARIA · DIÉSEL',

  /** NAP (nombre-direccion-telefono): los TRES deben coincidir con Google Business y redes.
   *  Direccion confirmada por el operador 2026-09-29 (= board FRENTE de la tarjeta).
   *  Escritura correcta: Heliodoro Hernández Loza (docs/12 traia "Heredoro Hernandez Loza"). */
  direccion: {
    calle: 'C. de Heliodoro Hernández Loza 462',
    cp: '47180',
    municipio: 'Arandas',
    estado: 'Jal.',
    fuente: 'operador 2026-09-29 · docs/13 board FRENTE · docs/05 C6',
  },
  municipioBase: 'Arandas, Jalisco',

  /** B-01 CERRADO (operador 2026-09-29): el numero es 348 100 9869, 10 digitos.
   *  El "1" de docs/11 item 13 (+52 1 348 100 9869) es formato legacy y NO va en wa.me.
   *  docs/06 V-009: WhatsApp es la via visible; la llamada al MISMO numero es secundaria. */
  whatsapp: {
    numero: '523481009869',
    numeroLocal: '348 100 9869',
    fuente: 'operador 2026-09-29 · docs/11 item 6 · docs/06 V-009',
  },

  /** Interruptor de publicacion: mientras siga en false, todas las paginas salen con
   *  <meta name="robots" content="noindex">. Se enciende en S1-D-06.4, cuando el sitio
   *  este revisado y el dominio definido (B-02). Evita que un deploy de vista previa
   *  se indexe en Google y compita con el perfil de Google Business. */
  publicado: false,

  /** Enlace de resenas de Google. Verificado 2026-09-29: responde 200 y resuelve al
   *  place ID 0x84294b390bc89357:0xcf89ab97df4a05fe, o sea el perfil SI existe. */
  resenas: {
    url: 'https://g.page/r/Cf4FSt-Xq4nPEBM/review',
    placeId: '0x84294b390bc89357:0xcf89ab97df4a05fe',
    verificado: '2026-09-29 — HTTP 200, redirige a google.com/maps/place con ese place ID',
  },

  /** Redes sociales (R05.34, orden del operador 2026-10-05, con sus URLs). Coinciden con
   *  docs/11 items 1-2 (@siemdes ✔ en ambas). Viven aqui y no en un JSON porque son
   *  identidad (como el WhatsApp y las resenas), no copy con fuente editable. */
  sociales: {
    facebook: 'https://www.facebook.com/siemdes.mx',
    instagram: 'https://www.instagram.com/siemdes.mx/',
    handle: '@siemdes.mx',
    fuente: 'operador 2026-10-05 · docs/11 items 1-2',
  },

  /** Mapa de la base (R05.17, orden del operador 2026-10-05). El link corto entrega
   *  el negocio real: SIEMDES en 20.6970067,-102.3553705, con el MISMO place ID del
   *  perfil de reseñas de arriba. El embed `output=embed` no pide API key y funciona
   *  sin JS. Nota de privacidad: Google fija cookies al cargar el iframe; el sitio
   *  sigue sin publicar (noindex) y el aviso va con B-05. */
  mapas: {
    // R05.33 (orden del operador 2026-10-05): su link corto sustituye al anterior. Verificado
    // por redirect: resuelve al MISMO negocio (SIEMDES 20.6970067,-102.3553705, place ID
    // 0x84294b390bc89357:0xcf89ab97df4a05fe, el de resenas.placeId). Fuente unica: de aqui
    // beben el CTA "Abrir en Google Maps" de la 03 y el domicilio del pie.
    negocio: 'https://maps.app.goo.gl/BPBgqCddAMkV1UJD7',
    embed:
      'https://www.google.com/maps?q=SIEMDES,+C.+de+Heliodoro+Hernandez+Loza+462,+47180+Arandas,+Jalisco&output=embed',
    fuente:
      'operador 2026-10-05 (resuelve a SIEMDES 20.6970067,-102.3553705; place ID coincide con resenas.placeId)',
  },
} as const;

export type RutaNavegacion = {
  ruta: string;
  etiqueta: string;
  /** La razon social no se abrevia ni se cambia; solo cambia el rotulo del menu. */
  enMenu: boolean;
};

export const NAVEGACION: RutaNavegacion[] = [
  { ruta: '/', etiqueta: 'Inicio', enMenu: true },
  // R05.12 (D-D, landing única): el sitio es UNA página; el nav va a sus secciones.
  // El scroll-spy (`src/scripts/seccion-activa.ts`) marca la visible; sin JS los
  // anchors saltan igual. Las páginas viejas redirigen en `public/_redirects`.
  { ruta: '/#servicios', etiqueta: 'Servicios', enMenu: true },
  // R05.29 (orden del operador 2026-10-05): "maquinaria debe ir en el menu". Entra en el
  // orden de las secciones del indice (02), no al final: el menu es el indice del sitio
  // (R05.28), asi que su orden es el de los numerales de la landing, no el de la epoca en
  // que cada seccion se escribio. Con esto las seis secciones tienen item y el scroll-spy
  // puede marcar tambien la 02.
  { ruta: '/#maquinaria', etiqueta: 'Maquinaria', enMenu: true },
  { ruta: '/#cobertura', etiqueta: 'Cobertura', enMenu: true },
  { ruta: '/#experiencia', etiqueta: 'Experiencia', enMenu: true },
  { ruta: '/#contacto', etiqueta: 'Contacto', enMenu: true },
];
