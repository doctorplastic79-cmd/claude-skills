#!/usr/bin/env bash
# Prepara da zero l'accesso di Claude al NAS Synology: aggiorna e installa la
# skill, collauda il client, trova il NAS in rete, raccoglie le credenziali,
# imposta SSH e verifica che tutto risponda.
#
#   skills/nas-synology/scripts/nas-setup.sh
#
# Opzioni:
#   --non-interattivo  non chiede niente: usa NAS_URL, NAS_USER, NAS_PASS
#                      dall'ambiente (per gli ambienti cloud e gli script)
#   --salta-collaudo   non esegue le prove del client
#   --salta-scansione  non offre la scansione della rete locale
#   --salta-installazione  non aggiorna il repository e non reinstalla la skill
#   --riconfigura      sovrascrive una configurazione esistente senza chiedere
#
# Le credenziali finiscono solo in ~/.config/nas-synology/config.env (chmod 600).
# Lo script non le stampa mai e non le scrive da nessun'altra parte.

set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$HERE/.." && pwd)"
NAS="$HERE/nas"
CONFIG="${NAS_CONFIG:-$HOME/.config/nas-synology/config.env}"

INTERACTIVE=1
RUN_TESTS=1
ALLOW_SCAN=1
DO_INSTALL=1
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --non-interattivo|--non-interactive) INTERACTIVE=0 ;;
    --salta-collaudo|--skip-tests)       RUN_TESTS=0 ;;
    --salta-scansione|--skip-scan)       ALLOW_SCAN=0 ;;
    --salta-installazione|--skip-install) DO_INSTALL=0 ;;
    --riconfigura|--force)               FORCE=1 ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opzione sconosciuta: $arg" >&2; exit 1 ;;
  esac
done

# La classificazione degli host (LAN, Tailscale, QuickConnect...) sta in
# lib-host.sh, condivisa con le prove: serve al passo 5 per SSH e al passo 6
# per il certificato, quindi va caricata qui e non dentro un ramo.
. "$HERE/lib-host.sh"

# Sessione cloud? NAS_AMBIENTE la forza (per le prove e i casi imprevisti),
# altrimenti si guardano i marcatori del container.
in_cloud() {
  case "${NAS_AMBIENTE:-}" in
    cloud) return 0 ;;
    mac|altro) return 1 ;;
  esac
  [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || [ -d /root/.ccr ]
}

STEP=0
step()  { STEP=$((STEP + 1)); printf '\n[%d/6] %s\n' "$STEP" "$1"; }
ok()    { printf '  ok    %s\n' "$1"; }
info()  { printf '        %s\n' "$1"; }
warn()  { printf '  nota  %s\n' "$1"; }
fail()  { printf '  stop  %s\n' "$1" >&2; exit 1; }

ask() {  # ask <domanda> <variabile-destinazione> [default]
  local prompt="$1" __var="$2" default="${3:-}" reply
  if [ "$INTERACTIVE" = 0 ]; then printf -v "$__var" '%s' "$default"; return; fi
  if [ -n "$default" ]; then read -rp "$prompt [$default]: " reply
  else read -rp "$prompt: " reply; fi
  printf -v "$__var" '%s' "${reply:-$default}"
}

confirm() {  # confirm <domanda> -> 0 se si'
  [ "$INTERACTIVE" = 0 ] && return 1
  local reply; read -rp "$1 [s/N] " reply
  [[ "$reply" =~ ^[sSyY]$ ]]
}

if [ "$INTERACTIVE" = 1 ] && [ ! -t 0 ]; then
  if [ -n "${NAS_URL:-}" ] && [ -n "${NAS_USER:-}" ] && [ -n "${NAS_PASS:-}" ]; then
    INTERACTIVE=0   # niente terminale ma c'e' tutto: si procede senza domande
  else
    cat >&2 <<'EOF'
nas-setup.sh fa delle domande (indirizzo, utente, password) e qui non c'e' un
terminale a cui farle: sta girando dentro uno strumento, non in una shell.

Due strade:
  - lancialo tu, dal Terminale del Mac:
      skills/nas-synology/scripts/nas-setup.sh
  - oppure passagli tutto dall'ambiente, e non chiedera' niente:
      NAS_URL=... NAS_USER=... NAS_PASS=... nas-setup.sh --non-interattivo
EOF
    exit 2
  fi
fi

echo "Configurazione dell'accesso di Claude al NAS Synology."

# ---------------------------------------------------------------- 1. requisiti
step "Requisiti"
command -v python3 >/dev/null || fail "manca python3: il client non puo' funzionare senza."
command -v curl    >/dev/null || fail "manca curl: serve per trovare il NAS in rete."
ok "python3 $(python3 -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])')"
ok "curl presente"
[ -x "$NAS" ] || fail "non trovo il client eseguibile in $NAS"

# ------------------------------------------------------------- 2. installazione
step "Installazione della skill"
REPO_ROOT="$(cd "$SKILL_DIR/../.." 2>/dev/null && pwd || true)"
if [ "$DO_INSTALL" = 0 ]; then
  info "saltata su richiesta"
elif [ -n "$REPO_ROOT" ] && [ -x "$REPO_ROOT/install.sh" ] && [ -d "$REPO_ROOT/.git" ]; then
  if git -C "$REPO_ROOT" pull --quiet --ff-only 2>/dev/null; then
    ok "repository aggiornato ($(git -C "$REPO_ROOT" log --oneline -1 | cut -c1-50))"
  else
    warn "non ho potuto aggiornare il repository, proseguo con la copia locale"
  fi
  if "$REPO_ROOT/install.sh" >/dev/null 2>&1; then
    ok "skill installate in ${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
  else
    warn "install.sh non e' andato a buon fine: la skill resta usabile da qui"
  fi
else
  info "eseguito da una copia installata, niente da aggiornare"
fi

# ----------------------------------------------------------------- 3. collaudo
step "Collaudo del client"
if [ "$RUN_TESTS" = 0 ]; then
  info "saltato su richiesta"
elif [ -x "$SKILL_DIR/tests/run-tests.sh" ]; then
  if OUT="$("$SKILL_DIR/tests/run-tests.sh" 2>&1)"; then
    ok "$(echo "$OUT" | tail -1)"
  else
    echo "$OUT" | tail -6
    fail "il client non supera le sue prove: non ha senso puntarlo al NAS vero."
  fi
else
  warn "prove non presenti in questa copia"
fi

# ------------------------------------------------------------- 4. trovare il NAS
step "Il NAS"

probe() {  # probe <url> -> 0 se risponde come un DSM
  curl -sk --max-time 3 \
    "$1/webapi/query.cgi?api=SYNO.API.Info&version=1&method=query&query=all" \
    2>/dev/null | grep -q 'SYNO.API.Auth'
}

probe_host() {  # probe_host <host> -> stampa l'URL che funziona
  local host="$1" url
  for url in "https://$host:5001" "http://$host:5000" "https://$host"; do
    probe "$url" && { echo "$url"; return 0; }
  done
  return 1
}

FOUND=""
if [ -n "${NAS_URL:-}" ]; then
  info "provo NAS_URL dall'ambiente..."
  for candidato in $(echo "$NAS_URL" | tr ',' ' '); do
    candidato="${candidato%/}"
    [[ "$candidato" == *://* ]] || candidato="https://$candidato"
    probe "$candidato" && { FOUND="$candidato"; break; }
  done
fi

if [ -z "$FOUND" ] && [ -f "$CONFIG" ] && [ "$FORCE" = 0 ]; then
  EXISTING="$(sed -n 's/^NAS_URL=//p' "$CONFIG" | head -1 | tr -d "\"'")"
  if [ -n "$EXISTING" ]; then
    info "provo l'indirizzo gia' configurato..."
    probe "${EXISTING%/}" && FOUND="${EXISTING%/}"
  fi
fi

if [ -z "$FOUND" ] && ! in_cloud; then
  info "cerco un DiskStation ai nomi soliti..."
  for host in diskstation.local nas.local synology.local diskstation nas; do
    FOUND="$(probe_host "$host")" && break || FOUND=""
  done
  if [ -n "$FOUND" ] && [ "$INTERACTIVE" = 1 ]; then
    # Le credenziali verranno mandate a QUESTO indirizzo al passo 6: meglio
    # una conferma che scoprire dopo che rispondeva un altro dispositivo.
    confirm "Trovato un DSM su $FOUND. E' il tuo NAS?" || FOUND=""
  fi
fi

if [ -z "$FOUND" ] && [ "$ALLOW_SCAN" = 1 ]; then
  SUBNET="$(python3 - <<'PY' 2>/dev/null
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(("192.0.2.1", 9))          # indirizzo di documentazione, nessun traffico
    print(".".join(s.getsockname()[0].split(".")[:3]))
except OSError:
    pass
finally:
    s.close()
PY
)"
  if [ -n "$SUBNET" ] && confirm "Non l'ho trovato. Sei sulla rete di casa? Scansiono $SUBNET.0/24 sulla porta 5001 (non farlo su una rete che non e' tua)"; then
    info "scansione in corso, una decina di secondi..."
    TMP="$(mktemp -d)"
    for i in $(seq 1 254); do
      ( curl -sk --max-time 2 \
          "https://$SUBNET.$i:5001/webapi/query.cgi?api=SYNO.API.Info&version=1&method=query&query=all" \
          2>/dev/null | grep -q 'SYNO.API.Auth' && echo "https://$SUBNET.$i:5001" > "$TMP/hit.$i" ) &
      [ $((i % 48)) = 0 ] && wait
    done
    wait
    FOUND="$(cat "$TMP"/hit.* 2>/dev/null | head -1)"
    rm -rf "$TMP"
  fi
fi

if [ -n "$FOUND" ]; then
  ok "DSM raggiungibile su $FOUND"
elif [ "$INTERACTIVE" = 0 ]; then
  # Senza nessuno a cui chiedere, NAS_URL e' l'unica fonte possibile. Se non
  # risponde lo diciamo, ma proseguiamo: il passo 6 fara' la diagnosi vera.
  [ -n "${NAS_URL:-}" ] || fail "in modalita' non interattiva serve NAS_URL nell'ambiente."
  FOUND="$(echo "$NAS_URL" | tr ',' ' ' | awk '{print $1}')"; FOUND="${FOUND%/}"
  [[ "$FOUND" == *://* ]] || FOUND="https://$FOUND"
  warn "nessun indirizzo di NAS_URL risponde da qui; proseguo e lascio la diagnosi alla verifica finale."
else
  warn "non l'ho trovato da solo."
  info "Se sei fuori casa serve l'indirizzo pubblico (DDNS), non l'IP locale."
  ask "Indirizzo del NAS (es. https://casa.synology.me:5001)" FOUND
  [ -n "$FOUND" ] || fail "senza indirizzo non posso proseguire."
  FOUND="${FOUND%/}"
  [[ "$FOUND" == *://* ]] || FOUND="https://$FOUND"
  probe "$FOUND" || warn "a questo indirizzo non risponde un DSM; scrivo comunque la configurazione."
fi

case "$FOUND" in
  https://*) : ;;
  *) warn "connessione in chiaro: va bene su LAN fidata, non da fuori casa." ;;
esac

# -------------------------------------------------------------- 5. credenziali
step "Credenziali"
if [ -f "$CONFIG" ] && [ "$FORCE" = 0 ] && [ "$INTERACTIVE" = 1 ]; then
  confirm "Esiste gia' $CONFIG. Lo sovrascrivo?" || {
    info "configurazione lasciata com'e'"; SKIP_WRITE=1; }
fi

if [ "${SKIP_WRITE:-0}" != 1 ] && [ "$INTERACTIVE" = 0 ] && in_cloud; then
  # Container cloud: le variabili arrivano dall'environment e ci restano.
  # Copiarle in un file su disco effimero non serve a niente e lascia in
  # giro una password in piu'.
  info "sessione cloud: le variabili dell'environment bastano, niente file"
  SKIP_WRITE=1
fi

if [ "${SKIP_WRITE:-0}" != 1 ]; then
  if [ "$INTERACTIVE" = 0 ]; then
    USER_NAME="${NAS_USER:-}"; PASS="${NAS_PASS:-}"; OTP="${NAS_OTP_SECRET:-}"
    [ -n "$USER_NAME" ] && [ -n "$PASS" ] || fail "in modalita' non interattiva servono NAS_USER e NAS_PASS."
  else
    info "Usa un utente DSM dedicato, non il tuo account personale."
    info "Come crearlo: references/setup.md, sezione 1."
    ask "Utente DSM" USER_NAME "${NAS_USER:-}"
    [ -n "$USER_NAME" ] || fail "serve un nome utente."
    read -rsp "  Password: " PASS; echo
    [ -n "$PASS" ] || fail "serve una password."
    info "Il segreto 2FA e' la stringa base32 sotto il QR code di DSM."
    read -rsp "  Segreto 2FA base32 (invio per saltare): " OTP; echo
  fi

  SSH_HOST=""; SSH_USER=""; SSH_KEY=""
  if [ "$INTERACTIVE" = 1 ] && command -v ssh >/dev/null; then
    WEBHOST="${FOUND#*://}"; WEBHOST="${WEBHOST%%:*}"
    SSH_TARGET=""
    if is_local_host "$WEBHOST"; then
      confirm "Configuro anche SSH verso $WEBHOST, per la shell di DSM?" \
        && SSH_TARGET="$WEBHOST"
    else
      case "$WEBHOST" in
        *.quickconnect.*)
          info "$WEBHOST e' un relay QuickConnect di Synology: inoltra il traffico"
          info "web di DSM, non SSH. La chiave finirebbe su una macchina non tua." ;;
        *)
          info "$WEBHOST e' un indirizzo pubblico: SSH andrebbe verso la porta 22"
          info "di casa, che e' meglio non aprire." ;;
      esac
      info "SSH serve solo dal Mac sulla stessa rete del NAS (o in VPN)."
      if confirm "Vuoi configurarlo verso l'indirizzo locale del NAS?"; then
        ask "Indirizzo locale del NAS (es. 192.168.1.10)" SSH_TARGET ""
        if [ -n "$SSH_TARGET" ] && ! is_local_host "$SSH_TARGET"; then
          warn "$SSH_TARGET non sembra un indirizzo di rete locale; salto SSH."
          SSH_TARGET=""
        fi
      fi
    fi

    if [ -n "$SSH_TARGET" ]; then
      SSH_HOST="$SSH_TARGET"
      ask "Utente SSH" SSH_USER "$USER_NAME"
      SSH_KEY="$HOME/.ssh/id_ed25519_nas"
      if [ ! -f "$SSH_KEY" ] && command -v ssh-keygen >/dev/null; then
        mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
        if ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -C "claude-nas" >/dev/null 2>&1; then
          ok "chiave creata in $SSH_KEY"
        else
          warn "non sono riuscito a creare la chiave in $SSH_KEY; salto SSH."
          SSH_HOST=""; SSH_USER=""; SSH_KEY=""
        fi
      fi
      if [ -f "$SSH_KEY.pub" ] && command -v ssh-copy-id >/dev/null; then
        info "Ora installo la chiave sul NAS. Due cose che ti chiedera':"
        info "  - l'impronta della chiave dell'host, la prima volta: rispondi yes"
        info "  - la password di $SSH_USER su DSM"
        if ssh-copy-id -i "$SSH_KEY.pub" "$SSH_USER@$SSH_HOST"; then
          ok "chiave installata"
          if ssh -o BatchMode=yes -o ConnectTimeout=10 -i "$SSH_KEY" \
               "$SSH_USER@$SSH_HOST" true 2>/dev/null; then
            ok "collegamento SSH verificato"
          else
            warn "la chiave e' installata ma il collegamento non riesce ancora."
          fi
        else
          warn "chiave non installata: attiva SSH in DSM (Pannello di controllo >"
          warn "Terminale e SNMP) e rilancia. Il resto della skill funziona lo stesso."
          SSH_HOST=""; SSH_USER=""; SSH_KEY=""
        fi
      fi
    fi
  fi

  # Un solo file per tutte le situazioni: in casa risponde la LAN, fuori
  # Tailscale, nel cloud QuickConnect. Il client prova in ordine e tiene il
  # primo che risponde, quindi qui si raccolgono tutti gli indirizzi noti.
  INDIRIZZI="$FOUND"
  for extra in $(echo "${NAS_URL:-}" | tr ',' ' '); do
    extra="${extra%/}"; [ -n "$extra" ] || continue
    [[ "$extra" == *://* ]] || extra="https://$extra"
    case " $INDIRIZZI " in *" $extra "*) ;; *) INDIRIZZI="$INDIRIZZI $extra" ;; esac
  done
  if [ "$INTERACTIVE" = 1 ]; then
    info "Se il NAS ha altri indirizzi (Tailscale 100.x.y.z, QuickConnect, DDNS),"
    info "mettili qui separati da spazio: la stessa configurazione varra' anche"
    info "fuori casa e nel cloud. Invio per saltare."
    ask "Altri indirizzi" ALTRI ""
    for extra in $ALTRI; do
      extra="${extra%/}"
      [[ "$extra" == *://* ]] || extra="https://$extra"
      case " $INDIRIZZI " in *" $extra "*) ;; *) INDIRIZZI="$INDIRIZZI $extra" ;; esac
    done
  fi
  NAS_URL_RIGA="$(echo "$INDIRIZZI" | tr -s ' ' ',' | sed 's/^,//;s/,$//')"

  mkdir -p "$(dirname "$CONFIG")"
  ( umask 077
    {
      echo "# Credenziali del NAS. Non copiare questo file in un repository."
      echo "# Generato da nas-setup.sh il $(date '+%Y-%m-%d %H:%M')."
      echo "# NAS_URL: piu' indirizzi in ordine di preferenza, risponde il primo"
      echo "# raggiungibile (LAN in casa, Tailscale fuori, QuickConnect nel cloud)."
      echo "NAS_URL=$NAS_URL_RIGA"
      echo "NAS_USER=$USER_NAME"
      echo "NAS_PASS=$PASS"
      [ -n "$OTP" ] && echo "NAS_OTP_SECRET=$OTP"
      if [ -n "$SSH_HOST" ]; then
        echo "NAS_SSH_HOST=$SSH_HOST"
        echo "NAS_SSH_USER=$SSH_USER"
        echo "NAS_SSH_KEY=$SSH_KEY"
      fi
      echo "# Togli il commento solo se il NAS ha il certificato autofirmato"
      echo "# e lo raggiungi solo dalla LAN:"
      echo "# NAS_VERIFY_TLS=no"
    } > "$CONFIG" )
  chmod 600 "$CONFIG"
  ok "scritto $CONFIG (permessi 600)"
fi

# --------------------------------------------------------------- 6. verifica
step "Verifica sul NAS"

# Su LAN o Tailscale il certificato autofirmato di DSM non e' verificabile, ed
# e' il caso normale, non un'anomalia: il canale e' gia' protetto dalla rete
# locale o dal tunnel. Invece di fermarsi con un errore di certificato, lo
# script propone il rimedio e lo scrive, ma solo per host di quel tipo: su un
# indirizzo pubblico disattivare la verifica sarebbe un consiglio pessimo.
VERIFICA="$("$NAS" check 2>&1)"
if [ $? -ne 0 ] && grep -q "certificato TLS non verificabile" <<<"$VERIFICA"; then
  HOSTVER="${FOUND#*://}"; HOSTVER="${HOSTVER%%:*}"
  if is_local_host "$HOSTVER"; then
    info "Il NAS ha il certificato autofirmato di DSM, che nessun client puo'"
    info "verificare. Su $HOSTVER il canale e' comunque protetto (rete locale o"
    info "tunnel Tailscale), quindi la verifica del certificato si puo' togliere."
    if [ "$INTERACTIVE" = 0 ] || confirm "Aggiungo NAS_VERIFY_TLS=no alla configurazione?"; then
      # Via anche le due righe di commento che spiegavano come attivarla:
      # lasciarle sopra alla riga attiva le farebbe leggere come una smentita.
      sed -i.bak -e '/^# Togli il commento/d' -e '/^# e lo raggiungi/d' \
        -e '/^# *NAS_VERIFY_TLS=/d' -e '/^NAS_VERIFY_TLS=/d' "$CONFIG"
      rm -f "$CONFIG.bak"
      {
        echo "# Verifica del certificato disattivata: host raggiungibile solo"
        echo "# dalla rete locale o da Tailscale, dove il canale e' gia' protetto."
        echo "NAS_VERIFY_TLS=no"
      } >> "$CONFIG"
      chmod 600 "$CONFIG"
      ok "verifica del certificato disattivata per questo NAS"
      info "Per riattivarla: installa un certificato Let's Encrypt in DSM e togli"
      info "la riga NAS_VERIFY_TLS=no da $CONFIG."
    fi
  fi
fi

if "$NAS" check; then
  echo
  echo "Pronto. Lo stato completo del NAS:"
  echo
  "$NAS" health || true
  echo
  echo "Da qui in poi basta chiedere a Claude, per esempio:"
  echo "  \"controlla il NAS\"   \"quanto spazio e' rimasto?\"   \"il backup e' andato?\""
  if "$NAS" cloud 2>/dev/null | grep -q "^     NAS_URL=https"; then
    echo
    echo "Per usare il NAS anche dalle sessioni cloud (dal telefono), la ricetta"
    echo "da incollare nelle impostazioni dell'environment: $NAS cloud"
  fi
else
  echo
  echo "Il collegamento non e' riuscito. La riga di errore qui sopra dice cosa manca;"
  echo "le cause frequenti e i rimedi sono in $SKILL_DIR/references/setup.md."
  exit 1
fi
