#!/usr/bin/env python3
"""Import icons from Health Icons into the app.

Usage:
    python3 scripts/fetch_healthicons.py .                # the categories below, rebuild src/icons.healthicons.json
    python3 scripts/fetch_healthicons.py . --dry-run
    python3 scripts/fetch_healthicons.py . --styles outline --limit 50

Health Icons (healthicons.org) is a volunteer project run by the public health non-profit Resolve to
Save Lives. Its icons are released under CC0: free for any use, no credit needed, editing and
redistribution fine. That makes it the easiest source to add here, and it covers the clinical side the
rest of the library lacks: symptoms, conditions, devices, diagnostics, medication, protective gear,
public health and health facilities.

Everything comes from one metadata file in the project's repository, which lists every icon with its
category, title and tags; the drawings sit next to it as outline (line) or filled (solid) SVGs. This
script takes the outline set and files each icon under the palette category its own category maps to.

The drawings are drawn with fill="currentColor", which the app cannot pick up as a colour, so every
"currentColor" becomes an explicit black here. That is what makes these icons recolourable like the
rest of the library. The metadata is cached in .cache/healthicons.
"""
import argparse, collections, json, os, re, sys, time, urllib.error, urllib.request
import xml.etree.ElementTree as ET

META = "https://raw.githubusercontent.com/resolvetosavelives/healthicons/main/public/icons/meta-data.json"
SVG = "https://raw.githubusercontent.com/resolvetosavelives/healthicons/main/public/icons/svg/{style}/{category}/{icon}.svg"
CC0 = "https://creativecommons.org/publicdomain/zero/1.0/"
PAGE = "https://healthicons.org/icon/{style}/{category}/{icon}"
UA = "figure-editor/1.0 (one-off import script; https://github.com/)"

# Health Icons category -> category of this app. Anything not listed is left out.
CATEGORIES = {
    "body": "Anatomy",
    "blood": "Blood Immunology",
    "people": "People",
    "conditions": "Symptoms and conditions",
    "devices": "Medical devices",
    "diagnostics": "Diagnostics",
    "medications": "Medications",
    "nutrition": "Nutrition",
    "ppe": "Protective equipment",
    "zoonoses": "Microbiology",
    "places": "Health facilities",
    "specialties": "Medical specialties",
    "symbols": "Public health",
}


def get(url, tries=4):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", "ignore")
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError):
            time.sleep(1 + attempt)
    return ""


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def clean(svg):
    svg = re.sub(r"<\?xml[^>]*\?>", "", svg)
    svg = re.sub(r"<!DOCTYPE[^\[>]*(\[.*?\])?\s*>", "", svg, flags=re.S)
    svg = re.sub(r"\s+xmlns:[\w.-]+=\"&[^\"]*;\"", "", svg)
    svg = re.sub(r"<script\b.*?</script>", "", svg, flags=re.S | re.I)
    svg = re.sub(r"\son\w+\s*=\s*\"[^\"]*\"", "", svg, flags=re.I)
    svg = re.sub(r"<metadata\b.*?</metadata>", "", svg, flags=re.S | re.I)
    # A colour the app can read, so the icon can be recoloured like the rest of the library.
    svg = re.sub(r'\b(fill|stroke)="currentColor"', r'\1="#000000"', svg)
    return svg.strip()


def valid(svg):
    try:
        root = ET.fromstring(svg.encode("utf-8"))
    except ET.ParseError:
        return False
    return root.tag.endswith("}svg") or root.tag == "svg"


def dims(svg):
    tag = re.search(r"<[a-z0-9]*:?svg[^>]*>", svg, re.I | re.S)
    tag = tag.group(0) if tag else ""
    vb = re.search(r'viewBox\s*=\s*"([^"]+)"', tag)
    if vb:
        p = [float(x) for x in re.split(r"[ ,]+", vb.group(1).strip())]
        if len(p) == 4 and p[2] > 0 and p[3] > 0:
            return p

    def num(a):
        mm = re.search(a + r'\s*=\s*"([\d.]+)', tag)
        return float(mm.group(1)) if mm else None

    w, h = num("width"), num("height")
    return [0, 0, w, h] if w and h else [0, 0, 100, 100]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("app", help="the figure-editor folder")
    ap.add_argument("--style", default="outline", choices=["outline", "filled"])
    ap.add_argument("--cats", help="comma separated Health Icons categories to take")
    ap.add_argument("--limit", type=int, default=0, help="stop after N icons (trial run)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--cache", default=".cache/healthicons")
    ap.add_argument(
        "--block",
        default="scripts/healthicons_block.txt",
        help="file of name fragments to leave out, relative to the app folder",
    )
    a = ap.parse_args()

    out_dir = os.path.join(a.app, "public", "icons")
    os.makedirs(out_dir, exist_ok=True)
    cache = os.path.join(a.app, a.cache)
    os.makedirs(cache, exist_ok=True)

    meta_path = os.path.join(cache, "meta-data.json")
    if os.path.exists(meta_path) and not a.refresh:
        meta = json.load(open(meta_path))
    else:
        meta = json.loads(get(META) or "[]")
        if not meta:
            raise SystemExit("could not read the Health Icons metadata file")
        json.dump(meta, open(meta_path, "w"), ensure_ascii=False)

    wanted = set(a.cats.split(",")) if a.cats else set(CATEGORIES)
    block_path = a.block if os.path.isabs(a.block) else os.path.join(a.app, a.block)
    blocked = []
    if os.path.exists(block_path):
        blocked = [
            line.strip().lower()
            for line in open(block_path, encoding="utf-8")
            if line.strip() and not line.startswith("#")
        ]

    out_dirty = False
    skipped = collections.Counter()
    rows = []
    taken = set()
    for name in ("icons.json", "icons.bioart.json", "icons.commons.json", "icons.phylopic.json"):
        path = os.path.join(a.app, "src", name)
        if os.path.exists(path):
            for r in json.load(open(path))["icons"]:
                taken.add(re.sub(r"[^a-z0-9]+", "", r["label"].lower()))

    for e in sorted(meta, key=lambda x: (x["category"], x["id"])):
        if a.limit and len(rows) >= a.limit:
            break
        if e["category"] not in wanted:
            skipped["category not wanted"] += 1
            continue
        label = " ".join((e.get("title") or e["id"]).split())
        key = re.sub(r"[^a-z0-9]+", "", label.lower())
        if any(w in label.lower() for w in blocked):
            skipped["left out by name"] += 1
            continue
        if key in taken:
            skipped["already in the library"] += 1
            continue
        taken.add(key)

        iid = "health-" + slug(e["id"])
        path = os.path.join(out_dir, iid + ".svg")
        if os.path.exists(path) and not a.refresh and not a.dry_run:
            svg = open(path, encoding="utf-8").read()
        else:
            raw = get(SVG.format(style=a.style, category=e["category"], icon=e["id"]))
            if not raw or "<svg" not in raw:
                out_dirty = True
                skipped["file not found"] += 1
                continue
            svg = clean(raw)
            if not valid(svg):
                skipped["invalid SVG"] += 1
                continue
            if re.search(r"<image\b", svg) or "data:image" in svg:
                skipped["embedded raster image"] += 1
                continue
            if not a.dry_run:
                open(path, "w", encoding="utf-8").write(svg)

        rows.append(
            {
                "id": iid,
                "label": label,
                "category": CATEGORIES[e["category"]],
                "author": "Health Icons contributors",
                "license": "cc0",
                "licenseUrl": CC0,
                "style": a.style,
                "healthCategory": e["category"],
                "tags": e.get("tags", []),
                "inline": "<style" not in svg.lower(),
                "viewBox": [round(x, 3) for x in dims(svg)],
            }
        )

    if out_dirty:
        print(f"note: {skipped['file not found']} icons have no {a.style} file; that set is only filled in")

    rows.sort(key=lambda r: (r["category"].lower(), r["label"].lower(), r["id"]))
    if not a.dry_run:
        path = os.path.join(a.app, "src", "icons.healthicons.json")
        old = {}
        if os.path.exists(path):
            for r in json.load(open(path))["icons"]:
                old[r["id"]] = r
        for r in rows:
            old.setdefault(r["id"], r)
        rows = [old[k] for k in sorted(old)]
        json.dump({"icons": rows}, open(path, "w"), ensure_ascii=False, separators=(",", ":"))

        if not a.cats:
            keep = {r["id"] + ".svg" for r in rows}
            for f in os.listdir(out_dir):
                if f.startswith("health-") and f not in keep:
                    os.remove(os.path.join(out_dir, f))

    print(f"{len(rows)} icons from Health Icons" + (" (dry run, nothing written)" if a.dry_run else ""))
    print("categories:", dict(collections.Counter(r["category"] for r in rows)))
    print("skipped:", dict(skipped.most_common()))


if __name__ == "__main__":
    sys.exit(main())