"""Expand each icon's viewBox to its real artwork bounds when the artwork only slightly overflows it."""
import json, os, sys
from playwright.sync_api import sync_playwright

APP = sys.argv[1] if len(sys.argv) > 1 else '.'  # path to the figure-editor folder
doc = json.load(open(f'{APP}/src/icons.json'))
data = doc['icons']
MAX_OVERFLOW = 0.10   # beyond this the extra art is off-page clutter, so keep the declared page
PAD = 0.005           # a hair of room for strokes, which getBBox ignores

changed, kept_big = [], []
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.set_content('<div id="h"></div>')
    for it in data:
        txt = open(f"{APP}/public/icons/{it['id']}.svg", encoding='utf-8', errors='ignore').read()
        bb = page.evaluate('''(t) => {
          const h = document.getElementById('h'); h.innerHTML = t;
          const s = h.querySelector('svg'); if (!s) return null;
          const r = s.getBBox(); return [r.x, r.y, r.width, r.height];
        }''', txt)
        if not bb or bb[2] <= 0 or bb[3] <= 0:
            continue
        vx, vy, vw, vh = it['viewBox']
        big = max(vw, vh)
        l = min(vx, bb[0]); t = min(vy, bb[1])
        r = max(vx + vw, bb[0] + bb[2]); bt = max(vy + vh, bb[1] + bb[3])
        over = max(vx - l, vy - t, r - (vx + vw), bt - (vy + vh)) / big
        if over <= 0.002:
            continue
        if over > MAX_OVERFLOW:
            kept_big.append((it['id'], round(over * 100, 1)))
            continue
        pad = PAD * big
        nv = [round(l - pad, 3), round(t - pad, 3), round(r - l + 2 * pad, 3), round(bt - t + 2 * pad, 3)]
        changed.append((it['id'], round(over * 100, 1)))
        it['viewBox'] = nv
    b.close()

json.dump(doc, open(f'{APP}/src/icons.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('expanded', len(changed), 'icons')
print('kept page clip for', len(kept_big), 'icons with large off-page art')
