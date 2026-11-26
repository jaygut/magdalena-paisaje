# Magdalena · Inteligencia de paisaje

Experiencia pública de Graph of Life para examinar qué evidencia necesita una decisión en El Espinal, Nataima y El Banco.

- **Página pública:** https://jaygut.github.io/magdalena-paisaje/
- **Entrada:** [index.html](index.html)
- **Autoría:** Story by Jay Gutiérrez, Graph of Life
- **Edición visual aprobada:** `e8b6904ec68796af2d8e398cc7be8606cd0bc3d6`, 26 de noviembre de 2026.

Este repositorio contiene el sitio estático y sus herramientas de mantenimiento. El motor de Spillover Predictor, los cálculos originales y el sprint de tres territorios se mantienen en sus repositorios de origen. Los comandos siguientes validan y empaquetan los resultados publicados; no vuelven a calcularlos.

## Empezar localmente

Se necesita Python 3.9 o posterior. La comprobación de sintaxis JavaScript usa Node.js. La experiencia no requiere instalar paquetes ni construir bundles.

```bash
python3 tools/site.py check
python3 -m http.server 8841 --bind 127.0.0.1
```

Abra http://127.0.0.1:8841/ en el navegador. Utilice HTTP para los módulos, el worker de MapLibre y la carga de archivos; abrir `index.html` mediante `file://` limita esas funciones.

## Validar y preparar una entrega

```bash
python3 tools/site.py check
python3 -m unittest discover -s tests -v
python3 tools/site.py package --out dist
```

El paquete se selecciona exclusivamente desde [datos/archivos.csv](datos/archivos.csv), más el propio inventario. `dist/site/` es la carpeta servible; `dist/` contiene también el ZIP y los recibos. La herramienta funciona desde una copia limpia del repositorio, sin depender de rutas personales, del historial Git o de los archivos de otro sprint. Consulte `python3 tools/site.py --help` para los demás comandos.

La integración continua ejecuta las comprobaciones estáticas, los controles negativos y el empaquetado. La revisión de navegador y la validación de marca siguen siendo pasos de aceptación separados, descritos en [docs/MANTENIMIENTO.md](https://github.com/jaygut/magdalena-paisaje/blob/main/docs/MANTENIMIENTO.md).

## Recorrer las escenas

| Escena | Entrada | Qué conserva la edición |
|---|---|---|
| El Espinal | [Corredores](index.html#corredores) | Arbolado ESA WorldCover 2021, campos de corriente potencial, retiros y lectura por celda. |
| El Espinal | [Sensibilidad](index.html#supuestos), [bosque](index.html#bosque), [radios](index.html#radios) | Comparaciones de costo, extensión del paisaje y escala de movimiento supuesta. |
| Nataima | [Visitantes](index.html#nataima), [seguimiento](index.html#cosecha) | Conteos por variedad y propuesta de seguimiento hasta la entrega. |
| El Banco | [Inesica](index.html#agua) | Recorrido de 1.800 m, dos pasadas de radar y una de Landsat, con sus celdas y clasificaciones. |
| El Banco | [Nivel del río](index.html#nivel-del-rio) | Contraste municipal de nueve fechas y resultado negativo al incorporar el nivel previo. |
| Mesa institucional | [Decisiones](index.html#decision) | Orden de financiación propuesto y siete fichas por audiencia. |

El refinamiento visual aprobado mejora el encuadre de los paisajes, las etiquetas y los controles existentes. Conserva los textos, las fuentes, los resultados y la interpretación. [docs/EDICION_VISUAL.md](https://github.com/jaygut/magdalena-paisaje/blob/main/docs/EDICION_VISUAL.md) registra su alcance y los límites de la revisión.

## Fuentes, derechos y límites

[creditos-capas.html](creditos-capas.html) reúne las atribuciones, transformaciones y condiciones por capa. Los avisos específicos están en [abierta/atribucion.txt](abierta/atribucion.txt), [nataima/atribucion.txt](nataima/atribucion.txt) y [banco/atribucion.txt](banco/atribucion.txt). [datos/resultados.json](datos/resultados.json) conserva cifras y alcance. Los productos Copernicus se identifican en `datos/terreno.json`, `datos/relieve-regional.json` y `datos/sentinel.json`.

Los campos espaciales públicos de corredores pertenecen al ensayo independiente con ESA WorldCover 2021 v200. El estudio MapBiomas 2024 se presenta mediante resultados agregados; sus objetos cartográficos locales permanecen fuera de este paquete mientras se precisa el aviso de distribución colombiana. Los conteos de Nataima son hechos agregados con una figura original. La fotografía de contexto procede de Florida y conserva CC BY 4.0; no representa una muestra localizada en Nataima.

La sección `el_banco` de `datos/resultados.json` y el gráfico municipal se comparten bajo CC BY-SA 4.0 como adaptaciones de series IDEAM. Los límites proceden del DANE. Las condiciones de cada insumo y de las fuentes tipográficas se conservan en sus avisos. La presencia de datos abiertos no establece una licencia única para todo el código, diseño o contenido de Graph of Life.

## Publicación y mantenimiento

GitHub Pages está activo desde `main` y la raíz del repositorio. Por ello, los archivos de mantenimiento versionados también pueden ser accesibles en la URL pública; sólo contienen instrucciones y verificadores públicos. El ZIP entregable selecciona exclusivamente el manifiesto del sitio. Los borradores, contactos, capturas de trabajo y datos privados deben permanecer fuera del repositorio.

Publicar o enviar a terceros requiere la autorización correspondiente. La guía de mantenimiento documenta la validación, la comprobación HTTP posterior y cómo iniciar otra iteración sin perder el estado aprobado.
