# Registro de la edición visual

Fecha de aceptación: 26 de noviembre de 2026. Commit de experiencia: `e8b6904ec68796af2d8e398cc7be8606cd0bc3d6`. Base comparada: `6c8e2e08d21e16c62bf5423fef01a4589b3c6c86`.

## Alcance implementado

La portada conserva las imágenes y el DEM existentes, con un encuadre oblicuo ajustado al espacio del relato y mayor presencia del color natural. El Espinal reserva espacio para los instrumentos del mapa, separa etiquetas con líneas de anclaje y suaviza el acercamiento existente. Nataima amplía la fotografía y la figura plana del inventario. El Banco mejora el encuadre y la separación entre etiquetas, escala y controles. Los estados de selección, foco y móvil reciben una jerarquía consistente.

No cambian la narrativa, las cifras, las advertencias, el orden de secciones, las siete fichas, las geometrías, los periodos, las fuentes, las clasificaciones, los resultados ni la firma. La proyección de los mapas y los puntos de anclaje se conservan; el ajuste opera sobre el encuadre de pantalla compartido.

## Referencia consultada

El sprint de tres territorios se inspeccionó sin modificarlo, con HEAD `4cf7688410f38b8191e8d9aeedecdfac25556aa5`. Los cinco archivos solicitados del renderer y de documentación coincidían con sus recibos. Se verificaron 651 archivos sellados en los tres territorios. Los 18 casos de navegador de ese sprint se consultaron como evidencia previa; no se volvieron a ejecutar durante esta edición visual.

Se adaptaron criterios de encuadre, separación de etiquetas y jerarquía de controles. Su renderer completo requiere otra estructura y otro esquema de evidencia, por lo que su incorporación habría alterado el alcance solicitado.

## Verificación realizada

| Comprobación | Resultado registrado |
|---|---|
| Contenido y estructura | Nueve HTML, sus textos, enlaces, controles, fuentes y firma conservados. |
| Archivos inmutables de la comparación visual | 82 archivos, sin cambios. |
| Alineación | 71.450 comprobaciones numéricas, 16 encuadres de El Espinal y 48 de El Banco; proyecciones originales conservadas. |
| Navegador local | Diez secciones; 43 registros de interacción; escritorio 1440×1000, tablet 881×876, móvil 390×844 y mínimo 320×740. |
| Estados principales | Doce de corredores, seis combinaciones de variedad/modo en Nataima y las tres observaciones de El Banco. |
| Teclado | Lectura por celda, avance por el caño y selección del contraste municipal. |
| Movimiento reducido | Prueba mediante simulación en las respuestas HTTP locales; sin cambiar la preferencia nativa del sistema. El harness quedó fuera del paquete. |
| Marca | Brandlint, 13 archivos, salida 0 y cero advertencias. |
| Paquete de experiencia | 114 archivos, 207 referencias locales y 71 anclas comprobadas; CRC y lectura de retorno del ZIP correctos. |
| Publicación | GitHub Pages confirmó `built` para `e8b6904`; 114/114 archivos y portada sin parámetros idénticos por HTTP. |
| Navegador público | El Espinal, Nataima, El Banco, contraste municipal y ficha FINAGRO comprobados; firma exacta y cero errores de consola observados. |

Los recibos completos y las capturas permanecen en la entrega local de esa edición. Este registro es un resumen, no una repetición de las pruebas. Los comandos portables del repositorio permiten repetir las verificaciones estáticas y HTTP sin esos materiales locales.

## Límites conservados

La revisión no midió FPS. Las capturas de tablet de El Banco muestran una pausa durante el recorrido. Una navegación rápida produjo un fallback regional transitorio en la base y en la nueva edición; la recarga restauró la portada GLO-30/Sentinel-2. Ese comportamiento de fallback se conservó.

La comprobación estática inventarió los enlaces externos sin verificar su disponibilidad. La alineación numérica complementa la inspección visual y no establece movimiento biológico observado. Ninguna mejora de inmersión cambia la interpretación científica de las escenas.

## Propuestas pendientes de otro alcance

- Cámara orbital libre en El Espinal o Inesica, que requeriría sustituir sus renderizadores y renovar la validación espacial.
- Imágenes de mayor resolución, que requerirían nuevos insumos y atribuciones.
- Migración de Pages para publicar exclusivamente el artefacto empaquetado, si se decide separar el árbol de mantenimiento del sitio servido.

Estas propuestas no impiden usar la edición aceptada y no se implementaron durante la consolidación.
