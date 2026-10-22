#!/bin/bash
# The compare demo's media (examples/lab-compare.ts): a small UI-like scene, 6 s at 30 fps, where
# "after" moves a card, recolours a button, widens the ball and flashes a badge from 1.5 s to 2.6 s.
# Run from this folder: bash make.sh .
set -euo pipefail
cd "$1"
box() { echo "drawbox=x=$1:y=$2:w=$3:h=$4:color=$5:t=fill"; }
# `bash make.sh . scrub` makes only scrub-1080-{before,after}.mp4 (gitignored): the scene at
# 1920×1080 for 20 s with a raw recording's keyframes (one in 10 s), what scripts/scrub-probe.mjs
# measures scrubbing on.
if [ "${2:-}" = "scrub" ]; then
  S="scale=1920:1080:flags=neighbor"
  for side in before after; do
    [ -f "scrub-1080-$side.mp4" ] && continue
    ffmpeg -y -hide_banner -loglevel error -i "long-$side.mp4" \
      -f lavfi -i "testsrc2=s=600x220:r=30:d=20" \
      -filter_complex "[0:v]$S[bg];[bg][1:v]overlay=x=1240:y=800,format=yuv420p" \
      -t 20 -c:v libx264 -preset veryfast -crf 26 -g 300 -keyint_min 300 -sc_threshold 0 -movflags +faststart -an "scrub-1080-$side.mp4"
  done
  exit 0
fi
COMMON="$(box 0 0 640 44 0x22252c),$(box 0 44 140 316 0x1b1e24),$(box 16 64 108 16 0x2c3038),$(box 16 94 92 16 0x2c3038),$(box 16 124 100 16 0x2c3038),$(box 16 12 90 20 0x3a3f4a),$(box 170 70 200 120 0x262a33),$(box 186 150 120 12 0x3a3f4a)"
X="170+190*(1-cos(PI*t/3))"
BEFORE="$COMMON,$(box 400 70 210 120 0x262a33),$(box 540 10 84 24 0x3a3f4a),drawbox=x=$X:y=196:w=60:h=60:color=0x4d8dff:t=fill"
AFTER="$COMMON,$(box 400 76 210 120 0x262a33),$(box 540 10 84 24 0x4d8dff),drawbox=x=$X:y=196:w=66:h=60:color=0x4d8dff:t=fill,drawbox=x=190:y=90:w=56:h=16:color=0xff9f0a:t=fill:enable=between(t\\,1.5\\,2.6)"
make() {
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -i "color=c=0x15171c:s=640x360:r=30:d=6" \
    -f lavfi -i "testsrc=s=210x80:r=30:d=6" \
    -filter_complex "[0:v]$2[bg];[bg][1:v]overlay=x=420:y=272,format=yuv420p" \
    -c:v libx264 -preset slow -crf 26 -g 15 -keyint_min 15 -movflags +faststart -an "$1.mp4"
  ffmpeg -y -hide_banner -loglevel error -ss 2.0 -i "$1.mp4" -frames:v 1 "$1.png"
}
make before "$BEFORE"
make after "$AFTER"
# The same scene for 40 s with a raw screen recording's keyframes (one in 10 s), for
# examples/compare-page.html and scripts/compare-probe.mjs: what scrubbing has to feel instant on.
# Synthetic, so it ships with the repo (the onboarding recordings stay local).
long() {
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -i "color=c=0x15171c:s=640x360:r=30:d=40" \
    -f lavfi -i "testsrc=s=210x80:r=30:d=40" \
    -filter_complex "[0:v]$2[bg];[bg][1:v]overlay=x=420:y=272,format=yuv420p" \
    -c:v libx264 -preset slow -crf 28 -g 300 -keyint_min 300 -sc_threshold 0 -movflags +faststart -an "$1.mp4"
}
long long-before "$BEFORE"
long long-after "$AFTER"
# Locally, the same keyframes from the walkthrough's 41 s recording (gitignored, like it):
# examples/compare-page.html?recordings uses them.
if [ -f ../walkthrough/57155-connect-before.mp4 ]; then
  for side in before after; do
    ffmpeg -y -hide_banner -loglevel error -i "../walkthrough/57155-connect-$side.mp4" \
      -c:v libx264 -preset veryfast -crf 20 -g 300 -keyint_min 300 -sc_threshold 0 \
      -pix_fmt yuv420p -movflags +faststart -an "sparse-$side.mp4"
  done
fi
