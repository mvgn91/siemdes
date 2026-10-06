#!/usr/bin/env node
// Guardia de marca — S1-D-03.7
//
// Revisa lo que REALMENTE se publica (dist/), no la intencion del autor. Corre despues
// de astro build y antes de dar el build por bueno: si algo se sale del kit, el build
// falla. Es el equivalente web de verificar-geometria.py de la tarjeta.
//
// Las reglas no se inventan aqui: salen de docs/14 (kit de marca) y de docs/15 §6.
//
// DISENO DEL ESCANEO DE COLOR — se midio antes de escribir la regla:
// el CSS compilado de Tailwind contiene exactamente los hex de la paleta mas #0000
// (transparente) y dos centinelas internos de Tailwind (`rgb(from red r g b)` y
// `color-mix(in lab, red, red)`, que son marcadores de sus variables --tw-*).
// Por eso la regla es: el CONJUNTO de hex del CSS debe ser subconjunto de la paleta.
// Una regla mas ingenua (buscar "colores bonitos" o cualquier palabra de color) daria
// falsos positivos contra el propio Tailwind.
//
// Uso: pnpm verificar:marca   (y enganchado al final de pnpm build)

import { readdirSync, readFileSync, existsSync } from 'node:fs';

// ─── Verdad de marca ────────────────────────────────────────────────────────────

/** Paleta controlada + tintes de apoyo (docs/14 §3.2 y §3.4). No son colores "de la marca" los tintes. */
const PALETA = [
  '#18181b', // negro industrial
  '#facc15', // amarillo de seguridad
  '#ffffff', // blanco
  '#3f3f46', // tinte 2 — texto secundario
  '#71717a', // tinte 3 — etiquetas y pies
  '#a1a1aa', // tinte indice
  '#e4e4e7', // filete
  '#eeeef0', // numeral de fondo
];

/** Hex que Tailwind emite por su cuenta y no son color de marca.
 *  #0000 = transparente; #fff = su color por defecto de --tw-ring-offset-color.
 *  Cualquier otro hex del CSS es una senal: o es color de marca o alguien metio un color.
 *  Ejemplo real: `.shadow` traia #0000001a en su valor por defecto y la guardia lo cazo
 *  porque Tailwind estaba escaneando docs/ y .mvgn/ (ver src/styles/marca.css). */
const HEX_DE_SISTEMA = ['#0000', '#fff', '#000'];

/** Centinelas internos de Tailwind: no son colores de la pieza. Documentados tras medir el CSS real. */
const CENTINELAS = [/rgb\(from red r g b\)/g, /color-mix\(in lab, red, red\)/g];

/** Familias de la paleta por defecto de Tailwind: si aparece alguna, alguien uso un color ajeno. */
const FAMILIAS_AJENAS = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green',
  'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

/**
 * R05.26: el material acrilico NO es un token de color, es una composicion con alfa, asi que
 * la cascada de contraste (regla 12) no tendria fondo para los ~29 elementos que lo llevan:
 * los mediria contra el de la banda o los saltaria en silencio. Se declara el compuesto
 * MEDIDO, no aproximado, y en el peor de los dos casos — el claro sobre la banda blanca y
 * el oscuro sobre el negro, que es donde el texto claro tiene menos contraste.
 *   .acrilico        = blanco 72% sobre #EEEEF0 -> #FAFAFA  (sobre #FFFFFF daria #FFFFFF)
 *   .acrilico-oscuro = blanco 10% sobre #18181B -> #2F2F32
 * Si algun dia cambia el alfa de marca.css, estos dos hex hay que volver a medirlos.
 * Lo consume tambien la regla 9b (el material tiene que existir en el CSS y estar en uso).
 */
const MATERIALES = new Map([
  ['acrilico', '#fafafa'],
  ['acrilico-oscuro', '#2f2f32'],
]);

const UTILIDADES = [
  'bg', 'text', 'border', 'ring', 'fill', 'stroke', 'from', 'via', 'to', 'decoration', 'outline',
  'shadow', 'divide', 'accent', 'caret', 'placeholder',
];

/** Palabras y frases vetadas. */
const VETADAS = [
  { nombre: 'sigla vieja SIEMES (L4)', patron: /\bSIEMES\b/g },
  { nombre: 'tipografia descartada Space Grotesk (docs/14 §4.1)', patron: /Space Grotesk/gi },
  { nombre: 'telefono con el 1 legacy (B-01)', patron: /\+52\s?1\s?348/g },
];

/**
 * Frases de L1-L3 que si se pueden decir. Se RETIRAN del texto antes de aplicar los patrones
 * prohibidos. Si alguien reescribe el copy, la excepcion deja de coincidir y la guardia
 * empieza a marcar: obliga a que un humano lo revise en vez de heredar el permiso.
 */
const EXCEPCIONES = [
  'No se prometen tiempos de entrega.',
  'No se prometen tiempos de entrega. Primero se diagnostica y después se dice qué sigue.',
  'Programación y configuración de módulos: no es servicio propio, se hace con apoyo especializado.',
  'Programación y configuración de módulos: no es servicio propio, se resuelve con apoyo especializado.',
];

const PROHIBIDAS = [
  { nombre: 'L1 — promesa de tiempos', patron: /\b(?:en|dentro de)\s+(?:\d+|un|dos|tres)\s+(?:d[ií]as?|semanas?|horas?)\b/gi },
  { nombre: 'L1 — entrega garantizada', patron: /\b(?:entrega|servicio)\s+(?:inmediat[ao]|garantizad[ao]|asegurad[ao])\b/gi },
  { nombre: 'L1 — garantia de resultado', patron: /\b(?:garantiz\w+|garant[ií]a de)\b/gi },
  { nombre: 'L2/L3 — modulos como servicio propio', patron: /\bprogramaci[oó]n de m[oó]dulos\b(?!:)/gi },
  { nombre: 'docs/01 §6 — certificaciones', patron: /\bcertificad\w+\b/gi },
];

// ─── Utilidades ─────────────────────────────────────────────────────────────────

/** Camina dist/ y devuelve los archivos con las extensiones pedidas. */
function recorrer(raiz, extensiones, encontrados = []) {
  if (!existsSync(raiz)) return encontrados;
  for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
    const ruta = `${raiz}/${entrada.name}`;
    if (entrada.isDirectory()) recorrer(ruta, extensiones, encontrados);
    else if (extensiones.some((ext) => entrada.name.endsWith(ext))) encontrados.push(ruta);
  }
  return encontrados;
}

const lineas = (texto, indice) => texto.slice(0, indice).split('\n').length;

let errores = 0;
let avisos = 0;

function error(mensaje) {
  errores += 1;
  console.log(`  x ${mensaje}`);
}

function aviso(mensaje) {
  avisos += 1;
  console.log(`  ! ${mensaje}`);
}

// ─── Escaneo ────────────────────────────────────────────────────────────────────

const hojas = recorrer('dist', ['.css']);
const paginas = recorrer('dist', ['.html']);

// R05.41 (migración Cloudflare 2026-10-06): el adapter @astrojs/cloudflare publica el
// sitio en dist/client/ (dist/server va vacío). PUB es la raíz publicada real, con
// fallback a dist/ por si el layout cambia. `recorrer` ya es recursivo, asi que hojas
// y paginas se encuentran solas; solo las rutas ESCRITAS a mano necesitan PUB.
const PUB = existsSync('dist/client/index.html') ? 'dist/client' : 'dist';

console.log('\nGUARDIA DE MARCA — sobre dist/, lo que se publica\n' + '='.repeat(74));

if (hojas.length === 0 || paginas.length === 0) {
  error('No hay dist/ que revisar. Corre `pnpm build` antes de la guardia.');
  process.exit(1);
}

// 1. Colores del CSS: el conjunto de hex debe caer dentro de la paleta.
console.log(`\n[1] Color en el CSS (${hojas.length} hoja/s)`);
const hexesVistos = new Map();
for (const hoja of hojas) {
  let css = readFileSync(hoja, 'utf8');
  for (const centinela of CENTINELAS) css = css.replace(centinela, '');
  for (const hex of css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
    const clave = hex.toLowerCase();
    const anterior = hexesVistos.get(clave) ?? { veces: 0, donde: new Set() };
    anterior.veces += 1;
    anterior.donde.add(hoja);
    hexesVistos.set(clave, anterior);
  }
}
const permitidos = new Set([...PALETA, ...HEX_DE_SISTEMA]);
for (const [hex, info] of [...hexesVistos].sort()) {
  // R05.26 (material acrilico): el alfa es legitimo, el COLOR no puede salir de la paleta.
  // Tailwind compila el `color-mix(in oklab, var(--color-blanco) 72%, transparent)` de
  // marca.css a `#ffffffb8`, o sea 6 digitos de color + 2 de alfa. Se acepta solo si esos
  // 6 digitos son un token de la paleta, y la regla 5c exige ademas que ese hex con alfa
  // aparezca UNICAMENTE dentro de `.acrilico`/`.acrilico-oscuro`.
  const conAlfa = hex.length === 9;
  const cuerpo = conAlfa ? hex.slice(0, 7) : hex;
  if (permitidos.has(hex)) {
    console.log(`  + ${hex}  ${String(info.veces).padStart(3)} usos  ${info.veces > 0 ? '' : ''}${PALETA.includes(hex) ? '(paleta)' : '(sistema)'}`);
  } else if (conAlfa && permitidos.has(cuerpo)) {
    console.log(`  + ${hex}  ${String(info.veces).padStart(3)} usos  (${cuerpo} con alfa: material acrilico)`);
  } else {
    error(`${hex} NO esta en la paleta (docs/14 §3.1) — aparece ${info.veces} vez/veces en ${[...info.donde].join(', ')}`);
  }
}

// 1b. Colores por FUNCION: `rgba()`/`hsla()` son la puerta de atrás a la paleta, porque no
//     aparecen como hex y la regla 1 no los veía. R05.26 (material acrilico): el alfa se
//     compone con `color-mix` sobre un token de la paleta, nunca con un color escrito a
//     mano, asi que cualquier rgb()/hsl() que sobreviva a los centinelas de Tailwind es un
//     color fuera de marca.
console.log('\n[1b] Colores por funcion (rgb/hsl) fuera de la paleta');
let coloresFuncion = 0;
for (const hoja of hojas) {
  let css = readFileSync(hoja, 'utf8');
  for (const centinela of CENTINELAS) css = css.replace(centinela, '');
  for (const coincidencia of css.matchAll(/\b(?:rgba?|hsla?)\([^)]*\)/g)) {
    coloresFuncion += 1;
    error(
      `color por funcion fuera de la paleta: "${coincidencia[0]}" (${hoja}) — el alfa se compone ` +
        'con color-mix sobre un token (marca.css), no con un color escrito',
    );
  }
}
if (coloresFuncion === 0) console.log('  + ninguno.');

// 2. Utilidades de familias ajenas: si Tailwind las emite, es porque alguien las uso.
console.log('\n[2] Utilidades de paleta ajena en el CSS');
const patronAjeno = new RegExp(`\\.(?:${UTILIDADES.join('|')})-(?:${FAMILIAS_AJENAS.join('|')})-\\d{2,3}\\b`, 'g');
let ajenas = 0;
for (const hoja of hojas) {
  for (const coincidencia of readFileSync(hoja, 'utf8').matchAll(patronAjeno)) {
    ajenas += 1;
    error(`utilidad fuera de marca: ${coincidencia[0]} (${hoja})`);
  }
}
if (ajenas === 0) console.log('  + ninguna. La paleta de Tailwind se usa solo a traves de los tokens de marca.');

// 3. Color inline en el HTML.
console.log('\n[3] Color inline en el HTML');
let inline = 0;
for (const pagina of paginas) {
  const html = readFileSync(pagina, 'utf8');
  for (const atributo of html.matchAll(/style="[^"]*"/g)) {
    for (const hex of atributo[0].match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
      inline += 1;
      if (!permitidos.has(hex.toLowerCase())) error(`color inline fuera de paleta ${hex} en ${pagina}`);
      else console.log(`  ! color inline permitido ${hex} en ${pagina} (mejor moverlo a tokens)`);
    }
  }
}
if (inline === 0) console.log('  + ninguno.');

// 4. Palabras vetadas en el HTML.
console.log('\n[4] Palabras y datos vetados en el HTML');
let vetadas = 0;
for (const pagina of paginas) {
  const html = readFileSync(pagina, 'utf8');
  for (const { nombre, patron } of VETADAS) {
    for (const coincidencia of html.matchAll(patron)) {
      vetadas += 1;
      error(`${nombre}: "${coincidencia[0]}" en ${pagina}:${lineas(html, coincidencia.index)}`);
    }
  }
}
if (vetadas === 0) console.log('  + ninguna (sin SIEMES, sin Space Grotesk, sin el 1 legacy).');

// 5. Limites duros de contenido L1-L3.
console.log('\n[5] Limites duros de contenido (docs/15 §6)');
let prohibidas = 0;
for (const pagina of paginas) {
  let html = readFileSync(pagina, 'utf8');
  // Se retiran las etiquetas para no escanear atributos, y luego las frases aprobadas.
  let texto = html.replace(/<[^>]+>/g, ' ');
  for (const excepcion of EXCEPCIONES) texto = texto.split(excepcion).join(' ');
  for (const { nombre, patron } of PROHIBIDAS) {
    for (const coincidencia of texto.matchAll(patron)) {
      prohibidas += 1;
      error(`${nombre}: "${coincidencia[0].trim()}" en ${pagina} — si es copy correcto, agregalo a EXCEPCIONES con el texto exacto`);
    }
  }
}
if (prohibidas === 0) console.log('  + ninguna promesa prohibida.');

// 5b. Efectos prohibidos por el manual (§10 y docs/14 §2.6: sin gradientes, sin sombras, sin texturas).
console.log('\n[5b] Efectos prohibidos (sin sombras, sin gradientes, sin texturas)');
const patronEfecto = /\.(?:shadow(?:-[a-z0-9-]+)?|drop-shadow(?:-[a-z0-9-]+)?|blur(?:-[a-z0-9-]+)?|bg-gradient-to-[a-z]+|text-shadow(?:-[a-z0-9-]+)?)\b/g;
let efectos = 0;
for (const hoja of hojas) {
  for (const coincidencia of readFileSync(hoja, 'utf8').matchAll(patronEfecto)) {
    efectos += 1;
    error(`efecto prohibido en el CSS: ${coincidencia[0]} (${hoja})`);
  }
}
if (efectos === 0) console.log('  + ninguno.');

// 5c. La enmienda del veto 6 (R05.26, orden del operador 2026-10-05): el operador pidio el
//     material translucido de Fluent ("no es glass real, necesito glass fluent looking") y
//     con el esta el desenfoque entra. Entra SOLO dentro de `.acrilico`/`.acrilico-oscuro`:
//     sombra de caja, drop-shadow, blur de elemento, gradientes y texturas siguen vetados
//     como estaban (5b). Esta capa existe para que la excepcion no se haga puerta abierta:
//     cualquier otro `backdrop-filter` en el CSS se rechaza.
console.log('\n[5c] backdrop-filter y alfa solo dentro del material acrilico');
let desenfoquesFuera = 0;
for (const hoja of hojas) {
  const css = readFileSync(hoja, 'utf8');
  // Se separa el CSS en bloques `selector { declaraciones }` y se mira el selector de
  // cada bloque. Sin esto, un `backdrop-blur` en cualquier elemento pasaria como efecto
  // permitido por el veto 6 enmendado, y un `#rrggbbaa` escrito a mano pasaria como alfa
  // legitimo por la regla 1.
  for (const [, selector, declaraciones] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const esMaterial = /\.acrilico(?:-oscuro)?(?![-\w])/.test(selector);
    if (/backdrop-filter/.test(declaraciones) && !esMaterial) {
      desenfoquesFuera += 1;
      error(
        `backdrop-filter fuera del material acrilico: "${selector.trim().slice(0, 60)}" (${hoja}) — ` +
          'la enmienda del veto 6 cubre solo .acrilico y .acrilico-oscuro (docs/14 §2.6)',
      );
    }
    // `#0000` (transparente de Tailwind) es de 4 digitos y no entra aqui; el alfa del
    // material llega como 6+2 digitos porque Tailwind resuelve el `color-mix` de marca.css.
    for (const alfa of declaraciones.match(/#[0-9a-fA-F]{8}\b/g) ?? []) {
      if (esMaterial) continue;
      desenfoquesFuera += 1;
      error(
        `alfa fuera del material acrilico: "${alfa}" en "${selector.trim().slice(0, 60)}" (${hoja}) — ` +
          'el relleno con alfa se compone con color-mix en marca.css, no se escribe',
      );
    }
  }
}
if (desenfoquesFuera === 0) console.log('  + ninguno.');

// 6. Ambar como color de texto: valido sobre negro, invalido sobre blanco (docs/14 §3.3).
//    Se revisa en el origen porque el CSS ya perdio la relacion entre clase y contexto.
console.log('\n[6] Uso de ambar como texto (revision, no bloquea)');
// .ts incluido a proposito: las clases del boton viven ahi (src/estilos/boton.ts) y las
// comparten Astro y las islas React.
const fuentes = recorrer('src', ['.astro', '.tsx', '.ts', '.css']);
let ambares = 0;
for (const archivo of fuentes) {
  // Se quitan los comentarios: un comentario que EXPLICA la regla del ambar no es un uso.
  const contenido = readFileSync(archivo, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const usos = [...contenido.matchAll(/text-ambar/g)].length;
  if (usos === 0) continue;
  ambares += usos;
  if (contenido.includes('bg-negro')) {
    console.log(`  + ${archivo}: ${usos} uso/s y el archivo declara bg-negro (valido)`);
  } else {
    aviso(`${archivo}: ${usos} uso/s de text-ambar SIN bg-negro en el archivo — verificar que no caiga sobre blanco (1.7:1)`);
  }
}
if (ambares === 0) console.log('  + ninguna.');

// 8. Campos internos: lo que el JSON guarda para NO publicar no debe aparecer en el HTML.
//    Existe porque hay decisiones que viven dentro del contenido: que las cosechadoras no se
//    atienden (C9), que San Julian y San Miguel el Alto quedaron fuera (V-015), que el horario
//    y el aviso de privacidad siguen sin confirmarse. Nada de eso debe salir al visitante.
console.log('\n[8] Campos internos que no deben publicarse');
const CON_CLAVE_INTERNA = /"(noPublicado|pendientes)"\s*:\s*\[/;
let filtraciones = 0;
for (const archivo of recorrer('src/data', ['.json'])) {
  const crudo = readFileSync(archivo, 'utf8');
  if (!CON_CLAVE_INTERNA.test(crudo)) continue;
  const datos = JSON.parse(crudo);
  const internos = [...(datos.noPublicado ?? []), ...(datos.pendientes ?? [])];
  for (const entrada of internos) {
    for (const [clave, valor] of Object.entries(entrada)) {
      if (clave === 'fuente' || typeof valor !== 'string') continue;
      for (const pagina of paginas) {
        const html = readFileSync(pagina, 'utf8');
        // El texto largo interno (motivo) nunca debe estar; el identificador corto tampoco,
        // pero se reporta como aviso para no bloquear un uso legitimo futuro.
        if (clave === 'motivo' && html.includes(valor)) {
          filtraciones += 1;
          error(`texto interno publicado en ${pagina}: "${valor.slice(0, 60)}..."`);
        } else if (clave !== 'motivo' && html.includes(valor)) {
          aviso(`"${valor}" aparece en ${pagina} y figura como dato no publicado en ${archivo} — revisar`);
        }
      }
    }
  }
}
if (filtraciones === 0 && avisos === 0) console.log('  + ninguno: lo interno se quedo interno.');

// 9. Utilidades definidas en modulos .ts compartidos: tienen que existir en el CSS.
//    Motivo real: al mover las clases del boton a src/estilos/boton.ts, Tailwind dejo de
//    verlas (no estaba en los @source) y `border-2` desaparecio del CSS: el boton de
//    contorno se habria publicado sin borde, en silencio. Esta regla cierra ese hueco:
//    si una clase compartida no llega al CSS, el build falla en vez de degradar el diseno.
console.log('\n[9] Utilidades de modulos compartidos presentes en el CSS');
const cssCompleto = hojas.map((hoja) => readFileSync(hoja, 'utf8')).join('\n');
let ausentes = 0;
const modulos = recorrer('src/estilos', ['.ts']);
for (const modulo of modulos) {
  const contenido = readFileSync(modulo, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  // Las cadenas se toman SIN saltos de linea y solo si TODAS sus palabras parecen clases.
  // Sin estas dos condiciones, un `extra = ''` seguido de `): string {` hacia que el
  // extractor tomara "string" y "return" como si fueran clases (paso el 2026-09-29).
  const PATRON_CLASE = /^[a-z][a-z0-9:/\[\].%#-]*$/;
  const clases = new Set();
  for (const cadena of contenido.matchAll(/'([^'\n]+)'/g)) {
    const tokens = cadena[1].trim().split(/\s+/);
    if (tokens.length === 0 || !tokens.every((token) => PATRON_CLASE.test(token))) continue;
    tokens.forEach((token) => clases.add(token));
  }
  for (const clase of clases) {
    const escapado = clase.replace(/([:./\[\]()%#])/g, '\\$1');
    if (!cssCompleto.includes(`.${escapado}`)) {
      ausentes += 1;
      error(`la clase "${clase}" de ${modulo} no llega al CSS (¿falta un @source?)`);
    }
  }
  if (clases.size > 0) console.log(`  + ${modulo}: ${clases.size} clases verificadas en el CSS`);
}
if (ausentes === 0) console.log('  + todas presentes.');

// 9b. El material acrilico tiene que EXISTIR en el CSS y estar en uso (R05.26).
//     Motivo real: una clase mal escrita no genera CSS y degrada en silencio — la tarjeta se
//     publicaria sin material y nadie se entera hasta que se ve. Se comprueba en los dos
//     sentidos: si el marcado usa `.acrilico*`, la regla tiene que estar en el CSS; si la
//     regla existe, tiene que traer `backdrop-filter` (si no, es un rectangulo opaco con
//     otro nombre). Y una variante declarada que nadie usa es material muerto.
console.log('\n[9b] Material acrilico presente en el CSS y en uso');
const htmlTodas = paginas.map((pagina) => readFileSync(pagina, 'utf8')).join('\n');
let materialRoto = 0;
for (const clase of MATERIALES.keys()) {
  // `(?![-\w])` y no `\b`: hace falta el FINAL del nombre de la clase, no el comienzo de
  // otro mas largo. Con `\b`, un `.acrilico-tirado` (material retirado a medias) contaria
  // como si el material estuviera declarado y la tarjeta se publicaria opaca sin que la
  // regla 9b dijera nada. Escrito como dos patrones porque `clase` ya trae un guion.
  const usada = new RegExp(`class="[^"]*\\b${clase}(?![-\\w])`).test(htmlTodas);
  const conDesenfoque = new RegExp(`\\.${clase}(?![-\\w])[^}]*\\{[^}]*backdrop-filter`).test(cssCompleto);
  if (usada && !conDesenfoque) {
    materialRoto += 1;
    error(`.${clase} se usa en el marcado pero el CSS no la declara con backdrop-filter — la tarjeta se publicaria sin material`);
  } else if (!usada) {
    materialRoto += 1;
    error(`.${clase} esta declarada en el CSS pero ninguna pagina la usa — material muerto`);
  }
}
if (materialRoto === 0) console.log('  + ambas variantes llegan al CSS y se usan.');

// 10. Lo que se publica para buscadores y para compartir el enlace.
//     Se revisa el HTML real porque son los_search engines y los previsualizadores los que
//     leen estas etiquetas, no el autor. Cubre S1-D-02.9 (metas + OG) y S1-D-04.9 (SEO tecnico).
console.log('\n[10] Metadatos, canonica, Open Graph y datos estructurados');
const SITIO_TS = readFileSync('src/data/navegacion.ts', 'utf8');
const publicado = /publicado:\s*(true|false)/.exec(SITIO_TS)?.[1] === 'true';
// El horario es el unico dato que hoy impide cerrar el JSON-LD (B-03). Se exige que exista
// en navegacion.ts ANTES de poder emitir openingHours: asi el campo no puede aparecer por
// arte de un copypaste con un horario que nadie confirmo.
const horarioDeclarado = /^\s*horario:\s*\{/m.test(SITIO_TS);

/** Lee las dimensiones de un PNG desde la cabecera IHDR, sin dependencias. */
function dimensionesPng(ruta) {
  const buffer = readFileSync(ruta);
  if (buffer.length < 24) return null;
  return { ancho: buffer.readUInt32BE(16), alto: buffer.readUInt32BE(20) };
}

const espera = (html, patron) => patron.exec(html)?.[1];
let metaProblemas = 0;
for (const pagina of paginas) {
  const html = readFileSync(pagina, 'utf8');
  // Las paginas de redireccion (`/ir/*`) llevan `fueraDeIndice`: no se comparten ni se
  // indexan, asi que reciben el mismo trato que la 404 (sin canonica, sin og:image, sin
  // aria-current). Se detectan por el noindex SIN canonica: una pagina de contenido con
  // publicado=false lleva noindex PERO conserva su canonica.
  const es404 = /404\.html$/.test(pagina) || (/\/ir\//.test(pagina) && !/<link rel="canonical"/.test(html));
  const erroresDe = (m) => {
    metaProblemas += 1;
    error(`${pagina}: ${m}`);
  };

  if (!/<html lang="es-MX"/.test(html)) erroresDe('falta lang="es-MX" en <html>');
  const h1 = html.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1 !== 1) erroresDe(`${h1} <h1> (debe haber exactamente 1)`);

  const titulo = espera(html, /<title>([^<]*)<\/title>/) ?? '';
  if (titulo.length === 0) erroresDe('sin <title>');
  else if (titulo.length > 60) erroresDe(`<title> de ${titulo.length} caracteres (se corta a 60)`);
  if (/\bSIEMES\b/.test(titulo)) erroresDe('SIEMES en el <title>');

  const descripcion = espera(html, /<meta name="description" content="([^"]*)"/) ?? '';
  if (descripcion.length === 0) erroresDe('sin meta description');
  else if (descripcion.length > 160) erroresDe(`meta description de ${descripcion.length} caracteres (se corta a 160)`);

  const canonica = espera(html, /<link rel="canonical" href="([^"]*)"/);
  if (es404) {
    // Una 404 canonizada es la forma mas corta de que Google indexe un error.
    if (canonica) erroresDe('la 404 tiene canonica: no debe indexarse');
    if (!/<meta name="robots" content="noindex"/.test(html)) erroresDe('la 404 no lleva noindex');
  } else {
    if (!canonica) erroresDe('sin link rel=canonical');
    if (!publicado && !/<meta name="robots" content="noindex"/.test(html)) {
      erroresDe('publicado=false pero la pagina NO lleva noindex: se indexaria en un deploy de vista previa');
    }
  }

  // Open Graph: sin esto el enlace llega sin imagen al compartirlo, que es el caso de uso
  // real de este sitio (el cliente vive en WhatsApp).
  // La 404 queda EXENTA de og:image: no se comparte un error, y poner una imagen social en
  // una pagina noindex solo haria que el error se viera como una pieza de marca.
  const etiquetasOg = [
    ['og:title', /property="og:title" content="([^"]*)"/],
    ['og:description', /property="og:description" content="([^"]*)"/],
    ['og:url', /property="og:url" content="([^"]*)"/],
    ...(es404
      ? []
      : [
          ['og:image', /property="og:image" content="([^"]*)"/],
          ['twitter:card', /name="twitter:card" content="([^"]*)"/],
        ]),
  ];
  for (const [etiqueta, patron] of etiquetasOg) {
    if (!espera(html, patron)) erroresDe(`falta ${etiqueta}`);
  }

  // La imagen social tiene que EXISTIR en dist/ y ser de 1200x630: una og:image que da 404
  // deja la previsualizacion vacia, y es el fallo que nadie ve hasta que alguien comparte.
  const ogImagen = espera(html, /property="og:image" content="([^"]*)"/);
  if (ogImagen) {
    const relativa = new URL(ogImagen).pathname;
    const destino = `${PUB}${relativa}`;
    if (!existsSync(destino)) erroresDe(`og:image apunta a ${relativa} y ese archivo no existe en dist/`);
    else {
      const dims = dimensionesPng(destino);
      if (!dims) erroresDe(`og:image ${relativa} no es un PNG legible`);
      else if (dims.ancho !== 1200 || dims.alto !== 630) {
        erroresDe(`og:image ${relativa} mide ${dims.ancho}x${dims.alto} (se espera 1200x630)`);
      }
    }
  }

  // Datos estructurados: tienen que parsear y traer lo minimo para que Google entienda
  // el negocio. Y no pueden traer lo que sigue sin confirmar.
  const jsonLd = espera(html, /<script type="application\/ld\+json">(.*?)<\/script>/s);
  if (!jsonLd) {
    erroresDe('sin datos estructurados JSON-LD');
  } else {
    let datos = null;
    try {
      datos = JSON.parse(jsonLd.replace(/\\u003c/g, '<'));
    } catch (e) {
      erroresDe(`el JSON-LD no parsea: ${e.message}`);
    }
    if (datos) {
      for (const campo of ['@type', 'name', 'legalName', 'telephone', 'address', 'areaServed', 'makesOffer']) {
        if (datos[campo] === undefined) erroresDe(`el JSON-LD no declara "${campo}"`);
      }
      if (datos['@type'] !== 'LocalBusiness') erroresDe(`@type = ${datos['@type']} (se espera LocalBusiness)`);
      if (datos.openingHours && !horarioDeclarado) {
        erroresDe('el JSON-LD declara openingHours pero el horario sigue sin confirmar (B-03)');
      }
      if (datos.aggregateRating || datos.reviewCount) {
        erroresDe('el JSON-LD inventa una valoracion: no hay dato verificado (docs/14 y directrices de Google)');
      }
      if (datos.geo) erroresDe('el JSON-LD declara geo y no hay coordenadas verificadas');
    }
  }
}

// El sitemap tiene que traer todas las URLs canonicas y NINGUNA más.
const sitemap = paginas.length > 0 && existsSync(`${PUB}/sitemap-0.xml`) ? readFileSync(`${PUB}/sitemap-0.xml`, 'utf8') : '';
if (!sitemap) {
  metaProblemas += 1;
  error(`no hay ${PUB}/sitemap-0.xml: revisa que @astrojs/sitemap siga activo`);
} else {
  const delSitemap = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const pagina of paginas) {
    const html = readFileSync(pagina, 'utf8');
    const canonica = espera(html, /<link rel="canonical" href="([^"]*)"/);
    if (!canonica) continue;
    if (!delSitemap.includes(canonica)) {
      metaProblemas += 1;
      error(`${pagina}: su canonica ${canonica} no esta en el sitemap`);
    }
  }
  if (delSitemap.some((url) => /404/.test(url))) {
    metaProblemas += 1;
    error('el sitemap incluye la 404');
  }
  // Las redirecciones son destinos de QR, no contenido: si caen al sitemap, Google las
  // indexa como paginas. El filtro vive en astro.config.mjs; aqui se comprueba que siga
  // funcionando. Paso de verdad el 2026-09-29 al crear `/ir/*`.
  if (delSitemap.some((url) => /\/ir\//.test(url))) {
    metaProblemas += 1;
    error('el sitemap incluye una redireccion /ir/* (deben quedar fuera: astro.config.mjs filter)');
  }
  console.log(`  + sitemap con ${delSitemap.length} URL(s), todas con canonica en el HTML`);
}

// robots.txt: tiene que existir y apuntar al sitemap del sitio configurado.
if (!existsSync(`${PUB}/robots.txt`)) {
  metaProblemas += 1;
  error(`no hay ${PUB}/robots.txt`);
} else {
  const robots = readFileSync(`${PUB}/robots.txt`, 'utf8');
  if (!/^Sitemap:\s*https?:\/\//m.test(robots)) {
    metaProblemas += 1;
    error('robots.txt sin linea Sitemap: con `site` sin definir, Google se queda sin sitemap');
  }
  if (/^Disallow:\s*\/\s*$/m.test(robots)) {
    metaProblemas += 1;
    error('robots.txt con Disallow: / — impediria leer el noindex del HTML y deja el sitio indexado sin salida');
  }
  console.log(`  + robots.txt con la linea Sitemap y sin bloqueo de rastreo`);
}
if (metaProblemas === 0) console.log('  + las 5 paginas y la 404 llevan titulo, descripcion, canonica, OG y JSON-LD.');

// 11. Coherencia de los numeros entre paginas.
//     Existe porque paso de verdad el 2026-09-29: la portada anunciaba "7 municipios en
//     cobertura" (el dato crudo C6) mientras /cobertura/ publica 6, porque V-015 quito San
//     Julian y San Miguel el Alto. La regla 8 no lo atrapaba: buscaba los NOMBRES de los
//     municipios, y el numero no es un nombre. Una cifra que cuenta algo que el sitio
//     publica en otra pagina se verifica contra esa pagina.
console.log('\n[11] Cifras de Inicio coherentes con lo que se publica en las demas paginas');
const inicio = JSON.parse(readFileSync('src/data/inicio.json', 'utf8'));
const marcas = JSON.parse(readFileSync('src/data/marcas.json', 'utf8'));
const cobertura = JSON.parse(readFileSync('src/data/cobertura.json', 'utf8'));
const unicas = new Set(marcas.grupos.flatMap((g) => g.marcas)).size;
const esperado = [
  { patron: /municipios/i, valor: cobertura.municipios.length, donde: 'cobertura.json' },
  { patron: /marcas atendidas/i, valor: unicas, donde: `marcas.json (${unicas} marcas unicas)` },
  {
    patron: /diagn.stico computarizado/i,
    valor: marcas.diagnosticoComputarizado.marcas.length,
    donde: 'marcas.json (C43)',
  },
];
let cifras = 0;
for (const cifra of inicio.cifras) {
  const regla = esperado.find((e) => e.patron.test(cifra.etiqueta));
  if (!regla) continue;
  cifras += 1;
  if (Number(cifra.valor) !== regla.valor) {
    error(`la portada dice "${cifra.valor} ${cifra.etiqueta}" y ${regla.donde} tiene ${regla.valor}`);
  } else {
    console.log(`  + "${cifra.valor} ${cifra.etiqueta}" cuadra con ${regla.donde}`);
  }
}
if (cifras === 0) console.log('  ! ninguna cifra de Inicio coincide con una regla conocida: revisa las etiquetas o anade la regla');

// 12. Accesibilidad de lo que se publica (WCAG 2.2 AA en lo que se puede medir sin navegador).
//     No es una opinion sobre "que se ve bien": son umbrales y relaciones que se comprueban
//     sobre el HTML de dist/. Lo que NO se puede medir aqui (area de toque, reflow a 320px,
//     contraste de imagenes, orden visual de tabulacion) queda como revision del operador
//     en docs/15 §4.8 y no se finge estar comprobado.
//
//     EL CONTRASTE SE MEDE SOBRE LA CASCADA, NO SOBRE UNA TABLA FIJA. La primera version de
//     esta regla cruzaba todos los `text-*` con todos los `bg-*` de un mismo elemento y
//     reportaba "negro sobre negro = 1.00:1" en botones que en realidad son correctos
//     (`bg-ambar text-negro hover:bg-negro hover:text-ambar`: en hover el texto SI cambia).
//     Aqui se resuelve por clave de variante: para el estado S, el color es el de la clave
//     S y, si no existe, el de la clave base; y el fondo es el del ancestro mas cercano que
//     declare esa clave. Es la cascada de Tailwind aproximada, y con ella salen solo los
//     pares que de verdad existen.
//
//     Un dato que la medicion dio y que no estaba en docs/14 §3.3: los 4.17:1 de tinte-3
//     sobre numeral. docs/14 advertia del ambar sobre blanco (1.53:1 medido) pero no del
//     cruce tinte-3/numeral, y las tres etiquetas que caian ahi fallaban AA en texto chico.
let accesibilidad = 0;
const fallaAcc = (m) => {
  accesibilidad += 1;
  error(`[accesibilidad] ${m}`);
};

/** Luminancia relativa WCAG. */
const luminancia = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
/** Razon de contraste entre dos hex de la paleta. */
const razon = (a, b) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
// body declara `background-color: var(--color-blanco); color: var(--color-negro)` en
// src/styles/marca.css. Se comprueba que siga siendo cierto antes de heredar esos valores:
// si alguien cambia el fondo base, la cascada que se simula aqui dejaria de ser la real.
const MARCA_CSS = readFileSync('src/styles/marca.css', 'utf8');
// Se lee el bloque `body { ... }` y se separan las DOS declaraciones. Con una sola regex
// sobre el archivo entero, `color:` encontraria primero `background-color:` y el fondo base
// se leeria como texto — un falso "todo pasa" silencioso.
const CUERPO_BASE = /(^|[\s,])body\s*\{([^}]*)\}/.exec(MARCA_CSS)?.[2] ?? '';
const COLOR_BASE_BG = /background-color:\s*var\(--color-([\w-]+)\)/.exec(CUERPO_BASE)?.[1] ?? 'blanco';
const COLOR_BASE_FG = /(^|[\s;])color:\s*var\(--color-([\w-]+)\)/.exec(CUERPO_BASE)?.[2] ?? 'negro';
if (!/background-color:\s*var\(--color-/.test(CUERPO_BASE)) {
  accesibilidad += 1;
  error('[accesibilidad] src/styles/marca.css: el bloque `body` no declara background-color con un token; la cascada simulada seria falsa');
}

// token de @theme -> hex. Se arma desde src/styles/marca.css y no desde una tabla escrita a
// mano: si alguien cambia `--color-tinte-3`, el contraste se recalcula con el valor nuevo y
// no contra un numero que se quedo viejo en el guion. Los hex que salen de ahi y NO estan
// en la paleta los reporta la regla 1; aqui solo se usan para medir.
const TOKENS = new Map(
  [...MARCA_CSS.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map((m) => [m[1], m[2].toLowerCase()]),
);
// Texto que se exime de 1.4.3 solo si el propio marcado declara que es decoracion. Sin el
// `aria-hidden`, la excepcion no aplica: la guardia no presume decoracion.
const UMBRAL_AA = 4.5;
const SIN_CONTRASTE_QUE_MIDE = ['img', 'meta', 'link', 'br', 'hr', 'input', 'source'];
const paresMedidos = new Map();
const paresRepetidos = [];
const paresDecorativos = new Map();

/** Defectos de la regla 15 (numeral decorativo y marca de agua). */
let numeralesDeco = 0;

for (const pagina of paginas) {
  const html = readFileSync(pagina, 'utf8');
  const relativa = pagina.replace('dist', '');
  const paginaRelative = relativa;

  // ── Estructura de encabezados ──
  const niveles = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  for (let i = 1; i < niveles.length; i += 1) {
    if (niveles[i] - niveles[i - 1] > 1) {
      fallaAcc(`${paginaRelative}: salto de encabezado h${niveles[i - 1]} a h${niveles[i]} — el orden de niveles rompe la navegacion por encabezados`);
    }
  }
  // El h1 ya lo cuenta la regla 10. Aqui se revisa que el primer encabezado de cada pagina
  // sea el h1: si el documento empieza en un h2, el titulo principal queda sin announces.
  if (niveles.length > 0 && niveles[0] !== 1) {
    fallaAcc(`${paginaRelative}: el primer encabezado es h${niveles[0]}, no h1`);
  }

  // ── Imagenes ──
  for (const [img] of html.matchAll(/<img\b[^>]*>/g)) {
    const alt = /\salt="([^"]*)"/.exec(img)?.[1];
    if (alt === undefined) fallaAcc(`${paginaRelative}: <img> sin atributo alt`);
    else if (alt === '' && !/aria-hidden="true"/.test(img)) {
      fallaAcc(`${paginaRelative}: <img alt=""> sin aria-hidden — un alt vacio sin aria-hidden se lee como "imagen sin nombre"`);
    }
  }

  // ── Controles de formulario: nombre accesible ──
  const idsEtiquetados = new Set([...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]));
  // El match completo es la posicion 0; el grupo 1 es la etiqueta del elemento y el 2 el
  // value de `type`. Destruirlos mal en silencio hacia que la regla saltara sobre controles
  // que si tienen nombre — paso al escribirla, por eso el destructuring va con las tres
  // posiciones explicitas y `ctrl` es el match completo.
  for (const [ctrl, etiqueta, tipo] of html.matchAll(/<(input|select|textarea)\b[^>]*\btype="([^"]*)"[^>]*>/g)) {
    // `hidden` no se anuncia. Los `radio` se revisan aparte, por conteo de labels envolventes.
    if (tipo === 'hidden' || tipo === 'radio') continue;
    if (/aria-label(?:ledby)?=/.test(ctrl)) continue;
    const id = /\bid="([^"]+)"/.exec(ctrl)?.[1];
    if (id && idsEtiquetados.has(id)) continue;
    fallaAcc(`${paginaRelative}: <${etiqueta}> sin nombre accesible (sin aria-label, sin id con <label for>)`);
  }
  // Un textarea o un select sin etiqueta es el caso que mas se escapa: se ven bien.
  for (const [ctrl, etiqueta] of html.matchAll(/<(textarea|select)\b[^>]*>/g)) {
    const id = /\bid="([^"]+)"/.exec(ctrl)?.[1];
    if (!id || !idsEtiquetados.has(id)) {
      fallaAcc(`${paginaRelative}: <${etiqueta}> sin <label for="${id ?? '(sin id)'}">`);
    }
  }
  // Los botones de radio del formulario van DENTRO de su <label> (asociacion implicita, que
  // es valida y es la que se usa). Contar es mas honesto que intentar emparejar el radio con
  // el label por posicion en un HTML minificado: si hay mas radios sin nombre propio que
  // labels envolventes, alguno quedo fuera.
  const labelsEnvuelven = [...html.matchAll(/<label\b(?![^>]*\bfor=)[^>]*>/g)].length;
  const radiosHuerfanos = [...html.matchAll(/<input\b[^>]*type="radio"[^>]*>/g)]
    .filter(([c]) => !/aria-label/.test(c) && !idsEtiquetados.has(/\bid="([^"]+)"/.exec(c)?.[1] ?? '')).length;
  if (radiosHuerfanos > labelsEnvuelven) {
    fallaAcc(
      `${paginaRelative}: ${radiosHuerfanos} radio(s) sin nombre accesible y solo ${labelsEnvuelven} <label> que los envuelva`,
    );
  }

  // ── Navegaciones con nombre ──
  for (const [nav] of html.matchAll(/<nav\b[^>]*>/g)) {
    if (!/aria-label(?:ledby)?=/.test(nav)) {
      fallaAcc(`${paginaRelative}: <nav> sin aria-label — hay varias y el lector de pantalla las anuncia todas como "navegacion"`);
    }
  }

  // ── Enlace de salto ──
  const salto = /<a[^>]*href="#([^"]+)"/.exec(html)?.[1];
  if (!salto) fallaAcc(`${paginaRelative}: sin enlace de salto al contenido`);
  else if (!new RegExp(`id="${salto}"`).test(html)) {
    fallaAcc(`${paginaRelative}: el enlace de salto apunta a #${salto} y ese id no existe`);
  }

  // ── Numeral decorativo y marca de agua (regla 15) ──
  //     Motivo real (auditoria del operador, 2026-09-30): 12 numerales seguian pintados con
  //     `text-numeral` (#EEEEF0) sobre fondo BLANCO — 1.16:1, invisibles — en servicios
  //     (principales x6, proceso x3) y experiencia (proceso x3). La guardia no los veia
  //     porque llevaban `aria-hidden`, que es exactamente el modo de fallo que docs/14 §4.3
  //     creia cerrado: la excepcion de contraste se concedia SIN mirar el fondo. Aqui se
  //     cierran las dos puertas a la vez, y por eso son dos comprobaciones y no una:
  //       a) el numeral decorativo tiene que declararse decoracion (aria-hidden);
  //       b) el tinte de marca de agua solo vale sobre un fondo negro. Su unico uso
  //          sancionado por el kit es la marca de agua sobre negro; sobre blanco es una
  //          jerarquia que nadie ve.
  for (const m of html.matchAll(/<[a-z0-9]+\b[^>]*\bclass="([^"]*)"[^>]*>/g)) {
    const clase = m[1];
    const elemento = m[0];
    if (/\btext-indice\b/.test(clase) && !/aria-hidden="true"/.test(elemento)) {
      numeralesDeco += 1;
      error(
        `${paginaRelative}: un numeral con "text-indice" sin aria-hidden="true" — se anunciaria ` +
          `como si fuera texto del documento`,
      );
    }
    if (/\btext-numeral\b/.test(clase) && !/\bbg-negro\b/.test(clase)) {
      numeralesDeco += 1;
      error(
        `${paginaRelative}: "text-numeral" (#EEEEF0) fuera de un fondo negro — es marca de agua, ` +
          `y sobre blanco da 1.16:1: invisible`,
      );
    }
  }

  // ── La pagina actual ──
  // Las redirecciones (`/ir/*`, fuera de indice) tampoco marcan seccion: nadie navega ahi.
  const fueraDeIndice = /404\.html$/.test(pagina) || /\/ir\//.test(pagina);
  const actual = [...html.matchAll(/aria-current="page"/g)].length;
  if (fueraDeIndice && actual > 0) {
    fallaAcc(`${paginaRelative}: marca aria-current="page" pero no es una seccion del sitio (404 o redireccion)`);
  } else if (!fueraDeIndice && actual === 0) {
    fallaAcc(`${paginaRelative}: sin aria-current="page" en la navegacion — el visitante no sabe en que seccion esta`);
  }

  // ── Contraste real, resuelto por cascada ──
  const pila = [
    {
      tag: 'body',
      bg: new Map([['', COLOR_BASE_BG]]),
      fg: new Map([['', COLOR_BASE_FG]]),
    },
  ];
  for (const [, cierre, tag, attrs, auto] of html.matchAll(
    /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g,
  )) {
    if (cierre) {
      while (pila.length > 1) {
        if (pila.pop().tag === tag) break;
      }
      continue;
    }
    const clases = /class="([^"]*)"/.exec(attrs)?.[1] ?? '';
    const padre = pila[pila.length - 1];
    const fondo = new Map(padre.bg);
    const tinta = new Map(padre.fg);
    const claves = new Set(['']);
    for (const token of clases.split(/\s+/).filter(Boolean)) {
      const corte = token.lastIndexOf(':');
      const clave = corte > 0 ? token.slice(0, corte) : '';
      const util = corte > 0 ? token.slice(corte + 1) : token;
      // `util.slice(n)` devuelve el NOMBRE del token (negro, tinte-3…), no su hex. La
      // pertenencia se comprueba contra TOKENS, que es donde vive el nombre. Compararlo
      // contra PALETA (que son hex) hacia que ningun color entrara y la tabla saliera vacia:
      // un fallo silencioso que se ve como "todo pasa".
      if (util.startsWith('bg-') && TOKENS.has(util.slice(3))) {
        fondo.set(clave, util.slice(3));
        claves.add(clave);
      }
      // R05.26: el material acrilico se declara por clase, no por utilidad `bg-`, asi que
      // se lee aparte. Sin esta linea el texto de las tarjetas se mediria contra el fondo
      // de la banda clara y saltarian ~40 falsos positivos.
      if (MATERIALES.has(util)) {
        fondo.set(clave, util);
        claves.add(clave);
      }
      if (util.startsWith('text-') && TOKENS.has(util.slice(5))) {
        tinta.set(clave, util.slice(5));
        claves.add(clave);
      }
    }
    // Solo se revisan los estados que el elemento declara: los demas son el estado base.
    for (const estado of claves) {
      const nombreFg = tinta.get(estado) ?? tinta.get('') ?? COLOR_BASE_FG;
      const nombreBg = fondo.get(estado) ?? fondo.get('') ?? COLOR_BASE_BG;
      const hexFg = TOKENS.get(nombreFg);
      const hexBg = TOKENS.get(nombreBg) ?? MATERIALES.get(nombreBg);
      if (!hexFg || !hexBg) continue;
      const r = razon(hexFg, hexBg);
      const etiqueta = `${hexFg} sobre ${hexBg}`;
      paresMedidos.set(etiqueta, Math.max(paresMedidos.get(etiqueta) ?? 0, r));
      if (r >= UMBRAL_AA) continue;
      // Salvedad: el texto que el propio marcado declara decorativo queda fuera de 1.4.3.
      // Aqui NO se presume decoracion: se exige el `aria-hidden` en el elemento.
      if (/aria-hidden="true"/.test(attrs) && estado === '') {
        const previo = paresDecorativos.get(etiqueta) ?? { usos: 0, ejemplos: new Set() };
        previo.usos += 1;
        if (previo.ejemplos.size < 3) previo.ejemplos.add(`${paginaRelative} <${tag}>`);
        paresDecorativos.set(etiqueta, previo);
        continue;
      }
      paresRepetidos.push(`${paginaRelative} <${tag}${estado ? ` (${estado})` : ''}> ${etiqueta} = ${r.toFixed(2)}:1`);
      fallaAcc(
        `${paginaRelative}: <${tag}> ${etiqueta} da ${r.toFixed(2)}:1 y se necesita ${UMBRAL_AA}:1 — usa tinte-2 o negro, o cambia el fondo`,
      );
    }
    if (!auto && !SIN_CONTRASTE_QUE_MIDE.includes(tag)) pila.push({ tag, bg: fondo, fg: tinta });
  }
}

// El foco tiene que ser visible: sin esto, quien navega con teclado no sabe donde esta.
if (!/:focus-visible\s*\{[^}]*outline:\s*3px solid/.test(cssCompleto)) {
  fallaAcc('el CSS no declara un :focus-visible con outline de 3px — el foco seria invisible con teclado');
}
// El zoom del movil no se bloquea:.user-scalable=no es un fallo de accesibilidad (WCAG 1.4.4).
for (const pagina of paginas) {
  const v = /<meta name="viewport" content="([^"]*)"/.exec(readFileSync(pagina, 'utf8'))?.[1] ?? '';
  if (!v) fallaAcc(`${pagina.replace('dist', '')}: sin <meta name="viewport">`);
  else if (/user-scalable=no|maximum-scale=1/.test(v)) {
    fallaAcc(`${pagina.replace('dist', '')}: el viewport bloquea el zoom (${v})`);
  }
}
const tabla = [...paresMedidos].sort((a, b) => a[1] - b[1]);
console.log(`\n[12] Contraste medido sobre ${paginas.length} pagina(s), resuelto por cascada (WCAG AA = ${UMBRAL_AA}:1)`);
for (const [par, r] of tabla) {
  const decorativo = paresDecorativos.has(par);
  console.log(`  ${r >= UMBRAL_AA ? '+' : decorativo ? 'o' : 'x'} ${par.padEnd(28)} ${r.toFixed(2).padStart(6)}:1`);
}
if (paresRepetidos.length === 0) console.log(`  + ningun texto legible por debajo de ${UMBRAL_AA}:1`);
for (const [par, info] of paresDecorativos) {
  console.log(`  o ${par} por debajo de ${UMBRAL_AA}:1 en ${info.usos} elemento(s), todos con aria-hidden="true"`);
  console.log(`      decoracion marcada como tal: ${[...info.ejemplos].join(', ')}`);
}
if (numeralesDeco === 0) {
  console.log('  + numerales decorativos con aria-hidden, y sin marca de agua sobre fondo claro.');
}
if (accesibilidad === 0) {
  console.log('  + encabezados sin saltos, img con alt, controles con nombre, navs con nombre, enlace de salto con destino, foco visible y zoom libre.');
}

// 13. Escala tipografica por ROL, con piso duro.
//     Motivo real: el sitio se habia construido mirando el NOMBRE de la clase y no el
//     tamano. `text-sm` significa "chico" y el cuerpo cayo a 14 px, la etiqueta a 12 px.
//     MEDIDO el 2026-09-29 con scripts/medir-densidad.mjs: 65% del texto del sitio por
//     debajo de 16 px, y el operador reporto que "los textos de todas las secciones se
//     sienten pequenos". La escala por rol vive en src/styles/marca.css; aqui se verifica
//     que el codigo la use y que la escala no vuelva a bajar del piso.
//
//     Tres capas, como con el color (regla 1) y con las clases compartidas (regla 9):
//       a) Ningun tamano numerico. `marca.css` hace `--text-*: initial`, asi que `text-sm`
//          ya no EXISTE: si alguien lo escribiera, el build no fallaria y el elemento
//          heredaria 18 px del body,publicando el cambio a medias. Aqui se corta en el
//          codigo, que es donde se puede cortar.
//       b) Todo `text-<algo>` que no sea un rol declarado ni un color de la paleta es un
//          nombre mal escrito, y un nombre mal escrito no genera CSS: falla en silencio.
//       c) Ningun rol por debajo de 14 px, y todo rol declarado tiene que existir en el CSS
//          emitido (un token que no llega al CSS es un rol que no existe en la pagina).
console.log('\n[13] Escala tipografica por rol (piso 14 px, sin escala numerica)');
const CSS_TEMA = readFileSync('src/styles/marca.css', 'utf8');
const ROLES = new Map(); // rol -> [px, ...]
for (const m of CSS_TEMA.matchAll(/--text-([a-z0-9-]+):\s*([\d.]+)(rem|px)\b/g)) {
  if (m[1].endsWith('-line-height')) continue;
  const px = m[2] * (m[3] === 'rem' ? 16 : 1);
  ROLES.set(m[1], [...(ROLES.get(m[1]) ?? []), px]);
}
const COLORES_TEXTO = new Set(
  [...CSS_TEMA.matchAll(/--color-([a-z0-9-]+):\s*#/g)].map((m) => m[1]),
);
/** El CSS emitido sin los bloques de rasgos (`:where(...)`), que MENCIONAN roles sin ser su
 *  utilidad. Lo que se quiere verificar es que el rol genere utilidad, no que su nombre
 *  aparezca en alguna parte. */
const CSS_SIN_RASGOS = cssCompleto.replace(/:where\([^)]*\)\{[^}]*\}/g, '');
const PISO_PX = 14;
const TAMANOS_NUMERICOS = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl'];
/** Utilidades `text-*` que existen pero NO son de tamano. Sin esta lista la regla los
 *  reportaba como "nombre mal escrito" (paso de verdad el 2026-09-29 con `text-center`,
 *  `text-wrap` y `text-ellipsis`: los tres son alineacion, ajuste de linea y recorte, y
 *  tienen su propia namespace en Tailwind). Un falso positivo aqui es peor que no tener la
 *  regla, porque entrena a ignorar el aviso. */
const TEXT_NO_TAMANO = new Set([
  'left', 'center', 'right', 'justify', 'start', 'end', // text-align
  'wrap', 'nowrap', 'balance', 'pretty', // text-wrap
  'ellipsis', 'clip', // text-overflow
  // Propiedades CSS cuyo nombre empieza por `text-`. Entran aqui por el mismo motivo que
  // las de arriba: el barrido lee los .css y las toma por clases. `text-transform` entro
  // el 2026-09-30, cuando los rasgos del rol (mayusculas de `etiqueta` y `boton`) se
  // movieron de cada elemento a marca.css. `text-shadow` sigue prohibido, pero lo prohibe
  // la regla de efectos, no esta.
  'transform', 'decoration', 'indent', 'size-adjust', 'overflow', 'shadow', 'rendering',
  // `decoration-thickness` y `underline-offset` entraron el 2026-10-05 (R04.13): son
  // propiedades del `.enlace-dinamico` de marca.css, no clases en el marcado.
  'decoration-thickness', 'underline-offset',
  // `decoration-color` entra el 2026-10-05 (R05.7): propiedad del `.seccion-activa` del
  // scroll-spy en marca.css, mismo motivo que las dos de arriba. R05.28 quito el subrayado
  // de `.seccion-activa` (ahora es la tarjeta ambar), pero el enlace de WhatsApp del pie
  // sigue usando `decoration-ambar`, asi que la excepcion se queda y el comentario se
  // corrige: si se quita el subrayado del pie, esta linea se va con ella.
  'decoration-color',
]);
let escala = 0;

for (const [rol, valores] of [...ROLES].sort((a, b) => b[1][0] - a[1][0])) {
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = min === max ? `${min} px` : `${min}-${max} px`;
  if (min < PISO_PX) {
    escala += 1;
    error(`el rol "text-${rol}" baja a ${min} px y el piso del sistema es ${PISO_PX} px`);
  } else if (!CSS_SIN_RASGOS.includes(`.text-${rol}`)) {
    // `CSS_SIN_RASGOS` y no `cssCompleto`: la tabla de rasgos del rol usa `:where(.text-x, ...)`
    // y MENCIONA el nombre del rol sin generar su utilidad. Comprobar el CSS completo dejaba
    // pasar como bueno un rol que ningun elemento usa — falso negativo introducido el
    // 2026-09-30 al mover las mayusculas de `etiqueta` a esa tabla, y que escondio el rol
    // muerto `cuerpo-denso` hasta que su propia prueba negativa lo delato.
    escala += 1;
    error(`el rol "text-${rol}" esta declarado en marca.css pero no llega al CSS emitido`);
  } else {
    console.log(`  + text-${rol.padEnd(12)} ${rango.padStart(10)}`);
  }
}

// Nombres de tamano que no son rol: numericos (retirados) o errores de escritura.
const ROLES_ORDENADOS = [...ROLES.keys()].sort((a, b) => b.length - a.length);
const coloresOrdenados = [...COLORES_TEXTO].sort((a, b) => b.length - a.length);
for (const archivo of fuentes) {
  const contenido = readFileSync(archivo, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const m of contenido.matchAll(/(?:^|[\s"':])([a-z0-9-]+:)?text-([a-z0-9-]+)\b/g)) {
    const nombre = m[2];
    if (COLORES_TEXTO.has(nombre)) continue;
    if (TEXT_NO_TAMANO.has(nombre)) continue;
    const esColor = coloresOrdenados.some((c) => nombre.startsWith(`${c}-`) || nombre === c);
    if (esColor) continue;
    if (ROLES.has(nombre)) continue;
    escala += 1;
    if (TAMANOS_NUMERICOS.includes(nombre)) {
      error(
        `${archivo}: "text-${nombre}" es un tamano numerico, no un rol. La escala por rol ` +
          `(marca.css) no lo declara y el piso es ${PISO_PX} px — usa el rol que corresponda`,
      );
    } else {
      error(
        `${archivo}: "text-${nombre}" no es un rol de la escala ni un color de la paleta — ` +
          `no genera CSS y el texto se publicaria al tamano heredado sin aviso`,
      );
    }
  }
}
if (escala === 0) {
  console.log(`  + ${ROLES.size} roles, ninguno bajo ${PISO_PX} px y todos presentes en el CSS.`);
  console.log('  + ningun tamano numerico en el codigo.');
}

// 14. Techo de densidad del espacio.
//     Motivo real: la queja del operador fue "hay mucho espacio en general", y el sitio
//     separaba bloques con una sola medida repetida (mt-16 = 64 px doce veces, mt-20 = 80 px
//     cinco veces) sin distinguir "cambio de seccion" de "respiro dentro de un bloque".
//     Separar dos ideas distintas con la misma medida es lo que produce el vacio.
//     Los tres techos de aqui no son una preferencia estetica: cada uno corresponde a un rol
//     del ritmo y su justificacion esta medida en scripts/ajustar-densidad.py.
console.log('\n[14] Techo de densidad del ritmo vertical');
const TECHOS = [
  { patron: /(?<!scroll-)\b(?:sm:|md:|lg:|xl:|2xl:)?(?:mt|mb|space-y)-(\d{1,2})\b/g, maximo: 12, px: 48, rol: 'cambio de seccion' },
  { patron: /\b(?:sm:|md:|lg:|xl:|2xl:)?(?:py|pt|pb)-(\d{1,2})\b/g, maximo: 10, px: 40, rol: 'padding de bloque' },
  { patron: /\b(?:sm:|md:|lg:|xl:|2xl:)?gap-(\d{1,2})\b/g, maximo: 6, px: 24, rol: 'hueco de rejilla' },
];
let densidad = 0;
for (const { patron, maximo, px, rol } of TECHOS) {
  let mayor = 0;
  let usos = 0;
  for (const archivo of fuentes) {
    const contenido = readFileSync(archivo, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const m of contenido.matchAll(patron)) {
      const n = Number(m[1]);
      usos += 1;
      if (n > mayor) mayor = n;
      if (n > maximo) {
        densidad += 1;
        error(
          `${archivo}: separacion de ${n * 4} px en "${rol}" (techo ${px} px). ` +
            `Un margen mayor se reserva a un cambio de seccion real, no a un respiro.`,
        );
      }
    }
  }
  if (densidad === 0) {
    console.log(`  + ${rol.padEnd(18)} techo ${String(px).padStart(2)} px · mayor usado ${String(mayor * 4).padStart(2)} px · ${usos} usos`);
  }
}

// 16. Estandar del rol y del arbol de encabezados.
//     Motivo real (estandarizacion del 2026-09-30, pedida por el operador): el sistema tenia
//     dos ejes que el marcado podia mover por su cuenta y los movia. El rol llevaba solo
//     tamano, asi que familia y peso se escribian a mano en cada elemento (`font-titular` x24,
//     `font-bold` x348 en el HTML publicado) y el mismo rol salia con tres pesos distintos. Y
//     el `<h2>` hacia cuatro trabajos, asi que el arbol de encabezados no decia nada.
//     Las dos reglas de aqui son el mismo criterio aplicado a cada eje:
//       16a) La familia la impone el rol. `font-titular` / `font-cuerpo` no se escriben en el
//            marcado: si aparecen, alguien puede volver a desincronizar una parte del sitio
//            sin que nada lo note, que es exactamente como empezo el problema.
//       16b) Cada nivel de encabezado usa el rol de su nivel. La unica excepcion declarada es
//            el rotulo de seccion (h2 con `etiqueta` + un `indice` delante), que es la marca
//            de la casa: numeral grande + etiqueta.
console.log('\n[16] Estandar del rol y del arbol de encabezados');
let estandar = 0;
const FUENTE_MARKUP = /\.(astro|tsx|ts)$/;

for (const archivo of fuentes) {
  if (!FUENTE_MARKUP.test(archivo)) continue;
  const contenido = readFileSync(archivo, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const m of contenido.matchAll(/\bfont-(titular|cuerpo)\b/g)) {
    estandar += 1;
    error(
      `${archivo}: "font-${m[1]}" escrito a mano — la familia la impone el rol ` +
        `(marca.css). Con la familia en el marcado, el mismo rol se puede desincronizar sin aviso`,
    );
  }
}

const ROL_ENCABEZADO = { 1: 'titular-1', 2: 'titular-2', 3: 'titular-3' };
for (const pagina of paginas) {
  const html = readFileSync(pagina, 'utf8');
  const rel = pagina.replace('dist', '');

  // 16b-i) Cada h1/h2/h3 lleva el rol de su nivel (o es el rotulo de la casa).
  for (const m of html.matchAll(/<h([123])\b[^>]*\bclass="([^"]*)"[^>]*>/g)) {
    const nivel = Number(m[1]);
    const clase = m[2];
    const esperado = ROL_ENCABEZADO[nivel];
    if (clase.includes(`text-${esperado}`)) continue;
    // El rotulo de seccion: h2 con `etiqueta` y un numeral `indice` inmediatamente antes.
    const antes = html.slice(Math.max(0, m.index - 220), m.index);
    const esRotulo = nivel === 2 && /\btext-etiqueta\b/.test(clase) && /text-indice/.test(antes);
    if (esRotulo) continue;
    estandar += 1;
    error(
      `${rel}: <h${nivel}> lleva "${clase.includes('text-') ? clase.match(/\btext-[a-z0-9-]+/)[0] : '(sin rol de tamano)'}" y le toca "text-${esperado}" — ` +
        `el nivel visual tiene que coincidir con el nivel semantico`,
    );
  }

  // 16b-ii) El rol de un nivel no se presta: `titular-1` es del h1 y `titular-2` es del h2.
  //         `titular-3` si se usa en bloques que no son encabezado (titulos de tarjeta dentro
  //         de una lista); los dos de arriba no, porque son los que dan la estructura.
  for (const m of html.matchAll(/<([a-z0-9]+)\b[^>]*\bclass="([^"]*)"[^>]*>/g)) {
    const tag = m[1];
    for (const rol of ['titular-1', 'titular-2']) {
      if (!new RegExp(`\\btext-${rol}\\b`).test(m[2])) continue;
      const esperado = rol === 'titular-1' ? 'h1' : 'h2';
      if (tag === esperado) continue;
      estandar += 1;
      error(
        `${rel}: <${tag}> usa "text-${rol}" — ese rol es del <${esperado}>: usado fuera de su ` +
          `nivel, el tamano deja de decir que es un encabezado`,
      );
    }
  }
}
if (estandar === 0) {
  console.log('  + ninguna familia escrita a mano en el marcado (la impone el rol).');
  console.log('  + h1/h2/h3 con el rol de su nivel, y titular-1/titular-2 solo en su encabezado.');
}

// ─── Veredicto ──────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(74));
console.log(`Errores: ${errores} · Avisos: ${avisos}`);
if (errores > 0) {
  console.log('RESULTADO: FALLA — el build no debe publicarse asi.\n');
  process.exit(1);
}
console.log('RESULTADO: OK — el HTML y el CSS publicados cumplen el kit de marca.\n');
