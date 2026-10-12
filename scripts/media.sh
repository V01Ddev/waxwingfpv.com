#!/usr/bin/env bash
#
# Media pipeline: Drive masters -> web renditions.
#
#   scripts/media.sh            fetch (if needed) and encode everything
#   scripts/media.sh candidates only cut the hero loop candidates
#
# Masters are pulled straight from the public Drive folder, so nothing has to
# be downloaded or re-uploaded by hand. They land in .media-cache/ (gitignored)
# and only the encoded output is committed.
#
# Re-run this whenever a master changes. It is idempotent.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="$ROOT/.media-cache"
OUT="$ROOT/public/video"
CAND="$ROOT/.checkpoints/hero-candidates"

# file id : output basename
MASTERS=(
  "1sKwOny4tL4kgTWoxaHDMMatNS397YSiZ:nish-16-9"
  "1PVMvlJ0lLeLfXyZU3UmcZ4xnncuJYXze:nish-9-16"
  "1ZapY6fZFJIFXid_fOvrQ_Zf0KD2XOeXs:milat-reel"
)

fetch() {
  mkdir -p "$CACHE"
  for entry in "${MASTERS[@]}"; do
    id="${entry%%:*}"; name="${entry##*:}"
    if [ -s "$CACHE/$name.mp4" ]; then
      echo "  cached  $name.mp4"
      continue
    fi
    echo "  fetch   $name.mp4"
    curl -sL -A "Mozilla/5.0" \
      "https://drive.google.com/uc?export=download&id=$id" \
      -o "$CACHE/$name.mp4"
  done
}

# --- portfolio renditions ---------------------------------------------------
# ONE rendition, at 720p-class, and that is a deliberate size decision:
#
#   * The lightbox caps its media at 72rem (1152px), so a 1280-wide file is
#     never upscaled on any screen a visitor will use.
#   * Shipping 1080p as well measured out at ~84MB of video in the repo for a
#     difference nobody can see at that display size.
#   * This footage is dark and detailed and does not compress cheaply: 1080p
#     CRF 23 projected to ~31MB for a single 58-second piece. A denoise pass
#     was measured and rejected — 21.7MB -> 20.6MB, not worth touching the
#     grade for.
#
# H.264 only. VP9 would save roughly a quarter of the bytes and cost a second
# copy of every file plus double the encode time; H.264 High decodes in
# hardware on essentially every phone. The hero keeps a VP9 sibling because it
# is small and loads on every visit.
#
# If a 1080p rendition is ever wanted, raise the scale and lower the CRF here;
# nothing in the components needs to change.
encode_portfolio() {
  mkdir -p "$OUT"

  enc() { # <source> <scale> <out>
    echo "  $(basename "$3")"
    ffmpeg -v error -y -i "$1" -map_metadata -1 \
      -vf "scale=$2:flags=lanczos,fps=30" \
      -c:v libx264 -profile:v high -crf 26 -preset medium \
      -pix_fmt yuv420p -movflags +faststart -g 60 \
      -c:a aac -b:a 112k "$3"
  }

  enc "$CACHE/nish-16-9.mp4"  1280:720  "$OUT/the-nish-16-9.mp4"
  enc "$CACHE/nish-9-16.mp4"  720:1280  "$OUT/the-nish-9-16.mp4"
  enc "$CACHE/milat-reel.mp4" 720:1280  "$OUT/milat-9-16.mp4"
}

# --- posters ----------------------------------------------------------------
# Frames chosen from the footage, at each cut's true aspect. No pillarboxed
# YouTube thumbnails anywhere in this project.
posters() {
  ffmpeg -v error -y -ss 33 -i "$CACHE/nish-16-9.mp4" -frames:v 1 \
    -vf "scale=1280:720:flags=lanczos" -q:v 4 "$OUT/the-nish-16-9.jpg"
  ffmpeg -v error -y -ss 7 -i "$CACHE/nish-9-16.mp4" -frames:v 1 \
    -vf "scale=720:1280:flags=lanczos" -q:v 4 "$OUT/the-nish-9-16.jpg"
  ffmpeg -v error -y -ss 25 -i "$CACHE/milat-reel.mp4" -frames:v 1 \
    -vf "scale=720:1280:flags=lanczos" -q:v 4 "$OUT/milat-9-16.jpg"
}

# --- hero loop candidates ---------------------------------------------------
# The masters are dim (mean luma ~20-26%), and the hero sits behind a scrim,
# so a straight cut reads as a black rectangle. A modest lift is applied for
# the loop only — the portfolio plays back as graded.
lift="eq=brightness=0.05:contrast=1.06:saturation=1.04"

candidates() {
  mkdir -p "$CAND"
  # landscape: four windows across the take
  i=0
  for ss in 0 14 28 47; do
    i=$((i+1))
    ffmpeg -v error -y -ss "$ss" -t 10 -i "$CACHE/nish-16-9.mp4" -an -map_metadata -1 \
      -vf "$lift,scale=1280:720:flags=lanczos,fps=30" \
      -c:v libx264 -crf 26 -preset veryfast -pix_fmt yuv420p -movflags +faststart \
      "$CAND/landscape-$i-t${ss}s.mp4"
  done
  # portrait: three windows, including the exterior signage opening
  i=0
  for ss in 0 20 44; do
    i=$((i+1))
    ffmpeg -v error -y -ss "$ss" -t 8 -i "$CACHE/nish-9-16.mp4" -an -map_metadata -1 \
      -vf "$lift,scale=608:1080:flags=lanczos,fps=30" \
      -c:v libx264 -crf 26 -preset veryfast -pix_fmt yuv420p -movflags +faststart \
      "$CAND/portrait-$i-t${ss}s.mp4"
  done
}

case "${1:-all}" in
  candidates) fetch; candidates ;;
  *) fetch; encode_portfolio; posters; candidates ;;
esac

echo
echo "portfolio:"
du -h "$OUT"/*.mp4 "$OUT"/*.jpg 2>/dev/null | sed 's/^/  /'
echo "total: $(du -sh "$OUT" | cut -f1)"
