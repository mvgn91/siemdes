// Pruebas negativas de la guardia de marca — S1-D-04.8
//
// POR QUE ESTE ARCHIVO EXISTE. Una regla que nunca se ha visto fallar no es una regla
// verificada: es una linea de codigo que quizas no hace nada. Cada prueba de aqui INYECTA
// un defecto real en un archivo real, corre la guardia de verdad y comprueba que el build
// se rechaza con el mensaje esperado. Si la guardia pasara alguna de estas pruebas, el
// defecto se publicaria.
//
// Las pruebas cubren las 14 reglas, no solo las 13 y 14 que nacieron del ajuste de
// densidad. El orden de las 12 primeras es el del historial: cada una existe porque un
// defecto real llego a la guardia.
//
// Uso: node scripts/probar-guardia.mjs
// Salida: una linea por prueba. Sale con codigo 1 si alguna prueba NO detecta su defecto.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const RAIZ = process.cwd();
const P = (p) => join(RAIZ, p);

/** Corre la guardia y devuelve stdout + codigo de salida. */
function correrGuardia() {
  try {
    const salida = execFileSync('node', ['scripts/guardia-marca.mjs'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { salida, codigo: 0 };
  } catch (e) {
    return { salida: `${e.stdout ?? ''}${e.stderr ?? ''}`, codigo: e.status ?? 1 };
  }
}

/**
 * Inyecta un defecto, corre la guardia y restaura el archivo pase lo que pase.
 * `espera` es el fragmento que la salida DEBE contener. Si la guardia no falla, la
 * prueba se reporta como fallo aunque el defecto se haya inyectado bien.
 */
function prueba(nombre, archivo, transformar, espera) {
  const ruta = P(archivo);
  if (!existsSync(ruta)) return { nombre, ok: false, motivo: `no existe ${archivo}` };
  const original = readFileSync(ruta, 'utf8');
  try {
    const modificado = transformar(original);
    if (modificado === original) {
      return { nombre, ok: false, motivo: 'el defecto no se pudo inyectar (el patron no caso)' };
    }
    writeFileSync(ruta, modificado);
    const { salida, codigo } = correrGuardia();
    // Una prueba sin `espera` solo exige que el build se rechace: sirve para reglas cuyo
    // texto de error no se quiere fijar en el test (si el mensaje cambia, el aviso sigue
    // siendo cierto y la prueba no se vuelve fragil).
    const detecto = codigo !== 0 && (espera === '' || salida.includes(espera));
    const motivo = detecto
      ? ''
      : codigo === 0
        ? 'la guardia APROBO el sitio con el defecto inyectado'
        : `fallo por otra causa; no contiene "${espera}"`;
    return { nombre, ok: detecto, motivo };
  } finally {
    writeFileSync(ruta, original);
  }
}

// ── Los defectos que cada prueba inyecta ─────────────────────────────────────────
//
// DONDE SE INYECTA. Esto no es un detalle: la primera version de este archivo inyectaba
// todos los defectos en `src/` y 5 de 15 pruebas pasaron sin comprobar nada. La razon es
// que las reglas 1, 2, 3, 4, 5, 5b y 12 leen `dist/` — lo que REALMENTE se publica — y
// 6, 9, 13 y 14 leen `src/`. Inyectar en el lado equivocado no produce un fallo, produce
// una prueba verde que no prueba nada. Cada caso declara el archivo que su regla lee.
//
// Que se inyecte en `dist/` no es una comodidad: es el punto honesto. La guardia existe
// para revisar lo publicado, asi que un defecto en `dist/` es exactamente el defecto que
// tiene que atrapar. Y `dist/` se regenera en cada `pnpm build`, asi que la prueba no
// puede dejar nada roto atras.

const CSS_EMITIDO = join('dist', '_astro', readdirSync(join(RAIZ, 'dist', '_astro')).find((f) => f.endsWith('.css')));

const CASOS = [
  // ── 1. Color fuera de la paleta (lee dist/_astro/*.css) ────────────────────────
  {
    nombre: '1 · un hex fuera de la paleta en el CSS emitido',
    archivo: CSS_EMITIDO,
    transformar: (t) => `${t}.prueba-azul{color:#2563eb}`,
    espera: 'NO esta en la paleta',
  },
  // ── 2. Paleta de color de Tailwind usada por su cuenta (lee dist/_astro/*.css) ─
  {
    nombre: '2 · una utilidad de color de la paleta por defecto de Tailwind',
    archivo: CSS_EMITIDO,
    transformar: (t) => `${t}.bg-blue-600{background-color:#2563eb}`,
    espera: 'utilidad fuera de marca',
  },
  // ── 2b. Tipografia que el kit descarta (Space Grotesk, lee dist/*.html) ────────
  {
    nombre: '2b · la familia que el manual descarta (Space Grotesk, docs/14 §4.1)',
    archivo: 'dist/index.html',
    transformar: (t) => t.replace('</main>', '<p>Space Grotesk</p></main>'),
    espera: 'Space Grotesk',
  },
  // ── 3. Color inline en el HTML publicado ───────────────────────────────────────
  {
    nombre: '3 · color puesto a mano en una etiqueta del HTML publicado',
    archivo: 'dist/index.html',
    transformar: (t) => t.replace('<h1 class=', '<h1 style="color:#ff0000" class='),
    espera: 'color inline',
  },
  // ── 4. Sigla vetada (lee dist/*.html) ──────────────────────────────────────────
  {
    nombre: '4 · la sigla que el kit veta (L4: SIEMES en vez de SIEMDES)',
    archivo: 'dist/index.html',
    transformar: (t) => t.replace('</main>', '<p>SIEMES</p></main>'),
    espera: 'sigla vieja',
  },
  // ── 5. Promesa prohibida (limite L1) ───────────────────────────────────────────
  {
    nombre: '5 · promesa de tiempo de entrega',
    archivo: 'dist/index.html',
    transformar: (t) => t.replace('</main>', '<p>Entrega en 48 horas</p></main>'),
    espera: 'promesa de tiempos',
  },
  // ── 5b. Efecto prohibido ───────────────────────────────────────────────────────
  {
    nombre: '5b · sombra de caja (lo prohibe el manual §10 y docs/14 §2.6)',
    archivo: CSS_EMITIDO,
    transformar: (t) => `${t}.shadow-lg{box-shadow:0 1px 3px #0000001a}`,
    espera: 'efecto prohibido',
  },
  // ── 5c/1b/9b. La enmienda del veto 6 (R05.26): el desenfoque entra, pero acotado ──
  //     Estas tres pruebas son las que sostienen que el veto sigue siendo veto. Sin ellas,
  //     "backdrop-filter dentro de .acrilico" seria una puerta abierta que nadie podria
  //     cerrar despues.
  {
    nombre: '5c · backdrop-filter en un elemento cualquiera (la excepcion es del material)',
    archivo: CSS_EMITIDO,
    transformar: (t) => `${t}.cristal{backdrop-filter:blur(8px)}`,
    espera: 'backdrop-filter fuera del material acrilico',
  },
  {
    nombre: '5c · alfa escrita a mano fuera del material (rgb en vez de color-mix)',
    archivo: CSS_EMITIDO,
    transformar: (t) => `${t}.cristal{background-color:rgb(255 255 255 / 12%)}`,
    espera: 'color por funcion fuera de la paleta',
  },
  {
    nombre: '9b · el material deja de llegar al CSS (tarjeta opaca sin que nadie se entere)',
    archivo: CSS_EMITIDO,
    // Se cambia el selector de la regla compartida: el HTML sigue usando `.acrilico`, el
    // CSS deja de definirla y la tarjeta se publica sin material en silencio.
    transformar: (t) => t.replace('.acrilico,.acrilico-oscuro{', '.acrilico-tirado,.acrilico-oscuro-tirado{'),
    espera: 'se usa en el marcado pero el CSS no la declara',
  },
  // ── 8. Campo interno que no debe publicarse (lee src/data/*.json + dist/*.html) ─
  //     Se declara como `motivo` un texto que YA esta publicado. Si la regla no funciona,
  //     este texto pasaria sin que nadie se entere, que es justo el fallo que la regla
  //     existe para tapar: una decision interna colada en una pagina visible.
  {
    nombre: '8 · un motivo interno que aparece en una pagina publicada',
    archivo: 'src/data/cobertura.json',
    // El motivo va CON acentos y tal cual aparece en el HTML publicado. Se re-ancla
    // 2026-10-03: el motivo anterior citaba la intro vieja ("La base está en Arandas…",
    // luego "Base en Arandas para toda la región…"), que el recorte de leads a ≤80c
    // cambió a "Base en Arandas para los Altos; en taller o en sitio.". Sin re-anclar,
    // la prueba pasaba sin comprobar nada (el defecto inyectado nunca llegaba al HTML).
    // Re-anclado R05.21 (2026-10-05): la intro pasó a "Base en Arandas, Jalisco.
    // Atención en taller o en sitio." por el retoque de tono.
    // Re-anclado R05.39 (2026-10-05): la intro de Cobertura SALIO del sitio con las
    // entradillas (orden del operador) y el motivo viejo volvia a pasar sin comprobar
    // nada. Nuevo ancla: el texto del canal WhatsApp, publicado y estable.
    transformar: (t) => t.replace(
      '"noPublicado": [',
      '"noPublicado": [\n    {"motivo": "Diagnóstico, visita o cotización por WhatsApp.", "fuente": "prueba"},',
    ),
    espera: 'texto interno publicado',
  },
  // ── 9. Clase compartida que no llega al CSS (lee src/estilos/*.ts) ────────────
  {
    nombre: '9 · clase de modulo compartido que Tailwind no escanea',
    archivo: 'src/estilos/boton.ts',
    transformar: (t) => t.replace("'inline-block", "'ring-4 inline-block"),
    espera: 'no llega al CSS',
  },
  // ── 11. Cifras que no cuadran entre paginas (lee src/data/*.json) ─────────────
  {
    nombre: '11 · una cifra de la portada que ya no coincide con su pagina',
    archivo: 'src/data/inicio.json',
    // Anclado por CONTENIDO y no por sangria: el patron llevaba la indentacion escrita a
    // mano y el reformateo de inicio.json (2026-10-01, unificacion con la guia) la movio de
    // 3 a 6 espacios. La prueba se reportaba DEBIL sin comprobar nada: no por un fallo de
    // la guardia, sino porque el defecto nunca llego a inyectarse.
    // 2026-10-05 (R04.23): la cifra "8 marcas con diagnostico" salio del sitio, asi que el
    // ancla pasa a "+22 marcas atendidas" (sigue cruzando contra marcas.json, regla 11).
    transformar: (t) => t.replace(/("valor":\s*)"\+22"(?=\s*,\s*"etiqueta":\s*"marcas atendidas)/, '$1"99"'),
    espera: 'cuadra con',
  },
  // ── 12. Contraste por debajo de AA en el HTML publicado ───────────────────────
  // El ancla es el párrafo de Maquinaria (fondo blanco): antes era el de Evidencia, pero
  // Evidencia pasó a banda numeral (alternancia 2026-10-01) y ahí el ámbar da otro ratio.
  // Anclado por contenido, no por orden.
  {
    // Re-anclado R05.39 (2026-10-05): el ancla anterior era la entradilla de la 02
    // ("Conoce los tipos…"), que salio con las entradillas. Nuevo ancla: un chip de la
    // 02. OJO CON EL NUMERO: sobre la banda blanca pura el ratio era 1.53:1, pero el chip
    // vive en tarjeta acrilica y la guardia mide el compuesto MEDIDO (#FAFAFA), que da
    // 1.47:1 — el `espera` cita lo que la guardia realmente dice, no el arquetipo.
    nombre: '12 · ambar como texto sobre fondo claro (falla AA)',
    archivo: 'dist/index.html',
    transformar: (t) => t.replace('text-chip text-tinte-2">Tractores agrícolas', 'text-chip text-ambar">Tractores agrícolas'),
    espera: 'da 1.47:1',
  },
  // ── 13. Escala tipografica: cuatro defectos distintos (lee src/) ───────────────
  // Re-anclado en R05.12: la página se retiró a la landing; el patrón vive igual
  // en la 01 Servicios de Inicio.
  // Re-anclado R05.39 (2026-10-05): el ancla era una entradilla
  // (`mt-4 max-w-2xl text-lead`, que ya no existe en ninguna seccion). Nuevo ancla: el
  // lead de la tarjeta negra de diagnostico, el unico `text-lead` publicado que queda.
  {
    nombre: '13 · tamano numerico (text-sm) reintroducido',
    archivo: 'src/pages/index.astro',
    transformar: (t) => t.replace('class="mt-2 max-w-2xl text-lead text-tinte-2"', 'class="mt-2 max-w-2xl text-sm text-tinte-2"'),
    espera: 'es un tamano numerico, no un rol',
  },
  {
    // El ancla es un rol EN USO. Cuando `cuerpo-denso` dejo de usarse (los chips pasaron a
    // `chip`) esta prueba dejo de inyectar su defecto y se reporto como fallo, que es lo
    // correcto: no paso en verde sin comprobar nada.
    nombre: '13 · rol mal escrito (text-chipp) que no genera CSS',
    archivo: 'src/pages/index.astro',
    transformar: (t) => t.replace('text-chip', 'text-chipp'),
    espera: 'no es un rol de la escala ni un color de la paleta',
  },
  {
    nombre: '13 · rol declarado por debajo del piso de 14 px',
    archivo: 'src/styles/marca.css',
    transformar: (t) => t.replace('--text-etiqueta: 0.875rem;', '--text-etiqueta: 0.75rem;'),
    espera: 'el piso del sistema es 14 px',
  },
  {
    nombre: '13 · rol declarado que nunca llega al CSS emitido',
    archivo: 'src/styles/marca.css',
    // El ancla es el valor de un rol: si la escala cambia (paso el 2026-09-30, `pie` paso de
    // 15 a 16 px), esta prueba deja de encontrar su patron y SE REPORTA COMO FALLO en vez de
    // pasar en verde sin comprobar nada. Es el comportamiento correcto, no un estorbo.
    transformar: (t) => t.replace('  --text-pie: 1rem;', '  --text-nunca-usado: 1rem;\n  --text-pie: 1rem;'),
    espera: 'no llega al CSS emitido',
  },
  // ── 14. Techo de densidad: tres defectos distintos (lee src/) ──────────────────
  // Ancla móvil por contenido: vivía en Servicios, pero R03 (Fase B) convirtió sus
  // bloques en bandas y el patrón dejó de existir. Se re-ancla donde el patrón
  // sigue significando lo mismo (un grid de bloques tras la intro).
  // Re-anclado en R05.12: la página se retiró a la landing; el grid de bloques
  // tras la intro vive en la 01 Servicios de Inicio.
  {
    nombre: '14 · margen de 64 px entre bloques (el aire que reporto el operador)',
    archivo: 'src/pages/index.astro',
    transformar: (t) => t.replace('mt-8 grid gap-6 md:grid-cols-2', 'mt-16 grid gap-6 md:grid-cols-2'),
    espera: 'separacion de 64 px',
  },
  {
    nombre: '14 · padding vertical de 96 px en un bloque',
    archivo: 'src/pages/index.astro',
    transformar: (t) => t.replace('px-4 py-10', 'px-4 py-24'),
    espera: 'padding de bloque',
  },
  // Re-anclado en R03 Fase B por el mismo motivo: el patrón de Servicios desapareció
  // con las bandas. Contacto conserva grids equivalentes.
  // Re-anclado en R05.12: la página se retiró a la landing; el grid equivalente
  // vive en la 05 Contacto de Inicio.
  {
    nombre: '14 · hueco de rejilla de 40 px entre columnas',
    archivo: 'src/pages/index.astro',
    transformar: (t) => t.replace('grid gap-6 md:grid-cols-2', 'grid gap-10 md:grid-cols-2'),
    espera: 'hueco de rejilla',
  },
  // ── 15. Numeral decorativo y marca de agua (lee dist/*.html) ──────────────────
  //     Las dos puertas del defecto real del 2026-09-30: 12 numerales con el tinte de marca
  //     de agua sobre fondo blanco, que la guardia no veia porque la excepcion de contraste
  //     se concedia por llevar `aria-hidden` sin mirar el fondo.
  {
    nombre: '15a · numeral decorativo sin aria-hidden (se anunciaria como texto)',
    archivo: 'dist/index.html',
    transformar: (t) => t.replace('<span class="text-indice" aria-hidden="true">', '<span class="text-indice">'),
    espera: 'sin aria-hidden',
  },
  // ── 16. Estandar del rol y del arbol de encabezados ───────────────────────────
  {
    nombre: '16a · familia escrita a mano en el marcado (la impone el rol)',
    archivo: 'src/pages/404.astro',
    transformar: (t) => t.replace('text-etiqueta-bloque hover:border-negro', 'font-titular text-etiqueta-bloque hover:border-negro'),
    espera: 'la impone el rol',
  },
  // ── 16b-ii: el rol de h2 fuera de su nivel ──
  // Re-anclado en R03 Fase D: el `<h2 class="text-titular-2">` pelado era el del
  // CierreCta de Inicio, que salió con la simplificación. Se ancla al primer h2
  // con titular-2 de Inicio (header S01).
  // Re-anclado en R05.6: los h2 de sección llevan `titulo-resaltado` (D-B); el
  // ancla incluye la clase nueva para que el defecto se siga inyectando.
  {
    nombre: '16b · un h2 con el rol de otro nivel (el nivel visual deja de decir el semantico)',
    archivo: 'dist/index.html',
    transformar: (t) => t.replace('text-titular-2 text-negro titulo-resaltado', 'text-titular-3 text-negro titulo-resaltado'),
    espera: 'le toca "text-titular-2"',
  },
  // Re-anclado R05.39 (2026-10-05): mismo motivo que la 13 de arriba — el ancla era una
  // entradilla. Nuevo ancla: el mismo lead de la tarjeta negra de diagnostico.
  {
    nombre: '16b · el rol de h1 usado en un parrafo',
    archivo: 'dist/index.html',
    transformar: (t) => t.replace('class="mt-2 max-w-2xl text-lead text-tinte-2"', 'class="mt-2 max-w-2xl text-titular-1 text-tinte-2"'),
    espera: 'ese rol es del <h1>',
  },
  {
    nombre: '15b · marca de agua (#EEEEF0) fuera de un fondo negro = 1.16:1',
    archivo: 'dist/index.html',
    transformar: (t) =>
      t.replace('<span class="text-indice" aria-hidden="true">', '<span class="text-indice text-numeral" aria-hidden="true">'),
    espera: '1.16:1',
  },
];

console.log('\n  PRUEBAS NEGATIVAS DE LA GUARDIA DE MARCA');
console.log('  Cada prueba inyecta un defecto real y exige que el build se rechace.\n');

const resultados = [];
for (const caso of CASOS) {
  const r = prueba(caso.nombre, caso.archivo, caso.transformar, caso.espera);
  resultados.push(r);
  const marca = r.ok ? '+' : 'x';
  console.log(`  ${marca} ${r.nombre}`);
  if (!r.ok) console.log(`      ${r.motivo}`);
}

const fallos = resultados.filter((r) => !r.ok);
console.log('\n' + '  ' + '─'.repeat(70));
console.log(`  ${resultados.length - fallos.length}/${resultados.length} defectos detectados por la guardia.`);
if (fallos.length === 0) {
  console.log('  La guardia rechaza cada defecto que se le inyecta.\n');
  process.exit(0);
}
console.log(`  ${fallos.length} prueba(s) con la guardia DEBIL: el defecto se publicaria.\n`);
process.exit(1);
