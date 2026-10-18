"""Checks that every English UI string passed to t() has a Spanish translation, and that placeholders match."""
import json, re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / 'src'
es_src = (root / 'es.ts').read_text()
es = {}
for m in re.finditer(r"^\s*(?:'((?:[^'\\]|\\.)*)'|([A-Za-z]+)):\s*'((?:[^'\\]|\\.)*)',?\s*$", es_src, re.M):
    k = (m.group(1) or m.group(2)).replace("\\'", "'").replace('\\n', '\n')
    es[k] = m.group(3).replace("\\'", "'").replace('\\n', '\n')
keys = set()
for f in root.glob('*.ts*'):
    if f.name in ('es.ts', 'i18n.ts'): continue
    txt = f.read_text()
    for m in re.finditer(r"\bt\(\s*'((?:[^'\\]|\\.)*)'", txt):
        keys.add(m.group(1).replace("\\'", "'").replace('\\n', '\n'))
    for m in re.finditer(r"\bt\(\s*\w+\s*\?\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'", txt):
        keys.update([m.group(1), m.group(2)])
    # keys held in data tables
    for m in re.finditer(r"label: '((?:[^'\\]|\\.)*)'", txt): keys.add(m.group(1))
    for m in re.finditer(r"^\s*\['([A-Z][a-z]+)', '", txt, re.M): keys.add(m.group(1))
cats = {i['category'] for i in json.loads((root / 'icons.json').read_text())['icons']}
for extra in ('icons.bioart.json', 'icons.commons.json', 'icons.phylopic.json', 'icons.healthicons.json'):
    other = root / extra
    if other.exists():
        cats |= {i['category'] for i in json.loads(other.read_text())['icons']}
keys |= cats
missing = sorted(k for k in keys if k not in es)
ph = lambda s: sorted(re.findall(r'\{\w+\}', s))
bad = sorted(k for k in keys if k in es and ph(k) != ph(es[k]))
unused = sorted(k for k in es if k not in keys)
print(f'{len(keys)} keys used, {len(es)} translated')
print('MISSING:', *missing, sep='\n  ') if missing else print('no missing keys')
print('PLACEHOLDER MISMATCH:', *bad, sep='\n  ') if bad else print('placeholders match')
print('UNUSED (informational):', *unused, sep='\n  ') if unused else None
sys.exit(1 if missing or bad else 0)
