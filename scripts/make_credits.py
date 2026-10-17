#!/usr/bin/env python3
"""Regenerate ICON_CREDITS.md from src/icons.json.   Usage: python3 scripts/make_credits.py ."""
import collections, json, sys

APP = sys.argv[1] if len(sys.argv) > 1 else "."
d = json.load(open(f"{APP}/src/icons.json"))
authors, icons = d["authors"], d["icons"]
LIC = {
    "cc0": ("CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"),
    "mit": ("MIT", "https://opensource.org/licenses/MIT"),
    "by3": ("CC BY 3.0", "https://creativecommons.org/licenses/by/3.0/"),
    "by4": ("CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"),
}
n_lic = collections.Counter(i["license"] for i in icons)
cats = len({i["category"] for i in icons})


def esc(s):
    return s.replace("|", "\\|")


out = [
    "# Icon credits",
    "",
    f"The {len(icons)} icons in `public/icons/` ({cats} categories) come from [Bioicons](https://bioicons.com) (github.com/duerrsimon/bioicons).",
    "Each one keeps its own license, listed below. Share-alike (CC BY-SA) and BSD icons were left out on purpose, as were",
    "brand logos and icons that embed raster images.",
    "",
    f"- **CC0 1.0** ({n_lic['cc0']} icons): public domain, no credit needed (still appreciated).",
    f"- **CC BY 3.0 / 4.0** ({n_lic['by3']} / {n_lic['by4']} icons): free to use and adapt, including commercially, if you credit the author,",
    "  link the license, and say if you changed the icon. Resizing, flipping and arranging icons in a figure is normal use;",
    '  recoloring or editing the artwork counts as a change, so write "adapted from".',
    f"- **MIT** ({n_lic['mit']} icons): keep the author's name and the license notice with the icon.",
    "- Many CC BY icons are from [Servier Medical Art](https://smart.servier.com). Servier asks that their images are not",
    "  marketed as a standalone image library, so keep this app a figure editor and not an icon pack.",
    "",
    "The app writes the right credit line for the icons used in a figure (Credits button, or under the exported image).",
    "",
    "| Icon | Category | Author | License | File |",
    "|---|---|---|---|---|",
]
for i in icons:
    a = i["author"]
    au = f"[{esc(a)}]({authors[a]})" if authors.get(a) else esc(a)
    name, url = LIC[i["license"]]
    out.append(f"| {esc(i['label'])} | {i['category']} | {au} | [{name}]({url}) | `public/icons/{i['id']}.svg` |")
open(f"{APP}/ICON_CREDITS.md", "w", encoding="utf-8").write("\n".join(out) + "\n")
print("wrote ICON_CREDITS.md with", len(icons), "icons")
