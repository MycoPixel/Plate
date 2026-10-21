#!/usr/bin/env python3
"""Import organism silhouettes from PhyloPic into the app.

Usage:
    python3 scripts/fetch_phylopic.py .                  # the taxon list below, rebuild src/icons.phylopic.json
    python3 scripts/fetch_phylopic.py . --dry-run        # report only
    python3 scripts/fetch_phylopic.py . --per-taxon 5    # more silhouettes of the same organism
    python3 scripts/fetch_phylopic.py . --taxa "Arabidopsis thaliana:Plants"

PhyloPic (phylopic.org) is a community library of flat black silhouettes of living things: 13,000+ of
them, most of them public domain. Every image is served as a vector as well, which is what this app
wants, since a one-colour silhouette recolours cleanly.

The API is browsable and needs a build number, which the script reads from the root of
https://api.phylopic.org/ on every run. Names are resolved through its autocomplete endpoint, then
the node's silhouette list is read and each image fetched for its license, contributor and vector
file. Public domain, CC0 and CC BY are kept; share-alike is left out unless --allow-sharealike, as in
the other importers. Answers are cached in .cache/phylopic, so a rerun makes few requests.
"""
import argparse, collections, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

API = "https://api.phylopic.org/"
UA = "figure-editor/1.0 (one-off import script; https://github.com/)"
LICENSES = {
    "https://creativecommons.org/publicdomain/zero/1.0/": "cc0",
    "https://creativecommons.org/publicdomain/mark/1.0/": "pd",
    "https://creativecommons.org/licenses/by/4.0/": "by4",
    "https://creativecommons.org/licenses/by/3.0/": "by3",
}
SHAREALIKE = {
    "https://creativecommons.org/licenses/by-sa/4.0/": "by4sa",
    "https://creativecommons.org/licenses/by-sa/3.0/": "by3sa",
    "https://creativecommons.org/licenses/by-sa/2.5/": "by25sa",
}

# (palette category, organisms to look for). These are the ones that turn up in figures; the whole
# collection is 13,000 images, which is not a library for this app.
TAXA = [
    ("Plants", [
        "Arabidopsis thaliana", "Zea mays", "Oryza sativa", "Solanum lycopersicum", "Triticum aestivum",
        "Glycine max", "Pisum sativum", "Nicotiana tabacum", "Phaseolus vulgaris", "Hordeum vulgare",
        "Brassica napus", "Camellia sinensis", "Coffea arabica", "Theobroma cacao", "Vitis vinifera",
        "Solanum tuberosum", "Daucus carota", "Spinacia oleracea", "Lactuca sativa", "Ocimum basilicum",
        "Rosmarinus officinalis", "Salvia officinalis", "Aloe vera", "Quercus robur", "Acer platanoides",
        "Pinus sylvestris", "Picea abies", "Sequoia sempervirens", "Ginkgo biloba", "Pteridium aquilinum",
        "Marchantia polymorfa", "Chlamydomonas reinhardtii", "Eucalyptus globulus", "Populus tremuloides",
        "Gossypium hirsutum", "Helianthus annuus", "Fagopyrum esculentum", "Sorghum bicolor",
        "Brachypodium distachyon", "Selaginella", "Sphagnum", "Funaria hygrometrica", "Nicotiana benthamiana",
    ]),
    ("Fungi", [
        "Amanita muscaria", "Saccharomyces cerevisiae", "Aspergillus niger", "Penicillium chrysogenum",
        "Candida albicans", "Neurospora crassa", "Agaricus bisporus", "Pleurotus ostreatus",
        "Coprinopsis cinerea", "Fusarium", "Rhizopus", "Mucor", "Cantharellus cibarius", "Boletus edulis",
        "Morchella esculenta", "Laccaria bicolor", "Cladosporium", "Cryptococcus neoformans",
        "Histoplasma", "Pneumocystis jirovecii", "Trichoderma reesei", "Ustilago maydis",
    ]),
    ("Microorganisms", [
        "Escherichia coli", "Bacillus subtilis", "Staphylococcus aureus", "Mycobacterium tuberculosis",
        "Pseudomonas aeruginosa", "Vibrio cholerae", "Salmonella enterica", "Helicobacter pylori",
        "Lactobacillus", "Streptomyces coelicolor", "Chlamydia trachomatis", "Treponema pallidum",
        "Clostridium botulinum", "Klebsiella pneumoniae", "Acinetobacter baumannii", "Deinococcus radiodurans",
        "Thermus aquaticus", "Methanobrevibacter smithii", "Synechocystis", "Plasmodium falciparum",
        "Toxoplasma gondii", "Leishmania donovani", "Giardia lamblia", "Entamoeba histolytica",
    ]),
    ("Invertebrates", [
        "Caenorhabditis elegans", "Octopus vulgaris", "Sepia officinalis", "Helix aspersa",
        "Hydra vulgaris", "Nematostella vectensis", "Paramecium", "Amoeba protea", "Dugesia",
        "Echinococcus granulosus", "Schistosoma mansoni", "Onchocerca volvulus", "Taenia saginata",
        "Ascaris lumbricoides", "Enterobius vermicularis", "Trichinella spiralis", "Strongyloides stercoralis",
        "Balanus", "Mytilus", "Asterias rubens", "Echinus esculentus", "Aurelia aurita", "Ciona intestinalis",
    ]),
    ("Arthropods", [
        "Drosophila melanogaster", "Anopheles gambiae", "Aedes aegypti", "Culex pipiens", "Apis mellifera",
        "Bombus terrestris", "Bombyx mori", "Manduca sexta", "Danaus plexippus", "Ixodes scapularis",
        "Amblyomma americanum", "Periplaneta americana", "Tribolium castaneum", "Aedes albopictus",
        "Anopheles stephensi", "Aedes aegypti mosquito", "Sarcoptes scabiei", "Tetranychus urticae",
        "Pantherophlegrys guttata", "Nasonia vitripennis", "Acyrthosiphon pisum",
    ]),
    ("Fish", [
        "Danio rerio", "Takifugu rubripes", "Oreochromis niloticus", "Gasterosteus aculeatus",
        "Salmo salar", "Xiphophorus hellerii", "Poecilia reticulata", "Carassius auratus",
        "Zebrafish", "Gadus morhua", "Thunnus thynnus", "Rhincodon typus",
    ]),
    ("Amphibians and reptiles", [
        "Xenopus laevis", "Ambystoma mexicanum", "Xenopus tropicalis", "Anolis carolinensis",
        "Iguana iguana", "Caretta caretta", "Python bivittatus", "Vipera berus", "Natrix natrix",
        "Taricha granulosa", "Rana temporaria", "Bufo bufo", "Chameleo calyptratus",
    ]),
    ("Birds", [
        "Corvus corax", "Passer domesticus", "Taeniopyxis guttata", "Gallus gallus",
        "Aquila chrysaetos", "Larus argentatus", "Serinus canaria", "Anas platyrhynchos",
        "Columba livia", "Meleagris gallopavo", "Aptenodytes forresti",
    ]),
    ("Animals", [
        "Mus musculus", "Rattus norvegicus", "Bos taurus", "Sus scrofa", "Ovis aries", "Canis lupus familiaris",
        "Felis catus", "Equus caballus", "Macaca mulatta", "Pan troglodytes", "Gorilla gorilla",
        "Loxodonta africana", "Cervus elaphus", "Ovis aries sheep", "Oryctolagus cuniculus",
        "Heterocephalus glaber", "Capra hircus", "Bos indicus", "Equus asinus", "Lepus europaeus",
        "Vulpes vulpes", "Ursus maritimus", "Phocoena phocoena", "Tursiops truncatus", "Pongo pygmaeus",
        "Delphinus delphis", "Erinaceus europaeus", "Myotis lucifugus", "Chiroptera", "Fasciola hepatica",
    ]),
]


def get(path, delay=0.4, tries=4):
    url = path if path.startswith("http") else API + path
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = json.load(r)
            time.sleep(delay)
            return data
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None  # PhyloPic answers 404 for a name it does not know
            time.sleep(1 + attempt)
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(1 + attempt)
    return None


def build_number():
    """The API's list endpoints only answer with the build they were generated from."""
    root = get("")
    return str(root["build"]) if root and root.get("build") else "559"


def find_node(name, build, delay):
    """Node uuid for a name, via the autocomplete endpoint then a node name filter."""
    ac = get(f"autocomplete?build={build}&query={urllib.parse.quote(name)}", delay)
    wanted = name.lower()
    candidates = ac.get("matches", []) if ac else []
    if wanted not in candidates:
        # Autocomplete answers nothing for most binomial names, so the genus is tried as well.
        candidates = [wanted, wanted.split()[0]] + candidates
    for cand in candidates[:6]:
        d = get(f"nodes?build={build}&filter_name={urllib.parse.quote(cand)}&page=0&page_size=48", delay)
        items = (d or {}).get("_links", {}).get("items", [])
        exact = [i for i in items if i["title"].lower() == cand]
        if exact or items:
            return (exact or items)[0]["href"]
    return None


def clade_images(node_href, build, delay, limit):
    """Silhouettes of a node: [{uuid, title}].

    The node's own list (filter_node) is what holds its silhouettes; the clade list is usually empty
    for a species, so it is only a fallback, and the primary silhouette is one more candidate.
    """
    node = get(node_href.lstrip("/"), delay) or {}
    links = node.get("_links", {})
    out = []
    for key in ("images", "cladeImages"):
        href = (links.get(key) or {}).get("href")
        if not href:
            continue
        d = get(href.lstrip("/"), delay)
        for i in (d or {}).get("_links", {}).get("items", []):
            uuid = i["href"].split("/images/")[1].split("?")[0]
            if uuid not in [o["uuid"] for o in out]:
                out.append({"uuid": uuid, "title": i["title"]})
        if out:
            break
    primary = (links.get("primaryImage") or {}).get("href")
    if primary:
        uuid = primary.split("/images/")[1].split("?")[0]
        if uuid not in [o["uuid"] for o in out]:
            out.insert(0, {"uuid": uuid, "title": node.get("primaryImage", {}).get("title", "")})
    return out[:limit]


def image_detail(uuid, build, delay):
    d = get(f"images/{uuid}?build={build}", delay)
    if not d:
        return None
    links = d.get("_links", {})
    return {
        "uuid": uuid,
        "license": (links.get("license") or {}).get("href", ""),
        "contributor": (links.get("contributor") or {}).get("title", ""),
        "vector": (links.get("vectorFile") or {}).get("href", ""),
        "name": (links.get("specificNode") or {}).get("title", ""),
    }


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


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
    ap.add_argument("--taxa", help="comma separated Name:PaletteCategory pairs, instead of the list above")
    ap.add_argument("--per-taxon", type=int, default=3, help="silhouettes kept per organism")
    ap.add_argument("--delay", type=float, default=0.4)
    ap.add_argument("--max-kb", type=float, default=200)
    ap.add_argument("--allow-sharealike", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--cache", default=".cache/phylopic")
    a = ap.parse_args()

    if a.taxa:
        taxa = []
        for part in a.taxa.split(","):
            bits = part.split(":")
            taxa.append((bits[1] if len(bits) > 1 else "Animals", [bits[0]]))
    else:
        taxa = TAXA

    out_dir = os.path.join(a.app, "public", "icons")
    os.makedirs(out_dir, exist_ok=True)
    cache = os.path.join(a.app, a.cache)
    os.makedirs(cache, exist_ok=True)

    build = build_number()
    skipped = collections.Counter()
    rows = []
    seen_names = set()
    used_ids = set()
    taken_labels = set()
    for name in ("icons.json", "icons.bioart.json", "icons.commons.json"):
        path = os.path.join(a.app, "src", name)
        if os.path.exists(path):
            for r in json.load(open(path))["icons"]:
                taken_labels.add(re.sub(r"[^a-z0-9]+", "", r["label"].lower()))

    for category, names in taxa:
        for name in names:
            cache_path = os.path.join(cache, slug(name) + ".json")
            if os.path.exists(cache_path) and not a.refresh:
                picks = json.load(open(cache_path))
            else:
                node = find_node(name, build, a.delay)
                if not node:
                    skipped["no node for this name"] += 1
                    continue
                images = clade_images(node, build, a.delay, a.per_taxon * 4)
                picks = []
                for img in images:
                    detail = image_detail(img["uuid"], build, a.delay)
                    if detail:
                        picks.append(detail)
                    if len([p for p in picks if p.get("vector")]) >= a.per_taxon * 2:
                        break
                json.dump(picks, open(cache_path, "w"), ensure_ascii=False)

            taken = 0
            for d in picks:
                if taken >= a.per_taxon:
                    break
                lic = LICENSES.get(d["license"]) or (SHAREALIKE.get(d["license"]) if a.allow_sharealike else None)
                if not lic:
                    skipped[f"license {d['license'].rsplit('/', 2)[-2] or 'unknown'}"] += 1
                    continue
                if not d["vector"]:
                    skipped["no vector file"] += 1
                    continue
                label = name
                key = re.sub(r"[^a-z0-9]+", "", label.lower())
                if key in seen_names or key in taken_labels:
                    skipped["already in the library"] += 1
                    continue
                seen_names.add(key)

                iid = "phylopic-" + slug(label)
                n = 1
                while iid in used_ids:
                    n += 1
                    iid = f"phylopic-{slug(label)}-{n}"
                used_ids.add(iid)
                path = os.path.join(out_dir, iid + ".svg")
                if os.path.exists(path) and not a.refresh and not a.dry_run:
                    svg = open(path, encoding="utf-8").read()
                else:
                    try:
                        req = urllib.request.Request(d["vector"], headers={"User-Agent": UA})
                        with urllib.request.urlopen(req, timeout=40) as r:
                            raw = r.read().decode("utf-8", "ignore")
                        time.sleep(a.delay)
                    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError):
                        skipped["vector not downloadable"] += 1
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

                taken += 1
                rows.append(
                    {
                        "id": iid,
                        "label": label,
                        "category": category,
                        "author": d["contributor"] or "PhyloPic contributor",
                        "license": lic,
                        "licenseUrl": d["license"],
                        "uuid": d["uuid"],
                        "inline": "<style" not in svg.lower(),
                        "viewBox": [round(x, 3) for x in dims(svg)],
                    }
                )

    rows.sort(key=lambda r: (r["category"].lower(), r["label"].lower(), r["id"]))
    if not a.dry_run:
        path = os.path.join(a.app, "src", "icons.phylopic.json")
        old = {}
        if os.path.exists(path):
            for r in json.load(open(path))["icons"]:
                old[r["id"]] = r
        for r in rows:
            old.setdefault(r["id"], r)
        rows = [old[k] for k in sorted(old)]
        json.dump({"icons": rows}, open(path, "w"), ensure_ascii=False, separators=(",", ":"))

        if not a.taxa:
            keep = {r["id"] + ".svg" for r in rows}
            for f in os.listdir(out_dir):
                if f.startswith("phylopic-") and f not in keep:
                    os.remove(os.path.join(out_dir, f))

    print(f"{len(rows)} silhouettes from PhyloPic" + (" (dry run, nothing written)" if a.dry_run else ""))
    print("categories:", dict(collections.Counter(r["category"] for r in rows)))
    print("skipped:", dict(skipped.most_common()))
    print("licenses:", dict(collections.Counter(r["license"] for r in rows)))


if __name__ == "__main__":
    sys.exit(main())