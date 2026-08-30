#!/usr/bin/env bash
# Collaudo di scripts/nas contro il finto DSM in fake_dsm.py.
#
#   skills/nas-synology/tests/run-tests.sh
#
# Non serve un NAS: verifica che il client parli il protocollo giusto, che i
# blocchi sulle scritture reggano e che gli errori dicano la cosa utile.
# Esce 0 se passa tutto, 1 al primo fallimento riepilogato in fondo.

set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAS="$HERE/../scripts/nas"
PORT="${NAS_TEST_PORT:-18099}"
WORK="$(mktemp -d)"

export NAS_URL="http://127.0.0.1:$PORT"
export NAS_USER=claude
export NAS_PASS=segreta
export NAS_OTP_SECRET=JBSWY3DPEHPK3PXP
export NAS_CONFIG="$WORK/assente.env"     # niente config reale nei test
export NAS_CACHE_DIR="$WORK/cache"
unset NAS_READONLY NAS_SSH_HOST NAS_SSH_USER NAS_OTP_CODE 2>/dev/null || true

PASS=0
FAILED=()

cleanup() {
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

python3 "$HERE/fake_dsm.py" "$PORT" & SERVER_PID=$!
for _ in $(seq 40); do
  curl -sf -o /dev/null "$NAS_URL/__control/state" && break
  sleep 0.1
done
curl -sf -o /dev/null "$NAS_URL/__control/state" || {
  echo "il finto DSM non si e' avviato sulla porta $PORT" >&2; exit 1; }

# check <nome> <atteso-nell-output> <exit-atteso> -- <comando...>
check() {
  local name="$1" expect="$2" want_rc="$3"; shift 4
  local out rc
  out="$("$@" 2>&1)"; rc=$?
  if [ "$rc" != "$want_rc" ]; then
    FAILED+=("$name: exit $rc invece di $want_rc -- $(echo "$out" | tail -1)")
  elif [ -n "$expect" ] && ! grep -qF -- "$expect" <<<"$out"; then
    FAILED+=("$name: manca \"$expect\" nell'output -- $(echo "$out" | tail -1)")
  else
    PASS=$((PASS + 1)); printf '.'; return 0
  fi
  printf 'x'
}

reset_session() { rm -rf "$NAS_CACHE_DIR"; }

echo "collaudo di scripts/nas contro il finto DSM su :$PORT"

# --- lettura -----------------------------------------------------------
check "check riporta il modello"    "DS923+"       0 -- "$NAS" check
check "info mostra la versione DSM" "DSM 7.2.2"    0 -- "$NAS" info
check "info uptime formattato"      "11g"          0 -- "$NAS" info
check "storage: volume e occupato"  "87%"          0 -- "$NAS" storage
check "storage: SMART del disco"    "WD80EFZZ"     0 -- "$NAS" storage
check "usage: carico CPU sommato"   "CPU"          0 -- "$NAS" usage
check "shares elenca le condivisioni" "Drive"      0 -- "$NAS" shares
check "users elenca gli utenti"     "claude"       0 -- "$NAS" users
check "connections mostra chi c'e'" "192.168.1.5"  0 -- "$NAS" connections
check "packages elenca i pacchetti" "Docker"       0 -- "$NAS" packages
check "docker elenca i container"   "plex"         0 -- "$NAS" docker
check "ls elenca i file"            "nota.txt"     0 -- "$NAS" ls /volume1/Drive
check "ls senza percorso -> share"  "Drive"        0 -- "$NAS" ls
check "find cerca ricorsivamente"   "film.mkv"     0 -- "$NAS" find "*.mkv" --path /volume1
check "logs assente degrada bene"   "nas api list" 1 -- "$NAS" logs
check "backups assente degrada bene" "nas api list" 1 -- "$NAS" backups

# --- formato di uscita -------------------------------------------------
check "--json restituisce JSON"     '"model"'      0 -- "$NAS" info --json
check "--json prima del comando"    '"model"'      0 -- "$NAS" --json info

# --- catalogo API ------------------------------------------------------
check "api list filtra"             "SYNO.FileStation.Delete" 0 -- "$NAS" api list FileStation
check "api call di lettura"         "Drive"        0 -- "$NAS" api call SYNO.Core.Share list
check "api call in scrittura bloccata" "sola lettura" 2 -- "$NAS" api call SYNO.Core.System reboot

# --- file: lettura e scrittura ----------------------------------------
check "get scarica il file"         "scaricato"    0 -- "$NAS" get /volume1/Drive/nota.txt "$WORK/nota.txt"
if [ "$(cat "$WORK/nota.txt" 2>/dev/null)" = "contenuto del file" ]; then
  PASS=$((PASS + 1)); printf '.'
else
  FAILED+=("get: contenuto del file scaricato diverso da quello servito"); printf 'x'
fi

echo "da caricare" > "$WORK/da-caricare.txt"
check "put senza --yes e' bloccato" "--yes"        2 -- "$NAS" put "$WORK/da-caricare.txt" /volume1/Drive
check "put con --yes carica"        "caricato"     0 -- "$NAS" put "$WORK/da-caricare.txt" /volume1/Drive --yes
check "mkdir richiede --yes"        "--yes"        2 -- "$NAS" mkdir /volume1/Drive/nuova
check "mkdir con --yes"             "creata"       0 -- "$NAS" mkdir /volume1/Drive/nuova --yes
check "rm richiede --yes"           "--yes"        2 -- "$NAS" rm /volume1/Drive/nota.txt
check "rm con --yes dopo il comando" "eliminato"   0 -- "$NAS" rm /volume1/Drive/nota.txt --yes
check "rm con --yes prima del comando" "eliminato" 0 -- "$NAS" --yes rm /volume1/Drive/altro.txt
check "mv sposta"                   "spostamento"  0 -- "$NAS" mv /volume1/Drive/a.txt /volume1/Archivio --yes

# --- il freno di sicurezza --------------------------------------------
check "NAS_READONLY vince su --yes" "NAS_READONLY" 2 -- env NAS_READONLY=1 "$NAS" rm /volume1/Drive/x --yes
check "NAS_READONLY blocca il put"  "NAS_READONLY" 2 -- env NAS_READONLY=1 "$NAS" put "$WORK/da-caricare.txt" /volume1/Drive --yes

# --- SSH: euristica sui comandi distruttivi ---------------------------
check "ssh rifiuta rm senza --yes"  "sola lettura" 2 -- "$NAS" ssh rm -rf /volume1
check "ssh rifiuta la redirezione"  "sola lettura" 2 -- "$NAS" ssh 'cat /etc/passwd > /tmp/x'
check "ssh non configurato lo dice" "SSH non configurato" 1 -- "$NAS" ssh df -h

# --- sessione ----------------------------------------------------------
if [ "$(stat -c '%a' "$NAS_CACHE_DIR/session.json" 2>/dev/null || stat -f '%Lp' "$NAS_CACHE_DIR/session.json" 2>/dev/null)" = "600" ]; then
  PASS=$((PASS + 1)); printf '.'
else
  FAILED+=("il file di sessione non ha i permessi 600"); printf 'x'
fi

curl -sf -o /dev/null "$NAS_URL/__control/expire"
check "re-login dopo SID scaduto"   "DS923+"       0 -- "$NAS" info
check "logout chiude la sessione"   "sessione chiusa" 0 -- "$NAS" logout

# --- errori: devono emergere, non essere mascherati -------------------
reset_session
check "password sbagliata"          "password sbagliata" 1 -- env NAS_PASS=sbagliata "$NAS" info
reset_session
check "2FA mancante indica cosa fare" "NAS_OTP_SECRET" 1 -- env NAS_OTP_SECRET= "$NAS" info
reset_session
check "host irraggiungibile"        "impossibile raggiungere" 1 -- env NAS_URL=http://127.0.0.1:1 "$NAS" info
reset_session
check "segreto 2FA malformato"      "base32"       1 -- env NAS_OTP_SECRET=xy "$NAS" info
reset_session
check "manca NAS_URL"               "manca NAS_URL" 1 -- env NAS_URL= "$NAS" info

# --- TOTP: vettori di prova della RFC 6238 ----------------------------
if python3 - "$NAS" <<'PY'
import sys, types
src = open(sys.argv[1]).read().replace('if __name__ == "__main__":\n    main()', "")
mod = types.ModuleType("nas")
exec(compile(src, "nas", "exec"), mod.__dict__)
seed = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"      # 12345678901234567890 in base32
vectors = {59: "287082", 1111111109: "081804", 1234567890: "005924", 2000000000: "279037"}
sys.exit(0 if all(mod.totp(seed, when=t) == v for t, v in vectors.items()) else 1)
PY
then PASS=$((PASS + 1)); printf '.'
else FAILED+=("TOTP: i codici non corrispondono ai vettori della RFC 6238"); printf 'x'
fi

echo; echo
if [ "${#FAILED[@]}" -eq 0 ]; then
  echo "$PASS prove superate."
  exit 0
fi
echo "$PASS superate, ${#FAILED[@]} fallite:"
printf '  - %s\n' "${FAILED[@]}"
exit 1
