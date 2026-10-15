#!/bin/sh
# Copy the clock-face skills and design prompts from their working projects into
# this repo. Rendered output (out/) is skipped: tools/render.mjs regenerates it.
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

if [ "$1" = "--push" ]; then
  git add -A skills prompts
  if git diff --cached --quiet; then
    echo "Nothing changed."
  else
    git commit -m "Sync skills and designs $(date +%Y-%m-%d)"
    git push
  fi
fi
