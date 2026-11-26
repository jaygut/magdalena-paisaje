/* Graph of Life · tokens.json · datos compilados desde el catálogo WorldCover. */
(() => {
  const figura = document.getElementById('supuestos');
  if (!figura) return;
  const selector = figura.querySelector('[data-selector-costo]');
  const salida = figura.querySelector('[data-lectura-elegida]');
  const escenarios = new Map(Array.from(figura.querySelectorAll('template[data-lectura-costo]'),
    elemento => [elemento.dataset.lecturaCosto, elemento.content.textContent]));
  if (!selector || !salida || !escenarios.size) return;

  function leer(costo) {
    const lectura = escenarios.get(costo);
    if (!lectura) return;
    for (const marca of figura.querySelectorAll('[data-costo-marca], [data-costo-guia]')) {
      marca.toggleAttribute('data-activo', (marca.dataset.costoMarca || marca.dataset.costoGuia) === costo);
    }
    for (const fila of figura.querySelectorAll('[data-fila-costo]')) {
      fila.toggleAttribute('data-activo', fila.dataset.filaCosto === costo);
    }
    salida.textContent = lectura;
  }

  selector.addEventListener('change', evento => {
    if (evento.target.matches('input[name="criterio-costo"]')) leer(evento.target.value);
  });
  leer(selector.querySelector('input:checked').value);
  selector.hidden = false;
})();
