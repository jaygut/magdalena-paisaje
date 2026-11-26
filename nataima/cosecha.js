// Graph of Life brand v1.0.0 · tokens.json
const field = document.getElementById('cosecha');
if (field) {
  const steps = Array.from(field.querySelectorAll('[data-etapa]'));
  const panels = Array.from(field.querySelectorAll('[data-paso]'));
  function show(name) {
    if (!steps.some(step => step.dataset.etapa === name)) return;
    for (const step of steps) {
      if (step.dataset.etapa === name) step.setAttribute('aria-current','step');
      else step.removeAttribute('aria-current');
    }
    for (const panel of panels) panel.hidden = panel.dataset.paso !== name;
  }
  function readLocation() {
    const url = new URL(window.location.href);
    const item = url.hash.startsWith('#medir-') ? url.hash.slice(7) : url.searchParams.get('etapa');
    const selected = steps.find(step => step.dataset.etapa === item);
    show(selected ? selected.dataset.etapa : steps[0].dataset.etapa);
  }
  for (const step of steps) {
    step.setAttribute('aria-controls', 'medir-' + step.dataset.etapa);
    step.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      show(step.dataset.etapa);
      const url = new URL(window.location.href);
      url.searchParams.set('etapa', step.dataset.etapa);
      url.hash = 'cosecha';
      window.history.replaceState(null, '', url);
    });
  }
  readLocation();
  window.addEventListener('hashchange', readLocation);
  window.addEventListener('popstate', readLocation);
}
