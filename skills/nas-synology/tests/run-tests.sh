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
disown "$SERVER_PID" 2>/dev/null || true   # evita il "Terminated: 15" di bash su macOS
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
check "packages: stato al primo livello" "running" 0 -- "$NAS" packages
check "packages: stato annidato in additional" "Foto" 0 -- "$NAS" packages
check "packages: conta i pacchetti"  "3 pacchetti"  0 -- "$NAS" packages
check "docker elenca i container"   "plex"         0 -- "$NAS" docker
check "ls elenca i file"            "nota.txt"     0 -- "$NAS" ls /volume1/Drive
check "ls senza percorso -> share"  "Drive"        0 -- "$NAS" ls
check "find cerca ricorsivamente"   "film.mkv"     0 -- "$NAS" find "*.mkv" --path /volume1
check "logs assente degrada bene"   "nas api list" 1 -- "$NAS" logs
check "updates: legge la versione"  "DSM 7.4.1-90080" 0 -- "$NAS" updates
check "updates: segnala il riavvio" "Riavvio"      0 -- "$NAS" updates
check "updates: rimanda a DSM"      "Pannello di controllo" 0 -- "$NAS" updates
check "security: tabella leggibile" "malware"      0 -- "$NAS" security
check "security: esito per riga"    "safe"         0 -- "$NAS" security
check "health non tronca il JSON"   "controllo"    0 -- "$NAS" health
check "health non stampa JSON grezzo" "Disponibile" 0 -- "$NAS" health
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
# Questa prova passava sul container solo perche' li' ssh non e' installato:
# su un Mac il client deduceva l'host da NAS_URL e tentava davvero la porta 22.
# Ora NAS_SSH_HOST e' obbligatorio, quindi il caso e' deterministico ovunque.
check "ssh senza NAS_SSH_HOST lo dice" "manca NAS_SSH_HOST" 1 -- "$NAS" ssh df -h
if command -v ssh >/dev/null; then
  check "ssh irraggiungibile spiega cosa controllare" "Terminale" 1 -- \
    env NAS_SSH_HOST=127.0.0.1 NAS_SSH_PORT=1 NAS_SSH_USER=nessuno "$NAS" ssh df -h --yes
else
  echo -n " (prova ssh saltata: comando assente)"
fi

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

SETUP="$HERE/../scripts/nas-setup.sh"

# --- verso quali host si puo' configurare SSH --------------------------
# Una chiave privata mandata all'host sbagliato non si richiama indietro.
. "$HERE/../scripts/lib-host.sh"
locali="192.168.1.10 10.0.0.5 172.16.3.4 127.0.0.1 diskstation.local
        100.73.172.85 100.64.0.1 100.127.255.254 nas.coda-panda.ts.net"
non_locali="informamedica-nas.fr3.quickconnect.to casa.synology.me 8.8.8.8
            example.com 172.15.0.1 172.32.0.1 100.63.0.1 100.128.0.1"
host_ko=""
for h in $locali;     do is_local_host "$h" || host_ko="$host_ko $h(atteso locale)"; done
for h in $non_locali; do is_local_host "$h" && host_ko="$host_ko $h(atteso NON locale)"; done
if [ -z "$host_ko" ]; then
  PASS=$((PASS + 1)); printf '.'
else
  FAILED+=("classificazione host sbagliata per:$host_ko"); printf 'x'
fi

# --- errori che non devono mai uscire come traceback --------------------
check "timeout di lettura diagnosticato" "non ha risposto entro" 1 -- \
  env NAS_TIMEOUT=1 "$NAS" api call SYNO.Core.Share list lento=3
check "timeout suggerisce NAS_TIMEOUT"   "NAS_TIMEOUT=90"        1 -- \
  env NAS_TIMEOUT=1 "$NAS" api call SYNO.Core.Share list lento=3
if env NAS_TIMEOUT=1 "$NAS" api call SYNO.Core.Share list lento=3 2>&1 | grep -q "Traceback"; then
  FAILED+=("un traceback Python e' arrivato all'utente"); printf 'x'
else
  PASS=$((PASS + 1)); printf '.'
fi

# --- uptime: DSM non lo restituisce sempre in secondi -------------------
if python3 "$HERE/check_uptime.py" "$NAS"; then
  PASS=$((PASS + 1)); printf '.'
else
  FAILED+=("uptime: una delle forme restituite da DSM non viene formattata"); printf 'x'
fi

# --- TLS ---------------------------------------------------------------
# Un DSM appena installato ha un certificato autofirmato: il client deve
# riconoscerlo come problema di certificato, non di rete. Il ramo era codice
# morto perche' urllib incapsula gli errori SSL dentro URLError.
if command -v openssl >/dev/null; then
  openssl req -x509 -newkey rsa:2048 -keyout "$WORK/key.pem" -out "$WORK/cert.pem" \
    -days 1 -nodes -subj "/CN=127.0.0.1" >/dev/null 2>&1
  TLS_PORT=$((PORT + 1))
  python3 "$HERE/https_dsm.py" "$TLS_PORT" "$WORK/cert.pem" "$WORK/key.pem" & TLS_PID=$!
  disown "$TLS_PID" 2>/dev/null || true
  for _ in $(seq 40); do
    curl -sk -o /dev/null "https://127.0.0.1:$TLS_PORT/__control/state" && break
    sleep 0.1
  done
  check "TLS: certificato non verificabile diagnosticato come tale" \
    "certificato TLS non verificabile" 1 -- \
    env NAS_URL="https://127.0.0.1:$TLS_PORT" NAS_CACHE_DIR="$WORK/tls" "$NAS" info
  check "TLS: --insecure permette comunque di leggere" "DS923+" 0 -- \
    env NAS_URL="https://127.0.0.1:$TLS_PORT" NAS_CACHE_DIR="$WORK/tls2" "$NAS" info --insecure
  # Il caso di Dario: DSM autofirmato su un indirizzo raggiungibile solo dalla
  # rete locale o da Tailscale. Il setup deve proporre il rimedio e concludere,
  # non fermarsi su un errore di certificato.
  check "setup risolve il certificato autofirmato" "Pronto" 0 -- \
    env NAS_URL="https://127.0.0.1:$TLS_PORT" NAS_CONFIG="$WORK/tls-setup.env" \
    NAS_CACHE_DIR="$WORK/tls3" "$SETUP" \
    --non-interattivo --salta-collaudo --salta-installazione
  if grep -q '^NAS_VERIFY_TLS=no$' "$WORK/tls-setup.env" 2>/dev/null &&
     ! grep -q '^# Togli il commento' "$WORK/tls-setup.env"; then
    PASS=$((PASS + 1)); printf '.'
  else
    FAILED+=("setup: NAS_VERIFY_TLS non scritto correttamente per l'host locale"); printf 'x'
  fi
  kill "$TLS_PID" 2>/dev/null
else
  echo -n " (prove TLS saltate: openssl assente)"
fi

# Python senza CA di sistema: causa diversa, messaggio diverso.
if python3 "$HERE/check_tls_hints.py" "$NAS"; then
  PASS=$((PASS + 1)); printf '.'
else
  FAILED+=("TLS: i messaggi non distinguono CA mancanti da certificato del NAS"); printf 'x'
fi

# --- lo script di configurazione ---------------------------------------
# Sempre con --salta-installazione e --salta-collaudo: qui interessa la sua
# logica, non che reinstalli la skill o rilanci ricorsivamente queste prove.
check "setup: --help descrive le opzioni" "--non-interattivo" 0 -- "$SETUP" --help
check "setup: opzione ignota rifiutata"   "opzione sconosciuta" 1 -- "$SETUP" --inventata
check "setup: senza NAS_URL lo dice"      "serve NAS_URL" 1 -- \
  env -u NAS_URL NAS_CONFIG="$WORK/setup-a.env" "$SETUP" \
  --non-interattivo --salta-collaudo --salta-installazione
check "setup: configura e verifica"       "Pronto" 0 -- \
  env NAS_CONFIG="$WORK/setup-b.env" "$SETUP" \
  --non-interattivo --salta-collaudo --salta-installazione
if [ "$(stat -c '%a' "$WORK/setup-b.env" 2>/dev/null || stat -f '%Lp' "$WORK/setup-b.env" 2>/dev/null)" = "600" ]; then
  PASS=$((PASS + 1)); printf '.'
else
  FAILED+=("setup: il file di configurazione non ha i permessi 600"); printf 'x'
fi
if grep -q "^NAS_URL=$NAS_URL$" "$WORK/setup-b.env" 2>/dev/null; then
  PASS=$((PASS + 1)); printf '.'
else
  FAILED+=("setup: NAS_URL non e' finito nella configurazione"); printf 'x'
fi

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
