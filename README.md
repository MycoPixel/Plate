# Plate

A free, open figure editor for biology. Drag cells, tubes and receptors onto a board, label them, add arrows, and export clean SVG or PNG.
React, TypeScript and Vite. No server, no account: everything runs in the browser and autosaves to local storage.

## Run it

```bash
npm install
npm run dev        # development
npm run build      # static site in dist/ (works from any folder or static host)
npm run preview    # serve the built site
```

Serve `dist/` over HTTP (GitHub Pages, Netlify, `npm run preview`). Opening `dist/index.html` straight from disk will not work, because browsers block module scripts on `file://`.

## What it does

- 2,885 drawings in ~70 categories, all searchable: 1,635 icons from Bioicons (chemistry, lab apparatus, amino acids, nucleic acids, safety symbols, microbiology, parasites, physiology and more), 669 illustrations from the [NIH BioArt Source](https://bioart.niaid.nih.gov) (viruses, parasites, cells, lab equipment, people, data visualisation), 69 lab glassware and apparatus drawings from [Wikimedia Commons](https://commons.wikimedia.org) (volumetric flasks, Kjeldahl flasks, graduated cylinders, reagent bottles, condensers, GHS pictograms), 126 organism silhouettes from [PhyloPic](https://www.phylopic.org) (plants, fungi, microbes, fish, birds, invertebrates), and 386 clinical and public health icons from [Health Icons](https://healthicons.org) (symptoms, devices, diagnostics, medication, protective gear, health facilities). Click to add or drag onto the board.
- Recolour any icon: the Colours section lists the colours the icon uses, and each one can be swapped. Recoloured icons are credited as "recoloured", as CC BY asks.
- Straight, elbow and curved arrows. Drag the diamond handle to bend them.
- Group items (Ctrl/Cmd+G, ungroup with Shift) so they select and move together. Alt-click picks one item inside a group. "Scale together" grows or shrinks a selection.
- Insert menu: panel labels (A, B, C…), a scale bar, a chemical structure drawn from a SMILES string, and your own SVG, PNG, JPG, WebP or GIF (also by dropping files on the board or pasting a copied picture).
- Text, arrows (with arrowheads, dashes), rectangles and ellipses. Move, resize, rotate, flip, opacity, layers (hide, lock, reorder), align, duplicate.
- Marquee select, grid and snap, zoom (Ctrl/Cmd + wheel), pan (hold Space or middle mouse), undo and redo.
- Export SVG (icons stay editable vectors, openable in Inkscape or Illustrator), PNG at 1×, 2× or 4×, and a `.plate.json` project file.
- A credit line for every icon you used, copyable and optionally added under exported images.
- English and Spanish (Español). The language follows your browser the first time, and the globe menu in the top bar switches it. Icon names and search work in both languages for every icon, and search ignores case and accents, so "celula" finds "célula"; credit lines keep the original English icon names so each one can be traced to its source.

Shortcuts: V select, T text, A arrow, R rectangle, E ellipse. Delete removes. Arrow keys nudge (Shift for 10). Ctrl/Cmd+Z undo, +Shift redo, +D duplicate, +G group (+Shift ungroup), +A select all, +S save project, +0 fit. `[` and `]` reorder layers.

## Licenses

The icons keep their own licenses, listed per icon in [ICON_CREDITS.md](ICON_CREDITS.md). Please read it before redistributing the app with the icons included.
The NIH BioArt illustrations are free for any use, including commercial ([terms](https://bioart.niaid.nih.gov/terms)); most are public domain, the Human Reference Atlas ones are CC BY 4.0. The collection asks that the entry an illustration comes from is named, which is what the credit line does.
Structures are drawn with [smiles-drawer](https://github.com/reymond-group/smilesDrawer) (MIT), loaded only when you open the structure dialog. Images you import are yours: they are not part of the icon credits, so check their licenses yourself.
The code has no license file yet; add the one you want before publishing.

## Adding or refreshing icons

```bash
git clone --depth 1 https://github.com/duerrsimon/bioicons.git
python3 scripts/curate_icons.py bioicons/static/icons . --max-kb 50   # copy permissive icons, rebuild src/icons.json
python3 scripts/expand_viewboxes.py .                                  # needs: pip install playwright
python3 scripts/make_credits.py .                                      # regenerate ICON_CREDITS.md
```

`--max-kb` keeps the bundle small: 50 KB leaves out about 1,050 very detailed icons (mostly large illustrations). Raise it to include more.
Existing icon ids are kept, so saved figures keep working.

The script only accepts CC0, MIT and CC BY 3.0/4.0 icons, and skips logos and icons with embedded bitmaps. It records author and license for each one, which is what feeds the credits.

### Health Icons

```bash
python3 scripts/fetch_healthicons.py .                 # the categories below, rebuild src/icons.healthicons.json
python3 scripts/fetch_healthicons.py . --dry-run
python3 scripts/fetch_healthicons.py . --styles outline --limit 50
```

[Health Icons](https://healthicons.org) is run by the public health non-profit Resolve to Save Lives and released under **CC0**, the easiest license to work with here. It covers what the rest of the library lacks: symptoms and conditions, medical devices, diagnostics, medication, protective equipment, public health and health facilities. One metadata file in the project's repository lists every icon; the drawings sit beside it as outline or filled SVGs. The importer maps each icon to a palette category (see `CATEGORIES` at the top of the file), rewrites `fill="currentColor"` as an explicit black so the app can recolour the icons, and leaves out what `scripts/healthicons_block.txt` lists: product logos, data standards such as FHIR and LOINC, the website's own interface glyphs, and every "ALT" twin of an icon already taken.

### PhyloPic

```bash
python3 scripts/fetch_phylopic.py .                  # the taxon list, rebuild src/icons.phylopic.json
python3 scripts/fetch_phylopic.py . --dry-run
python3 scripts/fetch_phylopic.py . --taxa "Arabidopsis thaliana:Plants"
```

[PhyloPic](https://www.phylopic.org) is a community library of flat silhouettes of living things (13,000+, mostly public domain). The script keeps the organisms in `TAXA` at the top of the file, resolves each name through the API's autocomplete, and takes a few silhouettes per organism. They are one-colour vectors, so they recolour like the rest of the library. Share-alike silhouettes are left out unless `--allow-sharealike`; answers are cached in `.cache/phylopic`.

### Wikimedia Commons

```bash
python3 scripts/fetch_commons.py .                    # walk the categories, rebuild src/icons.commons.json
python3 scripts/fetch_commons.py . --dry-run          # report what it would take
python3 scripts/fetch_commons.py . --cats "Category:Laboratory glassware icons:Laboratory glassware"
```

Commons is a directory, not a curated library, so the script reads the license of every file from its file page and keeps only public domain, CC0 and CC BY. Share-alike, non-commercial, GFDL and unknown licenses are dropped, as are logos, badges, emojis, drawings with embedded bitmaps, and anything whose name the library already uses. `scripts/commons_block.txt` lists the rest that get left out (icon-pack leftovers, non-English names, clipart, colour variants). Commons answers HTTP 429 after a handful of API calls, so calls are delayed, retried and cached in `.cache/commons`.

### NIH BioArt Source

```bash
python3 scripts/fetch_bioart.py .            # crawl the collection, download SVGs, rebuild src/icons.bioart.json
python3 scripts/fetch_bioart.py . --dry-run  # report what it would take
python3 scripts/fetch_bioart.py . --only 500 # re-import single entries
```

It walks the entry ids (`/bioart/<id>`), reads the collection, creator, licensing and categories off each entry page, and downloads the SVG of every representation. Entry pages are cached in `.cache/`, so a second run needs no requests, and SVGs already in `public/icons/` are not downloaded again.

Colour variants (the same drawing in 12 colours) are skipped, since the app recolours vectors; so are files over `--max-kb`, drawings with embedded bitmaps, and anything without an SVG. Ids are `bioart-<entry>-<name>`, so they never clash with the Bioicons ones. Per icon the script records the collection, the submission date and the entry DOI, which is what the credit line needs.

## How it is built

- `src/Canvas.tsx`: the SVG board, selection, handles, drag, resize, rotate.
- `src/icons.ts`: loads and cleans icon files. Icons are inlined so exports stay vector; ids are scoped per item so repeated icons never clash. Icons that carry their own `<style>` are embedded as isolated images.
- `src/export.ts`: builds the SVG and PNG from the document, not from the screen.
- Figure text uses Arial/Helvetica on purpose, so exports look the same on every machine.

## Adding a language

All interface text is written in English in the code, as `t('English text')`, and `src/es.ts` maps each string to Spanish (a missing entry simply shows English). To add another language, add a dictionary like `es.ts`, a per-icon names file like `src/icons.es.json` (`{ "icon-id": "name" }`, only names that differ), and a line in `LANGS` and `t()` in `src/i18n.ts`. `python3 scripts/check_i18n.py` lists any string that has no translation or whose `{placeholders}` do not match.

Known gaps: error text from the SMILES parser is only translated for the most common message, the page description in `index.html` is English, and there is no shared editing.
