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

# --- kit sample clips -------------------------------------------------------
# These two sources are dropped in the project root by hand rather than fetched,
# because they are hundreds of megabytes each and Drive refuses to serve the
# large ones without an interactive confirmation. Both are gitignored.
#
# No audio on either: these demonstrate how an aircraft moves, they are not
# scored films — the portfolio carries the music. The lightbox autoplays, so an
# ambient track would arrive uninvited.
#
# 960x540, not 720p. These are shown at about 470px wide in the kit panel and
# never wider than the lightbox's 1152px stage, so 720p was buying detail the
# layout cannot display. At 720p CRF 24 the 21-second 5-inch clip came out at
# 29.8MB, more than the whole hero and every portfolio cut combined; this
# footage is fast freestyle motion and does not compress cheaply.
kit() {
  mkdir -p "$OUT"

  if [ -f "$ROOT/IAU_Studio.MP4" ]; then
    # Meteor75 Pro II, shot in the IAU studio space.
    # 3840x2880 is 4:3; the centre 16:9 band is 3840x2160, offset 360 down.
    echo "  kit-meteor75 (crop 4:3 -> 16:9, 40s from 1:50)"
    ffmpeg -v error -y -ss 110 -t 40 -i "$ROOT/IAU_Studio.MP4" -map_metadata -1 -an \
      -vf "crop=3840:2160:0:360,scale=960:540:flags=lanczos,setsar=1,fps=30" \
      -c:v libx264 -profile:v high -crf 27 -preset slow -pix_fmt yuv420p \
      -movflags +faststart -g 60 "$OUT/kit-meteor75.mp4"
    ffmpeg -v error -y -ss 112 -i "$ROOT/IAU_Studio.MP4" -frames:v 1 \
      -vf "crop=3840:2160:0:360,scale=960:540:flags=lanczos" -q:v 4 "$OUT/kit-meteor75.jpg"
  else
    echo "  kit-meteor75: skipped, IAU_Studio.MP4 not in the project root"
  fi

  if [ -f "$ROOT/5-inch-sample.mp4" ]; then
    # Custom 5-inch. Already 16:9 (2704x1520), so no crop.
    echo "  kit-5-inch"
    ffmpeg -v error -y -i "$ROOT/5-inch-sample.mp4" -map_metadata -1 -an \
      -vf "scale=960:540:flags=lanczos,setsar=1,fps=30" \
      -c:v libx264 -profile:v high -crf 27 -preset slow -pix_fmt yuv420p \
      -movflags +faststart -g 60 "$OUT/kit-5-inch.mp4"
    ffmpeg -v error -y -ss 2 -i "$ROOT/5-inch-sample.mp4" -frames:v 1 \
      -vf "scale=960:540:flags=lanczos,setsar=1" -q:v 4 "$OUT/kit-5-inch.jpg"
  else
    echo "  kit-5-inch: skipped, 5-inch-sample.mp4 not in the project root"
  fi
}

# --- hero loop --------------------------------------------------------------
# A three-shot montage: the opening, a mid-take interior pass, and the bright
# late passage. Combined from measured windows rather than one continuous
# glide, which costs bytes — three shots of motion and two hard cuts on the
# one element that autoplays for every visitor. It is affordable because the
# hero sits behind a heavy scrim (0.92 alpha at the bottom, 0.18 mid-frame),
# so the detail a higher bitrate would buy is not visible anyway. Hence 960px
# and a high CRF, where the portfolio gets 1280px and CRF 26.
#
# The lift is applied here and only here. The portfolio plays back as graded.
hero() {
  mkdir -p "$OUT"
  local lift="eq=brightness=0.05:contrast=1.06:saturation=1.04"

  echo "  hero landscape (3 shots)"
  ffmpeg -v error -y \
    -ss 0  -t 4 -i "$CACHE/nish-16-9.mp4" \
    -ss 28 -t 4 -i "$CACHE/nish-16-9.mp4" \
    -ss 47 -t 4 -i "$CACHE/nish-16-9.mp4" \
    -filter_complex "[0:v]$lift,scale=960:540:flags=lanczos,fps=30,setpts=PTS-STARTPTS[a];\
                     [1:v]$lift,scale=960:540:flags=lanczos,fps=30,setpts=PTS-STARTPTS[b];\
                     [2:v]$lift,scale=960:540:flags=lanczos,fps=30,setpts=PTS-STARTPTS[c];\
                     [a][b][c]concat=n=3:v=1:a=0[out]" \
    -map "[out]" -an -map_metadata -1 \
    -c:v libx264 -profile:v high -crf 27 -preset slow \
    -pix_fmt yuv420p -movflags +faststart -g 60 "$OUT/hero-landscape.mp4"

  ffmpeg -v error -y -ss 0 -i "$CACHE/nish-16-9.mp4" -frames:v 1 \
    -vf "$lift,scale=960:540:flags=lanczos" -q:v 4 "$OUT/hero-landscape.jpg"

  echo "  hero portrait (3 shots)"
  ffmpeg -v error -y \
    -ss 0  -t 3 -i "$CACHE/nish-9-16.mp4" \
    -ss 20 -t 3 -i "$CACHE/nish-9-16.mp4" \
    -ss 44 -t 3 -i "$CACHE/nish-9-16.mp4" \
    -filter_complex "[0:v]$lift,scale=480:854:flags=lanczos,fps=30,setpts=PTS-STARTPTS[a];\
                     [1:v]$lift,scale=480:854:flags=lanczos,fps=30,setpts=PTS-STARTPTS[b];\
                     [2:v]$lift,scale=480:854:flags=lanczos,fps=30,setpts=PTS-STARTPTS[c];\
                     [a][b][c]concat=n=3:v=1:a=0[out]" \
    -map "[out]" -an -map_metadata -1 \
    -c:v libx264 -profile:v high -crf 28 -preset slow \
    -pix_fmt yuv420p -movflags +faststart -g 60 "$OUT/hero-portrait.mp4"

  ffmpeg -v error -y -ss 0 -i "$CACHE/nish-9-16.mp4" -frames:v 1 \
    -vf "$lift,scale=480:854:flags=lanczos" -q:v 4 "$OUT/hero-portrait.jpg"
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
  hero) fetch; hero ;;
  kit) kit ;;
  *) fetch; encode_portfolio; posters; hero; kit; candidates ;;
esac

echo
echo "portfolio:"
du -h "$OUT"/*.mp4 "$OUT"/*.jpg 2>/dev/null | sed 's/^/  /'
echo "total: $(du -sh "$OUT" | cut -f1)"
