// ─────────────────────────────────────────────────────────────────────────────
// Generador del MAPA COMPLETO DEL SITIO — docs/16_mapa-del-sitio.md
//
// PARA QUE SIRVE
//   Producir un documento unico que contenga TODO lo que hay publicado en el sitio
//   (texto visible, nivel de cada texto, distribucion por pagina, identidad, SEO,
//   datos estructurados y trazabilidad de cada dato a su fuente) para que se pueda
//   auditar SIN ABRIR EL SITIO — por ejemplo pegandolo en un modelo externo.
//
// POR QUE ES UN GENERADOR Y NO UN DOCUMENTO ESCRITO A MANO
//   Un documento escrito a mano se desincroniza del sitio en el primer cambio de copy,
//   y a partir de ahi miente con apariencia de verdad. Este se produce a partir de las
//   DOS fuentes reales:
//     - src/data/*.json  -> el copy con su fuente declarada (esquema zod en esquema.ts)
//     - dist/**/*.html   -> lo que el visitante ve de verdad, en orden de lectura
//   Regenerar: `pnpm mapa` (requiere que exista dist/; si no, corre `pnpm build` antes).
//
// QUE GARANTIZA
//   - El texto visible sale del HTML PUBLICADO, no del fuente: si algo no llega al HTML,
//     no aparece aqui.
//   - Cada hoja de texto del JSON se cruza contra el HTML de todas las paginas. Lo que
//     esta declarado y NO se publica se reporta aparte, no se esconde.
//   - La trazabilidad (clave -> fuente) se recorre del JSON, no se transcribe.
//
// NOTA DE CONVENCION: los comentarios de codigo de este proyecto van sin acentos (asi
// estan los .astro y los .ts); el documento que se emite si los lleva, porque es texto
// para leer.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');
const DIST = resolve(RAIZ, 'dist');
// R05.41 (migración Cloudflare 2026-10-06): el adapter @astrojs/cloudflare publica el
// sitio en dist/client/ (dist/server va vacío). PUB es la raíz publicada real, con
// fallback a dist/ por si el layout cambia.
const PUBREL = existsSync(resolve(DIST, 'client', 'index.html')) ? 'dist/client' : 'dist';
const PUB = resolve(RAIZ, PUBREL);
const SALIDA = resolve(RAIZ, 'docs/16_mapa-del-sitio.md');

// ─────────────────────────── utilidades de lectura ───────────────────────────

const leer = (ruta) => readFileSync(resolve(RAIZ, ruta), 'utf8');

/** JSON del proyecto. Se lee del disco (no con `import`) para que un JSON malformado
 *  falle aqui con su nombre en vez de romper el cargador de modulos. */
function leerJson(ruta) {
  try {
    return JSON.parse(leer(ruta));
  } catch (error) {
    console.error(`No se pudo leer ${ruta}: ${error.message}`);
    process.exit(1);
  }
}

const ENTIDADES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
};

/** Normaliza para COMPARAR (no para mostrar): quita entidades, colapsa espacios y
 *  unifica comillas tipograficas, que Astro emite y el JSON no lleva. */
function normalizar(texto) {
  let s = texto;
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  for (const [entidad, caracter] of Object.entries(ENTIDADES)) {
    s = s.split(entidad).join(caracter);
  }
  s = s.replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"');
  return s.replace(/\s+/g, ' ').trim();
}

/** Texto como se muestra (con acentos, sin tocar) pero con espacios colapsados. */
const mostrar = (texto) => texto.replace(/\s+/g, ' ').trim();

// ─────────────────────── extraccion del HTML publicado ───────────────────────

/** Cuerpo visible de una pagina, linea por linea, en orden de lectura.
 *  Se cortan script/style/svg/head (no son texto para el visitante) y se marca el
 *  final de cada elemento de bloque con un salto, que es lo que da la linea. */
function textoVisible(html) {
  let s = html;
  s = s.replace(/<head[\s\S]*?<\/head>/gi, ' ');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  // UNA SOLA PASADA sobre las etiquetas de bloque: la de cierre corta linea, la de
  // apertura desaparece. Hay que hacerlo en el mismo `replace` y no en dos: en dos, el
  // primero borra los `</p>` y el segundo ya no los encuentra, con lo que los parrafos
  // salen PEGADOS ("16 anosLo que otros..."). Es el defecto que tenia la primera version.
  s = s.replace(
    /<\/?(?:p|div|section|article|header|footer|main|nav|h[1-6]|li|ul|ol|figure|figcaption|blockquote|details|summary|dt|dd|dl|fieldset|legend|label|button|td|th|tr|thead|tbody|caption)\b[^>]*>/gi,
    (etiqueta) => (etiqueta.startsWith('</') ? '\n' : ''),
  );
  s = s.replace(/<br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<hr\b[^>]*>/gi, '\n');
  // Lo que queda son etiquetas en linea (a, span, strong...): se quitan sin cortar linea.
  s = s.replace(/<[^>]+>/g, ' ');

  // Se conserva toda linea que tenga al menos una letra o un digito. El filtro NO puede
  // ser `length > 1`: eso se comia las cifras de un solo caracter ("8" marcas con
  // diagnostico computarizado, "6" municipios) y el dato desaparecia del censo. Lo que se
  // descarta es la linea sin contenido real (un separador, un filete, un signo suelto).
  const lineas = s
    .split('\n')
    .map((linea) => mostrar(normalizar(linea)))
    .filter((linea) => /[\p{L}\p{N}]/u.test(linea));

  // Una misma frase puede salir dos veces si el elemento esta anidado; se conserva el
  // orden pero se evita la repeticion inmediata (que es siempre ruido de anidamiento).
  const salida = [];
  for (const linea of lineas) {
    if (salida.at(-1) !== linea) salida.push(linea);
  }
  return salida;
}

/** Contenido propio de la pagina (dentro de <main>). La cabecera y el pie son IDENTICOS
 *  en todo el sitio y no son contenido de ninguna pagina: se describen una sola vez en la
 *  seccion 3 del documento. Si se incluyeran aqui, el mismo menu se repetiria
 *  en cada pagina y taparia el contenido que de verdad se quiere auditar. */
function cuerpoPrincipal(html) {
  const coincidencia = html.match(/<main[^>]*>([\s\S]*)<\/main>/i);
  return coincidencia ? coincidencia[1] : html;
}

/** Encabezados h1-h6 en orden de documento, con su nivel. */
function encabezados(html) {
  const encontrados = [];
  const patron = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let coincidencia;
  while ((coincidencia = patron.exec(html)) !== null) {
    const sinDecorativos = coincidencia[2].replace(/<span[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/gi, '');
    const texto = mostrar(normalizar(sinDecorativos.replace(/<[^>]+>/g, ' ')));
    encontrados.push({ nivel: Number(coincidencia[1]), texto });
  }
  return encontrados;
}

/** Atributos que llevan texto que el visitante lee o escucha: alt, aria-label,
 *  placeholder y title. No son contenido de copy, pero se auditan. */
function atributosConTexto(html) {
  const salida = { alt: [], 'aria-label': [], placeholder: [], title: [] };
  for (const atributo of Object.keys(salida)) {
    const patron = new RegExp(`${atributo}="([^"]*)"`, 'gi');
    let coincidencia;
    while ((coincidencia = patron.exec(html)) !== null) {
      const valor = mostrar(normalizar(coincidencia[1]));
      if (valor) salida[atributo].push(valor);
    }
  }
  return salida;
}

/** Cabecera de la pagina: lo que ve un buscador y un previsualizador de enlaces. */
function metadatos(html) {
  const uno = (patron) => {
    const coincidencia = html.match(patron);
    return coincidencia ? mostrar(normalizar(coincidencia[1])) : null;
  };
  const ld = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  return {
    titulo: uno(/<title>([\s\S]*?)<\/title>/i),
    descripcion: uno(/<meta name="description" content="([^"]*)"/i),
    canonical: uno(/<link rel="canonical" href="([^"]*)"/i),
    robots: uno(/<meta name="robots" content="([^"]*)"/i),
    ogTitulo: uno(/<meta property="og:title" content="([^"]*)"/i),
    ogDescripcion: uno(/<meta property="og:description" content="([^"]*)"/i),
    ogImagen: uno(/<meta property="og:image" content="([^"]*)"/i),
    ogUrl: uno(/<meta property="og:url" content="([^"]*)"/i),
    twitter: uno(/<meta name="twitter:card" content="([^"]*)"/i),
    ld: ld ? JSON.parse(ld[1].replace(/\\u003c/g, '<')) : null,
  };
}

const palabras = (texto) => (texto.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

// ───────────────────── hojas de texto del JSON con su fuente ─────────────────

/** Claves que NO son copy: son identificadores o valores de control. No llegan a la
 *  pantalla, asi que no se auditan como texto (si se contaran, el censo diria que el sitio
 *  "no publica" cosas como `id: diagnostico`, que es falso: no son texto). */
// `motivo` se sumo el 2026-10-01 con `sinLogo`: es la justificacion interna de por que una
// marca se publica en texto y no con archivo. Es razon, no copy: si no se declarara aqui el
// mapa la reportaria como texto muerto en cada corrida, que es un aviso falso que entrena a
// ignorar el aviso. Mismo caso que `archivo` y `perfil`: son rutas y dominios, no redaccion.
const CLAVES_TECNICAS = new Set(['id', 'tipo', 'solicitud', 'url', 'numero', 'archivo', 'perfil', 'motivo', 'credito']);

/** Claves cuyo contenido esta declarado como NO publicado: su ausencia del HTML es
 *  correcta y no se reporta como posible deriva. */
const CLAVES_NO_PUBLICADAS = ['noPublicado', 'pendientes'];

/** Recorre el JSON y devuelve una hoja por cada texto visible, con la clave que ocupa en
 *  el archivo y la fuente que la respalda. La fuente puede venir del propio objeto o
 *  heredarse del bloque que lo contiene (una lista de marcas comparte la fuente de su grupo). */
function hojas(valor, prefijo = '', fuenteHeredada = null, salida = []) {
  if (typeof valor === 'string') {
    salida.push({ clave: prefijo, texto: valor, fuente: fuenteHeredada });
    return salida;
  }
  if (Array.isArray(valor)) {
    valor.forEach((elemento, indice) => hojas(elemento, `${prefijo}[${indice + 1}]`, fuenteHeredada, salida));
    return salida;
  }
  if (valor && typeof valor === 'object') {
    const fuente = typeof valor.fuente === 'string' ? valor.fuente : fuenteHeredada;
    for (const [clave, contenido] of Object.entries(valor)) {
      if (clave === 'fuente' || CLAVES_TECNICAS.has(clave)) continue;
      hojas(contenido, prefijo ? `${prefijo}.${clave}` : clave, fuente, salida);
    }
  }
  return salida;
}

// ──────────────────────────── configuracion del mapa ────────────────────────────

const ARCHIVOS_JSON = [
  'src/data/inicio.json',
  'src/data/servicios.json',
  'src/data/maquinaria.json',
  'src/data/marcas.json',
  'src/data/cobertura.json',
  'src/data/experiencia.json',
  'src/data/contacto.json',
  'src/data/ir.json',
];

/** Paginas del sitio en orden de menu. `json` es solo para la nota de procedencia
 *  (la comprobacion real se hace cruzando cada texto contra el HTML, no contra esto). */
const PAGINAS = [
  // R05.12 (D-D, landing única): el sitio es UNA página + la 404. Las 4 páginas
  // retiradas redirigen a sus secciones en `public/_redirects`.
  { ruta: '/', archivo: `${PUBREL}/index.html`, nombre: 'Inicio', proposito: 'Landing única: hero + cifras + 5 secciones (servicios, maquinaria, cobertura, experiencia, contacto).' },
  { ruta: '/404', archivo: `${PUBREL}/404.html`, nombre: '404', proposito: 'Error. Sin copy de datos del cliente, solo secciones reales.' },
];

const PAGINAS_IR = [
  { id: 'diagnostico', etiqueta: 'Solicitar diagnóstico' },
  { id: 'visita', etiqueta: 'Solicitar visita' },
  { id: 'cotizacion', etiqueta: 'Solicitar cotización' },
  { id: 'resenas', etiqueta: 'Dejar una reseña en Google' },
];

// ─────────────────────────────── lectura de datos ───────────────────────────────

if (!existsSync(DIST)) {
  console.error('Falta dist/. Corre `pnpm build` antes de generar el mapa: el documento se produce');
  console.error('a partir del HTML PUBLICADO, no del fuente, para que no pueda discrepar del sitio.');
  process.exit(1);
}

const navegacion = leer('src/data/navegacion.ts');
const datos = Object.fromEntries(ARCHIVOS_JSON.map((ruta) => [ruta, leerJson(ruta)]));

/** Constantes de identidad. Se leen del fuente con un extractor simple en vez de
 *  importar el modulo TS: el script tiene que poder correr con `node` a secas. */
function constante(nombre, bloque = navegacion) {
  const patron = new RegExp(`\\b${nombre}:\\s*(?:\\n\\s*)?(['"\`])([\\s\\S]*?)\\1`, 'm');
  const coincidencia = bloque.match(patron);
  return coincidencia ? coincidencia[2] : null;
}
function constanteAnidada(clave, subclave) {
  const bloque = navegacion.match(new RegExp(`\\b${clave}:\\s*\\{([\\s\\S]*?)\\n  \\}`, 'm'));
  return bloque ? constante(subclave, bloque[1]) : null;
}

const SITIO = {
  nombre: constante('nombre'),
  razonSocial: constante('razonSocial'),
  descriptor: constante('descriptor'),
  municipioBase: constante('municipioBase'),
  publicado: /publicado:\s*(true|false)/.exec(navegacion)?.[1] === 'true',
  publicara: /publicado:\s*(true|false)/.exec(navegacion)?.[1],
  calle: constanteAnidada('direccion', 'calle'),
  cp: constanteAnidada('direccion', 'cp'),
  municipio: constanteAnidada('direccion', 'municipio'),
  estado: constanteAnidada('direccion', 'estado'),
  direccionFuente: constanteAnidada('direccion', 'fuente'),
  whatsapp: constanteAnidada('whatsapp', 'numero'),
  whatsappLocal: constanteAnidada('whatsapp', 'numeroLocal'),
  whatsappFuente: constanteAnidada('whatsapp', 'fuente'),
  resenasUrl: constanteAnidada('resenas', 'url'),
  resenasPlaceId: constanteAnidada('resenas', 'placeId'),
};

const PAGINAS_HTML = PAGINAS.map((pagina) => {
  const ruta = resolve(RAIZ, pagina.archivo);
  if (!existsSync(ruta)) {
    console.error(`Falta ${pagina.archivo}. Corre \`pnpm build\` y vuelve a intentarlo.`);
    process.exit(1);
  }
  const html = readFileSync(ruta, 'utf8');
  const cuerpo = cuerpoPrincipal(html);
  const visible = textoVisible(cuerpo);
  return {
    ...pagina,
    html,
    cuerpo,
    visible,
    encabezados: encabezados(cuerpo),
    atributos: atributosConTexto(cuerpo),
    meta: metadatos(html),
    palabras: palabras(visible.join(' ')),
  };
});

// Las 4 paginas de redireccion tambien son parte del sitio y su texto tiene que contar
// para la comprobacion de publicacion.
const AUXILIARES = ['diagnostico', 'visita', 'cotizacion', 'resenas'].map((id) => ({
  ruta: `/ir/${id}/`,
  archivo: `${PUBREL}/ir/${id}/index.html`,
}));

const BLOB = [...PAGINAS_HTML.map((p) => p.html), ...AUXILIARES.map((p) => leer(p.archivo))]
  .map(normalizar)
  .join('\n');

// R05.30 (orden del operador 2026-10-05): al salir la isla "Armar el mensaje", los 3
// mensajes de `contacto.solicitudes` dejaron de imprimirse en la pagina y solo viajan dentro
// del href de WhatsApp de las redirecciones /ir/*: `wa.me/...?text=Hola%2C%20quiero...`.
// El mensaje SI llega al visitante (abre escrito en WhatsApp), pero escrito con %XX: sin
// decodificar, el mapa lo reportaba como copy muerto. Eso seria el aviso falso que el propio
// script califica de peor que no avisar (ver CLAVES_TECNICAS): entrena a ignorar el aviso.
// Se anade la variante DECODIFICADA al BLOB; el texto crudo sigue estando, asi que el chequeo
// no se relaja: lo que no exista en ninguna de las dos formas sigue siendo deriva.
const descodificar = (texto) => {
  try {
    return decodeURIComponent(texto);
  } catch {
    return texto;
  }
};
const BLOB_DECODIFICADO = descodificar(BLOB);
const publicada = (texto) => {
  const normalizado = normalizar(texto);
  return BLOB.includes(normalizado) || BLOB_DECODIFICADO.includes(normalizado);
};

// Archivos de rastreo tal como quedan en el build. Se leen del dist y no se transcriben.
const ARCHIVOS_RASTREO = {
  robots: existsSync(resolve(PUB, 'robots.txt')) ? readFileSync(resolve(PUB, 'robots.txt'), 'utf8') : null,
  sitemap: existsSync(resolve(PUB, 'sitemap-0.xml'))
    ? [...readFileSync(resolve(PUB, 'sitemap-0.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((c) => c[1])
    : [],
};

// Trazabilidad: hojas por archivo y el veredicto de si llegan al HTML.
const HOJAS = ARCHIVOS_JSON.map((ruta) => ({
  ruta,
  hojas: hojas(datos[ruta]).map((hoja) => ({
    ...hoja,
    publicada: publicada(hoja.texto),
    declaradaNoPublicada: CLAVES_NO_PUBLICADAS.some((clave) => hoja.clave.includes(clave)),
  })),
}));

/** Hojas que no llegan al HTML y NO estan declaradas como no publicadas: eso si seria
 *  deriva de verdad (copy escrito que nunca se muestra) y el script lo avisa. */
const DERIVA = HOJAS.flatMap((archivo) =>
  archivo.hojas.filter((hoja) => !hoja.publicada && !hoja.declaradaNoPublicada).map((hoja) => ({ ...hoja, archivo: archivo.ruta })),
);

// ───────────────────────────── armado del documento ─────────────────────────────

const lineas = [];
const w = (...texto) => lineas.push(...texto);
const tabla = (encabezado, filas) => {
  w(`| ${encabezado.join(' | ')} |`);
  w(`|${encabezado.map(() => '---').join('|')}|`);
  for (const fila of filas) w(`| ${fila.join(' | ')} |`);
  w('');
};
const escapar = (texto) => String(texto).replace(/\|/g, '\\|').replace(/\n+/g, ' ');

const FECHA = new Date();
const sello = FECHA.toISOString().slice(0, 16).replace('T', ' ');

w(
  '# Mapa completo del sitio SIEMDES',
  '',
  '**Documento generado. No editar a mano: se regenera con `pnpm mapa`.**',
  '',
  '> **Qué es:** el inventario completo del sitio publicado — todo el texto visible en su orden de',
  '> lectura, la estructura de cada página, la identidad del negocio, el SEO, los datos estructurados',
  '> y la fuente que respalda cada dato. Se puede auditar sin abrir el sitio.',
  '>',
  `> **Generado:** ${sello} UTC · **Comando:** \`pnpm mapa\` · **Salida:** \`docs/16_mapa-del-sitio.md\``,
  '>',
  '> **De dónde sale cada sección:** el texto visible se extrae del **HTML construido** (`dist/`), no del',
  '> código fuente: si algo no llega a la página, no aparece aquí. La trazabilidad de fuentes se recorre',
  '> de `src/data/*.json`, donde cada bloque de copy declara de qué documento o validación sale.',
  '',
);

// ── 0. Cómo leer / qué no es un error ──────────────────────────────────────────
w(
  '## 0. Cómo auditar este documento',
  '',
  '### Glosario de códigos',
  '',
  'El proyecto impone que **ningún dato se publique sin fuente**. Los códigos que verás:',
  '',
  '| Código | Qué es |',
  '|---|---|',
  '| `C###` | Dato del cliente, tomado del CSV de origen (`docs/05`). Ej. `C21` = 23 marcas en el CSV (el sitio publica 22 tras V-018). |',
  '| `V-###` | Validación del operador (el dueño del negocio). Manda sobre cualquier documento previo. |',
  '| `docs/NN` | Documento interno del proyecto (investigación, kit de marca, plan). |',
  '| `L#` | Límite explícito del proyecto. Ej. `L1` = no prometer plazos, `L4` = nunca escribir "SIEMES" (la sigla es **SIEMDES**). |',
  '| `B-##` | Bloqueo abierto esperando decisión o insumo externo. |',
  '| `ADR-*` | Decisión de arquitectura ya cerrada. |',
  '| `S1-D-*` | Tarea del plan, con su número. |',
  '',
  '### Decisiones cerradas que NO son errores',
  '',
  'Un auditor que no conozca esto va a marcar como fallas decisiones deliberadas. Todas están',
  'sostenidas por una validación o un límite, y varias son justamente lo que el sitio evita:',
  '',
  '| Lo que verás | Por qué está así (no es un olvido) |',
  '|---|---|',
  '| **El sitio va sin fotografías**; donde irían hay unas placas con identificador, proporción y spec (`FOT-…`) | `V-011` no ha autorizado casos ni fotos, y el kit prohíbe explícitamente el stock genérico de grúas. La placa reserva el espacio con el vocabulario del sistema para que la foto real entre sin rediseñar |',
  '| **No hay horarios** en ninguna página ni en los datos estructurados | `B-03` abierto: `docs/11` propone L-V 9-18 h pero el operador no lo ha confirmado. Publicar un horario sin confirmar es el tipo de dato inventado que este proyecto no hace |',
  '| **No hay aviso de privacidad** | `B-05` abierto (LFPDPPP). `S1-D-06.3` está bloqueada por eso |',
  '| **No hay reseñas, estrellas ni valoración** en la página, aunque haya enlace para dejar reseña | Emitir `aggregateRating` sin reseñas verificadas rompe las directrices de datos estructurados de Google y puede costar la visibilidad del perfil |',
  '| **No hay dirección de correo electrónico** ni formulario que envíe correos | Canal único decidido por el cliente: WhatsApp (`V-009`). El formulario del sitio **construye un mensaje de WhatsApp**, no envía nada |',
  '| **No hay plazos ni tiempos de entrega** en ningún texto | `L1` y `C113`: la casa no promete tiempos. Hay un bloque que lo dice en voz alta en Inicio |',
  '| **No hay casos de éxito** en Experiencia; en su lugar se describe el proceso y se pide autorización para publicarlos | `V-011` sin casos autorizados (`ADR-S05`, `RF-07`): la sección **nunca** inventa casos |',
  '| **No aparecen ciertos municipios y ciertos equipos** aunque estén en el CSV del cliente | Decisión del operador registrada como "no publicado" en el JSON, con su motivo. Está listada completa en la §6 |',
  '| **`siemdes.mx` no existe todavía** y el sitio sale con `noindex` | `B-02` abierto: sin dominio no hay URL estable, ni canónica, ni QR impreso. El interruptor `publicado: false` en `navegacion.ts` es lo que mantiene el `noindex` |',
  '| **Colores: solo negro, amarillo y blanco** (más tintes de apoyo) | Paleta de marca de tres colores. El amarillo de marca **nunca** es texto sobre blanco (1.7:1, falla WCAG AA); sí sobre negro, y como fondo con texto negro (14.3:1) |',
  '',
  '### Qué sería un hallazgo legítimo',
  '',
  'Texto que prometa un plazo o un resultado; un dato sin fuente; jerga del taller sin traducir para',
  'quien no es mecánico; dos secciones que dicen lo mismo; un texto que contradice otro; una llamada a',
  'la acción que no lleva a ningún lado; un dato del negocio que falta y el cliente sí tiene. La §11',
  'deja las preguntas abiertas ordenadas.',
  '',
  '---',
  '',
);

// ── 1. Ficha del negocio ──────────────────────────────────────────────────────
w(
  '## 1. Ficha del negocio (identidad y datos publicados)',
  '',
  'Estos datos son **NAP** (nombre, dirección, teléfono): deben coincidir exactamente con Google',
  'Business y con las redes del cliente, o el buscador los trata como dos negocios distintos.',
  '',
  '| Campo | Valor | Fuente |',
  '|---|---|---|',
  `| Nombre comercial | ${SITIO.nombre} | V-013 |`,
  `| Razón social (literal, mayúsculas, sin acentos) | ${escapar(SITIO.razonSocial)} | docs/14 §1.1 · L6 |`,
  `| Descriptor de apoyo (no es parte del nombre) | ${SITIO.descriptor} | docs/14 · L7 |`,
  `| Dirección | ${escapar(`${SITIO.calle}, ${SITIO.cp} ${SITIO.municipio}, ${SITIO.estado}`)} | ${escapar(SITIO.direccionFuente)} |`,
  `| WhatsApp | ${SITIO.whatsappLocal} (enlace: \`${SITIO.whatsapp}\`) | ${escapar(SITIO.whatsappFuente)} |`,
  `| Teléfono fijo publicado | **ninguno** — la llamada iría al mismo número y es vía secundaria | docs/06 V-009 |`,
  `| Correo electrónico | **ninguno publicado** | docs/06 V-009 |`,
  `| Horario | **no se publica** (B-03 abierto) | docs/11 ítem 14, sin confirmar |`,
  `| Perfil de Google | existe y responde; \`${SITIO.resenasPlaceId}\` | verificado 2026-09-29, HTTP 200 |`,
  `| Página de reseñas | ${SITIO.resenasUrl} | verificado 2026-09-29 |`,
  `| Aviso de privacidad | **no existe** (B-05 abierto, bloquea S1-D-06.3) | docs/15 |`,
  `| Estado de publicación | ${SITIO.publicado ? '**publicado**' : '**sin publicar** — todo el sitio sale con `noindex` hasta que exista dominio (B-02) y se cierre la revisión'} | navegacion.ts \`publicado\` |`,
  '',
  `> **Dato que el sitio repite y conviene verificar con el cliente:** 16 años de trayectoria (C79),`,
  '> 22 marcas atendidas (C21 menos P&H, retirada en V-018 por no tener fuente autoritativa de su logo), 8 marcas con diagnóstico computarizado (C43) y 6 municipios en',
  '> cobertura (V-015). Los tres primeros salen en las cifras de Inicio; el cuarto en la portada y en Cobertura.',
  '',
);

// ── 2. Mapa de rutas ─────────────────────────────────────────────────────────
w('## 2. Mapa de rutas', '', '### Páginas', '');
tabla(
  ['Ruta', 'Página', 'Para qué', 'Secciones (h2)', 'Palabras visibles'],
  PAGINAS_HTML.map((pagina) => [
    `\`${pagina.ruta}\``,
    pagina.nombre,
    escapar(pagina.proposito),
    String(pagina.encabezados.filter((e) => e.nivel === 2).length),
    String(pagina.palabras),
  ]),
);

w(
  '### Rutas de redirección (`/ir/…`)',
  '',
  'Existen para que un **QR impreso** no apunte nunca a un número de teléfono fijo: si el número cambia,',
  'el QR impreso muere. El QR apunta a `/ir/<destino>` y ahí se resuelve el destino real.',
  '',
);
tabla(
  ['Ruta', 'Destino', 'Qué hace'],
  PAGINAS_IR.map((destino) => [`\`/ir/${destino.id}\``, destino.etiqueta, 'Redirige de inmediato (meta-refresh + script) con un respaldo visible: título, explicación y enlace "Continuar"']),
);

w(
  '### Archivos y rutas no-HTML',
  '',
  '| Ruta | Qué es |',
  '|---|---|',
  '| `/robots.txt` | Directivas para rastreadores. **Sin dominio definitivo** todavía (B-02) |',
  '| `/sitemap-index.xml` | Se genera en el build, no en desarrollo |',
  '| `/favicon-32.png`, `/favicon-16.png`, `/apple-touch-icon.png`, `/site.webmanifest` | Iconos e instalación en móvil |',
  '| `/marca/logo-color-*.png`, `/marca/logo-claro-*.png` | Logotipo en sus dos versiones autorizadas (color sobre blanco, claro sobre negro), derivados por reescalado mecánico del asset oficial |',
  '| `/og/*.png` | Imágenes sociales (1200×630) que se ven al compartir el enlace en WhatsApp |',
  '',
  '---',
  '',
);

// ── 3. Navegación, CTAs y medición ───────────────────────────────────────────
w(
  '## 3. Navegación, llamadas a la acción y medición',
  '',
  `**Menú de cabecera y pie** — las 5 secciones, en este orden: ${['Inicio', 'Servicios', 'Cobertura', 'Experiencia', 'Contacto'].join(' · ')} (R04.14 + D-E: Maquinaria y Marcas viven ensanchadas en Inicio #maquinaria).`,
  'La página activa se marca con subrayado grueso en amarillo y `aria-current="page"`.',
  '',
  '**En móvil:** menú desplegable (`<details>`) y una barra fija abajo con **"Escribir por WhatsApp"**,',
  'que queda siempre visible. La barra no existe en escritorio: ahí el CTA vive en la cabecera.',
  '',
  '### Las cuatro llamadas a la acción',
  '',
  '| Dónde | rótulo | Qué abre | Medición (`data-cta`) |',
  '|---|---|---|---|',
  '| Cabecera | "Solicitar diagnóstico" | WhatsApp con mensaje escrito | `wa-cabecera` |',
  '| Barra fija móvil | "Escribir por WhatsApp" | WhatsApp con mensaje escrito | `wa-flotante` |',
  '| Pie | "WhatsApp 348 100 9869" | WhatsApp con mensaje escrito | `wa-pie` |',
  '| Banda de cierre (cada página) | "Solicitar diagnóstico" | WhatsApp con mensaje escrito | `wa-cierre` · `wa-servicios` · `wa-experiencia` · `wa-404` según la página |',
  '',
  '### Mensajes que viajan ya escritos',
  '',
  'El visitante no tiene que explicar nada desde cero. Hay cuatro entradas:',
  '',
  '| Entrada | Mensaje que llega al taller |',
  '|---|---|',
  '| Diagnóstico (cabecera, pie, cierres) | "Hola, quiero solicitar un diagnóstico para mi equipo." |',
  '| Solicitudes de Contacto | Los tres mensajes de la tabla de §4.7, más el detalle que el visitante agregue |',
  '| 404 | "Hola, no encontré la página que buscaba." |',
  '| `/ir/…` | El mensaje de la solicitud correspondiente |',
  '',
  '**Medición.** Un único script (`src/scripts/medicion.ts`) escucha por delegación todos los `data-cta` del',
  'sitio. No hay cookies, no hay identificadores y no hay terceros: registra el evento en el proveedor de',
  'analítica que se configure. **La analítica no está contratada todavía** — no hay nada que mida hoy.',
  '',
  '---',
  '',
);

// ── 4. Contenido por página ──────────────────────────────────────────────────
w(
  '## 4. Contenido completo por página',
  '',
  'El texto de cada página va en **orden de lectura** (arriba a abajo, como lo recorre un lector y un',
  'lector de pantalla). Es el **contenido propio de la página**: la cabecera y el pie son idénticos en',
  'todo el sitio y están descritos una sola vez en la §3, para no repetir el mismo menú trece veces.',
  '',
  'El **esqueleto de encabezados** de cada página muestra los niveles reales del documento. Un texto que',
  'se vea grande pero no aparezca ahí **no es un encabezado**: visualmente tiene rango, semánticamente no,',
  'y eso es exactamente lo que hay que auditar.',
  '',
);

for (const pagina of PAGINAS_HTML) {
  w(`### 4.${PAGINAS_HTML.indexOf(pagina) + 1} ${pagina.nombre} — \`${pagina.ruta}\``, '');

  // Meta y SEO
  w('**Ficha de la página**', '');
  tabla(
    ['Campo', 'Valor'],
    [
      ['Título (`<title>`)', escapar(pagina.meta.titulo ?? '—')],
      ['Longitud del título', pagina.meta.titulo ? `${pagina.meta.titulo.length} caracteres (máximo admitido: 60)` : '—'],
      ['Descripción (meta)', escapar(pagina.meta.descripcion ?? '—')],
      ['Longitud de la descripción', pagina.meta.descripcion ? `${pagina.meta.descripcion.length} caracteres (rango admitido: 60-160)` : '—'],
      ['Canónica', pagina.meta.canonical ? `\`${pagina.meta.canonical}\`` : '**sin canónica** (es la 404 o el sitio no está publicado)'],
      ['Robots', pagina.meta.robots ?? '— indexable (sin directiva) —'],
      ['Imagen social', pagina.meta.ogImagen ? `\`${pagina.meta.ogImagen}\`` : '—'],
      ['Palabras visibles', String(pagina.palabras)],
    ],
  );

  // Procedencia: que archivos de datos alimentan ESTA pagina. Se calcula, no se declara.
  // Solo cuentan los textos LARGOS (>35 caracteres): con textos cortos la deteccion da
  // falsos positivos, porque cadenas genericas como "Solicitar diagnostico" existen en
  // varios archivos a la vez y aparecerian en paginas que no las usan.
  const cuerpoNormalizado = normalizar(pagina.cuerpo);
  const fuentes = HOJAS.filter((archivo) =>
    archivo.hojas.some((hoja) => hoja.texto.length > 35 && cuerpoNormalizado.includes(normalizar(hoja.texto))),
  );
  w(
    `**Archivos cuyos textos aparecen en esta página** (detectado por coincidencia de textos de más de 35 caracteres): ${fuentes.length === 0 ? '_ninguno: esta página no muestra contenido de los archivos de datos_' : fuentes.map((f) => `\`${f.ruta.replace('src/data/', '')}\``).join(' · ')}`,
    '',
  );

  // Esqueleto
  w('**Estructura de encabezados**', '');
  if (pagina.encabezados.length === 0) {
    w('_Sin encabezados._', '');
  } else {
    w('```');
    for (const encabezado of pagina.encabezados) {
      w(`${'  '.repeat(encabezado.nivel - 1)}h${encabezado.nivel} · ${encabezado.texto}`);
    }
    w('```', '');
  }

  // Texto visible
  w('**Texto visible completo, en orden**', '');
  for (const linea of pagina.visible) {
    w(`- ${escapar(linea)}`);
  }
  w('');

  // Atributos con texto
  const atributos = Object.entries(pagina.atributos).filter(([, valores]) => valores.length > 0);
  if (atributos.length > 0) {
    w('**Texto en atributos** (lo lee el lector de pantalla o el marcador del campo)', '');
    for (const [atributo, valores] of atributos) {
      w(`- \`${atributo}\`: ${valores.map((v) => `"${escapar(v)}"`).join(' · ')}`);
    }
    w('');
  }

  w('---', '');
}

// 4.9 Paginas de redireccion: llevan texto propio (el respaldo visible), asi que van en el
// mapa aunque no sean navegables desde el menu.
w(
  '### 4.9 Páginas de redirección (`/ir/…`)', '',
  'Cada una muestra un respaldo visible por si el visitante llega sin redirección automática',
  '(el `meta-refresh` y el script funcionan siempre, pero el enlace es la salida sin JavaScript).',
  'Su contenido es el mismo salvo la etiqueta y la explicación.', ''
);
for (const destino of datos['src/data/ir.json'].destinos) {
  const html = leer(`${PUBREL}/ir/${destino.id}/index.html`);
  const visible = textoVisible(cuerpoPrincipal(html));
  w(`**\`/ir/${destino.id}\` — ${destino.etiqueta}**`, '');
  for (const linea of visible) w(`- ${escapar(linea)}`);
  w('');
}
w('---', '');

// ── 5. Trazabilidad ──────────────────────────────────────────────────────────
w(
  '## 5. Trazabilidad: de dónde sale cada texto',
  '',
  'Cada texto publicado se declara en `src/data/*.json` y **debe** citar su fuente (`C###`, `V-###` o',
  '`docs/NN`). No es una convención blanda: el validador corre antes del build y **falla la construcción**',
  'si un texto no cita fuente, si se pasa de longitud o si falta un bloque obligatorio.',
  '',
  'La columna **"¿Llega al sitio?"** cruza cada texto contra el HTML de las páginas publicadas. Cuando dice',
  '**no**, el texto está declarado en los datos pero no aparece en ninguna página — normalmente porque es',
  'un dato interno (un "no publicado" con su motivo) o porque alimenta los datos estructurados, no el visible.',
  '',
);

for (const archivo of HOJAS) {
  w(`### \`${archivo.ruta}\``, '');
  tabla(
    ['Clave en el archivo', 'Texto', 'Fuente que lo respalda', '¿Llega al sitio?'],
    archivo.hojas.map((hoja) => [
      `\`${hoja.clave}\``,
      escapar(hoja.texto.length > 78 ? `${hoja.texto.slice(0, 78)}…` : hoja.texto),
      escapar(hoja.fuente ?? '**sin fuente declarada**'),
      hoja.publicada ? 'sí' : '**no**',
    ]),
  );
}

// ── 5b. Textos repetidos entre paginas ────────────────────────────────────────
// Responde con evidencia a una de las preguntas centrales de la auditoria ("dos secciones
// dicen lo mismo?"): se busca cada texto largo declarado en el cuerpo de TODAS las paginas
// y se listan los que aparecen en mas de una.
const repetidos = [];
for (const archivo of HOJAS) {
  for (const hoja of archivo.hojas) {
    if (hoja.texto.length <= 35) continue;
    const normalizado = normalizar(hoja.texto);
    const paginas = PAGINAS_HTML.filter((pagina) => normalizar(pagina.cuerpo).includes(normalizado)).map((p) => p.nombre);
    if (paginas.length > 1) {
      repetidos.push({ texto: hoja.texto, fuente: hoja.fuente, archivo: archivo.ruta.replace('src/data/', ''), clave: hoja.clave, paginas });
    }
  }
}

w(
  '### Textos que aparecen en más de una página',
  '',
  'Mismo texto literal, en dos páginas o más. No siempre es un defecto: una regla de la casa dicha en',
  'dos lugares puede ser deliberada. Está aquí para que la decisión sea consciente.',
  '',
);
if (repetidos.length === 0) {
  w('_Ningún texto largo se repite entre páginas._', '');
} else {
  tabla(
    ['Texto', 'Aparece en', 'Declarado en', 'Fuente'],
    repetidos.map((item) => [
      escapar(item.texto.length > 110 ? `${item.texto.slice(0, 110)}…` : item.texto),
      item.paginas.join(', '),
      `\`${item.archivo}\` → \`${item.clave}\``,
      escapar(item.fuente ?? '—'),
    ]),
  );
  w(
    '> **Los tres pasos del proceso no son una duplicación accidental:** Experiencia lee el proceso del',
    '> mismo archivo que Servicios (`servicios.json`), a propósito, para que exista una sola versión de ese',
    '> texto y no dos que se desincronicen. El cuarto caso sí es una regla de la casa dicha en dos páginas',
    '> distintas: es una decisión de redacción, no un descuido.',
    '',
  );
}

// ── 6. Lo que NO se publica ──────────────────────────────────────────────────
w(
  '## 6. Lo que NO se publica, y por qué',
  '',
  'Esta sección es la contraparte del sitio: los datos que existen, que el cliente entregó o que el',
  'operador decidió, y que **deliberadamente no aparecen** en ninguna página. Está en el proyecto porque',
  'un dato ausente sin motivo escrito se "re-descubre" seis meses después y se publica por error.',
  '',
);

const noPublicados = [];
for (const [ruta, contenido] of Object.entries(datos)) {
  const recoger = (valor, rutaClave) => {
    if (Array.isArray(valor)) return valor.forEach((v, i) => recoger(v, `${rutaClave}[${i + 1}]`));
    if (!valor || typeof valor !== 'object') return;
    for (const [clave, sub] of Object.entries(valor)) {
      const camino = rutaClave ? `${rutaClave}.${clave}` : clave;
      if (['noPublicado', 'pendientes', 'noPromesas', 'noAtendido', 'noAtendidos'].includes(clave) && Array.isArray(sub)) {
        for (const item of sub) {
          noPublicados.push({
            archivo: ruta,
            clave: camino,
            que: item.equipo ?? item.municipio ?? item.dato ?? item.titulo ?? '(bloque)',
            motivo: item.motivo ?? item.texto ?? '—',
            fuente: item.fuente ?? '—',
          });
        }
      } else {
        recoger(sub, camino);
      }
    }
  };
  recoger(contenido, '');
}

if (noPublicados.length === 0) {
  w('_No hay datos marcados como no publicados._', '');
} else {
  tabla(
    ['Archivo', 'Qué no se publica', 'Motivo registrado', 'Fuente'],
    noPublicados.map((item) => [escapar(item.archivo.replace('src/data/', '')), escapar(item.que), escapar(item.motivo), escapar(item.fuente)]),
  );
}

w(
  '### Pendientes que sí están escritos en los datos, esperando insumo externo',
  '',
  'Estos no son "no publicados": son bloques que **existen y no se pueden completar** todavía porque falta',
  'un dato del cliente. El sitio no los inventa ni los deja a medias: esperan.',
  '',
  '| Pendiente | Motivo | Fuente |',
  '|---|---|---|',
  '| Horario de atención (B-03) | No confirmado por el operador; afecta también los datos estructurados | docs/11 ítem 14 · V-008 |',
  '| Aviso de privacidad (B-05) | Falta el documento legal (LFPDPPP); bloquea la tarea S1-D-06.3 | docs/15 |',
  '| Casos de éxito autorizados (B-04) | V-011 pide al menos 5 casos con autorización escrita; sin ellos Experiencia describe el proceso | docs/06 V-011 · docs/15 |',
  '| Dominio y hosting (B-02) | Sin dominio no hay URL estable, ni canónica, ni QR impreso, ni publicación | docs/15 |',
  '| Fotografías autorizadas (V-011) | Sin casos ni fotos autorizadas, el sitio va sin imágenes | docs/14 §5 |',
  '',
  '---',
  '',
);

// ── 7. Sistema tipográfico ───────────────────────────────────────────────────
w(
  '## 7. Sistema tipográfico',
  '',
  'La escala se nombra **por rol, no por tamaño**: `text-cuerpo` dice para qué sirve; `text-sm` solo decía',
  'cuánto medía, y de ahí venía la deriva (el mismo rol saliendo en tres tamaños distintos según la página).',
  '',
  '**Dos familias, y su reparto es una regla, no una preferencia:**',
  '',
  '- **Barlow** (600/700/800/900) manda: títulos, etiquetas, botones, cifras. Es la voz industrial del sistema.',
  '- **Inter Variable** entra cuando hay que leer corrido: cuerpo de texto, entradas y pies.',
  '',
  'Un elemento **no nombra su familia**: la impone el rol. Si alguien escribe `font-titular` en el marcado,',
  'el build falla (regla 16a de la guardia). Es lo que impide que el sistema se vuelva a desincronizar.',
  '',
  '### Los 12 roles',
  '',
  '| Rol | Tamaño (móvil / escritorio) | Familia y peso | Rol editorial |',
  '|---|---|---|---|',
  '| `titular-1` | 38 / **56 px** | Barlow 900 | `h1` — el título de la página |',
  '| `titular-2` | 28 px | Barlow 800 | `h2` — título de sección |',
  '| `titular-3` | 21 px | Barlow 700 | `h3` — título de bloque o paso |',
  '| `lead` | 21 px | Inter 400 | Entrada: el párrafo que sigue a un título |',
  '| `cuerpo` | 18 px | Inter 400 | Texto corrido |',
  '| `etiqueta-bloque` | 18 px | Barlow 700 mayúsculas | Navegación, títulos de grupo, nombres de canal |',
  '| `pie` | 16 px | Inter 500 | Pie, dirección, textos legales |',
  '| `chip` | 16 px | Barlow 800 | Chips de marca y de modelo (buscador) |',
  '| `boton` | 16 px | Barlow 800 mayúsculas | Botones y llamadas a la acción |',
  '| `etiqueta` | 14 px | Barlow 700 mayúsculas | Etiqueta corta: cejas, rótulos, marcadores |',
  '| `cifra` | 46 / **60 px** | Barlow 900, cifras tabulares | Número destacado real (16, 23, 8, 6) |',
  '| `indice` | 38 / **56 px** | Barlow 900, cifras tabulares | Numeral decorativo de sección (`01`–`07`) |',
  '',
  '**Siete escalones:** 14 · 16 · 18 · 21 · 28 · 38 · 46 px (56 y 60 solo en escritorio). Ningún salto por',
  'debajo del 12 %, que es el umbral por el que el ojo deja de leer un nivel distinto. **Nada mide menos de',
  '14 px** y la guardia lo verifica en cada build.',
  '',
  '**Jerarquía en tres ejes, no en uno:** peso (900/800/700/400), familia (Barlow/Inter) y caja',
  '(mayúsculas con espaciado amplio en las etiquetas). El tamaño solo separa niveles grandes.',
  '',
  '> **Nota sobre el máximo de dos pesos por pieza** (`docs/14 §4.3`): aquí se interpreta como dos pesos por',
  '> **bloque**, no por página — una página de siete secciones no es una pieza de imprenta. Es la única',
  '> lectura del kit que queda pendiente de ratificación formal.',
  '',
  '**Medición de densidad** (última corrida, 2026-09-30, a 390 px de ancho): **15 % del texto por debajo de',
  '16 px** (77 de 512 elementos), con cobertura de tinta del 39.5 %. El piso real del sitio es 14 px, así que',
  'ese 15 % es etiqueta y pie, no cuerpo de texto.',
  '',
);

// ── 8. Identidad y color ─────────────────────────────────────────────────────
w(
  '## 8. Identidad y color',
  '',
  'La paleta de marca son **tres colores**. No se admite ningún otro: la guardia revisa el CSS y el HTML',
  'construidos y falla el build si aparece un cuarto.',
  '',
  '| Token | Valor | Uso | Contraste |',
  '|---|---|---|---|',
  '| Negro Industrial | `#18181B` | Texto, reglas, bandas de fondo | 17.9:1 sobre blanco |',
  '| Amarillo de Seguridad | `#FACC15` | Acento: CTA, filetes, subrayado de sección activa | **1.7:1 sobre blanco — prohibido como texto**; 14.3:1 como fondo con texto negro |',
  '| Blanco | `#FFFFFF` | Fondo general del sitio | — |',
  '',
  'Tintes de apoyo (jerarquizan, **no** son color de marca):',
  '',
  '| Token | Valor | Uso |',
  '|---|---|---|',
  '| `tinte-2` | `#3F3F46` | Texto secundario |',
  '| `tinte-3` | `#71717A` | Etiquetas y pies |',
  '| `tinte-indice` | `#A1A1AA` | Textos sobre fondo negro (índices del pie) |',
  '| `filete` | `#E4E4E7` | Divisores de 1 px |',
  '| `numeral` | `#EEEEF0` | Fondo de las placas de fotografía, marca de agua sobre negro |',
  '',
  '**El administrador de color del sistema es la accesibilidad, no el gusto:** el amarillo nunca es texto',
  'sobre blanco; el foco del teclado se dibuja en amarillo de 3 px; el contraste del texto sobre fondos',
  'claros se verifica con la guardia.',
  '',
  '**El logotipo no se recrea ni se deforma.** Se usan los assets oficiales, en sus dos versiones',
  'autorizadas: color sobre blanco en la cabecera, claro sobre el pie negro. Altura en cabecera: 44 px.',
  '',
  '---',
  '',
);

// ── 9. Datos estructurados y SEO ─────────────────────────────────────────────
w(
  '## 9. Datos estructurados y SEO técnico',
  '',
  'El sitio emite `LocalBusiness` en JSON-LD. **Lo que no se emite importa tanto como lo que sí**, porque',
  'cada dato inventado aquí puede costar la visibilidad del perfil de Google:',
  '',
  '| Dato | ¿Se emite? | Por qué |',
  '|---|---|---|',
  '| Nombre, razón social, teléfono, dirección | **sí** | Datos verificados (B-01 cerrado) |',
  '| `areaServed` con los 6 municipios | **sí** | Es la misma lista que publica la 03 Cobertura, leída del mismo archivo |',
  '| `makesOffer` y `knowsAbout` con las 6 líneas de servicio | **sí** | Se leen del JSON de Servicios; no se duplican a mano |',
  '| `sameAs` con el perfil de Google | **sí** | Enlace verificado (HTTP 200) |',
  '| `openingHours` (horario) | **no** | B-03 abierto. Un horario sin confirmar es un dato inventado |',
  '| `aggregateRating` / `reviewCount` | **no** | No hay reseñas verificadas. Inventarlas viola las directrices de Google |',
  '| `geo` (coordenadas) | **no** | No hay coordenadas verificadas de la base |',
  '| `priceRange` | **no** | El cliente no publicó un rango de precios |',
  '',
  '**Tipo elegido:** `LocalBusiness` y no un subtipo más estrecho, a propósito: schema.org no tiene un tipo',
  'para "taller de maquinaria pesada", y un subtipo de automóviles (`AutoRepair`) describiría mal el negocio.',
  '',
  '**SEO de la página de error:** la 404 nunca lleva canónica y siempre sale con `noindex`, incluso cuando el',
  'sitio se publique. Una página de error canonizada es la vía más corta a que Google indexe un error.',
  '',
  '### Longitudes (los límites no son capricho: se midieron sobre el HTML real)',
  '',
  '| Campo | Límite | Motivo |',
  '|---|---|---|',
  '| Título | 15-60 caracteres | A partir de 60 el buscador corta; un título anterior medía 67 y se publicaba truncado |',
  '| Descripción | 60-160 caracteres | Por encima de ~160 el buscador corta a mitad de frase; una descripción anterior llegaba a 164 |',
  '',
  '### Archivos de rastreo (contenido real)',
  '',
  '`/robots.txt` — se genera en el build, no es un archivo suelto:',
  '',
  '```',
  ...(ARCHIVOS_RASTREO.robots ? ARCHIVOS_RASTREO.robots.trim().split('\n') : ['(no se encontró dist/robots.txt)']),
  '```',
  '',
);

if (ARCHIVOS_RASTREO.sitemap.length > 0) {
  w(
    `**Sitemap** — ${ARCHIVOS_RASTREO.sitemap.length} URLs declaradas a los buscadores:`,
    '',
  );
  for (const url of ARCHIVOS_RASTREO.sitemap) w(`- \`${url}\``);
  w('');
}

w(
  '> **Aviso sobre el dominio:** todo el sitio declara `siemdes.mx` como dominio (canónicas, sitemap,',
  '> datos estructurados e imágenes sociales). **B-02 sigue abierto**: `docs/11` lista ese dominio como',
  '> "por verificar". Mientras el dominio no exista, esas URLs apuntan a un destino que puede no ser el',
  '> definitivo, y el sitio entero sale con `noindex` para que una vista previa no compita con el perfil',
  '> de Google Business. Al cerrar B-02 se cambia **un solo valor** (`site` en `astro.config.mjs`) y todo',
  '> lo demás se recalcula: es exactamente el motivo de que esté centralizado.',
  '',
  '---',
  '',
);

// ── 10. Estado del proyecto ──────────────────────────────────────────────────
w(
  '## 10. Estado del proyecto y bloqueos',
  '',
  '**Lo que falta para que el sitio se pueda publicar** (el interruptor `publicado: false` mantiene hoy todo',
  'el sitio fuera del índice de Google, para que una vista previa no compita con el perfil de Google Business):',
  '',
  '| Bloqueo | Qué falta | Qué desbloquea |',
  '|---|---|---|',
  '| **B-02** | Dominio y hosting | URL estable, canónicas, QR impresos y la publicación misma |',
  '| **B-03** | Confirmar el horario | Bloque de horario + `openingHours` en los datos estructurados |',
  '| **B-04** | Casos autorizados (al menos 5, con autorización) | La sección Experiencia con casos reales en lugar del proceso |',
  '| **B-05** | Aviso de privacidad (LFPDPPP) | El pie legal y la tarea S1-D-06.3 |',
  '| **B-08** | Decisión de fondo claro u oscuro | El sitio mide 32 % de negro y la tarjeta aprobada 92.5 %; el operador reportó que "no se siente industrial". No se tocó sin autorización porque contradice el kit |',
  '',
  '**Riesgo declarado:** el proyecto **no está bajo control de versiones**. No hay historial de cambios ni',
  'posibilidad de revertir un cambio aislado. La única recuperación son las copias de seguridad del',
  'sistema de archivos. Cualquier auditoría que dependa de comparar versiones no se puede hacer hoy.',
  '',
  '**Verificación automática en cada build:** validador de contenido (fuentes, longitudes y bloques',
  'obligatorios) + guardia de marca (16 reglas: paleta, tipografía, jerarquía, contraste, estructura) +',
  '23 pruebas negativas que comprueban que la guardia **detecta de verdad** lo que dice detectar.',
  '',
  '---',
  '',
);

// ── 11. Preguntas abiertas ──────────────────────────────────────────────────
w(
  '## 11. Preguntas abiertas para quien audita',
  '',
  'El encargo de esta auditoría es el **contenido textual y su distribución**: qué dice el sitio, en qué',
  'orden, con qué jerarquía. Estas son las preguntas vivas, en orden de importancia:',
  '',
  '1. **¿El titular de Inicio dice lo que el negocio quiere que diga?** — "Lo que otros dejan desarmado,',
  '   nosotros lo terminamos". Es una promesa implícita: conviene decidir si el operador la sostiene.',
  '2. **¿Se entiende para quién es el sitio?** Está escrito para alguien que tiene una máquina parada,',
  '   no para un comprador de servicios. ¿Es el lector correcto?',
  '3. **¿Falta una sección?** Hoy son 6 páginas y ninguna habla de precios, procesos de facturación ni',
  '   tiempos. Lo de los tiempos es deliberado (`L1`); lo demás es una decisión de alcance que nadie ha tomado.',
  '4. **¿Sobra texto en alguna página?** Las más cargadas son Servicios y Marcas. Un corte ahí no toca a',
  '   las demás.',
  '5. **¿El buscador de marcas resuelve la duda real?** La duda del visitante es "¿ustedes atienden mi',
  '   máquina?", y el buscador resuelve marca y modelo, no tipo de equipo.',
  '6. **¿Hay jerga sin traducir?** El texto evita deliberadamente el vocabulario de taller; si se cuela,',
  '   es un hallazgo.',
  '7. **¿Dos secciones dicen lo mismo?** Inicio, Servicios y Experiencia comparten territorio; el reparto',
  '   está pensado pero no probado con lectores.',
  '',
  '### Cómo comprobar cualquier afirmación de este documento',
  '',
  '| Si quieres verificar… | Corre |',
  '|---|---|',
  '| Que el texto emitido es el publicado | `pnpm mapa` (se regenera desde `dist/`) |',
  '| Que todo dato tiene fuente y los largos se respetan | `pnpm verificar:contenido` |',
  '| Que la marca y la jerarquía no se rompen | `pnpm verificar:marca` |',
  '| Que la guardia detecta de verdad lo que dice | `pnpm verificar:guardia` |',
  '| Densidad, tinta y tamaño real del texto | `pnpm medir` |',
  '| Tipos y errores de plantilla | `pnpm check` |',
  '',
  '---',
  '',
  `_Documento generado por \`scripts/generar-mapa.mjs\` el ${sello} UTC. No editar a mano._`,
  '',
);

const documento = lineas.join('\n');
mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, documento, 'utf8');

// ── resumen en consola (lo que se verifico, no lo que se escribio) ──────────
const totalPalabras = PAGINAS_HTML.reduce((suma, pagina) => suma + pagina.palabras, 0);
const totalHojas = HOJAS.reduce((suma, archivo) => suma + archivo.hojas.length, 0);
const sinPublicar = HOJAS.flatMap((archivo) => archivo.hojas.filter((hoja) => !hoja.publicada));
const sinFuente = HOJAS.flatMap((archivo) => archivo.hojas.filter((hoja) => !hoja.fuente));

console.log(`Mapa escrito en docs/16_mapa-del-sitio.md (${(documento.length / 1024).toFixed(1)} KB)`);
console.log(`  ${PAGINAS_HTML.length} paginas · ${totalPalabras} palabras visibles`);
console.log(`  ${totalHojas} textos declarados en los datos · ${totalHojas - sinPublicar.length} llegan al sitio`);
console.log(`  ${sinPublicar.length} declarados como no publicados o pendientes · ${sinFuente.length} sin fuente`);
console.log(`  ${repetidos.length} textos largos que se repiten entre paginas`);

if (sinFuente.length > 0) {
  console.error('\nTextos SIN FUENTE declarada (el validador deberia haberlos detenido):');
  for (const hoja of sinFuente) console.error(`  - ${hoja.clave}`);
}

if (DERIVA.length > 0) {
  console.error('\nDERIVA: textos declarados en los datos que NO aparecen en ninguna pagina');
  console.error('y que tampoco estan marcados como no publicados. Revisar si son copy muerto:');
  for (const hoja of DERIVA) console.error(`  - ${hoja.archivo} :: ${hoja.clave}`);
  process.exitCode = 2;
}
