#!/usr/bin/env python3
"""Clean and restructure the compiled slide text in a qmd.

Usage: clean_ppm.py IN.qmd OUT.qmd

- drops title slides, the inauguration deck, participant guidelines, course
  overviews, thank-you slides and page/module/footer lines
- turns each slide into a `##` section named by its title; consecutive slides
  with the same title (e.g. "(Contd.)") are merged into one section
- normalises bullets and nesting, turns short label lines into bold labels,
  and shows PPR / PPA / Rule citations as italic reference lines
"""
import re
import sys
from pathlib import Path

DROP_DECKS = ("M1.00",)
DROP_TITLES = re.compile(
    r"^(guidelines? for the participants?|course at a glance|training objectives?|"
    r"thank you.*|we wish you.*|tea break|lunch break|break|any questions\??|questions\??)$", re.I)
NOISE_LINE = re.compile(
    r"^(\d{1,3}|module \d+|m\d\.\d+\w*|basic training on|training on|public procurement management|"
    r"basic public procurement management)$", re.I)
REF_LINE = re.compile(r"^\(?((ppr|ppa|rules?)[\s\-–]*(\d.*|20\d\d.*)?|sections?[\s\-–]*\d.*)\)?$", re.I)
ACRONYMS = {"PCC", "GCC", "ITT", "TDS", "NCT", "ICT", "PPR", "PPA", "RFQ", "STD", "OTM", "LTM", "DPM", "TOR",
            "EOI", "IPS", "BPPA", "PE", "TEC", "NOA", "DOFP", "OCE", "SLT", "APP", "SRFP", "RFP", "QCBS",
            "LCS", "SFB", "SSS", "CFCCO", "PG3", "PG3A", "PW3", "PPS3", "E-GP", "II", "III", "IV", "O&M", "SPP"}
SMALL = {"and", "of", "the", "for", "in", "on", "to", "a", "an", "or", "by", "with", "at", "vs"}
BULLET_GLYPH = re.compile(r"^[\s•●○◦▪■□§Ø➢➤►–—·o]+(?=\S)")


def clean_title(t):
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"\(?\s*\bcont(?:d|inued)?\b\.*\s*\)?", "", t, flags=re.I).strip(" :.-–")
    t = re.sub(r"\s+", " ", t)
    if t.isupper():
        words = []
        for i, w in enumerate(t.split()):
            core = re.sub(r"[^\w&\-]", "", w).upper()
            if core in ACRONYMS or re.match(r"^\(.*\)$", w):
                words.append(w)
            elif i and w.lower() in SMALL:
                words.append(w.lower())
            else:
                words.append(w.capitalize())
        t = " ".join(words)
    return t


def frame_kind(lines):
    s = lines[0].lstrip()
    if s.startswith("!["):
        return "image"
    if s.startswith("|"):
        return "table"
    if s.startswith(">"):
        return "note"
    return "bullets" if all(re.match(r"\s*- ", l) for l in lines) else "other"


def parse_bullets(lines):
    items = []
    for l in lines:
        m = re.match(r"(\s*)- (.*)", l)
        indent, text = len(m.group(1)) // 2, m.group(2)
        text = BULLET_GLYPH.sub("", text) if BULLET_GLYPH.match(text) else text
        text = re.sub(r"\s+", " ", text).strip()
        if text and re.search(r"\w", text) and not NOISE_LINE.match(text):
            items.append([indent, text])
    return items


def is_label(text):
    return text.endswith(":") or (text.isupper() and len(text) > 3)


def render_items(items):
    if not items:
        return []
    base = min(i for i, _ in items)
    out, prev = [], 0
    for lvl, text in items:
        lvl = min(max(lvl - base, 0), prev + 1, 3)
        out.append("  " * lvl + "- " + text)
        prev = lvl
    return out


def slide_sections(slide_lines):
    """Return (title, body_lines) for one slide, or None to drop it."""
    frames, cur = [], []
    for l in slide_lines + [""]:
        if l.strip():
            cur.append(l)
        elif cur:
            frames.append(cur)
            cur = []
    if not frames:
        return None
    title, body, i = None, [], 0
    if frame_kind(frames[0]) == "bullets":
        items = parse_bullets(frames[0])
        if items:
            title = clean_title(items[0][1])
            if len(title.split()) > 12 or title.endswith((",", ";")):
                title = None  # a sentence, not a title: keep it as a bullet
                frames[0] = [("  " * it[0]) + "- " + it[1] for it in items]
            else:
                frames[0] = [("  " * it[0]) + "- " + it[1] for it in items[1:]]
            if not frames[0]:
                frames = frames[1:]
        else:
            frames = frames[1:]
    if title and DROP_TITLES.match(title):
        return None
    refs = []
    for idx, fr in enumerate(frames):
        kind = frame_kind(fr)
        if kind in ("image", "table"):
            body += fr + [""]
        elif kind == "note":
            continue
        elif kind == "bullets":
            items = parse_bullets(fr)
            if not items:
                continue
            if len(items) == 1 and REF_LINE.match(items[0][1]):
                refs.append(items[0][1].strip("() "))
                continue
            nxt = frames[idx + 1] if idx + 1 < len(frames) else None
            nxt_items = parse_bullets(nxt) if nxt and frame_kind(nxt) == "bullets" else []
            lone = items[0][1]
            short_head = (len(items) == 1 and len(nxt_items) >= 2 and len(lone.split()) <= 8
                          and not re.search(r"[.;,]$", lone))
            if len(items) == 1 and (is_label(lone) or short_head):
                body += [f"**{lone.rstrip(':').strip()}**", ""]
                continue
            if len(items) > 1 and items[0][0] == 0 and is_label(items[0][1]):
                body += [f"**{items[0][1].rstrip(':').strip()}**", ""]
                items = items[1:]
            body += render_items(items) + [""]
        else:
            body += fr + [""]
    if refs:
        body += [f"*Reference: {'; '.join(refs)}*", ""]
    return title, body


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    text = src.read_text(encoding="utf-8")
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", text)
    head, *decks = re.split(r"\n\\newpage\n\n", text)
    out = [head.rstrip()]
    for deck in decks:
        lines = deck.split("\n")
        deck_title = lines[0][2:].strip()
        if deck_title.startswith(DROP_DECKS):
            continue
        parts = re.split(r"(?m)^## Slide (\d+).*$", "\n".join(lines[1:]))
        meta = [l for l in parts[0].split("\n") if l.strip()]
        sections = []  # [title, body]
        for num, body in zip(parts[1::2], parts[2::2]):
            sl = body.split("\n")
            if int(num) == 1:
                continue
            res = slide_sections(sl)
            if not res:
                continue
            title, content = res
            if title is None:
                if not sections:
                    sections.append(["Overview", [], set()])
                sections[-1][1] += content
                continue
            if title.lower() == "session at a glance":
                title = "Session Coverage"
            if sections and sections[-1][0].lower() == title.lower():
                seen = sections[-1][2]
                content = [l for l in content if not (l.lstrip().startswith("- ") and len(l) > 14 and l.strip() in seen)]
                seen.update(l.strip() for l in content if l.lstrip().startswith("- "))
                sections[-1][1] += content
            else:
                sections.append([title, content, {l.strip() for l in content if l.lstrip().startswith("- ")}])
        out += ["", "\\newpage", "", f"# {deck_title}", ""] + [m for m in meta[:1]] + [""]
        for title, content, _ in sections:
            while content and not content[-1].strip():
                content.pop()
            if not any(c.strip() for c in content):
                continue
            out += [f"## {title}", ""] + content + [""]
    result = re.sub(r"\n{3,}", "\n\n", "\n".join(out)).rstrip() + "\n"
    result = re.sub(r"(?m)^\*\*(.+?)\*\*\n\n(?=\*\*|\n|\Z)", "", result)  # label with no content after it
    dst.write_text(result, encoding="utf-8")
    n = len(re.findall(r"(?m)^## ", result))
    print(f"{len(decks)} decks, {n} sections, {len(result.splitlines())} lines")


if __name__ == "__main__":
    main()
