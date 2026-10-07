// Modelo de contenido del micrositio — S1-D-02.1 (docs/15)
//
// Regla de oro heredada del blackboard: NINGUN dato se publica sin fuente.
// Cada bloque de copy declara de donde sale (docs/NN, C### del CSV del cliente o V-### de
// docs/06). El validador (scripts/validar-contenido.ts) corre antes del build y lo exige,
// asi que un texto sin respaldo rompe el build en vez de llegar al sitio.
//
// Los esquemas tambien codifican decisiones ya cerradas del proyecto: los 3 pasos del
// diagnostico (C45, no los 6 del MASTER que siguen sin validar) y las 8 marcas del
// diagnostico computarizado (C43). Si alguien mete un noveno paso o una novena marca,
// el build falla: se revisa la decision, no se ignora el aviso.

import { z } from 'zod';

/** Cita valida: documento del proyecto (docs/NN), dato del CSV del cliente (C###) o validacion (V-###). */
const CITA = /(docs\/\d{2}|C\d{1,3}|V-\d{3})/;

export const fuenteSchema = z
  .string()
  .min(4)
  .refine((v) => CITA.test(v), {
    message: 'La fuente debe citar docs/NN, C### o V-###',
  });

export const metaSchema = z.object({
  /** 15-60 caracteres. El maximo de 60 no es capricho: medido, es donde el buscador
   *  empieza a cortar el titulo. Antes permitsa 70 y el titulo de Inicio medía 67, que
   *  se publicaba truncado. Ahora el build lo impide (S1-D-02.9). */
  titulo: z.string().min(15).max(60),
  /** 60-160. Por encima de ~160 caracteres el buscador corta la descripcion a mitad de
   *  frase. Se midio el HTML real, no se copio el numero de un blog: la de Experiencia
   *  llegaba a 164. */
  descripcion: z.string().min(60).max(160),
  fuente: fuenteSchema,
});

export const bloqueSchema = z.object({
  titulo: z.string().min(3).max(60),
  texto: z.string().min(25).max(300),
  fuente: fuenteSchema,
});

/**
 * Bloque de seccion SOLO con el encabezado, sin entradilla (R05.27, orden del operador
 * 2026-10-05: "elimina esta frase del sitio, no la quiero"). La entradilla de la 04
 * Experience ("Oficio de mina y taller para diagnostico y reparacion") salio del sitio, asi
 * que el tipo tiene que admitir una seccion que no lo lleva — y no un `texto: ''`, que
 * publicaria un parrafo vacio. El esquema lo refleja para que el build no pueda volver a
 * colar copy sin que se note.
 */
export const bloqueCabeceraSchema = z.object({
  titulo: z.string().min(3).max(60),
  fuente: fuenteSchema,
});

const equiposPorGrupo = z.object({
  id: z.string().min(2),
  nombre: z.string().min(3).max(50),
  equipos: z.array(z.string().min(3)).min(1),
  fuente: fuenteSchema,
});

// ─────────────────────────── Inicio (S1-D-02.2) ───────────────────────────

export const inicioSchema = z.object({
  meta: metaSchema,
  hero: z.object({
    titular: z.string().min(20).max(90),
    /** Segunda linea del titular, en ambar (orden del operador 2026-10-01). Va separada del
     *  titular para poder pintarla distinto: sigue siendo copy con fuente, no estilo suelto. */
    titularAcento: z.string().min(6).max(90),
    ctaPrimario: z.string().min(6).max(40),
    /** Slide de fondo del hero (orden del operador 2026-10-01): assets PROPIOS del cliente
     *  (MEDIA/ASSETS WEBSITE), no stock ni ilustrativas. Son fondo decorativo detras del H1,
     *  por eso se publican con alt="" + aria-hidden: el significado lo lleva el titular. */
    imagenes: z
      .array(
        z.object({
          src: z.string().min(10).max(300),
          fuente: fuenteSchema,
        }),
      )
      .min(2)
      .max(4),
    fuente: fuenteSchema,
  }),
  /** Propuesta y noPromesas salieron de Inicio en el rediseno (docs/28 §1.6).
   *  (Nota 2026-10-03: proceso y fronteras, donde vivia ese contenido en Servicios,
   *  tambien salieron por orden del operador. Se eliminan del esquema para que
   *  el censo no los pida; no se conservan como llaves muertas. */
  cifras: z
    .array(
      z.object({
        valor: z.string().min(1).max(4),
        etiqueta: z.string().min(6).max(50),
        fuente: fuenteSchema,
      }),
    )
    .min(3)
    .max(4),
  // El bloque `cintillo` salio del esquema de Inicio el 2026-10-01: la franja MUESTRA las
  // marcas, no las presenta (sin titulo de seccion, sin nota, sin CTA) y no necesita copy
  // propio. El archivo de cada logo vive ahora en marcas.json `logos`, que es donde estan
  // las 22 marcas de verdad; aqui no queda nada que censar. Precedente: propuesta/noPromesas.
  // El `cierre` salio en R03 Fase D (2026-10-01): duplicaba a Contacto directo palabra por
  // palabra. Las 6 internas conservan el suyo (bloqueSchema).
  /* Resumen ELIMINADO R05.8 (Revisión 2 R1/R5): la 01 absorbe el catálogo completo;
   * el resumen duplicaba sus conceptos. Precedente: `cierre` (R03), `evidencia` (R05.5). */
  /** Galeria visual de maquinaria (docs/28 §1.6): foto como protagonista; sin foto real
   *  (V-011) cada tarjeta es SlotFoto con spec, no stock ni IA.
   *  R05.39 (orden del operador 2026-10-05: fuera TODAS las entradillas): sin `texto`;
   *  el encabezado pasa directo a la galeria, como la 01 en R05.38 y la 04 en R05.27. */
  maquinariaGaleria: z.object({
    titulo: z.string().min(6).max(60),
    /** R04.18 (2026-10-05): eje unico. Cada imagen se ancla por `id` al `id` del grupo
     *  homonimo de marcas.json/maquinaria.json; las categorias sin foto (Plataformas y
     *  Motores) se pintan sin imagen, con el mismo patron. Se llama `id` (no `categoria`)
     *  porque `id` es clave tecnica en el mapa: `categoria` se censaria como copy. */
    imagenes: z
      .array(
        z.object({
          id: z.string().min(3).max(20),
          /** Foto ilustrativa identificada (D-2, docs/30): URL + alt + credito con fuente. */
          imagen: z.object({
            src: z.string().min(20).max(300),
            alt: z.string().min(10).max(140),
            credito: z.string().min(10).max(120),
            ancho: z.number().int().min(100),
            alto: z.number().int().min(100),
            fuente: fuenteSchema,
          }),
        }),
      )
      .min(1)
      .max(5),
    fuente: fuenteSchema,
  }),
  /** Bloque oscuro de experiencia: SOLO rejilla de cifras (guía definitiva docs/30
   *  bloque 5: filete + H2 + rejilla, sin texto lateral ni CTA en el bloque). El `cta`
   *  sigue viviendo aquí con fuente y lo usa el botón de Evidencia; el `texto` de apoyo
   *  salió con la reforma y se elimina del esquema para que el censo no lo pida
   *  (precedente: propuesta/noPromesas, docs/28 §1.6). */
  /* R05.5: el `cta` ("Conocer nuestra experiencia") vivía en la 03 eliminada;
   * sale con ella para no dejar copy muerto (lo delata `pnpm mapa`). */
  experienciaResumen: z.object({
    titulo: z.string().min(6).max(60),
    fuente: fuenteSchema,
  }),
  /* Evidencia ELIMINADA R05.5 (D-C desaparición total, Revisión 2 R3). */
});

// ───────────────────────── Servicios (S1-D-02.3) ─────────────────────────

export const serviciosSchema = z.object({
  /* R05.12: sin `meta` (era el title/description de la página retirada). */
  /* R05.38 (orden del operador 2026-10-05: fuera la sublinea "Siete líneas de servicio,
     incluido el taller, sin límite de marca ni modelo"): la introduccion ya NO lleva
     `texto` — mismo precedente que R05.27 en Experiencia. */
  introduccion: bloqueCabeceraSchema,
  /** Las 5 primeras son el top 5 aprobado en V-004 (docs/06) y su orden no se altera.
   *  La 6a es la linea de equipos de elevacion que el operador agrego el 2026-09-29
   *  (V-014) para que el descriptor ESTRUCTURA · ELEVACIÓN · MAQUINARIA · DIÉSEL tenga
   *  respaldo visible en esta pagina. Ni 4 ni 7: el minimo protege V-004 y el maximo
   *  protege la decision del operador. */
  principales: z
    .array(
      z.object({
        id: z.string().min(3),
        titulo: z.string().min(6).max(60),
        texto: z.string().min(60).max(320),
        incluye: z.array(z.string().min(6)).min(2).max(5),
        fuente: fuenteSchema,
      }),
    )
    .min(5)
    .max(6),
  secundarios: z.object({
    titulo: z.string().min(6).max(60),
    texto: z.string().min(40).max(260),
    trabajos: z.array(z.string().min(4)).min(5),
    fuente: fuenteSchema,
  }),
  /** C45 confirmaba 3 pasos; el MASTER proponia 6 y seguian sin validar. El bloque salio
   *  el 2026-10-03 por orden del operador (resultados, no proceso): fuera de Servicios y de
   *  Experiencia. No se conserva como llave muerta. Precedente: propuesta/noPromesas, cierre. */
  /** Fronteras salio el 2026-10-03 por orden del operador (disclaimer fuera de
   *  Servicios): fuera render, JSON y esquema. No se conserva como llave muerta.
   *  Precedente: propuesta/noPromesas, cierre, proceso. */
  /* Cierre ELIMINADO R05.19 (orden del operador: sin CTAs entre secciones). */
});

// ──────────────────────── Maquinaria (S1-D-02.4) ────────────────────────
// R04.14 (D-A): la pagina se retira y el catalogo vive ensanchado en Inicio, que lee
// este JSON como fuente unica (precedente: Experiencia lee el proceso de servicios.json).
// Sin pagina no hay <head> que lleve `meta`: sale del esquema para que el censo no lo
// pida (precedente: propuesta/noPromesas, docs/28 §1.6).
export const maquinariaSchema = z.object({
  /** R04.18 (2026-10-05): un solo eje. Los `grupos` ya no agrupan por uso sino por la
   *  clasificacion del cliente (docs/05 C21), con los mismos `id` que marcas.json. Asi
   *  Inicio cruza tipos y marcas por `id` en un unico `.map()`, sin indices magicos. */
  grupos: z.array(equiposPorGrupo).min(4),
  /**
   * Equipos que el cliente marco como NO atendidos. No se publican ni se excluyen
   * en el sitio (V-006 pide lenguaje generico sin exclusiones), pero la decision
   * queda escrita aqui para que no se re-descubra.
   */
  noPublicado: z.array(
    z.object({
      equipo: z.string().min(3),
      motivo: z.string().min(20),
      fuente: fuenteSchema,
    }),
  ),
  donde: z.object({
    titulo: z.string().min(6).max(60),
    modalidades: z.array(bloqueSchema).min(2).max(3),
    fuente: fuenteSchema,
  }),
  /* Cierre ELIMINADO R05.19 (orden del operador: sin CTAs entre secciones). */
});

// ─────────────────────────── Marcas (S1-D-02.5) ───────────────────────────
// D-E (2026-10-05): la pagina se retira y las marcas viven en la banda 02b de Inicio.
// Este JSON es su fuente unica (los `logos` siguen alimentando el cintillo). Sin pagina
// no hay <head> que lleve `meta`, ni buscador (la isla se retira con su copy), ni cierre
// propio (se fusiona en el de Maquinaria), ni `modelos` (duplicaba los de maquinaria.json).
// Salen del esquema para que el censo no los pida (precedente: propuesta/noPromesas).
export const marcasSchema = z.object({
  /** Titulo SIN subtitulo (orden del operador 2026-10-05: el explicar "referencia rapida /
   *  no limita el alcance" se veia pesimo). El propio titulo ya dice que son referencias. */
  introduccion: z.object({
    titulo: z.string().min(6).max(60),
    fuente: fuenteSchema,
  }),
  grupos: z
    .array(
      z.object({
        id: z.string().min(3),
        nombre: z.string().min(6).max(60),
        marcas: z.array(z.string().min(3)).min(2),
        fuente: fuenteSchema,
      }),
    )
    .length(5),
  /** Archivo del logo de cada marca que lo tiene. Hoy son las 22: `sinLogo` quedo VACIO el
   *  2026-10-01, cuando P&H salio del catalogo por no tener fuente autoritativa de su logo.
   *  Alta 2026-10-01: 17 logos de Brandfetch, 1 textlogo de dominio publico (Komatsu) y 4
   *  descargados del sitio oficial del fabricante (Grove, Mitsubishi, Yale, Thermo King),
   *  todos con la variante MEDIDA legible sobre blanco — la franja es clara y el tema
   *  "light" de Brandfetch es tinta clara: se descarta por luminancia, no por opinion.
   *
   *  `id` es el nombre canonico de la marca (docs/05 C21) y hace de clave contra `grupos`;
   *  por eso se llama `id` y no `nombre`: no es copy de esta pagina, es el identificador
   *  con el que el resto de los datos del proyecto se refieren a la misma marca. */
  logos: z
    .array(
      z.object({
        id: z.string().min(3).max(20),
        archivo: z.string().min(4).max(60),
        /** Dominio o host de donde salio el archivo: deja la procedencia comprobable. */
        perfil: z.string().min(4).max(60),
        fuente: fuenteSchema,
      }),
    )
    .min(10),
  /** Marcas SIN logo, con el motivo escrito. Una marca que no tiene archivo no se inventa
   *  con un wordmark dibujado a mano ni se sustituye por el logo de otra: se queda en
   *  texto y aqui queda escrito por que.
   *
   *  La clave se llama `sinLogo` y NO `pendientes` a proposito (2026-10-01): `pendientes` ya
   *  significa en este proyecto "existe escrito y no se publica" (regla 8 de la guardia, que
   *  avisa si eso aparece en el HTML). Estas marcas SI se publican, solo sin archivo. Con la
   *  clave equivocada la guardia avisaba de una fuga donde no la hay, y el aviso se
   *  descartaba a mano una vez por publicacion — que es como una regla de seguridad aprende
   *  a ser decoracion.
   *
   *  SIN `.min(1)` desde el 2026-10-01: la lista puede quedar VACIA cuando todas las marcas
   *  del catalogo tienen logo (fue al retirar P&H). Vacia significa "ninguna marca quedo sin
   *  archivo", no "no se reviso": el validador sigue exigiendo que toda marca de `grupos`
   *  este en `logos` o traiga aqui su motivo. */
  sinLogo: z.array(
    z.object({
      marca: z.string().min(3).max(20),
      motivo: z.string().min(40).max(300),
      fuente: fuenteSchema,
    }),
  ),
  /** C43: ocho marcas entran al escaner. Ni una mas sin validar. La tarjeta ya no
   *  publica la cuenta (orden del operador 2026-10-05): dice "diagnostico computarizado",
   *  sin "8 marcas". La lista de 8 se conserva: es la que cruza la guardia (regla 11). */
  diagnosticoComputarizado: z.object({
    titulo: z.string().min(6).max(60),
    texto: z.string().min(25).max(220),
    marcas: z.array(z.string().min(3)).length(8),
    fuente: fuenteSchema,
  }),
  // R03 Fase D: "Motores y sistemas" se fusionó en "Modelos". Solo queda la lista
  // de marcas de motor (el bloque muestra el dato, no lo presenta dos veces).
  motoresSistemas: z.object({
    marcas: z.array(z.string().min(3)).min(1),
    fuente: fuenteSchema,
  }),
});

// ────────────────────────── Cobertura (S1-D-02.6) ──────────────────────────

export const coberturaSchema = z.object({
  /* R05.12: sin `meta` (era el title/description de la página retirada). */
  /* R05.39 (orden del operador 2026-10-05: fuera TODAS las entradillas): la introduccion
     ya NO lleva `texto` — mismo precedente que R05.38 (01) y R05.27 (04). */
  introduccion: bloqueCabeceraSchema,
  // `base` salio en R05.30 (orden del operador 2026-10-05) con la tarjeta "Base de
  // operaciones" de la 05. El domicilio se publica en un solo lugar: el pie (data-nap)
  // y el JSON-LD de Base.astro. El mapa de la 03 lo localiza sin repetir el texto.
  /** Mapa Google de la base (R05.17, orden del operador 2026-10-05). R05.18: sin
   *  `nota` (descripción innecesaria, orden del operador). */
  mapa: z.object({
    cta: z.string().min(6).max(40),
    fuente: fuenteSchema,
  }),
  /** Los 6 municipios de V-015: la base mas los 5 que la acompanan. */
  municipios: z
    .array(
      z.object({
        nombre: z.string().min(4),
        esBase: z.boolean(),
        fuente: fuenteSchema,
      }),
    )
    .length(6),
  /** Municipios que estaban en C6 y quedaron fuera por decision del operador. */
  noPublicado: z
    .array(
      z.object({
        municipio: z.string().min(4),
        motivo: z.string().min(20),
        fuente: fuenteSchema,
      }),
    )
    .min(1),
  /* Cierre ELIMINADO R05.19 (orden del operador: sin CTAs entre secciones). */
});

// ─────────────────────── Experiencia (S1-D-02.7) ───────────────────────

/**
 * Sin casos autorizados (V-011) la seccion muestra el PROCESO, nunca casos inventados
 * (ADR-S05 / RF-07). El proceso en si no se duplica aqui: la pagina lo lee de
 * servicios.json, que es su unica fuente.
 */
export const experienciaSchema = z.object({
  /* R05.12: sin `meta` (era el title/description de la página retirada). */
  /* R05.27: la introduccion ya NO lleva `texto` (lo pidio quitar el operador). */
  introduccion: bloqueCabeceraSchema,
  capacidades: z
    .array(
      z.object({
        titulo: z.string().min(3).max(50),
        texto: z.string().min(25).max(240),
        fuente: fuenteSchema,
      }),
    )
    .min(3)
    .max(4),
  /* `porqueLlegan` y `casosReservados` ELIMINADOS R05.20 (orden del operador:
   * copy de revisión, tono serio sin explicaciones de más). */
  /* Cierre ELIMINADO R05.19 (orden del operador: sin CTAs entre secciones). */
});

// ──────────────────────── Contacto (S1-D-02.8) ────────────────────────

export const contactoSchema = z.object({
  /* R05.12: sin `meta` (era el title/description de la página retirada).
     R05.39 (orden del operador 2026-10-05: fuera TODAS las entradillas): sin
     `introduccion` entera — el h2 "Contacto directo" esta hardcodeado y nada mas la
     usaba; conservar su titulo seria copy muerto (precedente R05.5/R05.27/R05.38). */
  canales: z
    .array(
      z.object({
        /** La pagina decide el enlace a partir del id; el JSON no guarda URLs. */
        id: z.enum(['whatsapp', 'llamada', 'resenas']),
        nombre: z.string().min(4).max(40),
        texto: z.string().min(30).max(240),
        cta: z.string().min(6).max(40),
        fuente: fuenteSchema,
      }),
    )
    .min(2)
    .max(3),
  /** Las 3 solicitudes de C102-C108. Son exactamente 3: diagnostico, visita y cotizacion.
   *  R05.30: sin `etiqueta` — la usaba solo la isla "Armar el mensaje" para los chips, y con
   *  ella se fue. El nombre de cada tipo ya lo publica /ir/* en su propio H1 ("Solicitar
   *  visita"), asi que las etiquetas serian el mismo dato dicho dos veces. */
  solicitudes: z
    .array(
      z.object({
        id: z.enum(['diagnostico', 'visita', 'cotizacion']),
        mensaje: z.string().min(20).max(200),
        fuente: fuenteSchema,
      }),
    )
    .length(3),
  // `formulario` salio en R05.30 (orden del operador 2026-10-05): los textos de la isla
  // "Armar el mensaje" se borraron con ella. `solicitudes` NO se tocan: las usan las
  // redirecciones /ir/*, que siguen prellenando el mensaje de WhatsApp.
  // `queEnviar` salio en R03 Fase D (2026-10-01): el formulario dice los mismos
  // 4 datos; manda el formulario. Lo retirado vive en docs/31 D-1.
  /**
   * Lo que NO se publica todavia, dicho en voz alta: horario (V-008), aviso de privacidad
   * (B-05) y la llamada como via secundaria (V-009 exige horario definido). Ninguno se
   * inventa para "completar" la pagina.
   */
  pendientes: z
    .array(
      z.object({
        dato: z.string().min(4),
        motivo: z.string().min(20),
        fuente: fuenteSchema,
      }),
    )
    .min(1),
});

// ─────────────────────── Reels / trabajo real (docs/35) ───────────────────────
/** Banda de reels verticales entre la 02 Maquinaria y la 03 Cobertura (orden del operador
 *  2026-10-06, docs/35 §3.4). NO es una de las 5 secciones del indice (D-F): va SIN numeral,
 *  como la banda de cifras. Los 4 casos son trabajo real de Alfredo, publicados con la
 *  autorizacion del operador (V-011) del 2026-10-06, y el audio quedo autorizado (docs/35
 *  §6.3). El video se autohospeda en `public/video` y lo sirve el CDN de Pages.
 *
 *  `marca` y `equipo` son los mismos rotulos que usa el workstream REELS para cada caso
 *  ('Retroexcavadora 420D', 'Sprinter Mercedes-Benz', 'Montacargas Toyota', 'Motor Cummins
 *  8.3'): la banda no inventa nombres de equipo, cita los del caso fuente.
 *
 *  La marca de la Sprinter (Mercedes-Benz) NO esta en el catalogo de 22 marcas atendidas;
 *  entra por decision del operador y queda anotada aqui y en docs/35 §9. */
export const reelsSchema = z.object({
  /** Titulo de la banda. Sobrio y parejo con los demas (R05.18): no lleva entradilla,
   *  como todas las secciones desde R05.39. */
  titulo: z.string().min(3).max(60),
  casos: z
    .array(
      z.object({
        id: z.string().min(3).max(30),
        marca: z.string().min(2).max(30),
        equipo: z.string().min(3).max(40),
        /** Ruta servida por Pages (mismo origen). La existencia del archivo NO la comprueba
         *  el esquema sino `validar-contenido.ts`, con el mismo criterio que los logos: un
         *  `src` roto es un hueco en blanco y nadie se entera hasta abrir la pagina. */
        video: z.string().min(10).max(120),
        poster: z.string().min(10).max(120),
        fuente: fuenteSchema,
      }),
    )
    .min(1)
    .max(6),
  fuente: fuenteSchema,
});

/** Registro unico: archivo JSON -> esquema. Lo consume el validador y, mas adelante, las paginas. */
export const CONTENIDO = {
  'src/data/inicio.json': inicioSchema,
  'src/data/servicios.json': serviciosSchema,
  'src/data/maquinaria.json': maquinariaSchema,
  'src/data/marcas.json': marcasSchema,
  'src/data/cobertura.json': coberturaSchema,
  'src/data/experiencia.json': experienciaSchema,
  'src/data/contacto.json': contactoSchema,
  'src/data/reels.json': reelsSchema,
} as const;

export type Inicio = z.infer<typeof inicioSchema>;
export type Servicios = z.infer<typeof serviciosSchema>;
export type Maquinaria = z.infer<typeof maquinariaSchema>;
export type Marcas = z.infer<typeof marcasSchema>;
export type Cobertura = z.infer<typeof coberturaSchema>;
export type Experiencia = z.infer<typeof experienciaSchema>;
export type Contacto = z.infer<typeof contactoSchema>;
export type Reels = z.infer<typeof reelsSchema>;
