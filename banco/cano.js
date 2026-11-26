// Graph of Life brand v1.0.0 · tokens.json. Only the camera and cursor move; the classified pixels remain in place.
const scene=document.querySelector("#agua.inesica");
const at=name=>scene.querySelector(name),canvas=at(".bh-canvas"),ribbon=at(".bh-ribbon"),poster=at(".bh-poster");
const WIDTH=39,HEIGHT=76,N=WIDTH*HEIGHT,LENGTH=1800;
const fieldKey=["outside","other","open","unknown","vegetation"];
const names=["Fuera de la franja","Otra superficie clasificada","Agua abierta","Sin clasificar","Vegetación inundada"];
const palette=getComputedStyle(document.documentElement);
const token=s=>palette.getPropertyValue("--gol-"+s).trim(), size=s=>parseFloat(token(s));
const colors=["abyss","slate","muted","teal","green","paper","sand","amber"].reduce((o,k)=>(o[k]=token(k),o),{});
const ink=[colors.abyss,colors.muted,colors.green,colors.amber,colors.teal];
const textFace=token("mono"),font=parseFloat(palette.getPropertyValue("--caption"));
const output=v=>new Intl.NumberFormat("es-CO",{maximumFractionDigits:0,minimumGroupingDigits:1,useGrouping:"always"}).format(v);
const files=name=>new URL("datos/"+name,import.meta.url).href;
const expected=["radar10","landsat12","radar22"], keys=fieldKey.slice(1), cache=new Map();
const modes=window.matchMedia("(prefers-reduced-motion: reduce)");
let catalog,terrain,texture,corners,centers,trace,geometry,dataset,plate,mask;
const params=new URLSearchParams(location.search);
const requested=params.get("banco"),chainInput=params.get("metro"),exactM=chainInput!==null&&/^\d{1,4}$/.test(chainInput)?Number(chainInput):null;
let selection=expected.includes(requested)?requested:"radar10",distance=exactM!==null&&exactM<=LENGTH?exactM:null,reading=null,sequence=0,currentCamera=null,animation=0,playing=false,pendingFrame=0,mounted=false,firstPaint=true;
const assert=(v,msg)=>{if(!v)throw Error(msg);};
function gridOk(g){return g?.crs==="EPSG:32618"&&g.width===WIDTH&&g.height===HEIGHT&&g.pixel_m===30&&Array.isArray(g.transform)&&g.transform.every((n,i)=>n===[30,0,614190,0,-30,998280][i])&&g.transform.length===6;}
async function get(name,hash){
 const resp=await fetch(files(name));if(!resp.ok)throw Error(name);
 if(hash&&globalThis.crypto?.subtle){
  const buffer=await resp.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",buffer)),n=>n.toString(16).padStart(2,"0")).join("");
  assert(digest===hash,"integridad del pase");return JSON.parse(new TextDecoder().decode(buffer));
 }
 return resp.json();
}
function image(name){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=files(name);});}
function project(x,y){
  const m=terrain.mesh,xx=Math.max(0,Math.min(m.w-1,(x-m.x)/m.step)),yy=Math.max(0,Math.min(m.h-1,(y-m.y)/m.step));
  const j=Math.min(m.w-2,Math.floor(xx)),i=Math.min(m.h-2,Math.floor(yy)),a=xx-j,b=yy-i,h=m.altitudes;
  const z=(1-b)*((1-a)*h[i*m.w+j]+a*h[i*m.w+j+1])+b*((1-a)*h[(i+1)*m.w+j]+a*h[(i+1)*m.w+j+1]);
  const p=terrain.projection,dx=x-p.center[0],dy=y-p.center[1],c=Math.cos(p.bearing),s=Math.sin(p.bearing);
  return [p.w/2+p.scale*(c*dx+s*dy),p.h/2+p.scale*p.flat*(-s*dx+c*dy)-(z-p.datum)*p.pz];
}
function locationAt(m){
  const i=trace.findIndex(v=>v.m>=m);
  if(i<=0)return i===0?trace[0].xy:trace.at(-1).xy;
  const a=trace[i-1],b=trace[i],f=(m-a.m)/(b.m-a.m);
  return [a.xy[0]+(b.xy[0]-a.xy[0])*f,a.xy[1]+(b.xy[1]-a.xy[1])*f];
}
async function base(){
  const [cat,ter,img]=await Promise.all([get("cano-catalogo.json"),get("relieve-inesica.json"),image("relieve-inesica.webp")]);
  assert(gridOk(cat.grid)&&gridOk(ter.grid)&&Array.isArray(cat.lineXY)&&cat.lineXY.length>2&&cat.lineXY.every(p=>p.length===2&&p.every(Number.isFinite)),"registro");
  assert(img.naturalWidth===ter.projection.w&&img.naturalHeight===ter.projection.h&&ter.mesh.altitudes.length===ter.mesh.w*ter.mesh.h&&ter.mesh.altitudes.every(Number.isFinite),"relieve");
  assert(cat.sections.length===5&&cat.sections.every((s,i)=>s.chainageM===[360,630,900,1170,1440][i]&&s.xy.length===2&&s.cells.length&&s.cells.every(v=>Number.isInteger(v)&&v>=0&&v<N)),"secciones");
  expected.forEach(id=>assert(cat.datasets[id]==="cano-"+id+".json","catálogo"));
  catalog=cat;terrain=ter;texture=img;
  trace=[];let cumulative=0;
  cat.lineXY.forEach((xy,i)=>{if(i){const last=cat.lineXY[i-1];cumulative+=30*Math.hypot(xy[0]-last[0],xy[1]-last[1]);}trace.push({xy,m:cumulative});});
  assert(Math.abs(cumulative-LENGTH)<3,"longitud");trace.forEach(v=>v.m*=LENGTH/cumulative);
  corners=Array.from({length:(WIDTH+1)*(HEIGHT+1)},(_,i)=>project(i%(WIDTH+1),Math.floor(i/(WIDTH+1))));
  centers=Array.from({length:N},(_,i)=>project(i%WIDTH+.5,Math.floor(i/WIDTH)+.5));
  geometry=trace.map(v=>project(...v.xy));
  const stops=at("[data-bh-stops]");stops.replaceChildren();
  for(const s of cat.sections){const b=document.createElement("button");b.type="button";b.dataset.pos=s.chainageM;b.textContent=output(s.chainageM)+" m";b.setAttribute("aria-label","Ver sección transversal a "+output(s.chainageM)+" metros");b.setAttribute("aria-pressed","false");b.addEventListener("click",()=>go(s.chainageM));stops.append(b);}
}
function tally(a){const count={total:0,other:0,open:0,unknown:0,vegetation:0};for(const code of a){if(code){count.total++;count[fieldKey[code]]++;}}return count;}
function sameCounts(a,b){return ["total",...keys].every(k=>Number.isInteger(b?.[k])&&b[k]===a[k]);}
function validate(d,id){
  assert(d.id===id&&gridOk(d.grid)&&Array.isArray(d.cells)&&d.cells.length===HEIGHT&&d.cells.every(a=>typeof a==="string"&&a.length===WIDTH&&/^[0-4]+$/.test(a)),"cuadrícula");
  const arr=Array.from(d.cells.join(""),Number);
  assert(sameCounts(tally(arr),d.counts)&&d.counts.total===1509,"denominador");
  assert(d.sections.length===catalog.sections.length&&d.sections.every((s,i)=>s.id===catalog.sections[i].id&&s.chainageM===catalog.sections[i].chainageM&&sameCounts(tally(catalog.sections[i].cells.map(k=>arr[k])),s.counts)),"secciones");
  assert(Array.isArray(d.axisSamples)&&d.axisSamples.length>0&&d.axisSamples.every((a,i)=>Number.isInteger(a.cell)&&a.cell>=0&&a.cell<N&&Number.isFinite(a.fromM)&&Number.isFinite(a.toM)&&a.toM>a.fromM&&Math.abs(a.fromM-(i?d.axisSamples[i-1].toM:0))<.02&&Number(a.code)===arr[a.cell]),"eje");
  assert(Math.abs(d.axisSamples.at(-1).toM-LENGTH)<.05&&sameCounts(tally([...new Set(d.axisSamples.map(a=>a.cell))].map(k=>arr[k])),d.axisCounts),"eje completo");
  return {...d,arr};
}
function poly(ctx,k){
 const i=k+Math.floor(k/WIDTH);ctx.beginPath();ctx.moveTo(...corners[i]);ctx.lineTo(...corners[i+1]);ctx.lineTo(...corners[i+WIDTH+2]);ctx.lineTo(...corners[i+WIDTH+1]);ctx.closePath();
}
function line(ctx,coords){ctx.beginPath();ctx.moveTo(...coords[0]);for(const p of coords.slice(1))ctx.lineTo(...p);}
function buildPlate(){
 const p=document.createElement("canvas");p.width=texture.naturalWidth;p.height=texture.naturalHeight;
 const ctx=p.getContext("2d");ctx.drawImage(texture,0,0);mask=[];
 for(let k=0;k<N;k++){const type=dataset.arr[k];if(!type)continue;mask.push(k);
  ctx.fillStyle=ink[type];ctx.globalAlpha=[0,.18,.91,.38,.90][type];poly(ctx,k);ctx.fill();
  if(type===3){ctx.globalAlpha=.87;ctx.strokeStyle=colors.amber;ctx.lineWidth=1.2;const a=corners[k+Math.floor(k/WIDTH)+WIDTH+1],b=corners[k+Math.floor(k/WIDTH)+1];line(ctx,[a,b]);ctx.stroke();}
  if(type===4){ctx.globalAlpha=.82;ctx.fillStyle=colors.abyss;const [x,y]=centers[k];ctx.fillRect(x-1.5,y-1.5,3,3);}
 }
 ctx.globalAlpha=.78;ctx.strokeStyle=colors.sand;ctx.lineWidth=1.15;ctx.beginPath();
 for(const k of mask){const row=Math.floor(k/WIDTH),col=k%WIDTH,i=k+row;
  const edges=[[row? k-WIDTH:-1,i,i+1],[col<WIDTH-1?k+1:-1,i+1,i+WIDTH+2],[row<HEIGHT-1?k+WIDTH:-1,i+WIDTH+2,i+WIDTH+1],[col?k-1:-1,i+WIDTH+1,i]];
  for(const [n,a,b] of edges)if(n<0||!dataset.arr[n]){ctx.moveTo(...corners[a]);ctx.lineTo(...corners[b]);}
 }ctx.stroke();ctx.globalAlpha=1;
 ctx.strokeStyle=colors.abyss;ctx.lineWidth=6;line(ctx,geometry);ctx.stroke();ctx.strokeStyle=colors.paper;ctx.lineWidth=2.6;ctx.setLineDash([8,5]);ctx.stroke();
 return p;
}
function bounds(pts){const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];}
// Reserve the real control rectangles while fitting the unchanged projected terrain.
function screenLayout(w,h){
 const rect=canvas.getBoundingClientRect(),gap=size("s2"),side=w<520?size("s4"):size("s6");
 const boxes=Array.from(scene.querySelectorAll('.bh-position,.bh-travel')).filter(el=>!el.hidden).map(el=>{
  const r=el.getBoundingClientRect();return [r.left-rect.left-gap,r.top-rect.top-gap,r.width+2*gap,r.height+2*gap];
 }).filter(box=>box[2]>2*gap&&box[3]>2*gap);
 let top=size("s4"),bottom=h-size("s6");
 for(const [x,y,bw,bh] of boxes){if(y+bh/2<h/2)top=Math.max(top,y+bh+gap);else bottom=Math.min(bottom,y-gap);}
 return {left:side,right:w-side,top,bottom,boxes};
}
function camera(m,w,h){
 const area=screenLayout(w,h),focusX=(area.left+area.right)/2,focusY=(area.top+area.bottom)/2;
 if(m===null){
  const [l,t,r,b]=bounds(mask.map(k=>centers[k]));
  const z=Math.min((area.right-area.left)/(r-l+size("s6")),(area.bottom-area.top)/(b-t+size("s5")+size("s2")));
  return {cx:(l+r)/2-(focusX-w/2)/z,cy:(t+b)/2-(focusY-h/2)/z,z};
 }
 const [x,y]=project(...locationAt(m)),z=Math.min((w-size("s4"))/(w<520?490:725),(area.bottom-area.top)/(w<520?275:355));
 return {cx:x-(focusX-w/2)/z,cy:y-(focusY-h/2)/z,z};
}
function cssPt(p,c,w,h){return [(p[0]-c.cx)*c.z+w/2,(p[1]-c.cy)*c.z+h/2];}
function textTag(ctx,xy,text,w,h,ang=1,occupied=[]){
 const gap=size("s2"),offset=size("s3"),tw=ctx.measureText(text).width+2*gap,th=font+2*gap;
 const first=ang<0?-tw-offset:offset,second=ang<0?offset:-tw-offset;
 const offsets=[[first,-th-offset],[second,-th-offset],[first,offset],[second,offset],[-tw/2,-th-offset],[-tw/2,offset]];
 const opts=offsets.map(([dx,dy])=>[Math.max(gap,Math.min(w-tw-gap,xy[0]+dx)),Math.max(gap,Math.min(h-th-gap,xy[1]+dy))]);
 const overlap=([x,y])=>occupied.reduce((sum,[lx,ly,lw,lh])=>sum+Math.max(0,Math.min(x+tw+gap,lx+lw)-Math.max(x-gap,lx))*Math.max(0,Math.min(y+th+gap,ly+lh)-Math.max(y-gap,ly)),0);
 opts.sort((a,b)=>overlap(a)-overlap(b));const [x,y]=opts[0];occupied.push([x,y,tw,th]);
 const anchor=[Math.max(x,Math.min(x+tw,xy[0])),Math.max(y,Math.min(y+th,xy[1]))];
 ctx.strokeStyle=colors.sand;ctx.lineWidth=1;line(ctx,[xy,anchor]);ctx.stroke();ctx.fillStyle=colors.abyss;ctx.fillRect(x,y,tw,th);ctx.strokeStyle=colors.muted;ctx.strokeRect(x,y,tw,th);ctx.fillStyle=colors.paper;ctx.fillText(text,x+gap,y+font+gap-1);
}
function marker(ctx,x,y,r,fill){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=colors.abyss;ctx.lineWidth=1;ctx.stroke();}
function draw(override){
 if(!mounted||!dataset)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;const dpr=Math.min(devicePixelRatio||1,2);
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
 const c=override||camera(distance,w,h);currentCamera=c;const ctx=canvas.getContext("2d");
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=colors.abyss;ctx.fillRect(0,0,w,h);
 ctx.save();ctx.translate(w/2-c.cx*c.z,h/2-c.cy*c.z);ctx.scale(c.z,c.z);ctx.drawImage(plate,0,0);
 const selected=catalog.sections.find(s=>s.chainageM===Math.round(distance??-1));
 if(selected){ctx.strokeStyle=colors.paper;ctx.lineWidth=1.2/c.z;ctx.globalAlpha=.8;for(const k of selected.cells){poly(ctx,k);ctx.stroke();}}
 ctx.restore();ctx.font='500 '+font+'px '+textFace;
 const occupied=[...screenLayout(w,h).boxes,[0,h-size("s6"),size("s8")*2,size("s6")],[w-size("s7"),h-size("s7"),size("s7"),size("s7")]];
 if(distance===null){
  const ends=[cssPt(geometry[0],c,w,h),cssPt(geometry.at(-1),c,w,h)];textTag(ctx,ends[0],w<520?"Sur":"Extremo sur",w,h,-1,occupied);textTag(ctx,ends[1],w<520?"Norte":"Extremo norte",w,h,1,occupied);
  for(const ep of ends)marker(ctx,...ep,3,colors.paper);
 }
 for(const s of catalog.sections){const pos=cssPt(project(...s.xy),c,w,h);if(pos[0]<0||pos[0]>w||pos[1]<0||pos[1]>h)continue;marker(ctx,...pos,selected?.id===s.id?5:2.8,colors.sand);}
 if(distance!==null){
  const p=cssPt(project(...locationAt(distance)),c,w,h);ctx.strokeStyle=colors.paper;ctx.lineWidth=2;ctx.beginPath();ctx.arc(...p,10,0,Math.PI*2);ctx.stroke();marker(ctx,...p,3,colors.paper);textTag(ctx,p,output(distance)+" m",w,h,1,occupied);
 }
 if(reading!==null){const p=cssPt(centers[reading],c,w,h);ctx.strokeStyle=colors.paper;ctx.lineWidth=2;ctx.beginPath();ctx.arc(...p,7,0,Math.PI*2);ctx.stroke();}
 const theta=terrain.projection.bearing,origin=project(19.5,38),east=project(19.5+Math.cos(theta)*100/30,38+Math.sin(theta)*100/30),north=project(19.5,36);
 const sx=size("s3"),sy=h-size("s3"),ex=(east[0]-origin[0])*c.z,ey=(east[1]-origin[1])*c.z;
 ctx.strokeStyle=colors.paper;ctx.fillStyle=colors.sand;ctx.lineWidth=1.5;line(ctx,[[sx,sy-3],[sx,sy],[sx+ex,sy+ey],[sx+ex,sy+ey-3]]);ctx.stroke();ctx.fillText("100 m",sx,sy-7);
 const nx=north[0]-origin[0],ny=north[1]-origin[1],n=Math.hypot(nx,ny),ox=w-size("s5"),oy=h-size("s3");line(ctx,[[ox,oy],[ox+15*nx/n,oy+15*ny/n]]);ctx.stroke();ctx.fillText("N",ox+15*nx/n-2,oy+15*ny/n-4);
}
function stripe(){
 const w=ribbon.clientWidth,h=ribbon.clientHeight;if(!w||!h)return;const dpr=Math.min(devicePixelRatio||1,2);ribbon.width=Math.round(w*dpr);ribbon.height=Math.round(h*dpr);const ctx=ribbon.getContext("2d");ctx.scale(dpr,dpr);
 for(const a of dataset.axisSamples){const x=a.fromM/LENGTH*w,sz=(a.toM-a.fromM)/LENGTH*w;ctx.fillStyle=ink[Number(a.code)];ctx.fillRect(x,0,sz+.1,h);
  if(Number(a.code)===3||Number(a.code)===4){ctx.save();ctx.beginPath();ctx.rect(x,0,sz,h);ctx.clip();ctx.strokeStyle=colors.abyss;ctx.lineWidth=1;for(let j=Math.floor((x-h)/7)*7;j<x+sz+h;j+=7){line(ctx,[[j,h],[j+h,0]]);ctx.stroke();}ctx.restore();}
 }
}
function axisCell(m){return dataset.axisSamples.find(a=>m>=a.fromM&&m<a.toM)||dataset.axisSamples.at(-1);}
function readout(){
 const heading=at("[data-bh-place]"),coords=at("[data-bh-coordinate]"),support=at("[data-bh-support]"),number=at("[data-bh-number]"),finding=at("[data-bh-finding]");
 const value=distance===null?null:Math.round(distance),sec=catalog.sections.find(s=>s.chainageM===value),segment=dataset.sections.find(s=>s.id===sec?.id);
 heading.textContent=value===null?"Todo el caño":sec?"Sección transversal":value===0?"Extremo sur":value===LENGTH?"Extremo norte":"En el trazado";
 coords.textContent=value===null?"1.800 m · Sur a norte":output(value)+" m desde el extremo sur";
 const choice=at("[data-bh-cursor]");choice.hidden=value===null;if(value!==null){at("#bh-track").value=value;choice.style.left=(value/LENGTH*100)+"%";}
 at("#bh-track").setAttribute("aria-valuetext",value===null?"Vista completa":output(value)+" metros");
 at("[data-bh-length]").textContent=value===null?"1.800 m":output(value)+" m";
 for(const b of scene.querySelectorAll("[data-pos]"))b.setAttribute("aria-pressed",String(Number(b.dataset.pos)===value));
 if(value===null||segment){
  const c=segment?.counts||dataset.counts;support.textContent=segment?"Banda transversal a "+output(value)+" m":"Franja completa de búsqueda";
  number.textContent=output(c.open)+" / "+output(c.total);finding.textContent="celdas con agua abierta. "+output(c.unknown)+" sin clasificar"+(selection==="landsat12"?".":" y "+output(c.vegetation)+" con vegetación inundada.");
 }else{
  const a=axisCell(value);support.textContent="Celda que cruza la línea";number.textContent=names[Number(a.code)];finding.textContent="El eje atraviesa esta celda entre los metros "+output(a.fromM)+" y "+output(a.toM)+".";
 }
 const url=new URL(location.href);url.searchParams.set("banco",selection);if(value===null)url.searchParams.delete("metro");else url.searchParams.set("metro",value);url.hash="agua";
 const share=at("[data-bh-share]");share.href=url.href;share.hidden=false;
 const inspection=at("[data-bh-inspection]");
 if(reading===null)inspection.textContent="Toca una celda del mapa para consultarla. La franja abarca 300 m a cada lado del trazado.";
 else inspection.textContent="Celda de 30 m · fila "+(Math.floor(reading/WIDTH)+1)+" · columna "+(reading%WIDTH+1)+" · "+names[dataset.arr[reading]]+".";
}
function details(){
 const day=String(Number(dataset.fecha.slice(-2))),optical=selection==="landsat12";
 at("[data-bh-stamp]").textContent=(optical?"Landsat 9":"OPERA DSWx-S1 · Sentinel-1A")+" · "+day+" marzo 2025 · "+dataset.horaUTC+" UTC";
 at("[data-bh-veg]").hidden=optical;
 const cm=new Intl.NumberFormat("es-CO",{maximumFractionDigits:2,minimumFractionDigits:2}).format(dataset.hydro.delta7dCm);
 at("[data-bh-hydro]").textContent="En la estación IDEAM "+dataset.hydro.station+", el nivel medio del día estaba "+cm+" cm por encima del registrado siete días antes. La serie figura en revisión. Medir el nivel en el caño permitiría relacionar esa señal de la estación con el paso local.";
 at("[data-bh-axis-note]").textContent="De "+output(dataset.axisCounts.total)+" celdas sobre el eje, "+output(dataset.axisCounts.open)+" se clasificaron como agua abierta y "+output(dataset.axisCounts.unknown)+" quedaron sin clasificar.";
 const file=at("[data-bh-file]"),a=document.createElement("a");a.href=files(catalog.datasets[selection]);a.textContent="Descargar esta observación";file.replaceChildren(" · ",a);
 const ref=at("[data-bh-ref]");ref.textContent="Fondo de referencia del 1 feb 2025 · Celdas del "+day+" mar 2025.";
}
function cancel(){at(".bh-result").setAttribute("aria-live","polite");if(animation)cancelAnimationFrame(animation);animation=0;playing=false;const b=at("[data-bh-play]");b.textContent=modes.matches?"Siguiente sección":"Recorrer el caño";b.setAttribute("aria-pressed","false");}
function go(m,smooth=true){
 if(!dataset)return;cancel();reading=null;distance=m===null?null:Math.max(0,Math.min(LENGTH,m));readout();
 const a=currentCamera,b=camera(distance,canvas.clientWidth,canvas.clientHeight);
 if(!smooth||!a||modes.matches){draw();return;}
 const start=performance.now(),duration=530;
 function step(now){const u=Math.min(1,(now-start)/duration),t=u*u*(3-2*u);draw({cx:a.cx+(b.cx-a.cx)*t,cy:a.cy+(b.cy-a.cy)*t, z:a.z+(b.z-a.z)*t});if(u<1)animation=requestAnimationFrame(step);else animation=0;}
 animation=requestAnimationFrame(step);
}
function tour(){
 if(!dataset)return;if(playing){cancel();return;}
 if(modes.matches){const next=[0,...catalog.sections.map(s=>s.chainageM),LENGTH].find(v=>distance===null||v>distance);go(next??null,false);return;}
 cancel();reading=null;playing=true;at(".bh-result").setAttribute("aria-live","off");at("[data-bh-play]").textContent="Pausar recorrido";at("[data-bh-play]").setAttribute("aria-pressed","true");
 const start=performance.now(),origin=distance===null||distance>=LENGTH?0:distance;let last=-1;
 function frame(t){if(!playing)return;distance=Math.min(LENGTH,origin+(t-start)*.095);const v=Math.round(distance/5);
  if(v!==last){readout();last=v;}draw();if(distance<LENGTH)animation=requestAnimationFrame(frame);else{cancel();readout();draw();}}
 animation=requestAnimationFrame(frame);
}
function clearError(){
 at("[data-bh-share]").hidden=true;at("[data-bh-share]").removeAttribute("href");cancel();mounted=false;dataset=null;plate=null;reading=null;currentCamera=null;canvas.hidden=true;poster.hidden=true;
 for(const q of ["[data-bh-travel]","[data-bh-controls]",".bh-legend"])at(q).hidden=true;
 at("[data-bh-place]").textContent="Observación incompleta";at("[data-bh-coordinate]").textContent="";
 for(const q of ["[data-bh-hydro]","[data-bh-ref]","[data-bh-stamp]","[data-bh-number]","[data-bh-finding]","[data-bh-inspection]","[data-bh-file]"])at(q).replaceChildren();
 at(".bh-fail").hidden=false;at("[data-bh-error]").textContent="Falta una capa o la observación no coincide con la cuadrícula. Vuelve a cargarla para consultar sus celdas.";
}
async function open(id){
 const my=++sequence;at("[data-bh-share]").hidden=true;at("[data-bh-share]").removeAttribute("href");cancel();mounted=false;dataset=null;reading=null;canvas.hidden=true;poster.hidden=!(firstPaint&&id==="radar10"&&distance===null);firstPaint=false;at(".bh-fail").hidden=true;
 for(const q of ["[data-bh-travel]","[data-bh-controls]",".bh-legend"])at(q).hidden=true;
 at("[data-bh-place]").textContent=poster.hidden?"Cargando la observación…":"Vista completa · Primera pasada de radar";at("[data-bh-coordinate]").textContent="";
 for(const q of ["[data-bh-hydro]","[data-bh-file]","[data-bh-stamp]","[data-bh-ref]","[data-bh-inspection]"])at(q).replaceChildren();
 try{
  if(!catalog)await base();if(my!==sequence)return;
  at("[data-bh-dates]").hidden=false;const d=cache.get(id)||validate(await get(catalog.datasets[id],catalog.datasetSha256[id]),id);
  if(my!==sequence)return;cache.set(id,d);dataset=d;selection=id;plate=buildPlate();mounted=true;
  poster.hidden=true;canvas.hidden=false;for(const q of ["[data-bh-travel]","[data-bh-controls]",".bh-legend"])at(q).hidden=false;
  details();readout();draw();stripe();
 }catch(e){if(my===sequence)clearError();}
}
scene.addEventListener("change",e=>{if(e.target.name==="bh-dataset")open(e.target.value);});
at("[data-bh-play]").addEventListener("click",tour);at("[data-bh-overview]").addEventListener("click",()=>go(null));
at("#bh-track").addEventListener("input",e=>go(Number(e.target.value),false));
at("[data-bh-retry]").addEventListener("click",()=>{cache.clear();catalog=null;open(scene.querySelector("[name=bh-dataset]:checked").value);});
function byKey(e){
 if(!dataset)return;
 const increments={ArrowLeft:-30,ArrowRight:30,PageUp:300,PageDown:-300};
 if(e.key in increments){e.preventDefault();go((distance??0)+increments[e.key],false);}
 if(e.key==="Home"||e.key==="End"){e.preventDefault();go(e.key==="Home"?0:LENGTH,false);}
}
at("#bh-track").addEventListener("keydown",byKey);canvas.addEventListener("keydown",byKey);
canvas.addEventListener("pointerup",e=>{if(!mounted||!dataset||!currentCamera)return;const b=canvas.getBoundingClientRect(),c=currentCamera,x=(e.clientX-b.left-b.width/2)/c.z+c.cx,y=(e.clientY-b.top-b.height/2)/c.z+c.cy;
 for(const k of mask){const j=k+Math.floor(k/WIDTH),ring=[corners[j],corners[j+1],corners[j+WIDTH+2],corners[j+WIDTH+1]];if(ring.every((p,i)=>{const q=ring[(i+1)%4];return (q[0]-p[0])*(y-p[1])-(q[1]-p[1])*(x-p[0])>=0;})){cancel();reading=k;readout();draw();return;}}
});
new ResizeObserver(()=>{cancelAnimationFrame(pendingFrame);pendingFrame=requestAnimationFrame(()=>{if(mounted){draw();stripe();}});}).observe(at(".bh-map"));
new IntersectionObserver(es=>{if(!es[0].isIntersecting&&playing)cancel();}).observe(scene);
modes.addEventListener("change",cancel);document.addEventListener("visibilitychange",()=>{if(document.hidden)cancel();});
if(canvas.getContext("2d")){at('[name=bh-dataset][value="'+selection+'"]').checked=true;open(selection);}
