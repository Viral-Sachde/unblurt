#!/usr/bin/env bash
# Re-renders every creative in this folder with headless Chrome, then copies the
# ones the website uses into apps/web/assets.  Usage: brand/creatives/render.sh
set -euo pipefail
cd "$(dirname "$0")"

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
shot() { # url size out
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --virtual-time-budget=4000 --force-device-scale-factor=2 \
    --window-size="$2" --screenshot="$3" "file://$PWD/$1" 2>/dev/null
  echo "  $3"
}

echo "product shots"
shot "product.html#message" 1200,720 product-message.png    # 5:3, site hero
shot "product.html?tall#message" 640,800 product-message-tall.png  # portrait, site hero on phones
for s in email rephrase fix reply plate; do
  shot "product.html#$s" 1200,840 "product-$s.png"          # 10:7, showreel cards
done

echo "banner"
shot banner.html 1280,640 banner.png


cp product-*.png ../../apps/web/assets/
cp banner.png ../../apps/web/assets/og.png
echo "copied to apps/web/assets"
