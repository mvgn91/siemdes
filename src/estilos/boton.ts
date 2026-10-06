// Estilos del boton — S1-D-03.4
// Vive aparte porque lo usan DOS mundos: los componentes .astro y las islas React
// (S1-D-03.5). Si estuviera duplicado, en la primera edicion se separarian.
// Las tres variantes son las unicas permitidas por la paleta; no hay "azul" ni degradados.

export const BASE_BOTON =
  'inline-block px-5 py-2.5 text-boton';

export const VARIANTES_BOTON = {
  /** Fondo ambar con texto negro: 11.57:1 MEDIDO (docs/14 §3.3; antes decia 14.3 y estaba
   *  mal — la cifra corregida vive en la tabla, no en la memoria del autor). */
  ambar: 'bg-ambar text-negro hover:bg-negro hover:text-ambar',
  negro: 'bg-negro text-blanco hover:bg-ambar hover:text-negro',
  contorno: 'border-2 border-negro text-negro hover:bg-negro hover:text-blanco',
} as const;

export type VarianteBoton = keyof typeof VARIANTES_BOTON;

export function clasesBoton(variante: VarianteBoton, extra = ''): string {
  return [BASE_BOTON, VARIANTES_BOTON[variante], extra].filter(Boolean).join(' ');
}
