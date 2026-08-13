#!/bin/bash
# Avvia Graziella con un doppio clic: nessun comando da scrivere a mano.
# Se manca la configurazione (.env) la chiede prima, una volta sola.
cd "$(dirname "$0")"

echo
echo "== Avvio di Graziella =="
echo

if [ ! -f .env ]; then
  echo "Prima configurazione: servono le chiavi."
  echo
  bash setup.sh
  exit 0  # setup.sh chiede anche se avviare subito, non serve ripetere qui
fi

# Se un'altra copia è già accesa su questa porta, non provare a riavviarla:
# basta aprire il browser sulla pagina già attiva.
PORTA="${PORT:-8787}"
if lsof -ti "tcp:$PORTA" >/dev/null 2>&1; then
  echo "Graziella è già accesa: apro il browser."
  open "http://localhost:$PORTA"
  echo
  read -n 1 -s -r -p "Puoi chiudere questa finestra (premi un tasto)..."
  echo
  exit 0
fi

# apre il browser da solo appena il server è pronto
( sleep 2 && open "http://localhost:$PORTA" ) &

npm start
