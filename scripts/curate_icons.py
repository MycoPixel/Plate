#!/usr/bin/env python3
"""Copy permissively licensed icons from a Bioicons clone into the app.

Usage:
    git clone --depth 1 https://github.com/duerrsimon/bioicons.git
    python3 scripts/curate_icons.py bioicons/static/icons . [--max-kb 50]
    python3 scripts/expand_viewboxes.py .      # needs: pip install playwright
    python3 scripts/make_credits.py .

Only CC0, MIT, CC BY 3.0 and CC BY 4.0 are accepted. Share-alike icons are skipped on purpose.
Also skipped: brand logos, files with embedded raster images, files over --max-kb, empty or invalid SVGs.
Icons already present in src/icons.json keep their ids (so saved figures keep working) and are always kept.
"""
import argparse, collections, json, os, re, shutil, sys
import xml.etree.ElementTree as ET

LICENSES = {"cc-0": "cc0", "mit": "mit", "cc-by-3.0": "by3", "cc-by-4.0": "by4"}
LICENSE_NAMES = {"CC0 1.0": "cc0", "MIT": "mit", "CC BY 3.0": "by3", "CC BY 4.0": "by4"}
EXCLUDE_CATEGORIES = {"Machine_Learning", "Computer_hardware"}  # brand logos, not science illustrations
LABEL_FIXES = {"hepatits": "hepatitis", "emtpycell": "emptycell", "relesase": "release"}


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def clean(svg):
    svg = re.sub(r"<\?xml[^>]*\?>", "", svg)
    svg = re.sub(r"<!DOCTYPE[^\[>]*(\[.*?\])?\s*>", "", svg, flags=re.S)
    svg = re.sub(r'\s+xmlns:[\w.-]+="&[^"]*;"', "", svg)  # Illustrator entity namespaces
    svg = re.sub(r"<script\b.*?</script>", "", svg, flags=re.S | re.I)
    svg = re.sub(r"\son\w+\s*=\s*\"[^\"]*\"", "", svg, flags=re.I)
    svg = re.sub(r"<metadata\b.*?</metadata>", "", svg, flags=re.S | re.I)
    return svg.strip()


def valid(svg):
    try:
        root = ET.fromstring(svg.encode("utf-8"))
    except ET.ParseError:
        return False
    return root.tag.endswith("}svg") or root.tag == "svg"


def dims(svg):
    m = re.search(r"<svg[^>]*>", svg, re.S)
    tag = m.group(0) if m else ""
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
    ap.add_argument("src", help="bioicons/static/icons")
    ap.add_argument("app", help="the figure-editor folder")
    ap.add_argument("--max-kb", type=float, default=50)
    a = ap.parse_args()

    index = json.load(open(os.path.join(a.src, "icons.json")))
    authors = json.load(open(os.path.join(a.src, "authors.json")))

    # ids and authors already in use, so saved figures keep working
    old_path = os.path.join(a.app, "src", "icons.json")
    old, old_label = {}, {}
    if os.path.exists(old_path):
        data = json.load(open(old_path))
        for r in data["icons"] if isinstance(data, dict) else data:
            lic = r["license"] if r["license"] in LICENSES.values() else LICENSE_NAMES.get(r["license"])
            old[r["id"]] = (norm(r["author"]), lic)
            old_label[r["id"]] = r["label"]  # hand-tuned labels survive a re-import

    disk = collections.defaultdict(list)
    for lic in LICENSES:
        for root, _, files in os.walk(os.path.join(a.src, lic)):
            parts = os.path.relpath(root, a.src).split(os.sep)
            if len(parts) < 3:
                continue
            for f in files:
                if f.lower().endswith(".svg"):
                    disk[(lic, parts[1], f[:-4].lower())].append(os.path.join(root, f))

    def resolve(e):
        p = os.path.join(a.src, e["license"], e["category"], e["author"], e["name"] + ".svg")
        if os.path.exists(p):
            return p
        c = disk.get((e["license"], e["category"], e["name"].lower()), [])
        if len(c) == 1:
            return c[0]
        m = [x for x in c if norm(os.path.basename(os.path.dirname(x))) == norm(e["author"])]
        return m[0] if len(m) == 1 else None

    entries = [e for e in index if e["license"] in LICENSES]

    # pass 0: reserve the ids that already exist; pass 1: give everything else a unique id
    ids, used, reserved = {}, set(), set()
    for n, e in enumerate(entries):
        base = slug(f"{e['category']}-{e['name']}")
        if base in old and base not in used and old[base] == (norm(e["author"]), LICENSES[e["license"]]):
            ids[n] = base
            used.add(base)
            reserved.add(base)
    for n, e in enumerate(entries):
        if n in ids:
            continue
        base = slug(f"{e['category']}-{e['name']}") or "icon"
        i, cand = 1, base
        while cand in used or cand in old:
            i += 1
            cand = f"{base}-{i}"
        ids[n] = cand
        used.add(cand)

    out_dir = os.path.join(a.app, "public", "icons")
    shutil.rmtree(out_dir, ignore_errors=True)
    os.makedirs(out_dir)

    skipped = collections.Counter()
    rows = []
    for n, e in enumerate(entries):
        iid = ids[n]
        force = iid in reserved
        if not force:
            if e["category"] in EXCLUDE_CATEGORIES:
                skipped["brand-logo category"] += 1
                continue
            if "logo" in e["name"].lower():
                skipped["logo"] += 1
                continue
        path = resolve(e)
        if not path:
            skipped["file not found"] += 1
            continue
        size = os.path.getsize(path)
        if size == 0:
            skipped["empty file"] += 1
            continue
        if not force and size > a.max_kb * 1000:
            skipped[f"over {a.max_kb:g} KB"] += 1
            continue
        raw = open(path, encoding="utf-8-sig", errors="ignore").read()
        if not force and (re.search(r"<image\b", raw) or "data:image" in raw):
            skipped["embedded raster image"] += 1
            continue
        svg = clean(raw)
        if "<svg" not in svg or not valid(svg):
            skipped["invalid or unsupported SVG"] += 1
            continue
        open(os.path.join(out_dir, iid + ".svg"), "w", encoding="utf-8").write(svg)
        label = e["name"]
        for wrong, right in LABEL_FIXES.items():
            label = label.replace(wrong, right)
        label = old_label.get(iid) or " ".join(re.sub(r"[-_]+", " ", label).split())
        rows.append(
            {
                "id": iid,
                "label": label,
                "category": " ".join(e["category"].replace("_", " ").replace("-", " ").split()),
                "author": e["author"],
                "license": LICENSES[e["license"]],
                "inline": "<style" not in svg.lower(),
                "viewBox": [round(x, 3) for x in dims(svg)],
            }
        )

    rows.sort(key=lambda r: (r["category"].lower(), r["label"].lower(), r["id"]))
    used_authors = {r["author"] for r in rows}
    json.dump(
        {"authors": {k: v for k, v in authors.items() if k in used_authors}, "icons": rows},
        open(old_path, "w"),
        ensure_ascii=False,
        separators=(",", ":"),
    )

    missing_old = sorted(set(old) - {r["id"] for r in rows})
    print(f"wrote {len(rows)} icons ({sum(os.path.getsize(os.path.join(out_dir, f)) for f in os.listdir(out_dir)) / 1e6:.1f} MB)")
    print("skipped:", dict(skipped))
    print("previously used ids that could not be kept:", missing_old or "none")
    print(dict(collections.Counter(r["license"] for r in rows)))


if __name__ == "__main__":
    sys.exit(main())
