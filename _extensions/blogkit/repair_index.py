#!/usr/bin/env python3
"""Blogkit post-render hook: repair the homepage after a single-post render.

Quarto refreshes the homepage listing whenever one post is rendered, but it re-renders
index.qmd without the extension's format (light theme only, no CSS or scripts). This hook
renders index.qmd again, itself, so `quarto render posts/x.qmd` leaves a correct homepage.

Add to _quarto.yml:

    project:
      post-render: _extensions/blogkit/repair_index.py

It also renders index.qmd once more when the generated hero file changed. It does nothing for a
full render otherwise, or when only index.qmd was rendered.
"""
import os
import subprocess
import sys
from pathlib import Path

if os.environ.get("BLOGKIT_REPAIRING"):
    sys.exit(0)

root = Path(os.environ.get("QUARTO_PROJECT_DIR") or Path.cwd()).resolve()


def rerender(why):
    print(f"blogkit: re-rendering index.qmd ({why})")
    subprocess.run(["quarto", "render", "index.qmd"], cwd=root, check=False,
                   env={**os.environ, "BLOGKIT_REPAIRING": "1"})


# _bk-hero-tools.html changed during this render, after Quarto had already included the old one
stale = root / ".quarto" / "bk-hero-stale"
if stale.exists():
    stale.unlink()
    rerender("homepage hero tools changed")
    sys.exit(0)

if os.environ.get("QUARTO_PROJECT_RENDER_ALL"):
    sys.exit(0)
out = Path(os.environ.get("QUARTO_PROJECT_OUTPUT_DIR") or "_site")
out = out if out.is_absolute() else root / out
rendered = {Path(f if Path(f).is_absolute() else root / f).resolve()
            for f in os.environ.get("QUARTO_PROJECT_OUTPUT_FILES", "").split("\n") if f.strip()}
# The listing refresh counts as a rendered file, so only skip when index.html is all there is.
if not (root / "index.qmd").exists() or rendered <= {(out / "index.html").resolve()}:
    sys.exit(0)

rerender("Quarto's listing refresh drops the extension format")
