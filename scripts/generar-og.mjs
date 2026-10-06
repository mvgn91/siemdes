#!/usr/bin/env node
// Imagenes sociales (Open Graph) del micrositio — S1-D-02.9 / S1-D-04.9
//
// POR QUE EXISTE ESTE SCRIPT Y NO UN PLUGIN DE OG
// Las previsualizaciones de enlaces son el caso de uso real de este sitio: el cliente
// vive en WhatsApp y ADR-W01 se eligio precisamente por eso. Un enlace sin `og:image`
// se ve como una franjita de texto. Los generadores habituales (satori, resvg) anaden
// dependencias pesadas al build; aqui se compone un SVG con las MISMAS TTF de Barlow que
// usa el sitio y se rasteriza con rsvg-convert: la imagen ve la misma tipografia que la
// pagina, que es el requisito de marca.
//
// LA FUENTE UNICA DE LOS TEXTOS es el campo `meta.titulo` de cada src/data/*.json.
// Si el titulo cambia en el contenido, la imagen cambia en la siguiente ejecucion: no
// hay una segunda copia del copy que se pueda quedar vieja.
//
// LENGUAJE VISUAL: el del reverso oscuro de la tarjeta (fondo #18181B, barra ambar,
// emblema claro-ambar) porque es el lado que la gente recuerda. NO se inventa nada:
// sin degradados, sin sombras, sin texturas, sin un cuarto color (docs/14 §3.1).
//
// TRAMPA CONOCIDA (docs/13 §7.6): sin Barlow registrada, rsvg-convert OMITE los textos y
// sale un PNG que parece vacio pero no da ningun error. Por eso este script no se fia de
// que el render salio bien: al final rasteriza el PNG y comprueba que HAY tinta en la banda
// del titular. Si no la hay, falla diciendo cual es el arreglo.
//
// Uso: pnpm og        (manual, como `pnpm assets`; la salida en public/og/ SI se versiona)

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// ─── Configuración de la pieza (1200x630 es el tamaño que piden Facebook, WhatsApp y X)

const ANCHO = 1200;
const ALTO = 630;
const MARGEN = 72; // margen de texto; coincide con el margen del contenido del sitio
const FONDO = '#18181B';
const AMBAR = '#FACC15';
const BLANCO = '#FFFFFF';
const TINTE = '#A1A1AA'; // tinte indice del kit: 7.0:1 sobre el fondo, pasa AA
const FILete = '#3F3F46'; // tinte 2 como filete de 2 px

const TTF = {
  black: '.mvgn/tools/fonts/barlow/Barlow-Black.ttf',
  extraBold: '.mvgn/tools/fonts/barlow/Barlow-ExtraBold.ttf',
  medium: '.mvgn/tools/fonts/barlow/Barlow-Medium.ttf',
};

/** Emblema claro-ambar: el asset YA derivado por la receta del reverso v5 (negro->blanco,
 *  ambar intacto). No se vuelve a derivar aqui ni se redibuja (regla del operador). */
const EMBLEMA = 'MEDIA/TARJETA DE NEGOCIOS/REVERSO NEGRO v5/logo-siemes-claro-ambar.png';
const EMBLEMA_ALTO = 128;

/** Las 5 paginas (R04.14 + D-E: Maquinaria y Marcas viven en Inicio). El titulo sale del contenido, no de aqui. */
const PAGINAS = [
  { slug: 'inicio', seccion: 'SIEMDES', archivo: 'inicio.json' },
  { slug: 'servicios', seccion: 'SERVICIOS', archivo: 'servicios.json' },
  { slug: 'cobertura', seccion: 'COBERTURA', archivo: 'cobertura.json' },
  { slug: 'experiencia', seccion: 'EXPERIENCIA', archivo: 'experiencia.json' },
  { slug: 'contacto', seccion: 'CONTACTO', archivo: 'contacto.json' },
];

const PRESUPUESTO_BYTES = 120 * 1024;

// ─── Utilidades de medicion y render ────────────────────────────────────────────

/** Ancho de avance de un texto con la TTF real y un tamano dado.
 *  Se mide con FreeType (no con una estimacion) porque el ajuste de lineas depende de el.
 *  NOTA: es el ancho de AVANCE, no la caja de tinta; para decidir si una linea cabe en el
 *  lienzo el avance es la medida correcta, porque es lo que Pango/ligsvg usan al componer. */
function anchoAvance(texto, ttf, px) {
  const salida = execFileSync('magick', [
    '-font', ttf,
    '-pointsize', String(px),
    `label:${texto}`,
    '-format', '%w',
    'info:',
  ]).toString();
  return Number(salida);
}

/** Reparte en lineas que quepan, reduciendo el cuerpo hasta que quepan en `maxLineas`. */
function componer(texto, ttf, pxInicial, maxAncho, maxLineas) {
  let px = pxInicial;
  for (let intento = 0; intento < 8; intento += 1) {
    const palabras = texto.split(/\s+/);
    const lineas = [];
    let actual = '';
    for (const palabra of palabras) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (anchoAvance(prueba, ttf, px) <= maxAncho) {
        actual = prueba;
      } else {
        if (actual) lineas.push(actual);
        actual = palabra;
      }
    }
    if (actual) lineas.push(actual);
    if (lineas.length <= maxLineas) return { lineas, px };
    px -= 6; // 6 px por intento: 74 -> 44 en el peor caso
  }
  return { lineas: [texto], px };
}

/** Luminancia relativa WCAG. Se usa para comprobar el contraste del texto de la pieza. */
function luminancia(hex) {
  const canales = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canales.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(hexA, hexB) {
  const a = luminancia(hexA);
  const b = luminancia(hexB);
  const [claro, oscuro] = a > b ? [a, b] : [b, a];
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Media y maximo de un recorte, en 0..1. Sirve para medir tinta sobre el PNG YA RENDERIZADO. */
function stats(png, recorte) {
  const recorteArgs = recorte ? ['-crop', recorte, '+repage'] : [];
  const media = Number(
    execFileSync('magick', [png, ...recorteArgs, '-colorspace', 'srgb', '-format', '%[fx:mean]', 'info:']).toString(),
  );
  const maximo = Number(
    execFileSync('magick', [png, ...recorteArgs, '-colorspace', 'srgb', '-format', '%[fx:maxima]', 'info:']).toString(),
  );
  return { media, maximo };
}

// ─── Composición de una pieza ───────────────────────────────────────────────────

function svgDe({ seccion, titulo, whatsapp, municipio, estado, emblemaW, emblemaH }) {
  const maxAncho = ANCHO - MARGEN * 2;
  const { lineas, px } = componer(titulo, TTF.black, 74, maxAncho, 2);
  const altoLinea = Math.round(px * 1.12);
  const tituloBase = 396; // línea base de la primera linea del titular

  const textosTitulo = lineas
    .map(
      (linea, i) =>
        `  <text x="${MARGEN}" y="${tituloBase + i * altoLinea}" font-family="Barlow" font-weight="900" font-size="${px}" fill="${BLANCO}">${escapar(linea)}</text>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generado por scripts/generar-og.mjs. No editar a mano: la fuente unica es src/data/*.json -->
<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}">
  <rect width="${ANCHO}" height="${ALTO}" fill="${FONDO}"/>
  <rect width="${ANCHO}" height="10" fill="${AMBAR}"/>
  <image href="emblema.png" x="${MARGEN}" y="64" width="${emblemaW}" height="${emblemaH}"/>
  <text x="${MARGEN}" y="286" font-family="Barlow" font-weight="800" font-size="30" letter-spacing="5.4" fill="${AMBAR}">${escapar(seccion)}</text>
${textosTitulo}
  <rect x="${MARGEN}" y="546" width="${maxAncho}" height="2" fill="${FILete}"/>
  <text x="${MARGEN}" y="592" font-family="Barlow" font-weight="500" font-size="26" letter-spacing="2.2" fill="${TINTE}">${escapar(`${municipio.toUpperCase()}, ${estado.toUpperCase()}`)}</text>
  <text x="${ANCHO - MARGEN}" y="592" text-anchor="end" font-family="Barlow" font-weight="600" font-size="26" letter-spacing="1.4" fill="${AMBAR}">${escapar(whatsapp)}</text>
</svg>
`;
}

const escapar = (t) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ─── Ejecución ──────────────────────────────────────────────────────────────────

let problemas = 0;
const error = (m) => {
  problemas += 1;
  console.log(`  x ${m}`);
};

mkdirSync('public/og', { recursive: true });
mkdirSync('scripts/og', { recursive: true });

// fontconfig propio: el sistema solo tiene Barlow hasta Bold (no Black ni ExtraBold), y
// el titular de la pieza va en Black. Se apunta al directorio de TTF del proyecto sin
// tocar la configuracion del sistema (misma receta probada en docs/13 §7.6).
const dirFontes = '.mvgn/tools/fonts/barlow';
if (!existsSync(dirFontes) || !existsSync(TTF.black)) {
  console.error(`\nx Faltan las TTF de Barlow en ${dirFontes}.`);
  console.error('  Sin Barlow Black registrada, rsvg-convert omite los textos y el PNG sale vacio.');
  console.error('  Ver docs/13 §7.6: son las Google Fonts (OFL) que el proyecto ya trae.\n');
  process.exit(1);
}
const cacheFontes = 'scripts/og/.fontcache';
mkdirSync(cacheFontes, { recursive: true });
const fontsConf = join(process.cwd(), 'scripts/og/fonts.conf');
writeFileSync(
  fontsConf,
  `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${process.cwd()}/${dirFontes}</dir>
  <cachedir>${cacheFontes}</cachedir>
</fontconfig>
`,
);

console.log('\nIMAGENES SOCIALES 1200x630 (Open Graph)\n' + '='.repeat(74));

// El emblema se incrusta como PNG al lado de cada SVG: rsvg-convert resuelve las rutas
// relativas al archivo, asi que se copia el asset al directorio de trabajo. Se reescala
// con `-resize alto` (un solo limite = mantiene la proporcion) y luego se LEEN sus
// dimensiones reales para dibujar el <image> con la caja exacta: si se escribiera a mano
// el emblema estaria deformado un 1 %, y la regla del operador es no deformar el logo.
const emblemaTemporal = 'scripts/og/emblema.png';
execFileSync('magick', [EMBLEMA, '-resize', `${EMBLEMA_ALTO}`, emblemaTemporal]);
const [emblemaW, emblemaH] = execFileSync('magick', [
  'identify',
  '-format',
  '%w %h',
  emblemaTemporal,
])
  .toString()
  .split(' ')
  .map(Number);

const navegacion = readFileSync('src/data/navegacion.ts', 'utf8');
const whatsapp = navegacion.match(/numeroLocal: '([^']+)'/)?.[1] ?? '';
const municipio = navegacion.match(/municipio: '([^']+)'/)?.[1] ?? '';
const estado = navegacion.match(/estado: '([^']+)'/)?.[1] ?? '';
if (!whatsapp || !municipio || !estado) {
  error('no se pudo leer el NAP de src/data/navegacion.ts (whatsapp/municipio/estado)');
}

for (const pagina of PAGINAS) {
  const datos = JSON.parse(readFileSync(`src/data/${pagina.archivo}`, 'utf8'));
  // Fuente unica: el titulo es el del contenido, sin copia propia.
  const titulo = datos.meta.titulo;
  const svg = svgDe({ seccion: pagina.seccion, titulo, whatsapp, municipio, estado, emblemaW, emblemaH });

  const rutaSvg = `scripts/og/${pagina.slug}.svg`;
  const rutaPng = `public/og/${pagina.slug}.png`;
  writeFileSync(rutaSvg, svg);

  execFileSync('rsvg-convert', ['-w', String(ANCHO), '-h', String(ALTO), rutaSvg, '-o', rutaPng]);

  // ─── Verificacion sobre el PNG ya rasterizado (no sobre la intencion del dibujo) ───
  const dims = execFileSync('magick', ['identify', '-format', '%wx%h', rutaPng]).toString();
  if (dims !== `${ANCHO}x${ALTO}`) error(`${pagina.slug}: ${dims} en vez de ${ANCHO}x${ALTO}`);

  // Referencia: el fondo puro, medido en una esquina que la pieza no toca.
  const referencia = stats(rutaPng, '1x1+1199+620').media;

  // 1) Hay tinta en la banda del titular? (atrapa la trampa de la fuente ausente)
  const bandaTitulo = stats(rutaPng, `1056x180+${MARGEN}+300`);
  if (bandaTitulo.maximo - referencia < 0.05) {
    error(
      `${pagina.slug}: la banda del titular no tiene tinta (max ${bandaTitulo.maximo.toFixed(3)} vs fondo ${referencia.toFixed(3)}). ` +
        'Casi siempre es Barlow Black no registrada en fontconfig.',
    );
  }

  // 2) Hay tinta en el margen derecho? (atrapa un titular desbordado)
  const margenDerecho = stats(rutaPng, `8x580+${ANCHO - 8}+20`);
  if (margenDerecho.maximo - referencia > 0.02) {
    error(`${pagina.slug}: hay tinta en el margen derecho — el titular se desborda`);
  }

  // 3) Hay tinta en el emblema?
  const bandaEmblema = stats(rutaPng, '160x128+60+64');
  if (bandaEmblema.maximo - referencia < 0.05) error(`${pagina.slug}: el emblema no se ve`);

  // 4) Presupuesto de peso
  const bytes = statSync(rutaPng).size;
  if (bytes > PRESUPUESTO_BYTES) error(`${pagina.slug}: ${bytes} B supera el presupuesto`);

  const lineas = (svg.match(/font-weight="900"/g) ?? []).length;
  const cuerpo = svg.match(/font-weight="900" font-size="(\d+)"/)?.[1] ?? '?';
  console.log(
    `  + ${pagina.slug.padEnd(12)} ${dims}  ${String(bytes).padStart(6)} B  titular ${cuerpo}px en ${lineas} linea/s`,
  );
}

rmSync(emblemaTemporal, { force: true });

// ─── Contraste de los colores de texto de la pieza ──────────────────────────────
// Se comprueba aqui porque la imagen es un raster: la guardia de marca revisa el CSS y el
// HTML, y no podria ver el color de un PNG. Sin esta comprobacion, un texto ambar sobre
// negro poderia publicarse sin que nadie lo midiera.
console.log('\n[CONTRASTE] texto sobre el fondo de la pieza (WCAG AA = 4.5:1)');
for (const [nombre, color] of [['blanco (titular)', BLANCO], ['ambar (seccion, pie)', AMBAR], ['tinte indice (municipio)', TINTE]]) {
  const ratio = contraste(color, FONDO);
  const ok = ratio >= 4.5;
  if (!ok) error(`contraste insuficiente: ${nombre} ${color} sobre ${FONDO} = ${ratio.toFixed(2)}:1`);
  console.log(`  ${ok ? '+' : 'x'} ${nombre.padEnd(26)} ${color} sobre ${FONDO} = ${ratio.toFixed(1)}:1`);
}

console.log('\n' + '='.repeat(74));
if (problemas > 0) {
  console.log(`RESULTADO: FALLA — ${problemas} problema(s).\n`);
  process.exit(1);
}
console.log('RESULTADO: OK — 7 imagenes sociales generadas y verificadas sobre el PNG.\n');
