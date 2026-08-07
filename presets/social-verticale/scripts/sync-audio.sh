#!/bin/bash
# Copia in public/audio/ una traccia BGM e qualche SFX dalla libreria
# video-shotcraft, che il preset non duplica (sono 36 MB).
#
#   ./scripts/sync-audio.sh
#
# Se la libreria non c'è ancora, la clona: è lo stesso percorso che usa il
# loader della skill.
set -eu

VSC="${VSC:-$HOME/.cache/video-shotcraft}"
DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/public/audio"

[ -f "$VSC/SKILL.md" ] || git clone --depth 1 \
  https://github.com/Vincentwei1021/video-shotcraft.git "$VSC"

mkdir -p "$DEST"

# Una BGM come base. Sceglila fra quelle in $VSC/assets/audio/bgm/.
BGM="${BGM:-house-vibez.mp3}"
cp "$VSC/assets/audio/bgm/$BGM" "$DEST/bgm.mp3"
echo "bgm: $BGM"

# Gli SFX utili su un reel da foto: stacchi e comparse di testo.
for cat in transition text impact; do
  [ -d "$VSC/assets/audio/sfx/$cat" ] || continue
  mkdir -p "$DEST/sfx/$cat"
  cp "$VSC/assets/audio/sfx/$cat"/* "$DEST/sfx/$cat/" 2>/dev/null || true
  echo "sfx/$cat: $(ls "$DEST/sfx/$cat" | wc -l) file"
done

echo
echo "fatto. Ora metti USE_BGM = true in src/reel/Reel.tsx."
