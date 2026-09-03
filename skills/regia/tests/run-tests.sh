#!/bin/bash
#
# Controlli della skill di regia.
#
#   ./run-tests.sh          solo prove offline (non chiama il modello)
#   ./run-tests.sh --vivo   aggiunge una chiamata vera a ChatGPT
#
# Le prove offline usano --prova, che stampa il comando senza eseguirlo:
# non consumano l'abbonamento e non lasciano traccia nel registro.

set -u

QUI="$(cd "$(dirname "$0")" && pwd)"
GPT="$QUI/../scripts/gpt"
VIVO="no"
[ "${1:-}" = "--vivo" ] && VIVO="si"

# Le asserzioni sulla costruzione del comando guardano i flag di `codex`,
# quindi il canale va fissato: altrimenti la stessa suite, eseguita dalla
# copia installata sotto ~/.codex (che delega a Claude), fallirebbe metà
# delle prove per il motivo sbagliato. I due canali si provano a parte,
# passando --esecutore per nome.
export REGIA_ESECUTORE=chatgpt

passati=0
falliti=0

prova() {
    local nome="$1"; shift
    if "$@" >/dev/null 2>&1; then
        printf '  \033[32m✓\033[0m %s\n' "$nome"
        passati=$((passati + 1))
    else
        printf '  \033[31m✗\033[0m %s\n' "$nome"
        falliti=$((falliti + 1))
    fi
}

prova_fallisce_con() {
    local nome="$1" atteso="$2"; shift 2
    "$@" >/dev/null 2>&1
    local codice=$?
    if [ "$codice" -eq "$atteso" ]; then
        printf '  \033[32m✓\033[0m %s\n' "$nome"
        passati=$((passati + 1))
    else
        printf '  \033[31m✗\033[0m %s (atteso %s, ottenuto %s)\n' "$nome" "$atteso" "$codice"
        falliti=$((falliti + 1))
    fi
}

contiene() {
    local nome="$1" atteso="$2"; shift 2
    local uscita
    uscita="$("$@" 2>&1)"
    case "$uscita" in
        *"$atteso"*) printf '  \033[32m✓\033[0m %s\n' "$nome"; passati=$((passati + 1)) ;;
        *) printf '  \033[31m✗\033[0m %s (non contiene: %s)\n' "$nome" "$atteso"; falliti=$((falliti + 1)) ;;
    esac
}

echo "— struttura —"
prova "lo script esiste ed è eseguibile" test -x "$GPT"
prova "la sintassi bash è valida" bash -n "$GPT"
prova "SKILL.md c'è" test -f "$QUI/../SKILL.md"
prova "lo script di preparazione esiste ed è eseguibile" test -x "$QUI/../scripts/regia-setup.sh"
prova "la sintassi di regia-setup.sh è valida" bash -n "$QUI/../scripts/regia-setup.sh"
# un backtick fuori dai commenti in regia-setup.sh viene ESEGUITO: è già successo,
# e ha fatto partire un vero `codex login` invece di stampare il suo nome.
if grep -n '`' "$QUI/../scripts/regia-setup.sh" | grep -qv '^[0-9]*:#'; then
    printf '  \033[31m✗\033[0m regia-setup.sh ha backtick fuori dai commenti: verrebbero eseguiti\n'
    falliti=$((falliti + 1))
else
    printf '  \033[32m✓\033[0m nessun backtick eseguibile in regia-setup.sh\n'
    passati=$((passati + 1))
fi
for r in canale briefing schemi; do
    prova "references/$r.md c'è" test -f "$QUI/../references/$r.md"
done

# claude.ai rifiuta l'upload se la description supera i 1024 caratteri:
# il limite si scopre solo al caricamento, quindi va controllato qui.
lung="$(awk '/^description:/{sub(/^description: /,""); printf "%s", $0; exit}' "$QUI/../SKILL.md" | wc -c | tr -d ' ')"
if [ "$lung" -le 1024 ] && [ "$lung" -gt 100 ]; then
    printf '  \033[32m✓\033[0m description di %s caratteri (limite 1024)\n' "$lung"; passati=$((passati + 1))
else
    printf '  \033[31m✗\033[0m description di %s caratteri: claude.ai rifiuta oltre 1024\n' "$lung"; falliti=$((falliti + 1))
fi

echo "— uso errato —"
prova_fallisce_con "senza sottocomando esce 2" 2 "$GPT"
prova_fallisce_con "sottocomando ignoto esce 2" 2 "$GPT" fantasia
prova_fallisce_con "sforzo non valido esce 2" 2 "$GPT" chiedi --sforzo assurdo --prova "x"
prova_fallisce_con "'lavora' senza --dir esce 2" 2 "$GPT" lavora --prova "x"
prova_fallisce_con "'json' senza --schema esce 2" 2 "$GPT" json --prova "x"
prova_fallisce_con "'continua' senza sessione esce 2" 2 "$GPT" continua --prova "x"
prova_fallisce_con "cartella inesistente esce 2" 2 "$GPT" chiedi --dir /non/esiste --prova "x"
prova_fallisce_con "sandbox completo rifiutato" 2 "$GPT" chiedi --sandbox danger-full-access --prova "x"
prova_fallisce_con "brief mancante esce 2" 2 "$GPT" chiedi --prova < /dev/null
prova_fallisce_con "opzione senza valore esce 2" 2 "$GPT" chiedi --tag
prova_fallisce_con "timeout non numerico esce 2" 2 "$GPT" chiedi --timeout abc --prova "x"
prova_fallisce_con "timeout zero esce 2" 2 "$GPT" chiedi --timeout 0 --prova "x"
prova_fallisce_con "parallele zero esce 2" 2 "$GPT" squadra --parallele 0 --brief /dev/null

echo "— guardia dei segreti —"
prova_fallisce_con "rifiuta 'password: valore'" 2 "$GPT" chiedi --prova "entra con password: segretissima99"
prova_fallisce_con "rifiuta una chiave sk-" 2 "$GPT" chiedi --prova "la chiave e sk-abcdefghijklmnopqrstuvwxyz01"
prova_fallisce_con "rifiuta la forma JSON" 2 "$GPT" chiedi --prova '{"password": "hunter2xyz"}'
prova_fallisce_con "rifiuta un Bearer" 2 "$GPT" chiedi --prova "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123"
prova_fallisce_con "rifiuta un token GitHub" 2 "$GPT" chiedi --prova "usa ghp_abcdefghijklmnopqrstuvwxyz12"
prova "--consapevole scavalca" "$GPT" chiedi --prova --consapevole "password: finta123"
prova "parlare di password senza valori passa" "$GPT" chiedi --prova "spiegami come si gestiscono le password"

echo "— costruzione del comando —"
contiene "chiedi è in sola lettura" "--sandbox read-only" "$GPT" chiedi --prova "x"
contiene "chiedi resta in sola lettura anche se forzato" "--sandbox read-only" \
         "$GPT" chiedi --sandbox workspace-write --prova "x"
contiene "rivedi è in sola lettura" "--sandbox read-only" "$GPT" rivedi --prova "x"
contiene "lavora apre workspace-write" "--sandbox workspace-write" "$GPT" lavora --dir /tmp --prova "x"
contiene "passa sempre --skip-git-repo-check" "--skip-git-repo-check" "$GPT" chiedi --prova "x"
contiene "il brief arriva da stdin" "--json" "$GPT" chiedi --prova "x"
contiene "lo sforzo finisce nel comando" "model_reasoning_effort" "$GPT" chiedi --sforzo low --prova "x"
# resume non accetta --color, --sandbox, -C: il comando non deve contenerli
uscita="$("$GPT" continua --sessione 00000000-0000-0000-0000-000000000000 --prova "x" 2>&1)"
case "$uscita" in
    *"--color"*|*"--sandbox"*|*" -C "*)
        printf '  \033[31m✗\033[0m resume non usa flag che non accetta\n'; falliti=$((falliti + 1)) ;;
    *"sandbox_mode"*)
        printf '  \033[32m✓\033[0m resume non usa flag che non accetta\n'; passati=$((passati + 1)) ;;
    *)
        printf '  \033[31m✗\033[0m resume non usa flag che non accetta (comando inatteso)\n'; falliti=$((falliti + 1)) ;;
esac

echo "— i due canali —"
prova_fallisce_con "esecutore ignoto rifiutato" 2 "$GPT" chiedi --esecutore gemini --prova "x"
contiene "verso chatgpt costruisce un comando codex" "codex exec" \
         "$GPT" chiedi --esecutore chatgpt --prova "x"
contiene "verso claude costruisce un comando claude" "claude -p --output-format json" \
         "$GPT" chiedi --esecutore claude --prova "x"
contiene "verso claude la sola lettura è 'plan'" "--permission-mode plan" \
         "$GPT" chiedi --esecutore claude --prova "x"
contiene "verso claude la scrittura è 'acceptEdits'" "--permission-mode acceptEdits" \
         "$GPT" lavora --esecutore claude --dir /tmp --prova "x"
# l'esecutore lo decide il posto in cui la skill è installata
finto="$(mktemp -d)/.codex/skills/regia"
mkdir -p "$finto" && cp -a "$QUI/../scripts" "$QUI/../SKILL.md" "$finto/"
scelto="$(env -u REGIA_ESECUTORE HOME="${finto%/.codex/skills/regia}" "$finto/scripts/gpt" esecutore 2>/dev/null)"
if [ "$scelto" = "claude" ]; then
    printf '  \033[32m✓\033[0m installata sotto ~/.codex delega a claude\n'; passati=$((passati + 1))
else
    printf '  \033[31m✗\033[0m sotto ~/.codex ha scelto "%s" invece di claude\n' "$scelto"; falliti=$((falliti + 1))
fi
rm -rf "${finto%/.codex/skills/regia}"
finto2="$(mktemp -d)/.claude/skills/regia"
mkdir -p "$finto2" && cp -a "$QUI/../scripts" "$QUI/../SKILL.md" "$finto2/"
scelto2="$(env -u REGIA_ESECUTORE HOME="${finto2%/.claude/skills/regia}" "$finto2/scripts/gpt" esecutore 2>/dev/null)"
if [ "$scelto2" = "chatgpt" ]; then
    printf '  \033[32m✓\033[0m installata sotto ~/.claude delega a chatgpt\n'; passati=$((passati + 1))
else
    printf '  \033[31m✗\033[0m sotto ~/.claude ha scelto "%s" invece di chatgpt\n' "$scelto2"; falliti=$((falliti + 1))
fi
rm -rf "${finto2%/.claude/skills/regia}"

echo "— la squadra rispetta la prova a secco —"
# senza questo, `squadra --prova` chiamerebbe il modello davvero, N volte
banco="$(mktemp -d)"
printf 'OBIETTIVO: dimmi ciao.\n' > "$banco/uno.md"
printf 'OBIETTIVO: dimmi ciao.\n' > "$banco/due.md"
quanti="$("$GPT" squadra --prova --brief "$banco/uno.md" --brief "$banco/due.md" 2>/dev/null | grep -c 'codex exec')"
if [ "$quanti" = "2" ]; then
    printf '  \033[32m✓\033[0m due comandi stampati, nessuna chiamata vera\n'; passati=$((passati + 1))
else
    printf '  \033[31m✗\033[0m squadra --prova ha stampato %s comandi invece di 2\n' "$quanti"; falliti=$((falliti + 1))
fi
rm -rf "$banco"

echo "— la ripresa non pesca la conversazione di un altro —"
uscita="$(cd /tmp && "$GPT" continua --ultimo --prova "x" 2>&1)"
codice=$?
if [ "$codice" -eq 2 ]; then
    printf '  \033[32m✓\033[0m da una cartella estranea si ferma\n'; passati=$((passati + 1))
else
    printf '  \033[31m✗\033[0m da una cartella estranea non si ferma (codice %s)\n' "$codice"; falliti=$((falliti + 1))
fi
case "$uscita" in
    *"nessuna sessione di questa cartella"*)
        printf '  \033[32m✓\033[0m spiega perché si è fermata\n'; passati=$((passati + 1)) ;;
    *)  printf '  \033[31m✗\033[0m messaggio inatteso: %s\n' "$uscita"; falliti=$((falliti + 1)) ;;
esac

echo "— il registro non è leggibile dagli altri account —"
"$GPT" check >/dev/null 2>&1
permessi="$(ls -ld "${REGIA_HOME:-$HOME/.regia}" | cut -c1-10)"
if [ "$permessi" = "drwx------" ]; then
    printf '  \033[32m✓\033[0m ~/.regia è 700\n'; passati=$((passati + 1))
else
    printf '  \033[31m✗\033[0m ~/.regia ha permessi %s\n' "$permessi"; falliti=$((falliti + 1))
fi

echo "— la prova a secco non sporca il registro —"
prima="$(ls -1 "${REGIA_HOME:-$HOME/.regia}/lavori" 2>/dev/null | wc -l | tr -d ' ')"
"$GPT" chiedi --prova "x" >/dev/null 2>&1
dopo="$(ls -1 "${REGIA_HOME:-$HOME/.regia}/lavori" 2>/dev/null | wc -l | tr -d ' ')"
if [ "$prima" = "$dopo" ]; then
    printf '  \033[32m✓\033[0m nessuna cartella lasciata indietro\n'; passati=$((passati + 1))
else
    printf '  \033[31m✗\033[0m il registro è cresciuto (%s → %s)\n' "$prima" "$dopo"; falliti=$((falliti + 1))
fi

echo "— canale —"
if "$GPT" check >/dev/null 2>&1; then
    printf '  \033[32m✓\033[0m il canale si dichiara pronto\n'; passati=$((passati + 1))
else
    printf '  \033[33m!\033[0m canale non pronto: serve `codex login` o l'"'"'installazione\n'
fi

if [ "$VIVO" = "si" ]; then
    echo "— prova viva (consuma l'abbonamento) —"
    risposta="$("$GPT" chiedi --sforzo low --tag autoprova \
        "Rispondi esattamente con la parola PRONTO, nient'altro." 2>/dev/null)"
    case "$risposta" in
        *PRONTO*) printf '  \033[32m✓\033[0m ChatGPT ha risposto\n'; passati=$((passati + 1)) ;;
        *) printf '  \033[31m✗\033[0m risposta inattesa: %s\n' "$risposta"; falliti=$((falliti + 1)) ;;
    esac
fi

echo
if [ "$falliti" -eq 0 ]; then
    printf '\033[32m%s prove passate.\033[0m\n' "$passati"
    exit 0
fi
printf '\033[31m%s passate, %s fallite.\033[0m\n' "$passati" "$falliti"
exit 1
