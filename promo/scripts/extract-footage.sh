#!/usr/bin/env bash
# Cuts the screen-recording clips used by the promo out of the three raw
# KRONOS recordings, crops away the letterbox bars (the UI lives in a
# 1920x914 band starting at y=83) and re-encodes them with short GOPs so
# Remotion can seek frame-accurately.
#
# Usage: scripts/extract-footage.sh <part1.mp4> <part2.mp4> <part3.mp4>
#   part1 = first recording  (order history → MU → global map → SPX candles)
#   part2 = second recording (NAS100 → UK100 → MU timeframes → positions)
#   part3 = third recording  (portfolio map → geopolitical → macro dashboard)
set -euo pipefail

P1="$1"; P2="$2"; P3="$3"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/footage"
mkdir -p "$OUT"

cut() { # <src> <start> <duration> <name>
  ffmpeg -v error -y -ss "$2" -t "$3" -i "$1" \
    -vf "crop=1920:914:0:83,setsar=1" -an \
    -c:v libx264 -preset slow -crf 12 -pix_fmt yuv420p -g 15 -bf 0 \
    -movflags +faststart "$OUT/$4.mp4"
  echo "  $4.mp4"
}

echo "Extracting footage into $OUT"
cut "$P1" 23.80 4.20 terminal-candles    # SPX500: LINE → CANDLES toggle at ~25.7s
cut "$P1"  4.80 7.00 terminal-order      # MU: MARKET → LIMIT → STOP ticket
cut "$P2" 29.40 3.60 terminal-positions  # positions panel maximized
cut "$P2"  0.00 5.20 terminal-nas        # NAS100 live chart
cut "$P2" 14.40 14.6 terminal-mu         # MU chart range switching
cut "$P1" 14.40 4.20 map-us              # global map: hover + click United States
cut "$P3"  0.00 5.60 map-portfolio       # portfolio mode on the map
cut "$P3"  5.80 8.00 map-geo             # geopolitical layer
cut "$P3" 14.70 5.80 macro-top           # macro dashboard: barometer, curve, VIX
cut "$P3" 20.50 8.50 macro-rrg           # sector rotation + correlations
cut "$P3" 31.50 3.50 macro-corr          # correlations + economic indicators
