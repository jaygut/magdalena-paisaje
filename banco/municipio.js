// Graph of Life brand v1.0.0 · public, date-paired municipal water observations.
const section = document.querySelector('#nivel-del-rio');
const out = selector => section.querySelector(selector);
const number = (value, digits=2) => value.toLocaleString('es-CO',{minimumFractionDigits:digits, maximumFractionDigits:digits});
const svgNS = 'http://www.w3.org/2000/svg';
function paintCoverage(rows) {
  const map = out('[data-eb-huella]');
  const squares = rows.map(([row, col, total, valid]) => {
    const rect=document.createElementNS(svgNS,'rect');
    const state=valid/total>=.7?'alta':valid?'parcial':'vacia';
    for (const [key,val] of Object.entries({x:10*col,y:10*(11-row),width:9,height:9,class:'eb-'+state})) rect.setAttribute(key,val);
    return rect;
  });
  map.replaceChildren(...squares);
}
async function enable() {
  const res=await fetch(new URL('datos/municipio.json',import.meta.url));
  if (!res.ok) throw Error('Faltan las fechas municipales');
  const data=await res.json();
  const dates=new Map(data.fechas.map(item=>[item.fecha,item]));
  const buttons=Array.from(section.querySelectorAll('[data-eb-fecha]'));
  if (dates.size!==9 || !buttons.every(button=>dates.has(button.dataset.ebFecha))) throw Error('Fechas de la figura incompatibles');
  const url=new URL(window.location.href);
  const sharedDate=url.searchParams.get('fecha');
  const sharedModel=url.searchParams.get('nivel');
  let chosen=buttons.find(button=>button.dataset.ebFecha===sharedDate)
     || buttons.find(button=>button.getAttribute('aria-pressed')==='true');
  if(sharedModel==='con' || sharedModel==='sin') out('input[value="'+sharedModel+'"][name="eb-modelo"]').checked=true;
  const share=out('[data-eb-enlace]');
  function render() {
    const withLevel=out('[name=eb-modelo]:checked').value==='con';
    const model=withLevel?'con_nivel':'sin_nivel';
    section.dataset.nivel=withLevel?'con':'sin';
    const summary=data.resumen, scores=summary.error_absoluto_medio_pp;
    out('[data-eb-mae]').textContent=number(scores[model]);
    out('[data-eb-compacto]').textContent='Error medio en nueve fechas · '+number(scores.sin_nivel)
      +(withLevel?' → '+number(scores.con_nivel)+' puntos con el nivel':' puntos con calendario y lluvia');
    const link=new URL(window.location.pathname,window.location.origin);
    link.searchParams.set('fecha',chosen.dataset.ebFecha);
    link.searchParams.set('nivel',withLevel?'con':'sin');
    link.hash='nivel-del-rio';
    share.href=link.href;
    share.hidden=false;
    out('[data-eb-promedio]').textContent=withLevel
      ? 'Con el nivel, el error medio subió de '+number(scores.sin_nivel)+' a '+number(scores.con_nivel)+'. Mejoró en cinco fechas y empeoró en cuatro.'
      : 'El modelo usa el semestre y la lluvia del mes anterior. Añada el nivel de la víspera para ver cuánto se desplaza cada marca.';
    for (const button of buttons) {
      button.setAttribute('aria-pressed',String(button===chosen));
      const label=button.querySelector('.eb-error-dia');
      label.textContent=withLevel?label.dataset.final:label.dataset.inicial;
    }
    const row=dates.get(chosen.dataset.ebFecha);
    const obs=row.observado_pct, pred=row.estimado_pct[model];
    const err=Math.abs(pred-obs), prior=Math.abs(row.estimado_pct.sin_nivel-obs);
    out('[data-eb-dia]').textContent=chosen.firstElementChild.textContent;
    const intro='El satélite clasificó como agua el '+number(obs)+' % de la superficie válida. ';
    out('[data-eb-relato]').textContent=intro+'La estimación fue '+number(pred)+' %. '+(withLevel?'Sumar el nivel '+(err>prior?'aumentó':'redujo')+' el error de '+number(prior)+' a '+number(err)+' puntos porcentuales.':'El error fue de '+number(err)+' puntos porcentuales.');
    out('[data-eb-cobertura]').textContent=number(100*row.validos/row.pixeles_municipio,1)+' %';
    paintCoverage(row.teselas_municipales);
  }
  for(const button of buttons) {
    button.disabled=false;
    button.addEventListener('click',()=>{chosen=button;render();});
  }
  const controls=out('.eb-modos');
  controls.addEventListener('change',render);
  controls.hidden=false;
  render();
}
if(section) enable().catch(()=>{ /* Retain the verified static chart, comparison and table. */ });
