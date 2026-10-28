#!/usr/bin/env python3
"""Compile resources/*.md into resources/compiled.qmd (one PDF-ready document).

Usage: compile_resources.py [RES_DIR]   (default: resources)
Image links are kept relative to RES_DIR. WMF and GIF images cannot go into a PDF,
so they are replaced with a short placeholder line.
"""
import re
import sys
from pathlib import Path

res = Path(sys.argv[1] if len(sys.argv) > 1 else "resources")
head = """---
title: "PPM Training Slides: Reference Compilation"
subtitle: "Converted from the trainer-version PowerPoint decks"
toc: true
toc-depth: 1
number-sections: false
from: markdown-tex_math_dollars
format:
  pdf:
    pdf-engine: xelatex
    documentclass: article
    geometry: margin=2cm
    colorlinks: true
    fig-pos: H
---
"""
img = re.compile(r"!\[\]\(([^)]+)\)")


def fix(m):
    path = m.group(1)
    if path.lower().endswith((".wmf", ".emf", ".gif")):
        return f"*[image not included: {Path(path).name}]*"
    return f"![]({path}){{width=75%}}"


parts = [head]
for f in sorted(res.glob("*.md")):
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", f.read_text(encoding="utf-8"))
    parts.append("\n\\newpage\n\n" + img.sub(fix, text))
(res / "compiled.qmd").write_text("\n".join(parts), encoding="utf-8")
print(f"compiled {len(parts) - 1} decks")
