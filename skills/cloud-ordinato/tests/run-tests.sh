#!/bin/bash
# Collaudo di scripts/cloud. Non tocca il cloud: gira su dump finti in
# tests/fixtures. Da eseguire dopo ogni modifica allo script.
#
#   skills/cloud-ordinato/tests/run-tests.sh

set -u

QUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLOUD="$QUI/../scripts/cloud"
FIX="$QUI/fixtures"

# Orologio fisso: l'eta' delle sessioni finte non deve cambiare col calendario.
export CLOUD_ADESSO="2026-09-03T17:00:00Z"

PASSATE=0
FALLITE=0

prova() {  # prova <nome> <atteso> <comando...>
  local nome="$1" atteso="$2"; shift 2
  local out
  out="$("$@" 2>&1)"
  if printf '%s' "$out" | grep -qF "$atteso"; then
    PASSATE=$((PASSATE + 1))
  else
    FALLITE=$((FALLITE + 1))
    echo "FALLITA: $nome"
    echo "  atteso: $atteso"
    echo "  ottenuto:"
    printf '%s\n' "$out" | sed 's/^/    /' | head -20
  fi
}

nega() {  # nega <nome> <non-atteso> <comando...>
  local nome="$1" vietato="$2"; shift 2
  local out
  out="$("$@" 2>&1)"
  if printf '%s' "$out" | grep -qF "$vietato"; then
    FALLITE=$((FALLITE + 1))
    echo "FALLITA: $nome"
    echo "  non doveva comparire: $vietato"
  else
    PASSATE=$((PASSATE + 1))
  fi
}

S="$FIX/sessioni.json"
R="$FIX/routine.json"
ANALIZZA=(python3 "$CLOUD" analizza "$S" "$R" --io session_CORRENTE)
PIANO=(python3 "$CLOUD" piano "$S" "$R" --io session_CORRENTE)

echo "== lettura dei dump =="
# L'envelope <other-session untrusted="true"> non deve impedire la lettura.
prova "legge le 10 sessioni dentro l'envelope" "SESSIONI (10)" "${ANALIZZA[@]}"
prova "legge le 6 routine" "ROUTINE (6)" "${ANALIZZA[@]}"
prova "nessuna voce scartata" "SESSIONI" "${ANALIZZA[@]}"
nega "non conta voci non riconosciute" "non riconosciute" "${ANALIZZA[@]}"

echo "== sessioni: chi si tocca e chi no =="
prova "la sessione corrente non viene mai archiviata" \
  "tieni         runnin" "${ANALIZZA[@]}"
nega "la sessione corrente non finisce nel piano di archiviazione" \
  "archive_session session_CORRENTE" "${PIANO[@]}"
nega "una sessione con container connesso non viene archiviata" \
  "archive_session session_ALTRA_APERTA" "${PIANO[@]}"
nega "una sessione gia' archiviata non viene ri-archiviata" \
  "archive_session session_GIA_ARCHIVIATA" "${PIANO[@]}"
prova "sessione conclusa e vecchia: archivia" \
  "archive_session session_VECCHIA_FATTA" "${PIANO[@]}"
prova "sessione senza titolo e vecchia: archivia" \
  "archive_session session_SENZA_TITOLO" "${PIANO[@]}"
prova "fallita senza lavoro salvato: archivia" \
  "archive_session session_FALLITA_VUOTA" "${PIANO[@]}"
nega "lavoro non finito con un ramo non viene archiviato al buio" \
  "archive_session session_LAVORO_SOSPESO" "${PIANO[@]}"
prova "lavoro non finito con un ramo: prima la scheda di ripresa" \
  "session_LAVORO_SOSPESO" "${PIANO[@]}"
prova "contesto oltre il 60%: da compattare" \
  "contesto al 83%" "${PIANO[@]}"
prova "sessione con PR aperta: da verificare, non da archiviare" \
  "archivia solo se la PR e' merged o closed" "${PIANO[@]}"
nega "sessione con PR aperta mai archiviata al buio" \
  "archive_session session_PR_APERTA" "${PIANO[@]}"
prova "titolo generico ma recente: rinomina, non archivia" \
  "titolo generico" "${PIANO[@]}"

echo "== soglia dei giorni =="
nega "con --giorni 400 non archivia piu' niente" "   archive_session " \
  python3 "$CLOUD" piano "$S" "$R" --io session_CORRENTE --giorni 400
prova "con --giorni 1 archivia anche le sessioni di ieri" \
  "archive_session session_TITOLO_GENERICO_RECENTE" \
  python3 "$CLOUD" piano "$S" "$R" --io session_CORRENTE --giorni 1

echo "== routine: dove sta il consumo vero =="
prova "routine attiva e fallita in cima al piano" \
  "trig_FALLISCE_OGNI_GIORNO" "${PIANO[@]}"
prova "e la ragione e' detta" "brucia token" "${ANALIZZA[@]}"
prova "one-shot gia' scattata: eliminabile" \
  "delete_trigger trig_ONESHOT_SCATTATA" "${PIANO[@]}"
prova "routine morta con la sessione: eliminabile" \
  "delete_trigger trig_RESIDUO_SESSIONE_SPARITA" "${PIANO[@]}"
nega "una routine sana non viene eliminata" \
  "delete_trigger trig_SANA" "${PIANO[@]}"
nega "una routine in pausa non viene eliminata da sola" \
  "delete_trigger trig_IN_PAUSA" "${PIANO[@]}"
prova "routine oraria su sessione fissa: da verificare" \
  "trig_SESSIONE_FISSA" "${PIANO[@]}"

echo "== consumo gia' speso =="
prova "elenca le sessioni piu' costose" "LE PIU' COSTOSE FINORA" "${PIANO[@]}"
prova "col costo vero preso da external_metadata.usage" "14.83" "${PIANO[@]}"
prova "e dice che e' gia' speso, non un risparmio possibile" \
  "una sessione ferma non consuma niente" "${PIANO[@]}"
prova "riporta i token gia' letti" "18.150.161" "${ANALIZZA[@]}"

echo "== chat lasciate in sospeso =="
prova "dice cosa aspetta una sessione ferma" "dimmi come si chiama il repository" \
  python3 "$CLOUD" analizza "$S" "$R" --io session_CORRENTE --giorni 400
prova "vecchia e in attesa, con lavoro salvato: da compattare" \
  "aspetta una tua risposta da" "${ANALIZZA[@]}"

echo "== onesta' del piano =="
prova "dice che archiviare e' reversibile" "unarchive_session" "${PIANO[@]}"
prova "dice che cancellare una sessione non e' possibile" \
  "Cancellare una sessione" "${PIANO[@]}"
prova "distingue il guadagno reale dall'ordine" "nessun risparmio" "${PIANO[@]}"

echo "== scheda di ripresa =="
prova "la scheda riporta il ramo" "claude/skill-mezza-k9" \
  python3 "$CLOUD" scheda "$S" --id session_LAVORO_SOSPESO
prova "la scheda lascia i campi da compilare" "## Cosa manca" \
  python3 "$CLOUD" scheda "$S" --id session_LAVORO_SOSPESO
prova "id inesistente: errore chiaro" "non trovata" \
  python3 "$CLOUD" scheda "$S" --id session_INESISTENTE

echo "== formato JSON =="
prova "--json produce JSON valido" '"azione"' \
  python3 "$CLOUD" analizza "$S" "$R" --json
python3 "$CLOUD" analizza "$S" "$R" --json | python3 -c "import json,sys; json.load(sys.stdin)" \
  && PASSATE=$((PASSATE + 1)) \
  || { FALLITE=$((FALLITE + 1)); echo "FALLITA: --json non e' parsabile"; }

echo "== errori =="
prova "file mancante: lo dice invece di fingere" "non riesco a leggere" \
  python3 "$CLOUD" analizza "$FIX/non-esiste.json"
echo '{"data":[]}' > /tmp/cloud-vuoto.json
prova "dump vuoto: lo dice invece di dire che e' tutto a posto" \
  "nessuna sessione e nessuna routine" python3 "$CLOUD" analizza /tmp/cloud-vuoto.json
rm -f /tmp/cloud-vuoto.json

echo
echo "passate: $PASSATE   fallite: $FALLITE"
[ "$FALLITE" -eq 0 ]
