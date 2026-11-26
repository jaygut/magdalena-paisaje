/* Graph of Life brand · tokens.json. All quantitative views are prepared from datos/resultados.json. */
function bind(section, groupName, dataAttribute, onChange) {
  const controls = section.querySelector('fieldset[data-ot-selector]');
  const options = [...controls.querySelectorAll('input[type="radio"]')];
  const panels = [...section.querySelectorAll('[' + dataAttribute + ']')];
  const synchronize = () => {
    const selected = options.find(input => input.checked);
    if (!selected) return;
    panels.forEach(panel => { panel.hidden = panel.getAttribute(dataAttribute) !== selected.value; });
    if (onChange) onChange(selected.value);
  };
  if (options.length !== panels.length || options.some(option => option.name !== groupName ||
      !panels.some(panel => panel.getAttribute(dataAttribute) === option.value))) return;
  synchronize();
  controls.addEventListener('change', synchronize);
  controls.hidden = false;
}
const forest = document.querySelector('[data-ot="bosque"]');
if (forest) bind(forest, 'marco', 'data-ot-marco', value => { forest.dataset.ventana = value; });
const overlap = document.querySelector('[data-ot="radios"]');
if (overlap) bind(overlap, 'ot-den', 'data-ot-radio', value => { overlap.dataset.referencia = value; });
const decisions = document.querySelector('[data-ot="decision"]');
if (decisions) bind(decisions, 'ot-visita', 'data-ot-visita');
