#!/usr/bin/env python3
"""Import illustrations from NIH BioArt Source into the app.

Usage:
    python3 scripts/fetch_bioart.py .                 # crawl every entry, write src/icons.bioart.json
    python3 scripts/fetch_bioart.py . --limit 20      # trial run on the first 20 entries
    python3 scripts/fetch_bioart.py . --only 500,972  # re-import single entries
    python3 scripts/fetch_bioart.py . --dry-run       # report what would be taken, download nothing

Every entry is a server-rendered page at https://bioart.niaid.nih.gov/bioart/<id> that carries its
metadata (collection, creator, licensing, dates) plus one downloadable file per representation,
served through https://bioart.niaid.nih.gov/api/bioarts/<id>/files/<fileId>. Entry ids are dense
and start at 1, so the whole collection is found by walking the id range; ids that do not exist
answer with a 500 and a stale prerendered shell, which is why every page is checked against the
entry number it claims to be.

Only the SVG representations are taken: the PNGs of the same group are the same artwork, and the app
recolours vectors. An SVG may embed raster images (some BioArt entries are scanned drawings); those
are skipped, as are files over --max-kb, since public/icons/ is shipped with the app.

Entry pages are fetched politely (--jobs requests at a time, --delay between them). Re-running is
cheap: entries whose SVG is already on disk are skipped unless --refresh is given.

Licensing: entries marked "Public Domain" need no credit, everything else is CC BY and is credited.
"""
import argparse, collections, concurrent.futures as cf, json, os, re, sys, time, urllib.error, urllib.request
import xml.etree.ElementTree as ET

BASE = "https://bioart.niaid.nih.gov"
LAST_ID = 1100  # the collection stops well below this; used to see where the id range ends
PD_LABEL = "Public Domain"
# Public domain entries just link to the FAQ; CC BY ones carry the license image and its url
CC_BY_URLS = {
    "https://creativecommons.org/licenses/by/4.0/": "by4",
    "https://creativecommons.org/licenses/by/3.0/": "by3",
    "https://creativecommons.org/licenses/by/2.0/": "by2",
    "https://creativecommons.org/licenses/by/2.5/": "by25",
    "https://creativecommons.org/licenses/by/1.0/": "by1",
}
# The colour wheel BioArt offers for most illustrations; these representations are the same drawing.
COLOURS = {
    "red", "orange", "yellow", "green", "blue", "pink", "purple", "brown", "grey", "gray", "beige",
    "black", "white", "color", "colour", "gold", "ochre", "prussian", "tawny", "teal",
    "black and white", "blackwhite", "full color",
}
UA = "figure-editor/1.0 (https://github.com/; one-off import script)"


def is_colour_variant(caption):
    """True for the recoloured copies BioArt offers.

    They are captioned in every shape: "Red", "Person - Red", "VSV Silhouette - Beige",
    "Fire-Footed Rope Squirrel Black and White", "Black & White", "Dark Grey".
    """
    words = " ".join(re.sub(r"[^a-z0-9]+", " ", caption.lower()).split())
    return any(words == c or words.endswith(" " + c) for c in COLOURS)


def get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def text_of(html, label):
    """Value that follows a rendered field label, e.g. 'Collection'."""
    m = re.search(r"<h6[^>]*>\s*" + label + r"\s*:?\s*</h6>(.{0,600})", html, re.S)
    if not m:
        return ""
    after = m.group(1)
    p = re.search(r"<p[^>]*>(.*?)</p>", after, re.S)  # most fields render their value in a <p>
    nxt = re.search(r"<h6[^>]*>(.*?)</h6>", after, re.S)  # a few (Category) use a heading instead
    return strip_tags((p or nxt).group(1) if (p or nxt) else after.split("<")[0]).strip()


def strip_tags(s):
    s = re.sub(r"<[^>]+>", " ", s)
    return " ".join(s.replace("&amp;", "&").replace("&nbsp;", " ").split())


def category_of(payload):
    """Category from the metadata block; the page also shows a filter tree with the same label."""
    m = re.search(r'"children":"Category:"\}.{0,200}?"children":"([^"]*)"', payload, re.S)
    if not m:
        return ""
    return m.group(1).split(",")[0].strip()  # the site lists a full ontology path, e.g. "Cells and Organelles, Proteins"


def parse(html, entry_id):
    """Metadata and representations of one entry page, or None when the page is not that entry."""
    payload = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), html).replace('\\"', '"')
    m = re.search(r"BIOART-(\d+)", payload)
    if not m or int(m.group(1)) != entry_id:
        return None

    carousel = re.search(r'"carouselItems":\[(.*?)\]\}', payload, re.S)
    items = []
    if carousel:
        for it in re.finditer(
            r'"fileId":(\d+),"s3Location":"[^"]*","uploadDate":"[^"]*","name":"([^"]*)",'
            r'.*?"fileFormat":"([A-Z]+)","fileSize":(\d+),"downloadCount":\d+,'
            r'"bioartFileGroupId":(\d+),"caption":"([^"]*)"',
            carousel.group(1),
        ):
            items.append(
                {
                    "fileId": int(it.group(1)),
                    "name": it.group(2),
                    "format": it.group(3),
                    "size": int(it.group(4)),
                    "group": int(it.group(5)),
                    "caption": it.group(6),
                }
            )

    fm = re.search(r'"filemapping":\{(.*?)\}\]', payload, re.S)
    formats = {}
    if fm:
        for grp in re.finditer(r'"(\d+)":\{([^}]*)\}', fm.group(1)):
            formats[grp.group(1)] = dict(re.findall(r'"([A-Z]+)":(\d+)', grp.group(2)))

    licensing = re.search(r"Licensing:(.*?)</h6>", html, re.S)
    block = licensing.group(1) if licensing else ""
    if "/faqs#usage-restrictions-bioart" in block and PD_LABEL in block:
        license = "pd"
    else:
        url = re.search(r'href="(https://creativecommons\.org/licenses/[^"]+)"', block)
        license = CC_BY_URLS.get(url.group(1) if url else "", "by4")
    dates = dict(re.findall(r"(Creation Date|Submission Date|Modify Date):\s*<!-- -->(\d+/\d+/\d+)", payload))
    title = re.search(r'"h4","color":"heading","children":"([^"]+)"', payload)
    cite = re.search(
        r'NIAID NIH BIOART Source\. bioart\.niaid\.nih\.gov/bioart/<!-- -->(\d+)', html
    )
    doi = re.search(r'href="https://doi\.org/(10\.[^"]+)"', html)

    return {
        "id": entry_id,
        "title": (title.group(1) if title else "").strip(),
        "collection": text_of(html, "Collection"),
        "creator": text_of(html, "Creator"),
        "category": category_of(payload),
        "keywords": text_of(html, "Keywords"),
        "license": license,
        "doi": doi.group(1) if doi else "",
        "date": dates.get("Submission Date", ""),
        "citationId": int(cite.group(1)) if cite else entry_id,
        "items": items,
        "formats": formats,
    }


def clean(svg):
    svg = re.sub(r"<\?xml[^>]*\?>", "", svg)
    svg = re.sub(r"<!DOCTYPE[^\[>]*(\[.*?\])?\s*>", "", svg, flags=re.S)
    svg = re.sub(r'\s+xmlns:[\w.-]+="&[^"]*;"', "", svg)  # Illustrator entity namespaces
    svg = re.sub(r"<script\b.*?</script>", "", svg, flags=re.S | re.I)
    svg = re.sub(r'\son\w+\s*=\s*"[^"]*"', "", svg, flags=re.I)
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


def fetch_entry(entry_id, tries=4, cache=None):
    """One entry page, retried: the site answers 500 now and then under load.

    Pages are kept in the cache folder so a later run over the same entries needs no requests.
    """
    cached = os.path.join(cache, f"{entry_id}.html") if cache else None
    gone = os.path.join(cache, f"{entry_id}.none") if cache else None
    if cached and os.path.exists(cached):
        return parse(open(cached, encoding="utf-8").read(), entry_id)
    if gone and os.path.exists(gone):
        return None
    for attempt in range(tries):
        try:
            html = get(f"{BASE}/bioart/{entry_id}").decode("utf-8", "ignore")
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError):
            time.sleep(1 + 2 * attempt)
            continue
        if cached:
            os.makedirs(cache, exist_ok=True)
            open(cached, "w", encoding="utf-8").write(html)
        return parse(html, entry_id)
    if gone:
        os.makedirs(cache, exist_ok=True)
        open(gone, "w").close()
    return None


def fetch_svg(entry_id, svg_id, tries=4):
    """Cleaned SVG of one file.

    Downloads sometimes come back truncated or as a 200 with an HTML body, so a file is only
    accepted once it parses; anything else is fetched again.
    """
    for attempt in range(tries):
        try:
            raw = get(f"{BASE}/api/bioarts/{entry_id}/files/{svg_id}").decode("utf-8", "ignore")
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError):
            time.sleep(1 + 2 * attempt)
            continue
        svg = clean(raw)
        # Errors sometimes come back as a 200 with an HTML body, so only a parseable file is kept.
        if valid(svg):
            return svg
        time.sleep(1 + 2 * attempt)
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("app", help="the figure-editor folder")
    ap.add_argument("--limit", type=int, default=0, help="only walk the first N ids")
    ap.add_argument("--only", help="comma separated entry ids to (re)import")
    ap.add_argument("--last-id", type=int, default=LAST_ID)
    ap.add_argument("--jobs", type=int, default=6)
    ap.add_argument("--delay", type=float, default=0.2, help="seconds to wait between requests")
    ap.add_argument("--max-kb", type=float, default=200)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--refresh", action="store_true", help="download SVGs that are already on disk")
    ap.add_argument("--cache", default=".cache/bioart", help="folder for entry pages, relative to the app")
    ap.add_argument("--no-cache", action="store_true", help="always ask the site, ignoring the cache")
    a = ap.parse_args()

    out_dir = os.path.join(a.app, "public", "icons")
    os.makedirs(out_dir, exist_ok=True)

    if a.only:
        ids = [int(x) for x in a.only.replace(" ", "").split(",") if x]
    else:
        ids = list(range(1, (a.limit or a.last_id) + 1))

    cache = None if a.no_cache else (a.cache if os.path.isabs(a.cache) else os.path.join(a.app, a.cache))
    entries, missing, t0 = {}, [], time.time()
    with cf.ThreadPoolExecutor(max_workers=a.jobs) as ex:
        for n, e in enumerate(ex.map(lambda i: fetch_entry(i, cache=cache), ids), 1):
            if e:
                entries[e["id"]] = e
            else:
                missing.append(1)
            if a.delay and n % a.jobs == 0:
                time.sleep(a.delay)
            if n % 100 == 0:
                print(f"  {n}/{len(ids)} pages, {len(entries)} entries", flush=True)
    print(f"crawled {len(ids)} ids in {time.time() - t0:.0f}s: {len(entries)} entries, {len(ids) - len(entries)} without a page")

    skipped = collections.Counter()
    failures = []
    rows = []
    for eid in sorted(entries):
        e = entries[eid]
        for it in e["items"]:
            svg_id = e["formats"].get(str(it["group"]), {}).get("SVG")
            if not svg_id:
                skipped["no SVG for this representation"] += 1
                continue
            if is_colour_variant(it["caption"]):
                skipped["colour variant"] += 1  # the same drawing in another colour, the app recolours
                continue

            iid = f"bioart-{eid}-{slug(it['caption'] or e['title'])}"
            path = os.path.join(out_dir, iid + ".svg")
            if os.path.exists(path) and not a.refresh and not a.dry_run:
                svg = open(path, encoding="utf-8").read()
            else:
                svg = fetch_svg(eid, svg_id)
                if not svg:
                    skipped["SVG not downloadable"] += 1
                    failures.append((eid, svg_id, "not downloadable"))
                    continue
                if re.search(r"<image\b", svg) or "data:image" in svg:
                    skipped["embedded raster image"] += 1
                    continue
                if len(svg) > a.max_kb * 1000:
                    skipped[f"over {a.max_kb:g} KB"] += 1
                    continue
                if not a.dry_run:
                    open(path, "w", encoding="utf-8").write(svg)
                time.sleep(a.delay)

            rows.append(
                {
                    "id": iid,
                    "label": " ".join((it["caption"] or e["title"]).split()) or e["title"],
                    "category": e["category"] or "BioArt",
                    "author": e["creator"] or e["collection"] or "NIAID",
                    "license": e["license"],
                    "collection": e["collection"],
                    "date": e["date"],
                    "entry": e["citationId"],
                    "doi": e["doi"],
                    "inline": "<style" not in svg.lower(),
                    "viewBox": [round(x, 3) for x in dims(svg)],
                }
            )

    rows.sort(key=lambda r: (r["category"].lower(), r["label"].lower(), r["id"]))
    if not a.dry_run:
        path = os.path.join(a.app, "src", "icons.bioart.json")
        old = {}
        if os.path.exists(path):
            for r in json.load(open(path))["icons"]:
                old[r["id"]] = r
        for r in rows:
            old.setdefault(r["id"], r)
        rows = [old[k] for k in sorted(old)]
        json.dump({"icons": rows}, open(path, "w"), ensure_ascii=False, separators=(",", ":"))

        # A full crawl drops illustrations that are gone or filtered out now, and their files with them.
        if not a.only:
            keep = {r["id"] + ".svg" for r in rows}
            for f in os.listdir(out_dir):
                if f.startswith("bioart-") and f not in keep:
                    os.remove(os.path.join(out_dir, f))

    print(f"{len(rows)} illustrations from NIH BioArt Source" + (" (dry run, nothing written)" if a.dry_run else ""))
    print("skipped:", dict(skipped))
    for eid, svg_id, head in failures[:10]:
        print(f"  failed {eid} file {svg_id}: {head[:100]!r}")
    print("licenses:", dict(collections.Counter(r["license"] for r in rows)))
    print("collections:", dict(collections.Counter(r["collection"] for r in rows).most_common(12)))


if __name__ == "__main__":
    sys.exit(main())