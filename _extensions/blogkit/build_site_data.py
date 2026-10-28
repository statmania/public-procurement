#!/usr/bin/env python3
"""Blogkit pre-render hook.

Add to _quarto.yml:

    project:
      pre-render: _extensions/blogkit/build_site_data.py

On every `quarto render` (the whole project or a single post) it

  * reads the front matter of every post (title, description, date, tags,
    categories, author, draft),
  * reads authors.yml,
  * writes <output-dir>/blogkit-data.js and copies blogkit.js next to it
    (the browser script that builds the archive, tag cloud, related posts,
    author cards, tags page and author pages from that data),
  * (re)writes authors/<slug>.qmd for every author in authors.yml, and
  * creates tags.qmd and categories.qmd if the project does not have them yet.

Nothing about other posts is baked into rendered pages, so rendering just the
new post updates the archive, tags, related posts and author pages everywhere.

Options go in _quarto.yml under a top-level `blogkit:` key (all optional):

    blogkit:
      posts-dir: posts          # where posts live (also supports posts/<slug>/index.qmd)
      authors-file: authors.yml
      per-page: 10              # pagination on tag and author pages
      related: 5                # related posts under each post
      hero-topics: 5            # topic chips in the homepage hero tools
      hero-tagline: "..."        # one line shown above the hero stats
      labels: {archive: Archiv, tags: Schlagworte}   # translate/override UI text

Requires Python 3 and PyYAML (pip install pyyaml).
"""
import html
import json
import os
import re
import shutil
import sys
from datetime import date, datetime
from pathlib import Path

try:
    import yaml
except ImportError:                                    # pragma: no cover
    sys.exit("blogkit: PyYAML is required (pip install pyyaml)")

HERE = Path(__file__).resolve().parent                  # _extensions/blogkit
ROOT = Path(os.environ.get("QUARTO_PROJECT_DIR") or Path.cwd()).resolve()


def load_yaml(path):
    return (yaml.safe_load(path.read_text(encoding="utf-8")) or {}) if path.exists() else {}


def project_config():
    for name in ("_quarto.yml", "_quarto.yaml"):
        if (ROOT / name).exists():
            return load_yaml(ROOT / name)
    return {}


CONFIG = project_config()
OPTS = CONFIG.get("blogkit") or {}
POSTS_DIR = ROOT / str(OPTS.get("posts-dir", "posts"))
AUTHORS_FILE = ROOT / str(OPTS.get("authors-file", "authors.yml"))


def output_dir():
    env = os.environ.get("QUARTO_PROJECT_OUTPUT_DIR")
    if env:
        return Path(env) if Path(env).is_absolute() else ROOT / env
    return ROOT / str((CONFIG.get("project") or {}).get("output-dir", "_site"))


def front_matter(path):
    m = re.match(r"^---\s*\n(.*?)\n---\s*(\n|$)", path.read_text(encoding="utf-8"), re.S)
    return (yaml.safe_load(m.group(1)) or {}) if m else {}


def as_date(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    try:
        return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def as_list(v, lower=False):
    if isinstance(v, str):
        v = [x.strip() for x in v.split(",")]
    out = [str(x).strip() for x in (v or []) if str(x).strip()]
    return [x.lower() for x in out] if lower else out


def post_files():
    """posts/x.qmd, posts/x.md and posts/x/index.qmd (Quarto's default blog layout)."""
    found = list(POSTS_DIR.glob("*.qmd")) + list(POSTS_DIR.glob("*.md")) + list(POSTS_DIR.glob("*/index.qmd"))
    return sorted(p for p in found if not p.name.startswith("_") and p.name.lower() != "readme.md")


def post_image(path, image):
    """The post's front-matter image as a path relative to the site root (or an absolute URL)."""
    if not image:
        return ""
    image = str(image).strip()
    if re.match(r"^(https?:)?//", image):
        return image
    target = Path(os.path.normpath(path.parent / image))
    try:
        return target.relative_to(ROOT).as_posix()
    except ValueError:
        return ""


def adaptive_image(path, image):
    """True when the cover is a PNG made from a same-named SVG (svg2og.py): a dark generated
    figure that blogkit.js may invert in the light theme. Photos and real plots stay untouched."""
    if not image or re.match(r"^(https?:)?//", str(image).strip()):
        return False
    target = Path(os.path.normpath(path.parent / str(image).strip()))
    return target.suffix.lower() == ".png" and target.with_suffix(".svg").exists()


def load_posts():
    posts = []
    for path in post_files():
        fm = front_matter(path)
        d = as_date(fm.get("date"))
        if fm.get("draft"):
            continue
        if not fm.get("title") or d is None:
            print(f"blogkit: skipping {path.relative_to(ROOT)} (needs title and date)", file=sys.stderr)
            continue
        rel = path.relative_to(ROOT).with_suffix(".html").as_posix()
        posts.append({
            "href": rel,
            "title": str(fm["title"]),
            "desc": " ".join(str(fm.get("description") or "").split()),
            "date": d.isoformat(),
            "tags": as_list(fm.get("tags"), lower=True),
            "cats": as_list(fm.get("categories")),
            "author": str(fm.get("author") or "").strip(),
            "image": post_image(path, fm.get("image")),
        })
        if adaptive_image(path, fm.get("image")):
            posts[-1]["adapt"] = True
    posts.sort(key=lambda p: p["date"], reverse=True)
    return posts


def author_stub(slug, a):
    links = "".join(
        f'<a class="bk-tag" href="{html.escape(l["href"])}" rel="noopener">{html.escape(l["text"])}</a>'
        for l in a.get("links") or [])
    img = (f'<img class="bk-author-img" src="../{html.escape(str(a["image"]))}" alt="{html.escape(a["name"])}">'
           if a.get("image") else "")
    bio = html.escape(" ".join(str(a.get("bio") or "").split()))
    tagline = " ".join(str(a.get("tagline") or "").replace('"', "'").split())
    return f"""---
title: "{a["name"]}"
description: "{tagline}"
page-layout: article
toc: false
---

<!-- GENERATED by blogkit from authors.yml; do not edit. -->
```{{=html}}
<div class="bk-author-head">
{img}
<div><p class="bk-author-bio">{bio}</p>
<div class="bk-tag-cloud bk-tag-cloud-all">{links}</div></div>
</div>
<div id="bk-author-root" data-slug="{slug}"></div>
```
"""


FACET_QMD = """---
title: "{title}"
description: "{description}"
page-layout: article
toc: false
---

::: {{.column-margin}}
```{{=html}}
<div id="bk-{short}-side" class="bk-widget bk-tags bk-tags-side"></div>
```
:::

```{{=html}}
<div id="bk-{short}-page"></div>
```
"""
FACET_PAGES = {
    "tags.qmd": dict(title="Posts by Tag", description="Browse every post by tag.", short="tags"),
    "categories.qmd": dict(title="Posts by Category", description="Browse every post by category.", short="cats"),
}


HERO_LABELS = {"searchPosts": "Search posts", "moreTopics": "more", "posts": "posts",
               "topics": "topics", "updated": "updated", "rss": "RSS"}
HERO_ICONS = {
    "posts": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    "topics": '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    "updated": '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    "rss": '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def hero_tools_html(posts):
    """Static markup for the homepage hero tools (search, topic chips, stats), written to
    _bk-hero-tools.html so index.qmd can {{< include >}} it. Present in the HTML from the first
    paint, so nothing pops in; blogkit.js only attaches the search behaviour. Without the
    include, blogkit.js builds the same markup in the browser."""
    labels = {**HERO_LABELS, **(OPTS.get("labels") or {})}
    esc = lambda s: html.escape(str(s), quote=True)
    counts = {}
    for p in posts:
        for tag in set(p["tags"]):
            counts[tag] = counts.get(tag, 0) + 1
    top = sorted(counts, key=lambda k: (-counts[k], k))[: int(OPTS.get("hero-topics") or 5)]
    chips = "".join(f'<a class="bk-tag" href="tags.html#tag={esc(k)}">{esc(k)}</a>' for k in top)
    chips += f'<a class="bk-tag bk-tag-more" href="tags.html">{esc(labels["moreTopics"])} \u203a</a>'
    icon = lambda k: ('<svg class="bk-icon" viewBox="0 0 24 24" aria-hidden="true">' + HERO_ICONS[k] + '</svg>')
    stats = [("posts", f'{len(posts)} {labels["posts"]}'), ("topics", f'{len(counts)} {labels["topics"]}')]
    if posts:
        d = posts[0]["date"]
        stats.append(("updated", f'{labels["updated"]} {MONTHS[int(d[5:7]) - 1]} {d[:4]}'))
    tagline = " ".join(str(OPTS.get("hero-tagline") or "").split())
    tag_html = f'<span class="bk-hero-tagline">{esc(tagline)}</span>' if tagline else ""
    stats_html = "".join(f'<span class="bk-stat">{icon(k)}{esc(txt)}</span>' for k, txt in stats)
    stats_html += f'<a class="bk-stat bk-hero-rss" href="index.xml">{icon("rss")}{esc(labels["rss"])}</a>'
    return (f'<!-- GENERATED by blogkit on every render; do not edit. -->\n'
            f'<div id="bk-hero-tools" data-tagline="{esc(tagline)}">'
            f'<form class="bk-hero-search" role="search"><input type="search" placeholder="{esc(labels["searchPosts"])}" '
            f'aria-label="{esc(labels["searchPosts"])}"></form>'
            f'<div class="bk-hero-chips">{chips}</div>'
            f'<p class="bk-hero-stats">{tag_html}{stats_html}</p></div>\n')


def main():
    posts = load_posts()
    authors = load_yaml(AUTHORS_FILE)
    config = {k: v for k, v in OPTS.items() if k in ("per-page", "related", "labels", "hero-topics")}
    config = {"perPage": config.get("per-page"), "related": config.get("related"),
              "labels": config.get("labels"), "heroTopics": config.get("hero-topics")}
    config = {k: v for k, v in config.items() if v}
    out = output_dir()
    out.mkdir(parents=True, exist_ok=True)

    payload = json.dumps({"posts": posts, "authors": authors, "config": config},
                         ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    # a .js file (not .json) so pages also work when opened straight from disk
    (out / "blogkit-data.js").write_text("window.BLOGKIT_DATA=" + payload + ";\n", encoding="utf-8")
    shutil.copyfile(HERE / "blogkit.js", out / "blogkit.js")

    # Quarto resolves {{< include >}} before this hook runs, so a changed hero file is one render
    # late: leave a flag for repair_index.py, which then renders index.qmd once more.
    hero_file, hero_new = ROOT / "_bk-hero-tools.html", hero_tools_html(posts)
    if not hero_file.exists() or hero_file.read_text(encoding="utf-8") != hero_new:
        hero_file.write_text(hero_new, encoding="utf-8")
        (ROOT / ".quarto").mkdir(exist_ok=True)
        (ROOT / ".quarto" / "bk-hero-stale").touch()

    if authors:
        (ROOT / "authors").mkdir(exist_ok=True)
        for slug, a in authors.items():
            (ROOT / "authors" / f"{slug}.qmd").write_text(author_stub(slug, a), encoding="utf-8")
    for name, vals in FACET_PAGES.items():
        if not (ROOT / name).exists():
            (ROOT / name).write_text(FACET_QMD.format(**vals), encoding="utf-8")

    print(f"blogkit: {len(posts)} posts, {len(authors)} authors -> {out / 'blogkit-data.js'}")


if __name__ == "__main__":
    main()
