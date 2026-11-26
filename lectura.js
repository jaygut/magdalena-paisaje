const number = (value, places=2) => new Intl.NumberFormat("es-CO", {minimumFractionDigits:places, maximumFractionDigits:places}).format(value);
const file = relative => new URL(relative, import.meta.url).href;
async function getJSON(path) {
  const response = await fetch(file(path));
  if (!response.ok) throw new Error(path);
  return response.json();
}

async function comparisons() {
  const data = await getJSON("datos/resultados.json");
  const frame = document.querySelector("#marco");
  frame.hidden = false;
  frame.addEventListener("change", () => {
    const chosen = frame.querySelector("input:checked").value;
    for (const bar of document.querySelectorAll(".banda")) {
      const loss = data.bosque[chosen][bar.dataset.bosque];
      bar.querySelector("strong").textContent = number(loss);
      bar.querySelector("rect").setAttribute("width",loss);
    }
    document.querySelector("#lectura-marco").textContent = chosen === "original"
      ? "En la ventana original, quitar el 82 afecta a más bosque que quitar el 65."
      : "Con 3 km más por lado, el 65 pasa al primer lugar. Las rutas exteriores ofrecen alternativas alrededor del 82.";
  });
  const controls = document.querySelector("#selector-circuito");
  controls.hidden = false;
  controls.addEventListener("change", () => {
    const pair = controls.querySelector('[name="par"]:checked').value;
    const removed = controls.querySelector('[name="retiro"]:checked').value;
    const row = data.circuitos.find(row => row.terminales === pair && row.retiro === Number(removed));
    document.querySelector("#resultado-circuito").textContent = "+" + number(row.porcentaje) + " %";
    const [a,b] = pair.split("–");
    document.querySelector("#efecto-circuito").textContent = `Al retirar el bosque ${removed}, la resistencia simulada entre el ${a} y el ${b} pasa de ${number(row.antes)} a ${number(row.despues)} metros de costo.`;
  });
}

async function showTerrain() {
  const host = document.querySelector("#terreno-oblicuo");
  const library = await import("./vendor/maplibre/maplibre-gl.mjs");
  const region = await getJSON("datos/terreno.json");
  const palette = getComputedStyle(document.documentElement);
  const color = name => palette.getPropertyValue("--gol-" + name).trim();
  const dem = {type:"raster-dem",encoding:"terrarium",tileSize:256,minzoom:10,maxzoom:12,bounds:region.limites,tiles:[file("datos/dem/") + "{z}/{x}/{y}.png"]};
  library.setWorkerCount(1);
  library.setWorkerUrl(file("vendor/maplibre/maplibre-gl-worker.mjs"));
  const [w,s,e,n] = region.imagen;
  const source = {type:"image",url:file("media/sentinel-espinal.webp"),coordinates:[[w,n],[e,n],[e,s],[w,s]]};
  const bounds = region.relieve;
  const relief = {type:"image",url:file("media/copernicus-cc.webp"),coordinates:[[bounds[0],bounds[3]],[bounds[2],bounds[3]],[bounds[2],bounds[1]],[bounds[0],bounds[1]]]};
  const map = new library.Map({container:host,center:[-74.902,4.175],zoom:innerWidth<740?11.7:12.1,pitch:52,bearing:-21,
    padding:{left:innerWidth<740?0:Math.round(innerWidth*.40),right:0,top:0,bottom:0},renderWorldCopies:false,interactive:false,attributionControl:false,fadeDuration:0,
    style:{version:8,sources:{dsm:dem,sombra:{...dem},satelite:source,regional:relief},terrain:{source:"dsm",exaggeration:1},layers:[
      {id:"fondo",type:"background",paint:{"background-color":color("abyss")}},
      {id:"region",type:"raster",source:"regional",paint:{"raster-fade-duration":0}},
      {id:"relieve",type:"hillshade",source:"sombra",paint:{"hillshade-shadow-color":color("abyss"),"hillshade-highlight-color":color("slate"),"hillshade-accent-color":color("navy"),"hillshade-exaggeration":.55}},
      {id:"color-natural",type:"raster",source:"satelite",paint:{"raster-opacity":.55,"raster-fade-duration":0}}]}});
  let failed=false;
  const fallback=()=>{failed=true;host.hidden=true;document.querySelector("#leyenda-terreno").textContent="Tolima · Relieve regional Copernicus GLO-90";};
  map.on("error",fallback);
  map.getCanvas().addEventListener("webglcontextlost",fallback);
  map.getCanvas().tabIndex=-1;
  map.once("idle",()=>{if (!failed) document.querySelector("#leyenda-terreno").textContent="El Espinal · Copernicus GLO-30 y Sentinel-2B · 23 ene 2024";});
}
comparisons().catch(()=>{document.querySelector("#lectura-marco").textContent="Las cifras de las dos ventanas se conservan en el método. La tabla de circuitos incluye los cuatro contrastes.";});
const testCanvas=document.createElement("canvas");
const gl=testCanvas.getContext("webgl2",{failIfMajorPerformanceCaveat:true});
if(gl) {gl.getExtension("WEBGL_lose_context")?.loseContext();showTerrain().catch(()=>{document.querySelector("#terreno-oblicuo").hidden=true;});}
