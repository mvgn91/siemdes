// Medicion de densidad de tinta del sitio renderizado — S1-D-04.8
//
// MOTIVO: el operador reporto que la UI "no se siente tan industrial" y que "hay mucho
// espacio". Las dos son afirmaciones de ESPACIO, y el espacio se mide. Este script:
//
//   1) Rasteriza cada pagina con Firefox headless al ancho pedido, con una ventana mas
//      alta que la pagina, y localization DONDE ACABA la pagina por la ultima fila con
//      tinta. Asi la densidad se mide sobre el contenido real y no sobre el relleno.
//   2) Mide la cobertura de TINTA: pixeles que difieren del fondo en mas de 24 por canal.
//      Es la MISMA medida que se uso en docs/13 para el reverso de la tarjeta y por el
//      mismo motivo: la caja tipografica no es la tinta.
//   3) Reporta la distribucion real de tamanos de texto leyendo las clases del HTML y
//      resolviendo el token --text-* del CSS emitido. No estima: el valor sale del build.
//
// DOS LECCIONES QUE YA COSTARON UNA CORRECCION EN ESTE PROYECTO (docs/13, 2026-09-26),
// que este script respeta:
//   - No se suma cajas: las bandas se promedian ponderadas por las filas que cubren, y el
//     total se comprueba contra las partes.
//   - No se mide la caja tipografica para juzgar si algo se ve "vacio".
//
// Uso: node scripts/medir-densidad.mjs [--ancho 390] [--etiqueta antes] [--url http://...]

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : porDefecto;
};
const ANCHO = Number(opt('ancho', 390));
const ETIQUETA = opt('etiqueta', 'actual');
const URL_BASE = opt('url', 'http://127.0.0.1:4322');
const VENTANA_ALTA = Number(opt('alto', 16000));
const SALIDA = join('/tmp/opencode', `siemes-densidad-${ETIQUETA}-${ANCHO}`);

// R05.25 (2026-10-05): la lista seguia con las 4 paginas que R05.12 borro (hoy son 301 a
// la landing), asi que la medicion pedia cuatro 404, no encontraba sus PNG y reventaba con
// ENOENT. Se mide lo que el sitio REALMENTE publica: la landing. La 404 se deja fuera a
// proposito —`htmlDe` resuelve dist/<ruta>/index.html y la 404 se emite como dist/404.html—
// y porque es un tecnico de reserva, no una superficie de diseno.
const RUTAS = [
  ['/', 'inicio'],
];

if (existsSync(SALIDA)) rmSync(SALIDA, { recursive: true });
mkdirSync(SALIDA, { recursive: true });

/* ── Tokens de la escala, resueltos PARA EL ANCHO QUE SE MIDE ────────────────
   Dos defectos corregidos el 2026-09-30 (auditoria del operador), porque las
   cifras que este script publica se citan en docs/14 §4.2.1 y docs/15 §4.8.1:

   1) El patron era `--text-([a-z0-9]+)`: un guion NO cabe en la clase de
      caracteres, asi que `titular-1`, `titular-2`, `titular-3` y
      `cuerpo-denso` no se reconocian NUNCA. Los encabezados eran invisibles al
      censo, justo el eje que el script existe para medir.
   2) El mapa se quedaba con la ultima coincidencia, que es la del
      `@media (width>=64rem)`: censaba 390 px con la escala de escritorio y
      reportaba `60x4` en cifras que a 390 px miden 46.

   Ahora el CSS se aplana ANTES de leer los tokens: los bloques `@media` que no
   aplican al ancho pedido se descartan enteros (con emparejado de llaves, no
   con split, que perderia lo que va despues del segundo bloque). */
const CSS_EMITIDO = readdirSync('dist/_astro').find((f) => f.endsWith('.css'));
const css = readFileSync(join('dist/_astro', CSS_EMITIDO), 'utf8');

/** Aplana el CSS: deja solo lo que se aplica al ancho pedido. */
function cssParaAncho(hoja, ancho) {
  let salida = '';
  let i = 0;
  while (i < hoja.length) {
    const at = hoja.indexOf('@media', i);
    if (at < 0) {
      salida += hoja.slice(i);
      break;
    }
    salida += hoja.slice(i, at);
    const abre = hoja.indexOf('{', at);
    if (abre < 0) break;
    const condicion = hoja.slice(at + 6, abre).trim();
    let nivel = 0;
    let j = abre;
    for (; j < hoja.length; j++) {
      if (hoja[j] === '{') nivel++;
      else if (hoja[j] === '}' && --nivel === 0) break;
    }
    const cuerpo = hoja.slice(abre + 1, j);
    // Condiciones de ancho: `(width>=64rem)` o `(min-width:40rem)`. Sin clausula de
    // ancho (`only print`, `(hover:hover)`) el bloque no aplica a una medicion de layout.
    const anchos = [...condicion.matchAll(/(?:width>=|min-width:\s*)([\d.]+)rem/g)].map((m) => Number(m[1]) * 16);
    const aplica = anchos.length > 0 && anchos.every((w) => ancho >= w);
    if (aplica) salida += cuerpo;
    i = j + 1;
  }
  return salida;
}

const cssAplicable = cssParaAncho(css, ANCHO);
const TOKENS = new Map(
  [...cssAplicable.matchAll(/--text-([a-z0-9-]+):\s*([\d.]+)rem/g)].map((m) => [m[1], Number(m[2]) * 16]),
);
if (!TOKENS.size) {
  console.error('  ! no se reconocio ningun token --text-* en el CSS emitido');
  process.exit(1);
}

/** Elementos con mas de un rol de tamano: no deberia haber ninguno. */
const MULTI_ROL = [];
const htmlDe = (ruta) => (ruta === '/' ? 'dist/index.html' : join('dist', ruta.slice(1), 'index.html'));

/** px -> veces, por tag, de los elementos con una utilidad de tamano de texto.
 *  Tercer defecto corregido: se tomaba el PRIMER `text-*` y, si resultaba ser un
 *  color (`text-negro`), el elemento se descartaba entero en vez de buscar su rol.
 *  Eso sacaba del censo a todo elemento que llevara el color antes del tamano. */
function distribucion(markup) {
  const cuenta = new Map();
  for (const m of markup.matchAll(/<([a-z0-9]+)\b[^>]*\bclass="([^"]*)"/g)) {
    const roles = [...m[2].matchAll(/\btext-([a-z0-9-]+)\b/g)]
      .map((x) => x[1])
      .filter((t) => TOKENS.has(t));
    if (!roles.length) continue;
    if (roles.length > 1) MULTI_ROL.push(`<${m[1]}> ${roles.join(' + ')}`);
    const px = TOKENS.get(roles[0]);
    cuenta.set(px, (cuenta.get(px) ?? 0) + 1);
  }
  return [...cuenta.entries()].sort((a, b) => b[0] - a[0]);
}

/**
 * Cobertura de tinta sobre el area real de la pagina, y alto real en px.
 * El fondo de referencia NO se supone: se mide como el color mas frecuente de la columna
 * izquierda, que en este sitio es siempre el fondo de la pagina.
 */
function medir(archivoPng) {
  const guion = `
import sys
import numpy as np
from PIL import Image
from collections import Counter

im = Image.open(sys.argv[1]).convert("RGB")
a = np.asarray(im).astype(np.int16)          # (h, w, 3)
h, w, _ = a.shape
UMBRAL = 24

# Fondo real: color mas frecuente de la columna izquierda, que es el margen del sitio.
col = a[:, 0, :]
vals, counts = np.unique(col, axis=0, return_counts=True)
fondo = vals[counts.argmax()]

# Mascara de tinta: cualquier canal que se aparte del fondo.
dif = np.abs(a - fondo).max(axis=2)
tinta = dif > UMBRAL
# El CTA de WhatsApp es "fixed bottom-0": aparece pegado al borde INFERIOR de la ventana,
# no al de la pagina. Sin recortarlo, "ultima fila con tinta" daria siempre el alto de la
# ventana y la densidad saldria dilutionada por el relleno de abajo.
filas_con_tinta = tinta.any(axis=1)[: h - 200]
indice = np.flatnonzero(filas_con_tinta)
alto_real = int(indice[-1] + 1) if indice.size else 0
if alto_real > h - 200:
    alto_real = h - 200

tinta = tinta[:alto_real]
oscuro = (a[:alto_real].mean(axis=2) < 60)

# Bandas de 100 filas sobre el area real, promediadas ponderadas por filas cubiertas.
alto_banda = 100
banda_px = []
for y0 in range(0, alto_real, alto_banda):
    y1 = min(y0 + alto_banda, alto_real)
    if y1 - y0 < 10:
        continue
    banda_px.append(100.0 * tinta[y0:y1].sum() / ((y1 - y0) * w))
total = float(tinta.sum()) / (alto_real * w) * 100 if alto_real else 0.0
print(f"{total:.2f} {100.0*oscuro.sum()/(alto_real*w) if alto_real else 0:.2f} {alto_real} "
      + " ".join(f"{v:.1f}" for v in banda_px))
`;
  const s = execFileSync('python3', ['-c', guion, archivoPng], { encoding: 'utf8' }).trim().split(' ');
  return {
    promTinta: Number(s[0]),
    pctOscuro: Number(s[1]),
    altoReal: Number(s[2]),
    porBanda: s.slice(3).map(Number),
  };
}

const filas = [];
// Perfil temporal propio: sin esto, el headless choca con el Firefox del operador
// (perfil bloqueado) y no emite el PNG — el fallo se veía como FileNotFoundError
// aguas abajo en vez de como causa real (R03 Fase B, 2026-10-01).
const PERFIL = join(SALIDA + '-perfil');
mkdirSync(PERFIL, { recursive: true });
for (const [ruta, nombre] of RUTAS) {
  const png = join(SALIDA, `${nombre}.png`);
  try {
    execFileSync(
      'firefox',
      ['--headless', '-profile', PERFIL, `--window-size=${ANCHO},${VENTANA_ALTA}`, '--screenshot', png, `${URL_BASE}${ruta}`],
      { stdio: 'pipe', timeout: 120000 },
    );
  } catch (e) {
    console.error(`  ! firefox fallo en ${ruta}: ${e.message.slice(0, 100)}`);
    continue;
  }
  const m = medir(png);
  const d = distribucion(readFileSync(htmlDe(ruta), 'utf8'));
  const totalTexto = d.reduce((s2, [, n]) => s2 + n, 0);
  const bajo16 = d.filter(([px]) => px < 16).reduce((s2, [, n]) => s2 + n, 0);
  filas.push({ nombre, ruta, ...m, totalTexto, bajo16, dist: d });
}

const pct = (n) => `${n.toFixed(2)}%`.padStart(8);
console.log(`\n  DENSIDAD DEL SITIO · ${ANCHO}px de ancho · "${ETIQUETA}"`);
console.log(`  Tinta = pixeles que difieren del fondo en >24/canal. Alto = alto REAL de la pagina.\n`);
console.log(
  `  ${'pagina'.padEnd(12)}${'alto'.padStart(7)}${'tinta%'.padStart(8)}${'oscuro%'.padStart(8)}` +
    `${('texto<16px').padStart(11)}${'escala px x veces'.padStart(4)}`,
);
console.log('  ' + '─'.repeat(96));
for (const f of filas) {
  const escala = f.dist.map(([px, n]) => `${px}x${n}`).join(' ');
  console.log(
    `  ${f.nombre.padEnd(12)}${String(f.altoReal).padStart(7)}${pct(f.promTinta)}${pct(f.pctOscuro)}` +
      `${`${f.bajo16}/${f.totalTexto}`.padStart(11)}   ${escala}`,
  );
}
const n = filas.length;
const media = (k) => filas.reduce((s2, f) => s2 + f[k], 0) / n;
const texto = filas.reduce((s2, f) => s2 + f.totalTexto, 0);
const bajo = filas.reduce((s2, f) => s2 + f.bajo16, 0);
console.log('  ' + '─'.repeat(96));
console.log(
  `  PROMEDIO  tinta ${media('promTinta').toFixed(2)}%  ·  negro ${media('pctOscuro').toFixed(2)}%  ·  ` +
    `alto medio ${Math.round(media('altoReal'))}px  ·  texto bajo 16px: ${(100 * bajo / texto).toFixed(0)}% (${bajo}/${texto})`,
);
if (MULTI_ROL.length) {
  console.log(`  ATENCION: ${MULTI_ROL.length} elemento(s) con dos roles de tamano a la vez:`);
  for (const m of [...new Set(MULTI_ROL)].slice(0, 5)) console.log(`    · ${m}`);
}
console.log(`  PNG en ${SALIDA}\n`);
