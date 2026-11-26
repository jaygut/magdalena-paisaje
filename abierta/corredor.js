// Graph of Life brand v1.0.0 · tokens.json. Cells, labels and terrain share an orthographic projection.
const scene = document.querySelector(".wc");
const $ = (q) => scene.querySelector(q);
const asset = (file) => new URL("data/" + file, import.meta.url).href;
const fmt = (v, n = 2) => new Intl.NumberFormat("es-CO", { maximumFractionDigits:n, minimumFractionDigits:n }).format(v);
const phaseNames = {before:"Antes del retiro", after:"Con la arboleda retirada", change:"Diferencia de corriente"};
const N = 89;
const cached = new Map();
let meta, land, cover, photo, treesImg, sample, active, request=0, interval, visible=true, ready=false;
let zoom=window.matchMedia("(max-width:740px)").matches;
let probe=null, raster=null, lastView=null, cameraFrame=0, backingCanvas=null, tweenSurface=null, tweenContours=null, tweenCase=null;
const motion=window.matchMedia("(prefers-reduced-motion:reduce)");
const canvas=$(".wc-canvas"), poster=$(".wc-poster");
const token=getComputedStyle(document.documentElement);
const paint=name=>token.getPropertyValue("--gol-"+name).trim();
const px=name=>parseFloat(token.getPropertyValue("--gol-"+name));
const palette=Object.fromEntries(["abyss","slate","sand","paper","green","teal","amber","coral","muted"].map(k=>[k,paint(k)]));
const textFace=token.getPropertyValue("--gol-mono").trim();
const fontSize=parseFloat(token.getPropertyValue("--caption")) || px("s3");
const cut=$("[data-play]"), selected=name=>scene.querySelector('input[name="wc-'+name+'"]:checked').value;
const states=()=>({pair:selected("par"),removed:selected("retiro"),phase:selected("fase"),trees:$("[data-trees]").checked});
const required=(v,msg)=>{if (!v) throw new Error(msg);}; const validArray=(a,n)=>Array.isArray(a)&&a.length===n;
function loadImage(url){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});}
async function json(name){if(!cached.has(name)){const res=await fetch(asset(name));if(!res.ok)throw Error(name);return res.json();}return cached.get(name);}
async function loadBase(){
  const [m,l,t,b,canopy]=await Promise.all([json("catalogo.json"),json("relieve-oblicuo.json"),json("cobertura.json"),loadImage(asset("relieve-oblicuo.webp")),loadImage(asset("arbolado-10m.webp"))]);
  required(m.grid.width===N && m.grid.height===N && m.grid.pixel_m===90 && m.grid.crs==="EPSG:32618" && validArray(m.grid.transform,6),"grilla");
  required(m.grid.transform.every((v,i)=>v===[90,0,508275,0,-90,464805][i]),"registro");
  required(t.width===N && t.height===N && validArray(t.treeFraction,N*N) && t.treeFraction.every(x=>Number.isFinite(x)&&x>=0&&x<=1),"arbolado");
  required(l.width===b.naturalWidth && l.height===b.naturalHeight && validArray(l.heights_m,l.meshSize*l.meshSize)&&l.heights_m.every(Number.isFinite),"relieve");
  for(const k of ["ampP99","ampMax","deltaMax"])required(Number.isFinite(m.scale[k])&&m.scale[k]>0,"escala");
  for(const k of ["A","B"]){required(validArray(m.pairs[k].terminals,2),"par");for(const id of [...m.pairs[k].terminals,"X","Y"]){const p=m.patches[id];required(p && validArray(p.xy,2)&&p.xy.every(Number.isFinite)&&Array.isArray(p.rings)&&p.rings.length,"parche");}}
  required(canopy.naturalWidth===b.naturalWidth&&canopy.naturalHeight===b.naturalHeight,"textura de arbolado");meta=m;land=l;cover=t;photo=b;treesImg=canopy;
  const corners=Array.from({length:(N+1)*(N+1)},(_,i)=>point(i%(N+1),Math.floor(i/(N+1))));
  const centers=Array.from({length:N*N},(_,i)=>point(i%N+.5,Math.floor(i/N)+.5));
  sample={corners,centers};
}
function point(x,y){
  const n=land.meshSize,h=land.heights_m,xx=Math.min(n-1,Math.max(0,x*(n-1)/N)),yy=Math.min(n-1,Math.max(0,y*(n-1)/N));
  const j=Math.min(n-2,Math.floor(xx)),i=Math.min(n-2,Math.floor(yy)),fx=xx-j,fy=yy-i;
  const z=(1-fy)*((1-fx)*h[i*n+j]+fx*h[i*n+j+1])+fy*((1-fx)*h[(i+1)*n+j]+fx*h[(i+1)*n+j+1]);
  const p=land.projection,dx=x-p.centerGrid[0],dy=y-p.centerGrid[1],c=Math.cos(p.bearingRad),s=Math.sin(p.bearingRad);
  return [p.center[0]+p.scale*(c*dx+s*dy), p.center[1]+p.scale*p.foreshorten*(-s*dx+c*dy)-(z-p.datumM)*p.elevationPixelsPerMeter];
}
function ids(){return [...meta.pairs[active.pair].terminals,active.removed];}
// Camera fitting operates in the existing projected image plane; no geographic coordinate changes.
function screenLayout(w,h){
  const rect=canvas.getBoundingClientRect(),gap=px("s2"),side=w<600?px("s4"):px("s6");
  const boxes=Array.from(scene.querySelectorAll('.wc-rotulo,.wc-zoom,[data-phasebar]')).filter(el=>!el.hidden).map(el=>{
    const r=el.getBoundingClientRect();return [r.left-rect.left-gap,r.top-rect.top-gap,r.width+2*gap,r.height+2*gap];
  }).filter(box=>box[2]>2*gap&&box[3]>2*gap);
  let top=px("s4"),bottom=h-px("s6");
  for(const [x,y,bw,bh] of boxes){if(y+bh/2<h/2)top=Math.max(top,y+bh+gap);else bottom=Math.min(bottom,y-gap);}
  return {left:side,right:w-side,top,bottom,boxes};
}
function makeCamera(w,h){
  const pt=zoom ? ids().flatMap(id=>[point(...meta.patches[id].xy),...meta.patches[id].rings.flatMap(r=>r.map(v=>point(...v)))]) : [point(0,0),point(0,N),point(N,0),point(N,N)];
  const xs=pt.map(p=>p[0]),ys=pt.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const area=screenLayout(w,h),sx=(area.right-area.left)/Math.max(right-left,zoom?176:0),sy=(area.bottom-area.top)/Math.max(bottom-top,zoom?118:0);
  const z=Math.min(zoom?2.8:1.85,sx,sy), cx=(left+right)/2,cy=(top+bottom)/2;
  return {z,dx:(area.left+area.right)/2-z*cx,dy:(area.top+area.bottom)/2-z*cy,xy(p){return [p[0]*this.z+this.dx,p[1]*this.z+this.dy];}};
}
function cellPath(ctx,k,pts){const j=k+Math.floor(k/N);ctx.beginPath();ctx.moveTo(...pts[j]);ctx.lineTo(...pts[j+1]);ctx.lineTo(...pts[j+N+2]);ctx.lineTo(...pts[j+N+1]);ctx.closePath();}
function outline(ctx,ring){ctx.moveTo(...point(...ring[0]));for(const v of ring.slice(1))ctx.lineTo(...point(...v));ctx.closePath();}
function stage(w,h){const c=document.createElement("canvas");c.width=w;c.height=h;return c;}
function drawFields(ctx,grid){
  const s=active,phase=s.phase,max=phase==="change"?meta.scale.deltaMax:meta.scale.ampP99,cells=sample.corners;
  for(let k=0;k<N*N;k++){
    const value=grid[k];
    const q=Math.min(1,Math.abs(value)/max);
    if(q<.00012)continue;
    ctx.fillStyle=phase==="change"?(value<0?palette.coral:palette.sand):palette.amber;
    ctx.globalAlpha=phase==="change"?.94*Math.asinh(q*26)/Math.asinh(26):.83*Math.sqrt(q);cellPath(ctx,k,cells);ctx.fill();
  }
  ctx.globalAlpha=1;
}
// Isolines use interpolation on actual neighboring model cells, independent of zoom.
function isolines(ctx,grid,max,z){
  const uv=sample.centers,thresholds=active.phase==="change"?[.14,.40,-.14,-.40]:[.26,.66];
  ctx.lineWidth=.85/z;ctx.globalAlpha=.78;
  for(const level of thresholds){
    const t=max*level;ctx.strokeStyle=level<0?palette.coral:palette.sand;ctx.setLineDash(level<0?[2/z,3/z]:[]);ctx.beginPath();
    for(let y=0;y<N-1;y++)for(let x=0;x<N-1;x++){
      const a=y*N+x,ring=[a,a+1,a+1+N,a+N],edges=[];
      for(let i=0;i<4;i++){const s=ring[i],e=ring[(i+1)%4],sv=grid[s],ev=grid[e];if((sv<t)===(ev<t))continue;
        const f=(t-sv)/(ev-sv);edges.push([uv[s][0]+f*(uv[e][0]-uv[s][0]),uv[s][1]+f*(uv[e][1]-uv[s][1])]);}
      for(let i=0;i+1<edges.length;i+=2){ctx.moveTo(...edges[i]);ctx.lineTo(...edges[i+1]);}
    }
    ctx.stroke();
  }
  ctx.globalAlpha=1;ctx.setLineDash([]);
}
function drawSurface(ctx){
  ctx.drawImage(photo,0,0);
  if(active.trees){
    ctx.save();
    if(active.phase==="after"){
      ctx.beginPath();ctx.rect(0,0,photo.naturalWidth,photo.naturalHeight);
      for(const ring of meta.patches[active.removed].rings)outline(ctx,ring);
      ctx.clip("evenodd");
    }
    ctx.globalAlpha=active.phase==="change"?.53:.70;ctx.drawImage(treesImg,0,0);ctx.restore();
  }
  const values=active.field;
  drawFields(ctx,values);
}
// Source-plane caches exist only while the existing zoom button is moving the camera.
// The settled frame always uses the direct original-resolution drawing path.
function cacheTweenSurface(dpr){
  const c=stage(Math.round(photo.naturalWidth*dpr),Math.round(photo.naturalHeight*dpr)),ctx=c.getContext("2d");
  ctx.scale(dpr,dpr);drawSurface(ctx);return c;
}
function cacheTweenContours(){
  const paths=[];let path;
  const recorder={lineWidth:1,globalAlpha:1,strokeStyle:palette.sand,dash:[],
    beginPath(){path=new Path2D();},moveTo(x,y){path.moveTo(x,y);},lineTo(x,y){path.lineTo(x,y);},
    setLineDash(values){this.dash=[...values];},
    stroke(){paths.push({path,lineWidth:this.lineWidth,globalAlpha:this.globalAlpha,strokeStyle:this.strokeStyle,dash:[...this.dash]});}
  };
  isolines(recorder,active.field,active.phase==="change"?meta.scale.deltaMax:meta.scale.ampP99,1);
  return paths;
}
function drawContours(ctx,z){
  if(!tweenContours){isolines(ctx,active.field,active.phase==="change"?meta.scale.deltaMax:meta.scale.ampP99,z);return;}
  ctx.save();
  for(const item of tweenContours){ctx.lineWidth=item.lineWidth/z;ctx.globalAlpha=item.globalAlpha;ctx.strokeStyle=item.strokeStyle;ctx.setLineDash(item.dash.map(value=>value/z));ctx.stroke(item.path);}
  ctx.restore();
}
function drawBacking(w,h,dpr,view){
  if(tweenSurface&&tweenCase!==active)cancelCamera();
  if(!backingCanvas||backingCanvas.width!==Math.round(w*dpr)||backingCanvas.height!==Math.round(h*dpr))backingCanvas=stage(Math.round(w*dpr),Math.round(h*dpr));
  const c=backingCanvas,ctx=c.getContext("2d"),v=view||makeCamera(w,h);
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=1;ctx.setLineDash([]);ctx.fillStyle=palette.abyss;ctx.fillRect(0,0,w,h);
  ctx.save();ctx.translate(v.dx,v.dy);ctx.scale(v.z,v.z);
  if(tweenSurface)ctx.drawImage(tweenSurface,0,0,photo.naturalWidth,photo.naturalHeight);else drawSurface(ctx);
  drawContours(ctx,v.z);
  ctx.strokeStyle=palette.muted;ctx.lineWidth=1/v.z;ctx.setLineDash([3/v.z,5/v.z]);ctx.beginPath();outline(ctx,[[0,0],[N,0],[N,N],[0,N]]);ctx.stroke();ctx.setLineDash([]);
  const labels=[],chosen=ids();
  for(const id of chosen){
    const p=meta.patches[id],isCut=id===active.removed;
    ctx.strokeStyle=isCut?palette.coral:palette.sand;ctx.globalAlpha=1;ctx.lineWidth=(isCut?2.25:1.25)/v.z;
    ctx.setLineDash(isCut?[4/v.z,2/v.z]:[]);ctx.beginPath();for(const r of p.rings)outline(ctx,r);ctx.stroke();
    labels.push([id,v.xy(point(...p.xy)),isCut]);
  }
  ctx.restore();
  ctx.font='500 '+fontSize+'px '+textFace;
  const layout=screenLayout(w,h),occupied=[...layout.boxes,[0,h-px("s6"),px("s8")*2,px("s6")],[w-px("s7"),h-px("s7"),px("s7"),px("s7")]];
  for(const [id,p,isCut] of labels){
    const text=isCut?'Arboleda '+id:id.toUpperCase(),pad=px("s2"),tw=ctx.measureText(text).width+2*pad,th=fontSize+2*pad,gap=px("s3");
    const offsets=[[gap,-th-gap],[-tw-gap,-th-gap],[gap,gap],[-tw-gap,gap],[-tw/2,-th-gap],[-tw/2,gap],[gap,-th/2],[-tw-gap,-th/2]];
    const opts=offsets.map(([dx,dy])=>[Math.max(pad,Math.min(w-tw-pad,p[0]+dx)),Math.max(pad,Math.min(h-th-pad,p[1]+dy))]);
    const overlap=([x,y])=>occupied.reduce((sum,[lx,ly,lw,lh])=>sum+Math.max(0,Math.min(x+tw+pad,lx+lw)-Math.max(x-pad,lx))*Math.max(0,Math.min(y+th+pad,ly+lh)-Math.max(y-pad,ly)),0);
    opts.sort((a,b)=>overlap(a)-overlap(b));
    const [x,y]=opts[0];occupied.push([x,y,tw,th]);
    const anchor=[Math.max(x,Math.min(x+tw,p[0])),Math.max(y,Math.min(y+th,p[1]))];
    ctx.strokeStyle=isCut?palette.coral:palette.sand;ctx.lineWidth=1.25;ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...anchor);ctx.stroke();
    ctx.fillStyle=palette.abyss;ctx.fillRect(x,y,tw,th);ctx.strokeStyle=isCut?palette.coral:palette.muted;ctx.lineWidth=1;ctx.strokeRect(x,y,tw,th);
    ctx.fillStyle=isCut?palette.coral:palette.sand;ctx.fillText(text,x+pad,y+fontSize+pad-1);
    ctx.beginPath();ctx.arc(...p,3.5,0,Math.PI*2);ctx.fill();ctx.strokeStyle=palette.abyss;ctx.stroke();
  }
  // Project a real 0.5 km east-west segment, with its foreshortening shown on the map.
  const base=point(44.5,44.5),east=point(44.5+500/90,44.5),dx=(east[0]-base[0])*v.z,dy=(east[1]-base[1])*v.z;
  const sx=px("s4"),sy=h-px("s4");ctx.strokeStyle=palette.paper;ctx.fillStyle=palette.sand;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(sx,sy-4);ctx.lineTo(sx,sy);ctx.lineTo(sx+dx,sy+dy);ctx.lineTo(sx+dx,sy+dy-4);ctx.stroke();ctx.fillText('500 m',sx,sy-10);
  const north=point(44.5,40.5),nx=north[0]-base[0],ny=north[1]-base[1],norm=Math.hypot(nx,ny);const ox=w-px("s5"),oy=h-px("s4");
  ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(ox+nx/norm*19,oy+ny/norm*19);ctx.stroke();ctx.fillText('N',ox+nx/norm*19-3,oy+ny/norm*19-4);
  return {c,v};
}
function draw(force=false,view){
  if(!ready||!active)return;
  const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  if(force||!raster||raster.width!==Math.round(w*dpr)||raster.height!==Math.round(h*dpr)){const out=drawBacking(w,h,dpr,view);raster=out.c;lastView=out.v;if(canvas.width!==raster.width||canvas.height!==raster.height){canvas.width=raster.width;canvas.height=raster.height;}}
  const ctx=canvas.getContext("2d");ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(raster,0,0);
  if(probe!==null){ctx.save();ctx.scale(dpr,dpr);const [x,y]=lastView.xy(sample.centers[probe]);ctx.strokeStyle=palette.paper;ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.moveTo(x-13,y);ctx.lineTo(x-4,y);ctx.moveTo(x+4,y);ctx.lineTo(x+13,y);ctx.moveTo(x,y-13);ctx.lineTo(x,y-4);ctx.moveTo(x,y+4);ctx.lineTo(x,y+13);ctx.stroke();ctx.restore();}
}
// The existing zoom button changes only the viewport. Reduced motion resolves immediately.
function cancelCamera(){cancelAnimationFrame(cameraFrame);cameraFrame=0;tweenSurface=null;tweenContours=null;tweenCase=null;}
function zoomCamera(){
  if(!ready)return;
  cancelCamera();const startView=lastView,frameCase=active,w=canvas.clientWidth,h=canvas.clientHeight;
  zoom=!zoom;readout();const endView=makeCamera(w,h);
  if(motion.matches||!startView){draw(true);return;}
  tweenCase=active;tweenSurface=cacheTweenSurface(Math.min(window.devicePixelRatio||1,2));
  if(typeof Path2D!=="undefined")tweenContours=cacheTweenContours();
  const start=performance.now(),duration=420;
  function frame(now){
    if(!ready||active!==frameCase||canvas.clientWidth!==w||canvas.clientHeight!==h){cancelCamera();return;}
    const progress=Math.min(1,(now-start)/duration),t=progress*progress*(3-2*progress);
    if(progress===1){cancelCamera();draw(true);return;}
    const view={...endView,z:startView.z+(endView.z-startView.z)*t,dx:startView.dx+(endView.dx-startView.dx)*t,dy:startView.dy+(endView.dy-startView.dy)*t};
    draw(true,view);
    cameraFrame=requestAnimationFrame(frame);
  }
  cameraFrame=requestAnimationFrame(frame);
}
function adjustedCover(k){
  const x=k%N+.5,y=Math.floor(k/N)+.5;let inside=false;
  for(const ring of meta.patches[active.removed].rings){
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const [a,b]=ring[i],[c,d]=ring[j];
      if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;
    }
  }
  return inside?0:cover.treeFraction[k];
}
function inspect(k){probe=k;const row=Math.floor(k/N),col=k%N,v=active.field[k];$("[data-celda]").textContent="Fila "+(row+1)+" · col. "+(col+1)+" · arbolado "+fmt(100*cover.treeFraction[k],0)+" % en 2021"+(active.phase==="after"?" / "+fmt(100*adjustedCover(k),0)+" % simulado":"")+" · "+(active.phase==="change"?"Δ ":"")+fmt(v,5)+" A";$("[data-export]").hidden=false;draw();}
function caseData(file,data,remove,terminals,pair,resistance){
  required(data.width===N&&data.height===N&&data.pair===pair&&data.removed===remove&&validArray(data.terminals,2)&&data.terminals.every((x,i)=>x===terminals[i]),file);
  required(validArray(data.values,N*N)&&data.values.every(x=>Number.isFinite(x)&&x>=0),file);
  required(data.year===2021&&data.matrixCost===10&&Number.isFinite(data.effectiveResistance)&&Math.abs(data.effectiveResistance-resistance)<.0001,file);
  cached.set(file,data);return data;
}
function key(text,color){const s=document.createElement("span");s.className="wc-clave";const i=document.createElement("i");i.dataset.color=color;s.append(i,document.createTextNode(text));return s;}
// The URL carries the experiment settings; the raster stays in the static package.
const query = new URLSearchParams(location.search);
for (const [group, parameter] of [["par","par"],["retiro","retiro"],["fase","vista"]]) {
  const choice = [...scene.querySelectorAll('input[name="wc-' + group + '"]')].find(input => input.value === query.get(parameter));
  if (choice) choice.checked = true;
}
function readout(){
  const s=active,ct=meta.pairs[s.pair],row=ct.cases[s.removed],p=meta.patches[s.removed],legend=$("[data-leyenda]");
  $("[data-vista]").textContent=phaseNames[s.phase]+(s.pair==="A"?" · Cruce norte":" · Cruce sur");
  const link = new URL(location.href);
  link.searchParams.set("par",s.pair); link.searchParams.set("retiro",s.removed); link.searchParams.set("vista",s.phase);
  link.hash = "corredores";
  $("[data-enlace-vista]").href = link.href; $("[data-enlace-vista]").hidden = false;
  const unit=s.phase==="change"?meta.scale.deltaMax:meta.scale.ampP99;
  legend.replaceChildren();if(s.trees)legend.append(key(s.phase==="after"?"Arbolado tras el retiro":"Arbolado 2021","arbol"));
  if(s.phase==="change")legend.append(key("− Pierde corriente","neg"),key("+ Gana corriente","gain"),"±"+fmt(unit,4)+" A");
  else legend.append(key("Corriente de 0 a ≥"+fmt(unit,4)+" A","pos"));
  legend.append(key("Arboleda "+s.removed,"corte"));
  $("[data-metrica]").textContent=(row.pct>0?"+":"")+fmt(row.pct,3)+" %";
  $("[data-hallazgo]").textContent="Al retirar el arbolado de "+s.removed+", la resistencia entre "+ct.terminals.map(v=>v.toUpperCase()).join(" y ")+" pasa de "+fmt(row.r0)+" a "+fmt(row.r1)+" metros de costo del modelo.";
  const sensitivity=meta.sensitivity?.filter(v=>v.matrixCost>1).map(v=>v.pairs[s.pair][s.removed].pct);
  if(sensitivity?.length)$("[data-sensible]").textContent="Al variar el costo asignado a la matriz, el cambio para este cruce va de "+fmt(Math.min(...sensitivity),3)+" % a "+fmt(Math.max(...sensitivity),3)+" %. En el norte, X pesa más con costos relativos de 3 y 10. Y pasa delante con 30. En el sur, Y produce el mayor cambio en los tres escenarios.";
  const files=$("[data-fuentes]");files.replaceChildren();for(const [label,name] of [["Campo inicial",row.before],["Campo tras el retiro",row.after]]){const a=document.createElement("a");a.textContent=label;a.href=asset(name);files.append(" · ",a);}
  if(probe===null){$("[data-celda]").textContent="Toca el mapa para leer una celda de 90 × 90 m."; $("[data-export]").hidden=true;}else inspect(probe);
  $("[data-zoom]").textContent=zoom?"Ver ventana":"Acercar";
}
function stop(){clearInterval(interval);interval=null;cut.textContent="Alternar antes y retiro";cut.setAttribute("aria-pressed","false");}
function missing(){ $("[data-enlace-vista]").hidden=true; $("[data-enlace-vista]").removeAttribute("href"); ready=false;active=null;probe=null;raster=null;lastView=null;stop();canvas.hidden=true;poster.hidden=true;canvas.getContext("2d")?.clearRect(0,0,canvas.width,canvas.height);
  $("[data-vista]").textContent="Caso incompleto";$("[data-leyenda]").replaceChildren();$("[data-metrica]").textContent="";$("[data-hallazgo]").textContent="";$("[data-fuentes]").replaceChildren();$("[data-sensible]").textContent="";$("[data-celda]").textContent="";
  $("[data-export]").hidden=true;$("[data-zoom]").hidden=true;$(".wc-falla").hidden=false;$("[data-error]").textContent="Falta una capa de este caso. Vuelve a cargar para comparar las dos superficies."; }
async function choose(){
  const my=++request,s=states();ready=false;active=null;raster=null;canvas.hidden=true;poster.hidden=true;$(".wc-falla").hidden=true;
  for(const sel of ["[data-metrica]","[data-hallazgo]","[data-leyenda]","[data-fuentes]","[data-sensible]","[data-celda]"])$(sel).replaceChildren();
  $("[data-export]").hidden=true;$("[data-zoom]").hidden=true;$("[data-vista]").textContent="Cargando el cruce…";
  try{if(!meta)await loadBase();const pair=meta.pairs[s.pair],item=pair.cases[s.removed];
    const vals=await Promise.all([json(item.before),json(item.after)]);if(my!==request)return;
    const a=caseData(item.before,vals[0],null,pair.terminals,s.pair,item.r0),b=caseData(item.after,vals[1],s.removed,pair.terminals,s.pair,item.r1);
    const field=s.phase==="before"?a.values:s.phase==="after"?b.values:b.values.map((v,i)=>v-a.values[i]);
    active={...s,field};ready=true;$("[data-panel]").hidden=false;$("[data-phasebar]").hidden=false;canvas.hidden=false;$("[data-zoom]").hidden=false;
    readout();draw(true);
  }catch(err){if(my===request){missing(); $("[data-panel]").hidden=!meta;}}
}
scene.addEventListener("change",e=>{if(e.target.matches('input')){if(e.isTrusted)stop();probe=null;choose();}});
$("[data-zoom]").addEventListener("click",zoomCamera);
$("[data-retry]").addEventListener("click",()=>{cached.clear();meta=null;choose();});
cut.addEventListener("click",()=>{if(interval){stop();return;}if(!ready)return;const next=()=>{if(!visible){stop();return;}const phase=selected("fase")==="before"?"after":"before";scene.querySelector('[name=wc-fase][value="'+phase+'"]').checked=true;choose();};next();if(!motion.matches){cut.setAttribute("aria-pressed","true");cut.textContent="Pausar comparación";interval=setInterval(next,2000);}});
motion.addEventListener("change",()=>{stop();cancelCamera();draw(true);});document.addEventListener("visibilitychange",()=>{if(document.hidden){stop();cancelCamera();draw(true);}});
new IntersectionObserver(es=>{visible=es[0].isIntersecting;if(!visible)stop();},{rootMargin:"80px"}).observe(scene);
canvas.addEventListener("pointerup",e=>{if(!ready||!lastView)return;const b=canvas.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top;let distance=Infinity,which=0;
  for(let i=0;i<sample.centers.length;i++){const [cx,cy]=lastView.xy(sample.centers[i]),d=(x-cx)**2+(y-cy)**2;if(d<distance){distance=d;which=i;}}
  if(distance<Math.max(5,land.projection.scale*lastView.z)**2)inspect(which);});
canvas.addEventListener("keydown",e=>{const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!ready||!moves[e.key])return;e.preventDefault();const k=probe??Math.floor(N*N/2),[dc,dr]=moves[e.key];inspect(Math.max(0,Math.min(N-1,Math.floor(k/N)+dr))*N+Math.max(0,Math.min(N-1,k%N+dc)));});
$("[data-export]").addEventListener("click",()=>{
  if(!active||probe===null)return;const row=Math.floor(probe/N),col=probe%N,g=meta.grid.transform;
  const val={uso:"Punto propuesto para contrastar una predicción con observaciones de campo",cobertura:"ESA WorldCover 2021 v200",grilla:meta.grid.crs,fila_base_1:row+1,columna_base_1:col+1,centro_x_m:g[2]+g[0]*(col+.5),centro_y_m:g[5]+g[4]*(row+.5),lado_celda_m:90,arbolado_observado_fraccion_2021:cover.treeFraction[probe],arbolado_simulado_tras_retiro_fraccion:adjustedCover(probe),par:active.pair,terminales:meta.pairs[active.pair].terminals,retiro:active.removed,fase:active.phase,corriente_modelo_A:active.field[probe],comprobar:"Registrar cruces de la especie focal, ancho del claro, continuidad de copas, temporada y esfuerzo en una franja de contraste."};
  val.procedencia = meta.provenance;
  val.productor_del_modelo = "Graph of Life";
  val.costo_relativo_sin_arbolado = 10;
  val.arbolado_clasificado_fraccion_2021 = cover.treeFraction[probe];
  val.significado_de_la_corriente = active.phase === "change" ? "Corriente después del retiro menos corriente inicial, en amperios del modelo." : "Intensidad local simulada con inyección de un amperio.";
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(val,null,2)],{type:"application/json"}));a.download="espinal-punto-"+(row+1)+"-"+(col+1)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);});
let resize;new ResizeObserver(()=>{cancelAnimationFrame(resize);resize=requestAnimationFrame(()=>{cancelCamera();draw(true);});}).observe($(".wc-mapa"));
if(canvas.getContext("2d"))choose();
