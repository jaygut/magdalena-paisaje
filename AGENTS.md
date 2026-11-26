# Magdalena public experience

This repository serves an approved static experience. Read README.md and
docs/MANTENIMIENTO.md before changing it. The scientific engine and upstream runs
are maintained separately; these maintenance tools do not recompute evidence.

## Preserve the accepted edition

- Keep narrative, scenario definitions, data, geometry, scientific behavior,
  source attribution and licences intact unless the task explicitly authorizes
  a change to them.
- Preserve the exact signature: “Story by Jay Gutiérrez, Graph of Life”.
- `tools/experience-lock.json` records the accepted experience. Never refresh it
  merely to silence a failure. An intentional new edition needs review and
  appropriate scientific, spatial and browser acceptance first.
- Use the installed `graph-of-life-brand` skill for branded artifacts. Resolve
  visual values from its canonical `assets/tokens.json`; the local CSS token
  layer is `assets/tokens.css`. Run the skill's brandlint with exit 0 before
  delivering visual changes.

## Validate and package

```bash
python3 tools/site.py check --require-node
python3 -m unittest discover -s tests -v
python3 tools/site.py package --out dist --require-node
```

The publication allowlist is `datos/archivos.csv` plus the CSV itself. Add assets
only with reviewed provenance and rights. For reviewed maintenance metadata,
`python3 tools/site.py inventory --update README.md` updates only its existing
digest; it does not add files or alter the experience lock.

Generated releases, receipts, screenshots, local simulators, contact research,
draft outreach and private evidence belong outside version control. GitHub
Pages currently serves `main:/`, so tracked maintenance files are public too.
Do not place secrets or private information anywhere in this repository.

Publication, remote pushes and outreach must remain within the authorization
given in the active user session. CI validates only and does not deploy.
