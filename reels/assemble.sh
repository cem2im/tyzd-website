#!/bin/bash
# TYZD Instagram Reels — PNG → MP4 Assembler
# Combines 5 slide PNGs into a single reel video with crossfade transitions
set -e

BASE="$(dirname "$0")"
OUT="$BASE/output"
TMP="/tmp/tyzd-reel"
mkdir -p "$TMP"

SLIDE_DUR=5
FADE=0.5

echo "🎬 TYZD Reel Assembler"
echo "━━━━━━━━━━━━━━━━━━━━━━"

# Check that slide PNGs exist
for i in 1 2 3 4 5; do
  if [ ! -f "$OUT/slide-${i}.png" ]; then
    echo "❌ Missing: $OUT/slide-${i}.png"
    echo "   Run 'node render.js' first!"
    exit 1
  fi
done

echo "📐 Converting PNGs to individual video segments..."

# Convert each PNG to a 5-second video clip (720x1280 for Instagram Reels)
for i in 1 2 3 4 5; do
  echo "  🔄 slide-${i}.png → slide${i}.mp4"
  ffmpeg -y -loop 1 -i "$OUT/slide-${i}.png" \
    -vf "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,setsar=1" \
    -c:v libx264 -profile:v high -pix_fmt yuv420p -t $SLIDE_DUR \
    -r 30 "$TMP/slide${i}.mp4" 2>/dev/null
  echo "  ✅ slide${i}.mp4"
done

echo ""
echo "🔗 Concatenating with crossfade transitions..."

CUR_DUR=$SLIDE_DUR

# Step 1: slide1 + slide2
OFFSET=$(echo "$CUR_DUR - $FADE" | bc)
CUR_DUR=$(echo "$CUR_DUR + $SLIDE_DUR - $FADE" | bc)
ffmpeg -y -i "$TMP/slide1.mp4" -i "$TMP/slide2.mp4" \
  -filter_complex "[0:v][1:v]xfade=transition=fade:duration=$FADE:offset=$OFFSET[v]" \
  -map "[v]" -c:v libx264 -pix_fmt yuv420p "$TMP/m01.mp4" 2>/dev/null
echo "  ✅ 1+2 merged (dur=${CUR_DUR}s)"

# Step 2: +slide3
OFFSET=$(echo "$CUR_DUR - $FADE" | bc)
CUR_DUR=$(echo "$CUR_DUR + $SLIDE_DUR - $FADE" | bc)
ffmpeg -y -i "$TMP/m01.mp4" -i "$TMP/slide3.mp4" \
  -filter_complex "[0:v][1:v]xfade=transition=fade:duration=$FADE:offset=$OFFSET[v]" \
  -map "[v]" -c:v libx264 -pix_fmt yuv420p "$TMP/m02.mp4" 2>/dev/null
echo "  ✅ +3 merged (dur=${CUR_DUR}s)"

# Step 3: +slide4
OFFSET=$(echo "$CUR_DUR - $FADE" | bc)
CUR_DUR=$(echo "$CUR_DUR + $SLIDE_DUR - $FADE" | bc)
ffmpeg -y -i "$TMP/m02.mp4" -i "$TMP/slide4.mp4" \
  -filter_complex "[0:v][1:v]xfade=transition=fade:duration=$FADE:offset=$OFFSET[v]" \
  -map "[v]" -c:v libx264 -pix_fmt yuv420p "$TMP/m03.mp4" 2>/dev/null
echo "  ✅ +4 merged (dur=${CUR_DUR}s)"

# Step 4: +slide5
OFFSET=$(echo "$CUR_DUR - $FADE" | bc)
CUR_DUR=$(echo "$CUR_DUR + $SLIDE_DUR - $FADE" | bc)
OUTPUT="$OUT/tyzd-reel.mp4"
ffmpeg -y -i "$TMP/m03.mp4" -i "$TMP/slide5.mp4" \
  -filter_complex "[0:v][1:v]xfade=transition=fade:duration=$FADE:offset=$OFFSET[v]" \
  -map "[v]" -c:v libx264 -pix_fmt yuv420p "$OUTPUT" 2>/dev/null
echo "  ✅ +5 merged (dur=${CUR_DUR}s)"

echo ""
echo "🎬 Final reel ready!"
FINAL_DUR=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$OUTPUT")
FINAL_SIZE=$(du -h "$OUTPUT" | cut -f1)
echo "  Duration: ${FINAL_DUR}s"
echo "  Size: $FINAL_SIZE"
echo "  Resolution: 720x1280 (Instagram Reels)"
echo "  Path: $OUTPUT"

# Copy to media inbound for delivery
MEDIA_DIR="/home/clawdbot/.openclaw/media/inbound"
mkdir -p "$MEDIA_DIR"
cp "$OUTPUT" "$MEDIA_DIR/tyzd-reel.mp4"
echo "  📤 Copied to $MEDIA_DIR/tyzd-reel.mp4"

# Cleanup temp
rm -rf "$TMP"
echo "  🧹 Temp files cleaned"
echo ""
echo "✨ Done!"
