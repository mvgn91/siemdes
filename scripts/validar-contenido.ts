#!/usr/bin/env node
// Validador de contenido del micrositio SIEMDES — S1-D-02.1 (docs/15)
//
// Corre ANTES del build (ver package.json). Si un bloque no trae fuente, si falta un
// campo o si aparece una palabra vetada, el build se detiene: un dato sin respaldo no
// llega al sitio publicado. Es el mismo criterio del blackboard aplicado al copy.
//
// Alcance de este script: ESTRUCTURA y FUENTES. Las reglas de frases prohibidas
// (L1–L3), colores fuera de paleta y tipografias vetadas son de la guardia de marca
// (S1-D-03.7), que trabaja sobre el HTML ya generado y puede declarar excepciones
// ("No se prometen tiempos de entrega" es correcto y una lista ingenua lo marcaria).

import { readFileSync } from 'node:fs';
import { CONTENIDO } from '../src/data/esquema.ts';

const VETADAS: { patron: RegExp; motivo: string }[] = [
  { patron: /\bSIEMES\b/, motivo: 'La sigla autorizada es SIEMDES (V-013, limite L4)' },
  { patron: /Space Grotesk/i, motivo: 'Tipografia descartada por decision del operador 2026-09-28 (docs/14 §4.1)' },
];

/** Recorre el JSON y devuelve las rutas de las cadenas que coinciden con un patron. */
function cadenasQueCoinciden(valor: unknown, patron: RegExp, ruta = ''): string[] {
  if (typeof valor === 'string') {
    return patron.test(valor) ? [ruta] : [];
  }
  if (Array.isArray(valor)) {
    return valor.flatMap((v, i) => cadenasQueCoinciden(v, patron, `${ruta}[${i}]`));
  }
  if (valor && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([k, v]) =>
      cadenasQueCoinciden(v, patron, ruta ? `${ruta}.${k}` : k),
    );
  }
  return [];
}

/** Cuenta bloques de copy (objetos con campo `fuente`) y junta las fuentes citadas. */
function auditarFuentes(valor: unknown, fuentes = new Set<string>()): { bloques: number } {
  let bloques = 0;
  const recorrer = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(recorrer);
    if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      if (typeof obj.fuente === 'string') {
        bloques += 1;
        for (const parte of obj.fuente.split(',')) {
          const limpio = parte.trim();
          if (limpio) fuentes.add(limpio);
        }
      }
      Object.values(obj).forEach(recorrer);
    }
  };
  recorrer(valor);
  return { bloques };
}

/**
 * Logos de marca: cada archivo declarado tiene que EXISTIR y las 23 marcas de `grupos`
 * tienen que estar cubiertas por un logo o por un motivo escrito en `sinLogo`.
 *
 * Motivo real (2026-10-01, alta de los 18 logos de Brandfetch): el mapa de marcas cambio
 * de 6 logos a 18 y el Invierno del build no lo notaba — el JSON era valido, el esquema
 * pasaba y el cintillo se publicaba con un `src` roto, que en el navegador es un hueco
 * en blanco con el texto de la marca al lado. Nadie se entera hasta que alguien abre la
 * pagina. Y el reverso tambien importa: si una marca pierde su logo sin motivo escrito,
 * la franja pierde una marca en silencio y el motivo se re-descubre seis meses después.
 */
function auditarLogos(marcas: unknown): number {
  let fallos = 0;
  const m = marcas as {
    grupos: { marcas: string[] }[];
    logos?: { id: string; archivo: string; perfil: string }[];
    sinLogo?: { marca: string }[];
  };
  const unicas = [...new Set(m.grupos.flatMap((g) => g.marcas))];
  const conLogo = new Set((m.logos ?? []).map((l) => l.id));
  const sinLogo = new Set((m.sinLogo ?? []).map((p) => p.marca));

  for (const logo of m.logos ?? []) {
    const ruta = new URL(`../public${logo.archivo}`, import.meta.url);
    try {
      readFileSync(ruta);
    } catch {
      fallos += 1;
      console.log(`✗ marcas.json · logos\n    ${logo.id}: el archivo ${logo.archivo} no existe en public/`);
    }
  }
  for (const marca of unicas) {
    if (conLogo.has(marca)) {
      if (sinLogo.has(marca)) {
        fallos += 1;
        console.log(`✗ marcas.json · ${marca}: tiene logo y además está en sinLogo`);
      }
    } else if (!sinLogo.has(marca)) {
      fallos += 1;
      console.log(`✗ marcas.json · ${marca}: sin logo y sin motivo escrito en sinLogo`);
    }
  }
  for (const extra of [...conLogo, ...sinLogo]) {
    if (!unicas.includes(extra)) {
      fallos += 1;
      console.log(`✗ marcas.json · ${extra}: declarado en logos/sinLogo pero no está en ningún grupo`);
    }
  }
  return fallos;
}

/**
 * Reels (docs/35, 2026-10-06): cada `video` y cada `poster` declarado tiene que EXISTIR en
 * `public/`. Mismo motivo escrito que en `auditarLogos`: el JSON puede ser valido, el
 * esquema puede pasar y el `<video>` publicarse con un `src` roto, que en el navegador es un
 * cuadro vacío con el poster ausente. Nadie se entera hasta que alguien abre la página.
 */
function auditarReels(reels: unknown): number {
  let fallos = 0;
  const r = reels as { casos?: { marca: string; video: string; poster: string }[] };
  for (const caso of r.casos ?? []) {
    for (const campo of ['video', 'poster'] as const) {
      const ruta = new URL(`../public${caso[campo]}`, import.meta.url);
      try {
        readFileSync(ruta);
      } catch {
        fallos += 1;
        console.log(`✗ reels.json · ${caso.marca}\n    ${campo}: el archivo ${caso[campo]} no existe en public/`);
      }
    }
  }
  return fallos;
}

let errores = 0;
const fuentesGlobales = new Set<string>();
let bloquesTotales = 0;

console.log('\nVALIDACION DE CONTENIDO — micrositio SIEMDES\n' + '─'.repeat(64));

for (const [archivo, esquema] of Object.entries(CONTENIDO)) {
  let crudo: unknown;
  try {
    crudo = JSON.parse(readFileSync(archivo, 'utf8'));
  } catch (error) {
    errores += 1;
    console.log(`✗ ${archivo}\n    no se pudo leer o no es JSON valido: ${String(error)}`);
    continue;
  }

  const resultado = esquema.safeParse(crudo);
  if (!resultado.success) {
    errores += resultado.error.issues.length;
    console.log(`✗ ${archivo}`);
    for (const issue of resultado.error.issues) {
      console.log(`    ${issue.path.join('.') || '(raiz)'}: ${issue.message}`);
    }
    continue;
  }

  for (const { patron, motivo } of VETADAS) {
    for (const ruta of cadenasQueCoinciden(crudo, patron)) {
      errores += 1;
      console.log(`✗ ${archivo}\n    ${ruta}: ${motivo}`);
    }
  }

  const fuentes = new Set<string>();
  const { bloques } = auditarFuentes(crudo, fuentes);
  fuentes.forEach((f) => fuentesGlobales.add(f));
  bloquesTotales += bloques;

  if (archivo === 'src/data/marcas.json') {
    const fallos = auditarLogos(crudo);
    errores += fallos;
    const m = crudo as { grupos: { marcas: string[] }[] };
    const unicas = new Set(m.grupos.flatMap((g) => g.marcas));
    const conLogo = ((crudo as { logos?: unknown[] }).logos ?? []).length;
    console.log(
      `  marcas: ${unicas.size} únicas · ${conLogo} con logo · ${unicas.size - conLogo} en texto con motivo escrito` +
        (fallos === 0 ? ' · todos los archivos existen' : ''),
    );
  }

  if (archivo === 'src/data/reels.json') {
    const fallos = auditarReels(crudo);
    errores += fallos;
    const r = crudo as { casos?: unknown[] };
    console.log(
      `  reels: ${(r.casos ?? []).length} casos` +
        (fallos === 0 ? ' · video y poster existen en public/' : ''),
    );
  }

  console.log(`✓ ${archivo.padEnd(34)} ${String(bloques).padStart(3)} bloques · ${fuentes.size} fuentes`);
}

console.log('─'.repeat(64));
console.log(`Bloques con fuente declarada: ${bloquesTotales}`);
console.log(`Fuentes distintas citadas:    ${fuentesGlobales.size}`);
console.log(`Palabras vetadas encontradas: ${errores === 0 ? 0 : 'ver arriba'}`);

if (errores > 0) {
  console.log(`\nRESULTADO: FALLA — ${errores} problema(s). Build detenido.\n`);
  process.exit(1);
}

console.log('\nRESULTADO: OK — todo el copy trae respaldo y no hay palabras vetadas.\n');
