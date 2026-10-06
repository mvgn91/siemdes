#!/usr/bin/env node
// Derivacion de assets de marca para web — S1-D-04.10
//
// Por que existe: los PNG entregados son de 1312x1200 (399 KB) y 1098x1433 (376 KB).
// Servirlos tal cual en una cabecera de 44 px es tirar ancho de banda. La regla del
// operador es NO REDIBUJAR ni deformar el logotipo con IA (docs/05 §4.1): lo que hace
// este script es un reescalado mecanico del asset OFICIAL, que es justo lo que pide
// docs/14 §8 D7 y lo que ya se hizo para la tarjeta (recorte al bbox, sin tocar el trazo).
//
// Los origenes viven en MEDIA/ y NO se modifican: solo se leen.
// La salida vive en public/marca/ y SI se versiona, porque el build de publicacion no
// debe depender de que ImageMagick exista en el servidor de despliegue.
//
// Uso: pnpm assets

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync } from 'node:fs';

const FUENTES = {
  /** Logotipo principal a color: va sobre fondo BLANCO (docs/14 §2.3). */
  color: 'MEDIA/LOGOS/LOGO SIEMDES COLOR.png',
  /** Version claro/positivo (negro->blanco, ambar intacto) para fondo oscuro. */
  claro: 'MEDIA/TARJETA DE NEGOCIOS/REVERSO NEGRO v5/logo-siemes-claro-ambar.png',
};

/** Alturas en px, pensadas para 2x del tamano en pantalla (docs/14 §2.4: minimo 32 px de ancho). */
const SALIDAS = [
  { origen: 'color', archivo: 'logo-color-88.png', alto: 88, uso: 'cabecera (44 px en pantalla, 2x)' },
  { origen: 'color', archivo: 'logo-color-176.png', alto: 176, uso: 'cabecera en pantallas de alta densidad' },
  { origen: 'claro', archivo: 'logo-claro-112.png', alto: 112, uso: 'pie negro (56 px en pantalla, 2x)' },
];

/**
 * Set de reproduccion por tamano — docs/14 D7 ("Sin spec de reproduccion por tamano:
 * no hay PNG optimizados (favicon 32, avatar 512...)"). Todo se DERIVA del asset oficial
 * con recorte al bbox de la tinta y reescalado mecanico. No se redibuja ni se deforma.
 *
 * MEDIDO 2026-09-29 sobre `LOGO SIEMDES COLOR.png`: la tinta ocupa 979x1114 px
 * (proporcion 0.879) y el perfil de columnas es plano de principio a fin, o sea que el
 * archivo es SOLO el emblema, sin wordmark. Eso despeja la duda que quedo abierta en la
 * sesion anterior ("si el asset trae wordmark, a 44 px puede quedar apretado"): no lo trae.
 *
 * FONDO BLANCO Y POR QUE: el emblema oficial es TINTA NEGRA sobre alfa. Un favicon con
 * transparencia es invisible en el modo oscuro del navegador y en el fondo negro de
 * algunas barras del sistema: el icono se pondria blanco sobre blanco. Por eso el
 * lienzo es blanco explicito. La variante sobre negro (claro-ambar) es la que vive en el
 * pie y en las imagenes sociales, donde el fondo si es negro.
 */
const REPRODUCCION = [
  { origen: 'color', archivo: 'favicon-16.png', lado: 16, uso: 'favicon en pestanas (W11): el limite de la marca (D7)' },
  { origen: 'color', archivo: 'favicon-32.png', lado: 32, uso: 'favicon estandar (D7)' },
  { origen: 'color', archivo: 'apple-touch-icon.png', lado: 180, uso: 'iOS al anadir a pantalla de inicio' },
  { origen: 'color', archivo: 'icon-512.png', lado: 512, uso: 'avatar social / icono de instalacion' },
];

const PRESUPUESTO_BYTES = 40 * 1024;

let problemas = 0;
mkdirSync('public/marca', { recursive: true });

console.log('\nDERIVACION DE ASSETS DE MARCA\n' + '-'.repeat(72));

for (const salida of SALIDAS) {
  const origen = FUENTES[salida.origen];
  if (!existsSync(origen)) {
    problemas += 1;
    console.log(`x falta el origen: ${origen}`);
    continue;
  }

  const destino = `public/marca/${salida.archivo}`;
  // -resize xH preserva la proporcion; -strip quita metadatos (el asset no los necesita).
  execFileSync('magick', [origen, '-resize', `x${salida.alto}`, '-strip', destino]);

  const bytes = statSync(destino).size;
  const dims = execFileSync('magick', ['identify', '-format', '%wx%h', destino]).toString();
  const excede = bytes > PRESUPUESTO_BYTES;
  if (excede) problemas += 1;

  console.log(
    `${excede ? 'x' : '+'} ${salida.archivo.padEnd(22)} ${dims.padEnd(10)} ${String(bytes).padStart(7)} B` +
      `  <- ${salida.uso}`,
  );
  const origenBytes = statSync(origen).size;
  console.log(`    origen ${origen.split('/').pop()} ${origenBytes} B -> ahorro ${(100 - (bytes / origenBytes) * 100).toFixed(1)}%`);
}

console.log('-'.repeat(72));

// ─── Set de reproducción por tamaño (docs/14 D7) ────────────────────────────────
// Recorte al bbox de la tinta (-trim) + ajuste dentro de un lienzo cuadrado + fondo
// blanco explicito. El emblema no se deforma: se ajusta proporcionalmente y se centra.
for (const item of REPRODUCCION) {
  const origen = FUENTES[item.origen];
  const destino = `public/${item.archivo}`;
  if (!existsSync(origen)) {
    problemas += 1;
    console.log(`x falta el origen: ${origen}`);
    continue;
  }

  // -trim quita el margen transparente; -resize ajusta DENTRO del cuadrado sin estirar;
  // -extent rellena hasta el cuadrado con blanco. El margen es el 8 % para no pegar el
  // emblema al borde (zona de respeto, docs/14 §2.4).
  const interior = Math.round(item.lado * 0.84);
  execFileSync('magick', [
    origen,
    '-trim',
    '+repage',
    '-resize',
    `${interior}x${interior}`,
    '-background',
    '#ffffff',
    '-gravity',
    'center',
    '-extent',
    `${item.lado}x${item.lado}`,
    '-alpha',
    'off',
    '-strip',
    destino,
  ]);

  const bytes = statSync(destino).size;
  const dims = execFileSync('magick', ['identify', '-format', '%wx%h', destino]).toString();
  const cuadrado = dims === `${item.lado}x${item.lado}`;
  if (!cuadrado) problemas += 1;

  console.log(
    `${cuadrado ? '+' : 'x'} ${item.archivo.padEnd(22)} ${dims.padEnd(10)} ${String(bytes).padStart(7)} B  <- ${item.uso}`,
  );
}

// ─── Hero de Inicio (2026-10-01) ───────────────────────────────────────────────
// Assets PROPIOS del cliente entregados en MEDIA/ASSETS WEBSITE (2048x1152). Se DERIVAN
// por reescalado mecanico —nunca se redibujan ni se recrean con IA, regla del operador—
// y se pasan a WebP. WebP y no JPEG porque el hero es la imagen LCP de una seccion de
// 88vh: la misma foto a 1920 px y calidad ~76 pesa ~30% menos (medido, de 286/379 KB en
// JPEG a ~202/296 KB en WebP). La primera va en el camino critico con fetchpriority=high;
// la segunda es el segundo cuadro del crossfade y se carga en lazy, asi que el primer
// cuadro no arrastra el peso de las dos.
const HEROES = [
  { origen: 'MEDIA/ASSETS WEBSITE/wallpaper hero section 1', archivo: 'hero/hero-1.webp' },
  { origen: 'MEDIA/ASSETS WEBSITE/hero section wall 2.jpg', archivo: 'hero/hero-2.webp' },
];
const HERO_ANCHO = 1920;
const HERO_CALIDAD = 76;
const HERO_PRESUPUESTO = 340 * 1024;

mkdirSync('public/hero', { recursive: true });
for (const item of HEROES) {
  if (!existsSync(item.origen)) {
    problemas += 1;
    console.log(`x falta el origen: ${item.origen}`);
    continue;
  }

  const destino = `public/${item.archivo}`;
  execFileSync('magick', [
    item.origen,
    '-resize',
    `${HERO_ANCHO}x`,
    '-strip',
    '-quality',
    String(HERO_CALIDAD),
    destino,
  ]);

  const bytes = statSync(destino).size;
  const dims = execFileSync('magick', ['identify', '-format', '%wx%h', destino]).toString();
  const excede = bytes > HERO_PRESUPUESTO;
  if (excede) problemas += 1;

  console.log(
    `${excede ? 'x' : '+'} ${item.archivo.padEnd(22)} ${dims.padEnd(10)} ${String(bytes).padStart(7)} B  <- hero de Inicio (asset propio)`,
  );
}

// ─── Validación del favicon a 32 px (lo que D7 pide explícitamente) ─────────────
// "Validar" aquí significa MIRAR, no suponer: se rasteriza a 32x32 y se imprime el mapa
// de tinta. Es el mismo metodo con el que se valido el emblema del reverso v5, y evita
// declarar bueno un icono que a 32 px es una mancha. Si el mapa sale todo negro o todo
// vacio, el tamano no sirve y hay que cambiar la solucion, no el criterio.
console.log('\n[VALIDACION] favicon a 32 px (docs/14 D7)');
const favicon32 = 'public/favicon-32.png';
if (existsSync(favicon32)) {
  // Profundidad de 8 bits en escala de grises; la tinta es lo que queda por debajo de 250.
  const grises = execFileSync('magick', [
    favicon32,
    '-colorspace', 'gray',
    '-depth', '8',
    '-resize', '32x32!',
    'gray:-',
  ]);
  let conTinta = 0;
  const mapa = [];
  for (let y = 0; y < 32; y += 1) {
    let fila = '';
    for (let x = 0; x < 32; x += 1) {
      const valor = grises[y * 32 + x];
      if (valor < 245) conTinta += 1;
      fila += valor > 250 ? ' ' : valor > 200 ? '.' : valor > 120 ? '+' : '#';
    }
    mapa.push(fila);
  }
  for (const fila of mapa) console.log(`  |${fila}|`);

  const cobertura = (conTinta / (32 * 32)) * 100;
  // Un emblema legible ocupa una fraccion apreciable del lienzo. Menos de 6 % es una
  // mancha; mas de 55 % es un bloque negro. Se avisa, no se falla: el umbral es una guia.
  if (cobertura < 6) {
    problemas += 1;
    console.log(`x cobertura de tinta ${cobertura.toFixed(1)} %: a 32 px el emblema no se lee`);
  } else if (cobertura > 55) {
    problemas += 1;
    console.log(`x cobertura de tinta ${cobertura.toFixed(1)} %: a 32 px el emblema se lee como bloque`);
  } else {
    console.log(`  + cobertura de tinta ${cobertura.toFixed(1)} % — el anillo y el simbolo se distinguen`);
  }
}

console.log('-'.repeat(72));
if (problemas > 0) {
  console.log(`RESULTADO: ${problemas} problema(s). Ningun archivo debe pasar de ${PRESUPUESTO_BYTES} B.\n`);
  process.exit(1);
}
console.log('RESULTADO: OK — derivados generados desde los assets oficiales, sin redibujar nada.\n');
