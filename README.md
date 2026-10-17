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

- 1,635 icons in 33 categories (chemistry, lab apparatus, amino acids, nucleic acids, safety symbols, microbiology, parasites, physiology and more), searchable. Click to add or drag onto the board.
- Recolour any icon: the Colours section lists the colours the icon uses, and each one can be swapped. Recoloured icons are credited as "recoloured", as CC BY asks.
- Straight, elbow and curved arrows. Drag the diamond handle to bend them.
- Group items (Ctrl/Cmd+G, ungroup with Shift) so they select and move together. Alt-click picks one item inside a group. "Scale together" grows or shrinks a selection.
- Insert menu: panel labels (A, B, C…), a scale bar, a chemical structure drawn from a SMILES string, and your own SVG, PNG, JPG, WebP or GIF (also by dropping files on the board or pasting a copied picture).
- Text, arrows (with arrowheads, dashes), rectangles and ellipses. Move, resize, rotate, flip, opacity, layers (hide, lock, reorder), align, duplicate.
- Marquee select, grid and snap, zoom (Ctrl/Cmd + wheel), pan (hold Space or middle mouse), undo and redo.
- Export SVG (icons stay editable vectors, openable in Inkscape or Illustrator), PNG at 1×, 2× or 4×, and a `.plate.json` project file.
- A credit line for every icon you used, copyable and optionally added under exported images.

Shortcuts: V select, T text, A arrow, R rectangle, E ellipse. Delete removes. Arrow keys nudge (Shift for 10). Ctrl/Cmd+Z undo, +Shift redo, +D duplicate, +G group (+Shift ungroup), +A select all, +S save project, +0 fit. `[` and `]` reorder layers.

## Licenses

The icons keep their own licenses, listed per icon in [ICON_CREDITS.md](ICON_CREDITS.md). Please read it before redistributing the app with the icons included.
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

## How it is built

- `src/Canvas.tsx`: the SVG board, selection, handles, drag, resize, rotate.
- `src/icons.ts`: loads and cleans icon files. Icons are inlined so exports stay vector; ids are scoped per item so repeated icons never clash. Icons that carry their own `<style>` are embedded as isolated images.
- `src/export.ts`: builds the SVG and PNG from the document, not from the screen.
- Figure text uses Arial/Helvetica on purpose, so exports look the same on every machine.

Known gaps: no import of your own SVG or PNG yet, no grouping, no curved arrows, no shared editing.
