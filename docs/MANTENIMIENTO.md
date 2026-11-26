# Mantener una edición verificable

## Fuentes de verdad

- `index.html` y `audiencias/*.html` contienen el recorrido y las fichas aprobadas.
- `datos/archivos.csv` es la lista explícita del paquete público y sus SHA-256. Conserva fuentes, condiciones y hashes de origen. El inventario se excluye de su propio listado para evitar una dependencia circular.
- `tools/experience-lock.json` fija los bytes de los 112 archivos de experiencia aprobados en `e8b6904`. Excluye el README y el inventario, que son metadatos de mantenimiento. Detecta cambios, sin certificar equivalencia científica de una modificación.
- Los JSON, imágenes, mallas y productos incluidos son resultados publicados. `tools/site.py` no calcula nueva evidencia ni descarga capas.
- `docs/` y `tools/` documentan y verifican la entrega. No se añaden al manifiesto de la experiencia.

## Organización del sitio

| Ruta | Responsabilidad |
|---|---|
| `lectura.js` / `lectura.css` | Portada, contexto y comparaciones existentes. |
| `reunion.css` / `refinamiento.css` | Composición institucional y ajustes visuales finales. El orden de las hojas en el HTML es deliberado. |
| `abierta/` | Visor de corriente potencial y arbolado WorldCover. |
| `nataima/` | Figura de visitantes y recorrido de mediciones propuestas. |
| `banco/` | Caño Inesica y contraste municipal. |
| `otras/` / `criterio.*` | Comparaciones agregadas de extensión, escala y costo. |
| `audiencias/` | Siete fichas institucionales. |
| `assets/`, `expediente/`, `vendor/` | Tokens, tipografías y biblioteca cartográfica con sus avisos. |

Se conservan las hojas especializadas y el override final. Fusionarlas o sustituir el renderer abriría otra revisión visual y espacial sin resolver un problema pendiente de esta edición.

## Comandos de mantenimiento

Desde la raíz del repositorio:

```bash
python3 tools/site.py check
python3 -m unittest discover -s tests -v
python3 tools/site.py package --out dist
python3 -m http.server 8841 --bind 127.0.0.1 --directory dist/site
```

`check` revisa el inventario, los hashes, las rutas, los enlaces HTML/CSS, las anclas, los JSON y la firma. También comprueba el sello de la experiencia y la sintaxis de JavaScript con Node. Los enlaces externos se inventarían; su disponibilidad y la vigencia de sus condiciones requieren revisión específica. Los recursos construidos dinámicamente por JavaScript y la interacción se comprueban en navegador.

`package` repite la validación antes de generar el sitio y el ZIP. Comprueba los bytes al volver a leer el archivo comprimido y usa metadatos estables para permitir la comparación entre dos ejecuciones. No añade archivos que encuentre casualmente en el árbol.

Para una edición exclusivamente documental, actualice sólo el hash de la fila afectada, después de revisar el diff:

```bash
python3 tools/site.py inventory --update README.md
python3 tools/site.py check
```

El comando de inventario sólo actualiza hashes de filas existentes. Añadir un activo requiere revisar explícitamente su fuente, condiciones, transformación y derechos antes de incorporarlo al CSV. Nunca complete esos campos por inferencia automática.

## Cambios en la experiencia

El sello de `tools/experience-lock.json` bloquea una alteración de los archivos aprobados aunque alguien actualice también su hash en el CSV. Cuando exista autorización para otra edición, conserve el sello anterior, revise los cambios y genere un sello nuevo sólo después de cerrar las pruebas pertinentes. No actualice el sello para silenciar una comprobación fallida.

Una modificación de presentación requiere comparar texto, estructura, orden, controles, cifras y fuentes, además de revisar los mapas alineados. Un cambio científico necesita su propia ejecución y validación en Spillover Predictor; este repositorio no sustituye ese proceso.

## Marca y aceptación visual

Use el skill `graph-of-life-brand` y su `assets/tokens.json` como fuente canónica. La copia CSS publicada está en `assets/tokens.css`. No improvise colores, fuentes o espaciados. En el entorno con el skill instalado, el gate usado en la edición visual es:

```bash
python3 "$HOME/.codex/skills/graph-of-life-brand/assets/brandlint.py" \
  index.html creditos-capas.html audiencias/*.html \
  refinamiento.css lectura.js abierta/corredor.js banco/cano.js
```

Debe devolver salida 0 antes de entregar cambios visuales. El skill y su ubicación no son una dependencia para servir el sitio; tampoco se distribuyen como parte del ZIP. La integración continua valida estructura y empaquetado, y no sustituye este gate de marca.

En navegador, recorra las diez secciones y las fichas afectadas. Compruebe escritorio, tablet y móvil, incluida una anchura de 320 px. Revise foco y activación por teclado, lectura de celdas, todos los estados afectados, atribuciones visibles, separación de etiquetas y ausencia de desbordamiento. Compruebe movimiento reducido con preferencia nativa cuando esté disponible; si usa una simulación, registre el método y su límite. Ningún harness de prueba se incluye en el sitio.

## Publicación y reversión

Pages sigue sirviendo `main:/`. El workflow de validación no publica ni cambia esa configuración. Las herramientas y la documentación versionadas son públicas en ese árbol; el ZIP contiene sólo el manifiesto de la experiencia. Servir exclusivamente el ZIP mediante un deployment de artefactos requeriría una migración de hosting separada.

Antes de un push autorizado, revise los archivos preparados, ejecute los gates y compruebe que no se añaden materiales privados. Espere a que Pages confirme el commit publicado. Luego ejecute:

```bash
python3 tools/site.py verify-public \
  --url https://jaygut.github.io/magdalena-paisaje/ \
  --receipt dist/publicacion.json
```

La comparación HTTP usa el manifiesto local aprobado y exige identidad de bytes. No certifica el renderizado, por lo que deben revisarse también las escenas públicas. Para deshacer una edición, prepare un commit de reversión y revalide sus inventarios y sello. No reescriba la historia de `main`.

## Qué queda fuera

Los borradores de comunicación, contactos, contexto de Notion, recibos con rutas personales, copias `antes/`, simuladores, descargas y artefactos temporales se conservan fuera del repositorio. El sprint de tres territorios y sus productos se consultan en modo de lectura. El roadmap visual y sus propuestas no implementadas están en `docs/EDICION_VISUAL.md`.
