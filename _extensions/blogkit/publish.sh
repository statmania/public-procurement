#!/usr/bin/env bash
# Render posts, commit the project, and push. Run from anywhere inside the project.
#
#   ./publish.sh posts/my-post.qmd        render one post, commit, push
#   ./publish.sh posts/a.qmd posts/b.qmd  several posts (one `quarto render` each)
#   ./publish.sh --all                    full render (after theme/config/JS changes)
#   ./publish.sh                          no render: refresh data, commit, push
#
#   -m "message"   commit message (default: "Blog: update <files>")
#   --no-push      render and commit, but do not push
#
# Commits only the Quarto project folder (sources and the built output-dir).
set -euo pipefail

msg="" push=1 all=0 files=()
while [ $# -gt 0 ]; do
  case "$1" in
    -m)        msg="${2:?-m needs a message}"; shift 2 ;;
    --no-push) push=0; shift ;;
    --all)     all=1; shift ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    -*)        echo "Unknown option: $1" >&2; exit 2 ;;
    *)         files+=("$1"); shift ;;
  esac
done

command -v quarto >/dev/null || { echo "quarto not found" >&2; exit 1; }
root="$PWD"
while [ ! -f "$root/_quarto.yml" ] && [ "$root" != "/" ]; do root="$(dirname "$root")"; done
[ -f "$root/_quarto.yml" ] || { echo "No _quarto.yml found above $PWD" >&2; exit 1; }
cd "$root"

if [ "$all" -eq 1 ]; then
  echo "==> Full render"
  quarto render
elif [ "${#files[@]}" -gt 0 ]; then
  for f in "${files[@]}"; do
    [ -f "$f" ] || { echo "No such file: $f" >&2; exit 1; }
    echo "==> Rendering $f"
    quarto render "$f"      # quarto takes one file per call
  done
else
  echo "==> Refreshing site data"
  python3 _extensions/blogkit/build_site_data.py
fi

git add -A -- .
if git diff --cached --quiet; then
  echo "Nothing to commit."
  exit 0
fi

if [ -z "$msg" ]; then
  if [ "$all" -eq 1 ]; then msg="Blog: full rebuild"
  elif [ "${#files[@]}" -gt 0 ]; then
    names=""
    for f in "${files[@]}"; do b="$(basename "$f")"; names="${names:+$names, }${b%.*}"; done
    msg="Blog: update $names"
  else msg="Blog: update"
  fi
fi

git commit -q -m "$msg"
echo "==> Committed: $msg"

if [ "$push" -eq 1 ]; then
  git pull --rebase --autostash -q
  git push
  echo "==> Pushed."
else
  echo "==> Not pushed (--no-push)."
fi
