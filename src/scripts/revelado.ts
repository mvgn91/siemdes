// Revelado por scroll — R05.19 (orden del operador 2026-10-05)
//
// Los contenidos aparecen y desaparecen en medida que se hace scroll: cada bloque
// con `data-revela` entra (opacidad + subida leve) al entrar en pantalla y sale al
// dejarla. Solo transform+opacity, dentro del criterio D-D. Sin JS no hay nada que
// ocultar (el estado oculto solo existe bajo `.revela-listo`, que pone este script);
// con `prefers-reduced-motion` el script no corre y todo queda visible.

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('revela-listo');

  const visibles = new Set<Element>();
  const observa = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        entrada.target.classList.toggle('visible', entrada.isIntersecting);
        if (entrada.isIntersecting) visibles.add(entrada.target);
        else visibles.delete(entrada.target);
      }
    },
    { threshold: 0.12 },
  );

  for (const bloque of document.querySelectorAll('[data-revela]')) observa.observe(bloque);
}
