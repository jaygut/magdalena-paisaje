// Graph of Life brand v1.0.0 · tokens.json. Every point corresponds to one captured specimen.
const atlas=document.getElementById("nataima");
const find=selector=>atlas.querySelector(selector);
const canvas=find(".na-canvas"), ctx=canvas.getContext("2d"), poster=find(".na-poster");
const ids=["coleopteros","dipteros","himenopteros","resto"];
const cultivarIDs=["ambas","hilacha","tommy-atkins"],views=["ejemplares","proporciones"];
const permitted=(name,choices,defaultValue)=>{const value=new URLSearchParams(location.search).get(name);return choices.includes(value)?value:defaultValue;};
const request={cultivar:permitted("cultivar",cultivarIDs,"ambas"),vista:permitted("figura",views,"ejemplares"),grupo:permitted("grupo",ids,null)};
const style=getComputedStyle(document.documentElement);
const token=name=>style.getPropertyValue("--gol-"+name).trim();
const spacing=name=>parseFloat(token(name));
const ink={dark:token("abyss"),neutral:token("slate"),soft:token("muted"),sand:token("sand"),white:token("paper"),green:token("signal"),teal:token("connection"),outline:token("hairline")};
const tones=[ink.green,ink.teal,ink.sand,ink.outline];
const mono=token("mono"),sans=token("sans"),micro=parseFloat(style.getPropertyValue("--micro")),bodySize=parseFloat(style.getPropertyValue("--copy-size"));
const fmt=(n,places=0)=>new Intl.NumberFormat("es-CO",{useGrouping:"always",minimumFractionDigits:places,maximumFractionDigits:places}).format(n);
const pct=(k,total)=>fmt(100*k/total,1)+" %";
const label={coleopteros:"Escarabajos",dipteros:"Dípteros",himenopteros:"Himenópteros",resto:"Demás artrópodos"};
const assert=v=>{if(!v)throw Error("Muestra incompleta o incoherente");};
let source=null,regions=[],stamp=0;
function valid(raw){
 assert(raw.sitio?.nombre==="Centro de Investigación Nataima"&&raw.unidad&&Array.isArray(raw.cultivares)&&raw.cultivares.length===2);
 const fields=[...raw.cultivares,raw.conjunto];
 for(const c of fields){
  assert(Number.isInteger(c.ejemplares)&&c.ejemplares>0&&c.grupos&&ids.every(k=>Number.isInteger(c.grupos[k])&&c.grupos[k]>=0));
  assert(ids.reduce((total,k)=>total+c.grupos[k],0)===c.ejemplares&&c.coleopteros===c.grupos.coleopteros&&c.otros===c.ejemplares-c.coleopteros);
 }
 assert(raw.cultivares.every((c,i)=>c.id===cultivarIDs[i+1]&&typeof c.nombre==="string"));
 assert(raw.cultivares.reduce((sum,c)=>sum+c.ejemplares,0)===raw.conjunto.ejemplares);
 for(const k of ids)assert(raw.cultivares.reduce((sum,c)=>sum+c.grupos[k],0)===raw.conjunto.grupos[k]);
 assert(raw.esfuerzo?.dias===1&&raw.esfuerzo?.franjas?.length===4&&raw.esfuerzo.arboles_por_cultivar_y_franja===3&&raw.esfuerzo.inflorescencias_por_arbol_y_franja===3);
 return raw;
}
// Memoize the fingerprint of the independently checked counts; prose and citation updates remain compatible.
async function verifiedCounts(raw){
 if(globalThis.crypto?.subtle){
  const rows=raw.cultivares.map(c=>[c.id,c.ejemplares,...ids.map(k=>c.grupos[k])]);
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(rows)));
  assert(Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("")==="316f416fc5610212d50d6829f525e8ebb0a5d5b93f9ac3dc78b6148effd684d2");
 }
 return raw;
}
function selected(){return request.cultivar==="ambas"?source.cultivares:source.cultivares.filter(c=>c.id===request.cultivar);}
function collection(){return request.cultivar==="ambas"?source.conjunto:selected()[0];}
function glyph(c,x,y,r,i){
 c.beginPath();c.fillStyle=tones[i];c.strokeStyle=tones[i];c.lineWidth=Math.max(.8,r*.46);
 if(i===0)c.arc(x,y,r,0,2*Math.PI);
 if(i===1){c.moveTo(x,y-r*1.27);c.lineTo(x+r*1.13,y);c.lineTo(x,y+r*1.27);c.lineTo(x-r*1.13,y);c.closePath();}
 if(i===2){c.moveTo(x,y-r*1.35);c.lineTo(x+r*1.24,y+r);c.lineTo(x-r*1.24,y+r);c.closePath();}
 if(i===3){c.rect(x-r*.88,y-r*.88,r*1.76,r*1.76);c.stroke();return;}
 c.fill();
}
function text(content,x,y,face,color=ink.white,alignment="left"){
 ctx.font=face;ctx.fillStyle=color;ctx.textAlign=alignment;ctx.fillText(content,x,y);ctx.textAlign="left";
}
function rule(x,y,x2,y2,color,width=1){
 ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();
}
function dots(w,h,list){
 const pad=spacing("s2"),rowCount=10,maxColumns=Math.ceil(Math.max(...source.cultivares.map(c=>c.ejemplares))/rowCount);
 const stepX=(w-2*pad)/maxColumns;
 const band=list.length===1?Math.min(h*.82,220):h/list.length;
 const y0=(h-list.length*band)/2;
 list.forEach((c,bandIndex)=>{
  const start=y0+bandIndex*band+spacing("s2"),nameY=start+bodySize;
  text(c.nombre,pad,nameY,'600 '+(bodySize+(w>=440?2:0))+'px '+sans);
  const caption=c.ejemplares+" ejemplares";text(caption,w-pad,nameY,'500 '+micro+'px '+mono,ink.sand,"right");
  const matrixY=nameY+spacing("s3"),stepY=Math.min((band-(matrixY-start)-spacing("s3"))/rowCount,stepX,13);
  const r=Math.max(1.45,Math.min(4.25,Math.min(stepX,stepY)*.34));
  let j=0;
  for(const [order,id] of ids.entries()){
   ctx.globalAlpha=!request.grupo||request.grupo===id?1:.23;
   for(let sample=0;sample<c.grupos[id];sample++,j++){
    const x=pad+(Math.floor(j/rowCount)+.5)*stepX,y=matrixY+(j%rowCount+.5)*stepY;
    glyph(ctx,x,y,r,order);regions.push({group:id,x,y,r:Math.max(r+2,Math.min(stepX,stepY)*.5),cultivar:c.id});
   }
  }
  ctx.globalAlpha=1;
  if(bandIndex<list.length-1)rule(pad,y0+(bandIndex+1)*band,w-pad,y0+(bandIndex+1)*band,ink.neutral);
 });
}
function shares(w,h,list){
 const pad=spacing("s2"),left=pad,right=w-pad,range=right-left,top=spacing("s5"),end=h-spacing("s4"),step=(end-top)/4;
 const compare=list.length===2;
 text(compare?"H  Hilacha     T  Tommy Atkins":list[0].nombre,left,micro+spacing("s2"),'500 '+micro+'px '+mono,ink.sand);
 ids.forEach((id,i)=>{
  const y=top+step*i+micro,bar=y+Math.min(18,step*.37);
  const emphasized=!request.grupo||request.grupo===id;ctx.globalAlpha=1;
  text(label[id],left,y,'500 '+(w<340?micro:bodySize)+'px '+sans);
  const numbers=list.map(c=>(compare?(c.id==="hilacha"?"H ":"T "):"")+pct(c.grupos[id],c.ejemplares)).join("   ");
  text(numbers,right,y,'500 '+micro+'px '+mono,emphasized?tones[i]:ink.sand,"right");
  ctx.globalAlpha=emphasized?1:.43;
  rule(left,bar,right,bar,ink.neutral,2);
  for(let j=0;j<list.length;j++){
   const c=list[j],x=left+range*c.grupos[id]/c.ejemplares,yMark=compare?bar+(j===0?-4:4):bar;
   rule(left,yMark,x,yMark,tones[i],j===0?1.5:1);
   ctx.strokeStyle=tones[i];ctx.fillStyle=j===0?tones[i]:ink.dark;ctx.lineWidth=1.5;
   ctx.beginPath();if(c.id==="hilacha"){ctx.arc(x,yMark,3.6,0,2*Math.PI);}else{ctx.rect(x-3.3,yMark-3.3,6.6,6.6);}
   ctx.fill();ctx.stroke();
  }
  regions.push({group:id,row:[y-micro-3,bar+9]});
  ctx.globalAlpha=1;
 });
 text("0 %",left,h-spacing("s1"),'400 '+micro+'px '+mono,ink.sand);
 text("100 %",right,h-spacing("s1"),'400 '+micro+'px '+mono,ink.sand,"right");
}
function draw(){
 if(!source||canvas.hidden||!ctx)return;
 const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
 if(!w||!h)return;
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.fillStyle=ink.dark;ctx.fillRect(0,0,w,h);regions=[];
 if(request.vista==="ejemplares")dots(w,h,selected());else shares(w,h,selected());
}
function subgroup(id){
 request.grupo=request.grupo===id?null:id;
 redraw();
}
function legend(){
 const host=find("[data-na-grupos]");host.replaceChildren();
 for(const id of ids){
  const b=document.createElement("button"),mark=document.createElement("i");b.type="button";b.dataset.order=id;mark.dataset.grupo=id;mark.setAttribute("aria-hidden","true");
  b.append(mark,document.createTextNode(label[id]));b.addEventListener("click",()=>subgroup(id));host.append(b);
 }
}
function comparison(c,k){
 if(request.cultivar==="ambas"){
  const [a,b]=source.cultivares;
  return "En Hilacha, el grupo «"+label[k]+"» reunió "+a.grupos[k]+" de "+a.ejemplares+" ejemplares ("+pct(a.grupos[k],a.ejemplares)+"). En Tommy Atkins reunió "+b.grupos[k]+" de "+b.ejemplares+" ("+pct(b.grupos[k],b.ejemplares)+").";
 }
 return "El grupo «"+label[k]+"» representa el "+pct(c.grupos[k],c.ejemplares)+" de los "+c.ejemplares+" ejemplares capturados en "+c.nombre+".";
}
function redraw(){
 if(!source)return;
 const c=collection(),group=request.grupo;
 for(const b of atlas.querySelectorAll("[data-order]"))b.setAttribute("aria-pressed",String(group===b.dataset.order));
 find("[data-na-numero]").textContent=group?fmt(c.grupos[group])+" de "+fmt(c.ejemplares):fmt(c.ejemplares)+" ejemplares";
 if(group)find("[data-na-lectura]").textContent=comparison(c,group);
 else if(request.cultivar==="ambas"){
  const [a,b]=source.cultivares;
  find("[data-na-lectura]").textContent="En Hilacha se recogieron "+a.grupos.dipteros+" dípteros y "+a.grupos.himenopteros+" himenópteros. En Tommy Atkins, con "+b.grupos.dipteros+" y "+b.grupos.himenopteros+" respectivamente, los himenópteros ocuparon el segundo lugar.";
 }else{
  const ranked=ids.slice(1).sort((a,b)=>c.grupos[b]-c.grupos[a]),next=ranked[0];
  find("[data-na-lectura]").textContent="En "+c.nombre+" se recogieron "+c.grupos.coleopteros+" escarabajos ("+pct(c.grupos.coleopteros,c.ejemplares)+"). El segundo grupo fueron los "+label[next].toLowerCase()+", con "+c.grupos[next]+" ejemplares.";
 }
 find("[data-na-indicacion]").textContent=request.vista==="ejemplares"?"Cada marca cuenta un ejemplar. Una columna completa reúne diez.":"Cada porcentaje usa el total de ejemplares de su variedad. La escala va de 0 a 100 %.";
 const link=new URL(location.href);link.searchParams.set("cultivar",request.cultivar);link.searchParams.set("figura",request.vista);if(group)link.searchParams.set("grupo",group);else link.searchParams.delete("grupo");link.hash="nataima";
 const share=find("[data-na-link]");share.href=link.href;share.hidden=false;
 canvas.setAttribute("aria-label",(request.vista==="ejemplares"?"Ejemplares":"Porcentajes")+" en "+(request.cultivar==="ambas"?"ambas variedades":c.nombre)+". "+find("[data-na-numero]").textContent+". "+find("[data-na-lectura]").textContent);
 draw();
}
function clear(){
 source=null;regions=[];canvas.hidden=true;poster.hidden=true;find(".na-error").hidden=false;
 for(const q of ["[data-na-controls]","[data-na-clave]","[data-na-link]"])find(q).hidden=true;
 for(const q of ["[data-na-numero]","[data-na-lectura]","[data-na-indicacion]"])find(q).textContent="";
 find("[data-na-link]").removeAttribute("href");ctx?.clearRect(0,0,canvas.width,canvas.height);
}
async function hydrate(){
 const ticket=++stamp;
 try{
  const r=await fetch(new URL("observaciones.json",import.meta.url));if(!r.ok)throw Error("observaciones");
  const raw=await verifiedCounts(valid(await r.json()));if(ticket!==stamp)return;source=raw;legend();
  for(const key of ["cultivar","vista"]){find('[name="na-'+key+'"][value="'+request[key]+'"]').checked=true;}
  find(".na-error").hidden=true;poster.hidden=true;canvas.hidden=false;find("[data-na-controls]").hidden=false;find("[data-na-clave]").hidden=false;redraw();
 }catch(e){if(ticket===stamp)clear();}
}
atlas.addEventListener("change",e=>{const group=e.target.name;if(group==="na-cultivar"){request.cultivar=e.target.value;redraw();}if(group==="na-vista"){request.vista=e.target.value;redraw();}});
canvas.addEventListener("pointerup",e=>{if(!source)return;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
 const pick=regions.find(q=>q.row?(y>=q.row[0]&&y<=q.row[1]):Math.hypot(x-q.x,y-q.y)<=q.r);
 if(pick)subgroup(pick.group);
});
find("[data-na-retry]").addEventListener("click",hydrate);
let nextFrame;new ResizeObserver(()=>{cancelAnimationFrame(nextFrame);nextFrame=requestAnimationFrame(draw);}).observe(find(".na-lamina"));
document.fonts?.ready.then(draw);
if(ctx)hydrate();
