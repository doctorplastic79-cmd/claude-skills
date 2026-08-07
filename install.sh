#!/bin/bash
# Installa le skill di questo repository in ~/.claude/skills, così sono
# disponibili in ogni sessione e su qualsiasi progetto.
#
# In locale:   ./install.sh
# Come setup script di un cloud environment:
#   git clone --depth 1 https://github.com/doctorplastic79-cmd/claude-skills.git \
#     /opt/claude-skills && /opt/claude-skills/install.sh || true

set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

mkdir -p "$DEST"

for skill in "$REPO"/skills/*/; do
  [ -f "$skill/SKILL.md" ] || continue
  name="$(basename "$skill")"
  rm -rf "$DEST/$name"
  cp -a "$skill" "$DEST/$name"
  echo "installata: $name -> $DEST/$name"
done

# Esce sempre 0: come setup script un errore qui bloccherebbe l'avvio della sessione.
exit 0
