#!/bin/sh
# Copy the clock-face skills, design prompts and the gallery from their working
# projects into this repo, and build the gallery's generated files from the
# copied skills. Rendered output (out/) is skipped: tools/render.mjs regenerates it.
# Usage: ./sync.sh          copy only
#        ./sync.sh --push   copy, commit any changes and push
set -e
cd "$(dirname "$0")"

SRC=/Users/bilibili/coding
EXCLUDES="--exclude=out/ --exclude=.DS_Store --exclude=node_modules/"

for s in 1602-clock oled-clock ws2812-clock; do
  rsync -a --delete $EXCLUDES "$SRC/1602display/.claude/skills/$s/" "skills/$s/"
done
rsync -a --delete $EXCLUDES "$SRC/lcd_clock/.claude/skills/tft-clock/" "skills/tft-clock/"

rsync -a --delete $EXCLUDES "$SRC/1602display/prompts/" "prompts/1602display/"
rsync -a --delete $EXCLUDES "$SRC/lcd_clock/prompts/" "prompts/lcd_clock/"

# The gallery: its source, then manifest.json and lazy/ built from skills/ here
# (excluded from the copy, so --delete leaves them for the build to rewrite).
rsync -a --delete $EXCLUDES --exclude=.cache/ --exclude=/manifest.json --exclude=/lazy/ "$SRC/clock-gallery/" "gallery/"
node gallery/tools/build.mjs

if [ "$1" = "--push" ]; then
  git add -A skills prompts gallery
  if git diff --cached --quiet; then
    echo "Nothing changed."
  else
    git commit -m "Sync skills and designs $(date +%Y-%m-%d)"
    git push
  fi
fi
