#!/usr/bin/env python3
"""Import freely licensed SVG drawings from Wikimedia Commons into the app.

Usage:
    python3 scripts/fetch_commons.py .                                  # the default categories
    python3 scripts/fetch_commons.py . --cats "Category:Laboratory glassware icons"
    python3 scripts/fetch_commons.py . --dry-run                        # report only

Commons is a directory rather than a curated library, so the script is deliberately picky. It walks
a category (and its subcategories), reads the license of every file from the file page metadata, and
keeps only the licenses that fit this app: public domain, CC0 and CC BY. Share-alike (CC BY-SA),
non-commercial, no-derivatives, GFDL-only and unknown licenses are dropped, as are logos, bitmaps
embedded in the vector, and files over --max-kb. What survives is written to public/icons/commons-*.svg
and listed in src/icons.commons.json, next to the Bioicons and BioArt ones.

Metadata comes from the MediaWiki action API, and answers are cached in .cache/commons so a rerun
needs no requests. Commons rate-limits quickly (HTTP 429 after a handful of calls), so every call is
delayed and retried; keep --delay generous if you widen the category list.
"""
import argparse, collections, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

API = "https://commons.wikimedia.org/w/api.php"
# Commons leaves the url empty on public domain files; the credit needs something to link to.
PD_URL = "https://creativecommons.org/publicdomain/mark/1.0/"
UA = "figure-editor/1.0 (one-off import script; https://github.com/)"

# Short name as Commons reports it -> the keys src/icons.ts knows about.
LICENSES = {
    "public domain": "pd",
    "pd": "pd",
    "cc0": "cc0",
    "cc0 1.0": "cc0",
    "cc by 1.0": "by1",
    "cc by 2.0": "by2",
    "cc by 2.5": "by25",
    "cc by 3.0": "by3",
    "cc by 3.0 igo": "by3",
    "cc by 4.0": "by4",
    "attribution": "by4",
}
# Share-alike drawings are left out, like in curate_icons.py: bundling them means the app ships them
# under the same license. --allow-sharealike takes them anyway, if that trade is worth it.
SHAREALIKE = {
    "cc by-sa 1.0": "by1sa",
    "cc by-sa 2.0": "by2sa",
    "cc by-sa 2.5": "by25sa",
    "cc by-sa 3.0": "by3sa",
    "cc by-sa 3.0 igo": "by3sa",
    "cc by-sa 3.0 de": "by3sa",
    "cc by-sa 3.0 us": "by3sa",
    "cc by-sa 4.0": "by4sa",
}
# Categories we walk by default, and the palette category each one files its files under.
DEFAULT_CATS = [
    ("Category:SVG laboratory glassware icons", "Laboratory glassware"),
    ("Category:Laboratory glassware icons", "Laboratory glassware"),
    ("Category:SVG Laboratory equipment", "Laboratory equipment"),
    ("Category:Chemistry icons", "Chemistry"),
]
# "Biology icons" and its subcategories hold more than 2,000 drawings, most of them organism line
# art the library already has; add them with --cats when you want that style.
# Emojis of scientists and flasks sit in these categories; they are duplicates of what the app already
# draws and there are hundreds of them.
SKIP_WORDS = (
    "logo", "coat of arms", "signature", "stamp", "map of", "banner", "flag ", "barnstar",
    "trophy", "medal", "emoji", "emojione", "openmoji", "fluent", "twemoji", "noto emoji",
)


def get(params, delay=1.5, tries=5):
    """One API call, delayed and retried: Commons answers 429 when you rush it."""
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = json.load(r)
            time.sleep(delay)
            return data
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(5 * (attempt + 1))
            elif e.code == 404:
                return {}
            else:
                time.sleep(2 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Commons did not answer: {url}")


def category_files(cat, depth=1, delay=1.5):
    """File names in a category and its subcategories, up to `depth` levels."""
    files, queue, seen = [], [(cat, 0)], {cat}
    while queue:
        name, level = queue.pop(0)
        cont = {}
        while True:
            d = get(
                {
                    "action": "query",
                    "format": "json",
                    "list": "categorymembers",
                    "cmtitle": name,
                    "cmlimit": 500,
                    **cont,
                },
                delay,
            )
            for m in d.get("query", {}).get("categorymembers", []):
                if m["title"].startswith("Category:"):
                    if level < depth and m["title"] not in seen:
                        seen.add(m["title"])
                        queue.append((m["title"], level + 1))
                elif m["title"].lower().endswith(".svg"):
                    files.append(m["title"])
            cont = d.get("continue", {})
            if not cont:
                break
    return sorted(set(files))


def image_info(titles, delay=1.5):
    """url, license and author of each file, read off the file page."""
    out = []
    for i in range(0, len(titles), 25):
        d = get(
            {
                "action": "query",
                "format": "json",
                "prop": "imageinfo",
                "titles": "|".join(titles[i : i + 25]),
                "iiprop": "url|mime|size|extmetadata",
                "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|AttributionRequired|ObjectName|ImageDescription",
            },
            delay,
        )
        for page in d.get("query", {}).get("pages", {}).values():
            info = (page.get("imageinfo") or [{}])[0]
            meta = info.get("extmetadata", {})

            def field(name):
                return meta.get(name, {}).get("value", "")

            out.append(
                {
                    "title": page["title"],
                    "url": info.get("url", ""),
                    "mime": info.get("mime", ""),
                    "size": info.get("size", 0),
                    "license": field("LicenseShortName").strip(),
                    "licenseUrl": field("LicenseUrl").strip(),
                    "author": strip_tags(field("Artist")),
                    "name": strip_tags(field("ObjectName")) or "",
                }
            )
    return out


def strip_tags(html):
    s = re.sub(r"<[^>]+>", " ", html)
    s = (
        s.replace("&amp;", "&")
        .replace("&nbsp;", " ")
        .replace("&quot;", '"')
        .replace("&#039;", "'")
        .replace("\n", " ")
    )
    return " ".join(s.split()).strip(" |")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def label_of(name, title):
    """A readable name: Commons files are named after the upload, e.g. '201305 dissecting scissors'."""
    label = name or re.sub(r"^File:", "", title)[:-4]
    label = re.sub(r"\.(svg|png|jpg|jpeg)$", "", label, flags=re.I).replace("_", " ")
    label = re.sub(r"[\(\[]?\s*(NIH\s*)?BioArt[^)\]]*[)\]]?", " ", label, flags=re.I)
    label = re.sub(r"[\(\[]?\s*\d{4,7}\s*[)\]]?\s*-\s*the noun project", " ", label, flags=re.I)
    label = re.sub(r"\s*-\s*the noun project", " ", label, flags=re.I)
    label = re.sub(r"^\s*\d{6}[\s_-]+", " ", label)  # upload date prefixes, e.g. '201305 beaker.svg'
    label = re.sub(r"^\s*\d{4}-\d{2}-\d{2}[\s_-]+", " ", label)
    label = re.sub(r"\s+", " ", label).strip(" -()[]")
    label = re.sub(r"[\(\[]\s*$", "", label).strip()  # a name that lost its closing bracket
    return label


def plain_author(html):
    """Artist as a name: Commons often has only a link or 'own work' there."""
    a = strip_tags(html)
    a = re.sub(r"https?://\S+", "", a).strip(" ,;|")
    a = re.sub(r"^\s*(own work|self)\s*$", "", a, flags=re.I)
    a = re.sub(r"\bFile:[^,:|]+(svg|png|jpe?g)\s*:?", " ", a, flags=re.I)  # 'File:Beakers.svg : Xavax derived work'
    a = re.sub(r"\bderived work\b", "", a, flags=re.I)
    return a.strip(" ,;|")


def clean(svg):
    svg = re.sub(r"<\?xml[^>]*\?>", "", svg)
    svg = re.sub(r"<!DOCTYPE[^\[>]*(\[.*?\])?\s*>", "", svg, flags=re.S)
    svg = re.sub(r"\s+xmlns:[\w.-]+=\"&[^\"]*;\"", "", svg)  # Illustrator entity namespaces
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
    ap.add_argument("--cats", help="comma separated Category:Name:PaletteCategory triples")
    ap.add_argument("--delay", type=float, default=1.5, help="seconds between API calls")
    ap.add_argument("--max-kb", type=float, default=200)
    ap.add_argument("--allow-sharealike", action="store_true", help="also take CC BY-SA files")
    ap.add_argument(
        "--block",
        default="scripts/commons_block.txt",
        help="file of name fragments to leave out, relative to the app folder",
    )
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--cache", default=".cache/commons")
    a = ap.parse_args()

    out_dir = os.path.join(a.app, "public", "icons")
    os.makedirs(out_dir, exist_ok=True)
    cache = os.path.join(a.app, a.cache)
    os.makedirs(cache, exist_ok=True)

    if a.cats:
        cats = []
        for part in a.cats.split(","):
            bits = part.split(":")
            cats.append((f"Category:{bits[1]}", bits[2] if len(bits) > 2 else bits[1]))
    else:
        cats = DEFAULT_CATS

    block_path = a.block if os.path.isabs(a.block) else os.path.join(a.app, a.block)
    blocked = []
    if os.path.exists(block_path):
        blocked = [
            line.strip().lower()
            for line in open(block_path, encoding="utf-8")
            if line.strip() and not line.startswith("#")
        ]

    skipped = collections.Counter()
    rows = []
    seen_ids = set()
    seen_titles = set()
    run_labels = set()
    # A Commons file often shows a drawing the library already has (NIAID uploads its BioArt work
    # there too), so labels already in use are left alone.
    taken_labels = set()
    for name in ("icons.json", "icons.bioart.json"):
        path = os.path.join(a.app, "src", name)
        if os.path.exists(path):
            for r in json.load(open(path))["icons"]:
                taken_labels.add(re.sub(r"[^a-z0-9]+", "", r["label"].lower()))
    for cat, palette_cat in cats:
        cache_key = slug(cat) + ".json"
        cache_path = os.path.join(cache, cache_key)
        if os.path.exists(cache_path) and not a.refresh:
            entries = json.load(open(cache_path))
        else:
            titles = category_files(cat, delay=a.delay)
            print(f"{cat}: {len(titles)} SVG files", flush=True)
            entries = image_info(titles, delay=a.delay)
            json.dump(entries, open(cache_path, "w"), ensure_ascii=False)

        for e in entries:
            label = label_of(e["name"], e["title"])
            key = re.sub(r"[^a-z0-9]+", "", label.lower())
            if not key:
                skipped["no usable name"] += 1
                continue
            if key in taken_labels or key in run_labels:
                skipped["already in the library"] += 1
                continue
            run_labels.add(key)
            if e["title"] in seen_titles:
                continue  # the same file listed in several categories
            seen_titles.add(e["title"])
            base = "commons-" + (slug(label) or slug(e["title"]))
            iid, n = base, 1
            while iid in seen_ids:
                n += 1
                iid = f"{base}-{n}"
            seen_ids.add(iid)
            low = label.lower()
            if any(w in low for w in blocked):
                skipped["left out by name"] += 1
                continue
            if any(w in low for w in SKIP_WORDS):
                skipped["logo, badge or emoji"] += 1
                continue
            if re.match(r"^\d+-.+-\d+$", low) or re.fullmatch(r"[\d\s-]+", low):
                skipped["numbered icon-pack entry"] += 1
                continue
            lic = LICENSES.get(e["license"].lower()) or (SHAREALIKE.get(e["license"].lower()) if a.allow_sharealike else None)
            if not lic:
                skipped[f"license {e['license'] or 'unknown'}"] += 1
                continue
            if e["mime"] != "image/svg+xml":
                skipped["not an SVG"] += 1
                continue
            if e["size"] > a.max_kb * 1000:
                skipped[f"over {a.max_kb:g} KB"] += 1
                continue

            path = os.path.join(out_dir, iid + ".svg")
            if os.path.exists(path) and not a.refresh and not a.dry_run:
                svg = open(path, encoding="utf-8").read()
            else:
                try:
                    req = urllib.request.Request(e["url"], headers={"User-Agent": UA})
                    with urllib.request.urlopen(req, timeout=40) as r:
                        raw = r.read().decode("utf-8", "ignore")
                    time.sleep(a.delay)
                except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError):
                    skipped["file not downloadable"] += 1
                    continue
                svg = clean(raw)
                if not valid(svg):
                    skipped["invalid SVG"] += 1
                    continue
                if re.search(r"<image\b", svg) or "data:image" in svg:
                    skipped["embedded raster image"] += 1
                    continue
                if len(raw) > a.max_kb * 1000:
                    skipped[f"over {a.max_kb:g} KB"] += 1
                    continue
                if not a.dry_run:
                    open(path, "w", encoding="utf-8").write(svg)

            rows.append(
                {
                    "id": iid,
                    "label": label,
                    "category": palette_cat,
                    "author": plain_author(e["author"]) or "Wikimedia Commons contributor",
                    "license": lic,
                    "licenseUrl": e["licenseUrl"] or (PD_URL if lic == "pd" else ""),
                    "file": "File:" + e["title"][5:],
                    "inline": "<style" not in svg.lower(),
                    "viewBox": [round(x, 3) for x in dims(svg)],
                }
            )

    rows.sort(key=lambda r: (r["category"].lower(), r["label"].lower(), r["id"]))
    if not a.dry_run:
        path = os.path.join(a.app, "src", "icons.commons.json")
        old = {}
        if os.path.exists(path):
            for r in json.load(open(path))["icons"]:
                old[r["id"]] = r
        for r in rows:
            old.setdefault(r["id"], r)
        rows = [old[k] for k in sorted(old)]
        json.dump({"icons": rows}, open(path, "w"), ensure_ascii=False, separators=(",", ":"))

        # A full run drops files that are gone or filtered out now, and their SVGs with them.
        if not a.cats:
            keep = {r["id"] + ".svg" for r in rows}
            for f in os.listdir(out_dir):
                if f.startswith("commons-") and f not in keep:
                    os.remove(os.path.join(out_dir, f))

    print(f"{len(rows)} drawings from Wikimedia Commons" + (" (dry run, nothing written)" if a.dry_run else ""))
    print("skipped:", dict(skipped.most_common()))
    print("licenses:", dict(collections.Counter(r["license"] for r in rows)))


if __name__ == "__main__":
    sys.exit(main())