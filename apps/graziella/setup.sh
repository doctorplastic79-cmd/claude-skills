#!/bin/bash
# Configura Graziella rispondendo a due domande, senza aprire nessun editor.
# Uso: bash setup.sh
set -e
cd "$(dirname "$0")"

echo
echo "== Configurazione di Graziella =="
echo

ANTHROPIC_KEY=""
while [ -z "$ANTHROPIC_KEY" ]; do
  read -rp "Incolla qui la tua ANTHROPIC_API_KEY (da console.anthropic.com) e premi Invio: " ANTHROPIC_KEY
  ANTHROPIC_KEY="$(printf '%s' "$ANTHROPIC_KEY" | tr -d '[:space:]')"
  if [ -z "$ANTHROPIC_KEY" ]; then
    echo "Serve per forza, altrimenti Graziella non può rispondere: riprova."
  fi
done

read -rp "Incolla qui la tua ELEVENLABS_API_KEY (da elevenlabs.io), oppure premi solo Invio per saltarla: " ELEVEN_KEY
ELEVEN_KEY="$(printf '%s' "$ELEVEN_KEY" | tr -d '[:space:]')"

if [ -f .env ]; then
  cp .env .env.bak
  echo "(il vecchio .env è stato salvato come .env.bak, per sicurezza)"
fi

{
  echo "ANTHROPIC_API_KEY=$ANTHROPIC_KEY"
  if [ -n "$ELEVEN_KEY" ]; then
    echo "ELEVENLABS_API_KEY=$ELEVEN_KEY"
  fi
} > .env

echo
echo "Fatto. File .env scritto in $(pwd)/.env"
if [ -n "$ELEVEN_KEY" ]; then
  echo "Chiavi salvate: ANTHROPIC_API_KEY, ELEVENLABS_API_KEY"
else
  echo "Chiave salvata: ANTHROPIC_API_KEY (ElevenLabs saltata, va bene lo stesso)"
fi
echo

read -rp "Vuoi avviare Graziella adesso? (s/n): " AVVIA
if [[ "$AVVIA" =~ ^[sS] ]]; then
  npm start
else
  echo "Quando vuoi avviarla: npm start"
fi
