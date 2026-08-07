#!/bin/bash
# Impacchetta una skill per l'upload su claude.ai (Impostazioni -> Capacità -> Skill).
#
#   ./package-for-claude-ai.sh video-shotcraft
#
# Lo zip deve avere una sola voce di primo livello, chiamata come il campo
# `name` nel frontmatter di SKILL.md, e stare sotto i 30 MB non compressi.
# video-shotcraft ne pesa 49, quindi i file più pesanti vengono esclusi: i 149
# SFX restano, spariscono le 5 tracce BGM e le texture del template. Lo script
# inietta in cima a SKILL.md la nota che spiega all'agente cosa manca e come
# recuperarlo, così la copia completa nel repo resta senza avvisi inutili.

set -eu

SKILL="${1:-}"
[ -n "$SKILL" ] || { echo "uso: $0 <nome-skill>" >&2; exit 1; }

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$REPO/skills/$SKILL"
[ -f "$SRC/SKILL.md" ] || { echo "skill non trovata: $SRC" >&2; exit 1; }

EXCLUDE=(assets/audio/bgm template/public/textures README_CN.md README_JA.md)
# Sottoinsieme di EXCLUDE che l'agente deve poter recuperare: le traduzioni del
# README non servono a produrre un video, gli asset sì.
RECOVERABLE=(assets/audio/bgm template/public/textures)
UPSTREAM="https://github.com/Vincentwei1021/video-shotcraft.git"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -a "$SRC" "$WORK/$SKILL"
for path in "${EXCLUDE[@]}"; do rm -rf "${WORK:?}/$SKILL/$path"; done

# La nota va dopo il frontmatter: il campo `description` decide quando la skill
# si attiva, e l'upload rifiuta chiavi fuori dalla spec, quindi non si tocca.
{
  echo
  echo "## Assets missing in this build"
  echo
  echo "Trimmed for the claude.ai skill upload limit (30 MB). Removed:"
  echo
  for path in "${RECOVERABLE[@]}"; do
    [ -e "$SRC/$path" ] && echo "- \`$path\`"
  done
  echo
  echo "Fetch them before music beat-sync or rendering the template, rather than"
  echo "skipping the audio pass or rewriting the beat plan around the gap:"
  echo
  echo '```bash'
  echo "git clone --depth 1 $UPSTREAM /tmp/vsc-full"
  for path in "${RECOVERABLE[@]}"; do
    echo "cp -a /tmp/vsc-full/$path \"\$SKILL_DIR/$path\""
  done
  echo '```'
} > "$WORK/note.md"

awk -v note="$WORK/note.md" '
  BEGIN { fm = 0 }
  { print }
  /^---$/ { if (++fm == 2) { while ((getline line < note) > 0) print line } }
' "$SRC/SKILL.md" > "$WORK/$SKILL/SKILL.md"

BYTES="$(find "$WORK/$SKILL" -type f -printf '%s\n' | awk '{s+=$1} END {print s+0}')"
LIMIT=$((30 * 1024 * 1024))
awk -v b="$BYTES" 'BEGIN { printf "non compresso: %.1f MB\n", b/1048576 }'
if [ "$BYTES" -ge "$LIMIT" ]; then
  echo "oltre il limite di 30 MB: aggiungi voci a EXCLUDE" >&2
  exit 1
fi

OUT="$REPO/$SKILL.zip"
rm -f "$OUT"
( cd "$WORK" && zip -rq "$OUT" "$SKILL" -x '*.DS_Store' )
echo "creato: $OUT ($(du -h "$OUT" | cut -f1))"
