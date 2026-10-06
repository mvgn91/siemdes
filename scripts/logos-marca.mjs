#!/usr/bin/env node
// Logos de marca en NEGRO para el cintillo — S1-R02.6 (2026-10-01)
//
// QUE DECIDE: el cintillo muestra las marcas en NEGRO DE MARCA (#18181B), todas iguales.
// Pedido del operador del 2026-10-01: una tira monocroma se lee como una sola pieza y
// compite con el ambar de los separadores, no con 18 colores de terceros.
//
// ── POR QUE NO SE HACE CON UN FILTRO CSS ───────────────────────────────────────────────
// Lo primero que se probo mentalmente fue `filter: brightness(0)` en el <img>: una linea.
// Es incorrecto, y medido no es una preferencia:
//
//   1. JCB trae el logotipo AL REVES que el resto. Su bloque es `path165`, un trazado SIN
//      atributo `fill` (negro por defecto), y ENCIMA las letras en `#ffffff`; despues el
//      detalle `#253689` y un cuadrado `#f8b004`. Con la tinta en negro el bloque y las
//      letras se vuelven la misma cosa y el logo es un rectangulo negro macizo: la marca
//      desaparece de la franja. Medido: el original tiene 70 119 pixeles de calado claro y
//      la conversion a negro, 0.
//   2. Cuatro PNG traen FONDO OPACO (clark, genie, jcb, liebherr). Pintados de negro son
//      un cuadrado negro del tamano del archivo.
//
// La conversion va sobre el archivo entonces, y se apoya en una sola pregunta MEDIDA:
// ¿trae caja de fondo? De la respuesta depende cual de los dos tonos es la tinta y cual es
// el calado, y equivocarse en eso es exactamente lo que borra la marca.
//
// ── LA REGLA ───────────────────────────────────────────────────────────────────────────
//   Sin caja: el fondo ya es transparente. El blanco que quede DENTRO del logotipo es
//   calado —el hueco por el que se ve la franja— y pasa a transparente; todo lo demas es
//   tinta y pasa a negro de marca. Asi los logos de una sola tinta no cambian y los que
//   tienen negativos internos los conservan.
//   Con caja: el fondo es la caja, no el blanco. La caja es lo que se borra y el blanco
//   deja de ser calado para pasar a ser la TINTA. Sin esa inversion JCB sale macizo.
//
// Que el negro sea #18181B y no #000000 es del kit (docs/14 §3.1): el negro puro no es el
// negro del sistema, y una franja monocroma que no es del negro del sitio se nota al lado
// del texto.
//
// ── SALIDA ─────────────────────────────────────────────────────────────────────────────
// `public/marcas/logos/negro/<archivo>`. Los ORIGINALES quedan intactos en
// `public/marcas/logos/` —este script lee, nunca escribe fuera de `negro/`— porque son
// marcas de terceros y porque un archivo de marca no se deforma: si manana se quiere la
// franja a color, se borra `negro/` y el cintillo vuelve a leer los originales.
//
// El SVG se resuelve editando el texto, que conserva el vector (a 48 px en una pantalla 2x
// el logo tiene que seguir nitido a 96). Excepcion medida: si el SVG trae caja de fondo el
// bloque puede no llevar atributo `fill` —JCB no lo lleva— y no hay forma de encontrarlo
// leyendo el texto, asi que ese caso se resuelve sobre el raster y sale como PNG.
//
// Cada salida se VERIFICA antes de darse por buena: se comprueba que conserve la tinta que
// traia y que esa tinta sea el negro del kit. Sin esa comprobacion una clasificacion
// equivocada se lleva por delante un logo sin que nadie se entere hasta verlo publicado.
//
// Uso: pnpm logos

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import marcasJson from '../src/data/marcas.json' with { type: 'json' };

const ORIGENES = 'public/marcas/logos';
const DESTINO = 'public/marcas/logos/negro';
const NEGRO_MARCA = '#18181B'; // docs/14 §3.1. No #000: ese no es el negro del sistema.

/** Ancho del raster de trabajo. Es tambien la medida de salida del SVG con caja, y sobra
 *  para un cintillo que dibuja los logos a 48 px. */
const ANCHO_TRABAJO = 1200;

/** Margen de fusion de tonos: el mismo 12% que usa ImageMagick por defecto, que agrupa
 *  los bordes antialiaseados con su propio tono sin comerse el trazo. */
const FUSION = '12%';

/** Fraccion del lienzo desde la que se siembra la inundacion. Los archivos de marca traen
 *  margen, y sembrar en (0,0) —transparente en casi todos— no inunda nada. */
const MARGEN_SIEMBRA = 0.02;

/** Cuanta superficie tiene que comerse la inundacion para leer "trae caja". Un logo de
 *  fondo transparente da 0%; uno con bloque da casi la mitad (JCB: 47%) porque las letras
 *  blancas cortan la inundacion en tres. El umbral va bajo a proposito y cada corrida
 *  imprime la cifra, para que la decision se pueda auditar sin volver a correr nada. */
const UMBRAL_CAJA = 0.2;

/** La tinta visible de la salida tiene que seguir siendo tinta: ni la mitad ni el doble
 *  de la que traia. Los dos extremos son fallos reales y distintos: por debajo se comio la
 *  marca, por encima quedo un bloque. */
const TINTA_MIN = 0.4;
const TINTA_MAX = 2.2;

const magick = (...args) => execFileSync('magick', args, { stdio: 'pipe' });
const fx = (archivo, expr) => Number(magick('identify', '-format', expr, archivo).toString().trim());
const pixel = (archivo, x, y) =>
  magick('identify', '-format', `%[pixel:p{${x},${y}}]`, archivo).toString().trim();

/** Alfa de un `srgba(r,g,b,a)` de ImageMagick. */
const alfa = (p) => Number(p.replace(/^s?rgba?\(/, '').replace(/[()]/g, '').split(',')[3]);

const temporal = (sufijo) => `${DESTINO}/.${sufijo}.png`;

// ── Raster de trabajo ──────────────────────────────────────────────────────────────────
/**
 * El SVG se rasteriza con `rsvg-convert` y no con el motor interno de ImageMagick (MSVG).
 * Medido, no preferencia: MSVG pinta BLANCO donde el SVG es transparente, con lo que
 * Navistar —que NO tiene caja— devolvia un "fondo blanco" que se tragaba el logo entero, y
 * JCB —que si la tiene— perdia la suya. Medir sobre el render equivocado es medir otra
 * cosa, y por eso el motor se declara aqui y no se deja al defaults de la herramienta.
 */
function aRaster(origen, destino) {
  if (origen.endsWith('.svg')) {
    execFileSync('rsvg-convert', ['-w', String(ANCHO_TRABAJO), '-o', destino, origen]);
  } else {
    magick(origen, '-background', 'none', '-alpha', 'set', destino);
  }
  return destino;
}

// ── La pregunta: ¿trae caja de fondo? ─────────────────────────────────────────────────
/**
 * Se mide inundando: se siembra dentro del logo y se mira cuanto opaco se volvio
 * transparente. Si el fondo ya era transparente la inundacion no encuentra nada que comerse
 * y da 0%; si traia bloque, se lo come.
 *
 * La semilla va DENTRO de la marca, no en el margen: sembrar en el margen transparente no
 * inunda nada y JCB —que si tiene caja— mediria 0%. Se recorre en diagonal hacia dentro
 * buscando el primer pixel opaco; si no hay ninguno, el archivo es opaco de borde a borde y
 * la esquina sirve igual.
 */
function medirCaja(rasterPng) {
  const w = fx(rasterPng, '%[fx:w]');
  const h = fx(rasterPng, '%[fx:h]');
  const opacoAntes = fx(rasterPng, '%[fx:mean.a]');

  const salto = Math.max(1, Math.floor(Math.min(w, h) * MARGEN_SIEMBRA));
  let x = 0;
  let y = 0;
  for (let intento = 0; intento < 12; intento++) {
    const px = Math.min(w - 1, salto * intento);
    const py = Math.min(h - 1, salto * intento);
    if (alfa(pixel(rasterPng, px, py)) > 0.9) {
      x = px;
      y = py;
      break;
    }
  }

  // El color de la caja es el de la semilla: por definicion es fondo.
  const color = pixel(rasterPng, x, y);

  // `alpha X,Y floodfill` es el primitivo de ImageMagick 7; el antiguo `matte` se elimino y
  // falla con "non-conforming drawing primitive definition".
  const abierto = temporal('medido');
  magick(rasterPng, '-alpha', 'set', '-fuzz', FUSION, '-fill', 'none', '-draw', `alpha ${x},${y} floodfill`, abierto);
  const opacoDespues = fx(abierto, '%[fx:mean.a]');
  rmSync(abierto, { force: true });

  const comido = opacoAntes > 0 ? (opacoAntes - opacoDespues) / opacoAntes : 0;
  return { caja: comido > UMBRAL_CAJA, color, comido };
}

// ── Conversiones ───────────────────────────────────────────────────────────────────────

/** Sin caja: el blanco interno es calado (se ve la franja) y el resto es tinta. */
function tintaYCalado(rasterPng, destino) {
  magick(
    rasterPng,
    '-channel', 'RGB',
    '-fill', NEGRO_MARCA,
    '-colorize', '100',
    '+channel',
    '-fuzz', FUSION,
    '-transparent', 'white',
    destino,
  );
}

/**
 * Con caja: la caja ES el fondo y se borra; el blanco deja de ser calado y pasa a tinta.
 * Invertir esto es lo que evita el rectangulo negro macizo de JCB: alli el bloque es tinta
 * (negro) y las letras son calado (blanco), al reves que en un logo de una sola tinta.
 */
function fondoABlanco(rasterPng, destino, caja) {
  magick(
    rasterPng,
    '-fuzz', FUSION,
    '-transparent', caja,
    '-channel', 'RGB',
    '-fill', NEGRO_MARCA,
    '-colorize', '100',
    '+channel',
    destino,
  );
}

/** SVG sin caja: se retocan los valores de color del texto y el vector se conserva. */
function svgANegro(origen, destino) {
  const svg = readFileSync(origen, 'utf8');
  let pintados = 0;
  let calados = 0;

  const recoloreado = svg.replace(
    /#(?:[0-9a-f]{3}|[0-9a-f]{6})\b|\brgba?\([^)]*\)|\bwhite\b|\bblack\b/gi,
    (color) => {
      // El blanco es calado: se devuelve el hueco al fondo.
      if (/^#(?:fff|ffffff)$/i.test(color) || /^rgba?\(\s*255/.test(color) || color.toLowerCase() === 'white') {
        calados += 1;
        return 'none';
      }
      pintados += 1;
      return NEGRO_MARCA;
    },
  );

  // `stop-color="none"` no pinta nada, y un degradado aplanado a un solo negro es
  // justamente lo que significa "monocromo": se aplana en vez de desaparecer.
  writeFileSync(destino, recoloreado.replace(/stop-color="none"/g, `stop-color="${NEGRO_MARCA}"`));
  return { pintados, calados };
}

// ── Verificacion de la salida ──────────────────────────────────────────────────────────
/**
 * Una conversion puede destruir un logo y seguir pareciendo bien en el log. Se comprueba
 * que la salida conserve la tinta del original y que esa tinta sea el negro del kit.
 *
 * Las dos medidas se toman sobre el ALFA y no sobre los canales RGB: en un archivo con
 * calado, el RGB del hueco no significa nada y contarlo como tinta daria por aprobado un
 * logo vacio. `opaca` es la fraccion del lienzo que se ve; `negra` es la parte de esa que
 * es el negro del kit. Con las dos se detectan los dos fallos opuestos: un logo que quedo
 * como bloque macizo (JCB antes del arreglo) y uno al que se le comio la marca.
 */
function verificar(origenRaster, salida) {
  const espera = temporal('espera');
  aRaster(salida, espera);

  const medidas = (archivo) => {
    // El negro del kit dentro de lo VISIBLE: se compone el logo sobre blanco —el calado
    // pasa a blanco— y se mide el tanto de lienzo que es el negro del kit. Medir sobre los
    // canales RGB sin componer contaria como tinta el RGB del calado, que no es nada, y
    // daria por aprobado un logo vacio.
    const mascara = temporal('negra');
    magick(
      archivo,
      '-background', 'white',
      '-alpha', 'remove',
      '-colorspace', 'Gray',
      '-fuzz', '25%',
      '-fill', 'white',
      '+opaque', NEGRO_MARCA,
      '-threshold', '50%',
      mascara,
    );
    const negra = fx(mascara, '%[fx:mean]');
    rmSync(mascara, { force: true });
    return { opaca: fx(archivo, '%[fx:mean.a]'), negra };
  };

  const antes = medidas(origenRaster);
  const despues = medidas(espera);
  rmSync(espera, { force: true });

  const razon = despues.opaca > 0 ? antes.opaca / despues.opaca : Infinity;
  const negraDespues = despues.opaca > 0 ? despues.negra / despues.opaca : 0;

  const fallos = [];
  if (razon < TINTA_MIN || razon > TINTA_MAX) {
    fallos.push(`la tinta visible paso de ${Math.round(antes.opaca * 100)}% a ${Math.round(despues.opaca * 100)}% del lienzo`);
  }
  if (negraDespues < 0.6) {
    fallos.push(`solo el ${Math.round(negraDespues * 100)}% de la tinta es el negro del kit`);
  }

  return { ok: fallos.length === 0, motivo: fallos.join(' · '), razon, negraDespues };
}

// ── Reporte ────────────────────────────────────────────────────────────────────────────
console.log('\nLOGOS DE MARCA EN NEGRO — cintillo\n' + '─'.repeat(100));

mkdirSync(DESTINO, { recursive: true });
const trabajo = temporal('trabajo');
const hechos = [];
const problemas = [];

for (const logo of marcasJson.logos) {
  const nombre = logo.archivo.replace(/^\/marcas\/logos\//, '');
  const origen = `${ORIGENES}/${nombre}`;

  if (!existsSync(origen)) {
    console.log(`  ✗ ${logo.id.padEnd(14)} no existe ${origen}`);
    problemas.push(`${logo.id}: falta ${origen}`);
    continue;
  }

  aRaster(origen, trabajo);
  const { caja, color, comido } = medirCaja(trabajo);

  let detalle;
  let salida = nombre;
  if (nombre.endsWith('.svg') && !caja) {
    const { pintados, calados } = svgANegro(origen, `${DESTINO}/${salida}`);
    detalle = `vector · ${pintados} colores a negro${calados ? ` · ${calados} calados` : ''}`;
  } else {
    // PNG, o SVG con caja: alli el bloque que la forma puede no lleva atributo `fill`, asi
    // que no hay texto que leer y se resuelve sobre el raster.
    salida = nombre.replace(/\.svg$/, '.png');
    if (caja) fondoABlanco(trabajo, `${DESTINO}/${salida}`, color);
    else tintaYCalado(trabajo, `${DESTINO}/${salida}`);
    detalle = caja
      ? `caja abierta (${Math.round(comido * 100)}% ${color}), blanco a tinta`
      : 'fondo ya transparente, blanco interno a calado';
    if (nombre.endsWith('.svg')) detalle = `vector con caja → raster · ${detalle}`;
  }

  const v = verificar(trabajo, `${DESTINO}/${salida}`);
  const bytes = readFileSync(`${DESTINO}/${salida}`).byteLength;
  hechos.push({ id: logo.id, salida });

  console.log(
    `  ${v.ok ? '✓' : '✗'} ${logo.id.padEnd(14)} ${nombre.padEnd(18)} → ${salida.padEnd(18)} ` +
      `${detalle.padEnd(48)} tinta x${v.razon.toFixed(2)} negro ${String(Math.round(v.negraDespues * 100)).padStart(3)}% ` +
      `${String(bytes).padStart(6)} B`,
  );
  if (!v.ok) {
    console.log(`      REVISAR: ${v.motivo}`);
    problemas.push(`${logo.id}: ${v.motivo}`);
  }
}

rmSync(trabajo, { force: true });

// Al reejecutar, un logo que dejo de ser SVG con caja conserva su PNG viejo, y un temporal
// a medias tambien. Se borra todo lo que no sea salida declarada de ESTA corrida: si no,
// `negro/` acumula archivos que el cintillo no lee y nadie sabe quien los puso ahi.
for (const existente of readdirSync(DESTINO)) {
  if (existente.startsWith('.')) continue;
  if (!hechos.some((h) => h.salida === existente)) {
    rmSync(`${DESTINO}/${existente}`, { force: true });
    console.log(`  · retirada ${existente}: salida de una corrida anterior que ya no se declara`);
  }
}

console.log('─'.repeat(100));
console.log(`Logos en negro: ${hechos.length} de ${marcasJson.logos.length} declarados. Los ${marcasJson.sinLogo.length} sin archivo siguen en texto.`);
console.log(`Originales intactos en ${ORIGENES}/ (este script solo escribe en negro/).`);
if (problemas.length) {
  console.log(`\n${problemas.length} PROBLEMA(S):\n${problemas.map((p) => `  · ${p}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  console.log('');
}
