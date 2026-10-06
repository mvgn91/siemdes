// Viajeros: CTA que acompaña + botón subir — R05.19 (orden del operador 2026-10-05)
//
// Un solo CTA viaja con el visitante al dar scroll (aparece pasado el hero); en la
// sección de Contacto se oculta porque ahí ya están los CTA de cierre. El botón de
// subir aparece más abajo y lleva arriba con scroll suave (o directo con
// `prefers-reduced-motion`). Sin JS no hay viajeros: son mejora, no función.

const viajero = document.getElementById('viajero-cta');
const subir = document.getElementById('viajero-subir');
const contacto = document.getElementById('contacto');

if (viajero && subir) {
  const UMBRAL_VIAJERO = 480;
  const UMBRAL_SUBIR = 1200;
  let contactoVisible = false;

  if (contacto) {
    new IntersectionObserver(
      (entradas) => {
        contactoVisible = entradas[0]?.isIntersecting ?? false;
        refrescar();
      },
      { threshold: 0.25 },
    ).observe(contacto);
  }

  const refrescar = () => {
    const y = window.scrollY;
    viajero.classList.toggle('viajero-visible', y > UMBRAL_VIAJERO && !contactoVisible);
    subir.classList.toggle('viajero-visible', y > UMBRAL_SUBIR);
  };

  subir.addEventListener('click', () => {
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: suave ? 'smooth' : 'auto' });
  });

  window.addEventListener('scroll', refrescar, { passive: true });
  refrescar();
}
