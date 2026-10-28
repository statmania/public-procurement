#!/usr/bin/env python3
"""Remove decorative images (clipart, stock photos, icons) from a compiled qmd.

Usage: strip_decorative.py FILE.qmd

An image is kept only if it looks like content: mostly white (a page, form or
table) and either wide (a screenshot) or very white (a text page). Everything
else (small icons, dark or full-colour pictures, square clipart) is dropped,
as are the "[image not included: ...]" placeholders. Image links are resolved
relative to the file. The .md files and image folders are not touched.
"""
import re
import sys
from pathlib import Path
from urllib.parse import unquote

from PIL import Image

qmd = Path(sys.argv[1])
img_re = re.compile(r"^!\[\]\(([^)]+)\)(\{[^}]*\})?\s*$")
ph_re = re.compile(r"^\*\[image not included: .*\]\*\s*$")


def white_fraction(im):
    im = im.convert("RGBA")
    im.thumbnail((100, 100))
    px = list(im.getdata())
    return sum(1 for r, g, b, a in px if a < 20 or (r > 235 and g > 235 and b > 235)) / len(px)


def is_content(path):
    try:
        im = Image.open(path)
        w, h = im.size
        if max(w, h) <= 300:
            return False
        wf = white_fraction(im)
    except Exception:
        return False
    return wf >= 0.5 and (w / h >= 1.25 or wf >= 0.85)


kept = dropped = 0
out = []
for line in qmd.read_text(encoding="utf-8").split("\n"):
    m = img_re.match(line)
    if m:
        if is_content(qmd.parent / unquote(m.group(1))):
            kept += 1
            out.append(line)
        else:
            dropped += 1
        continue
    if ph_re.match(line):
        dropped += 1
        continue
    out.append(line)
text = re.sub(r"\n{3,}", "\n\n", "\n".join(out))
qmd.write_text(text, encoding="utf-8")
print(f"kept {kept} images, dropped {dropped}")
