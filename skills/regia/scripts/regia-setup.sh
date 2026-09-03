#!/bin/bash
#
# Prepara il canale della regia dove non c'è un browser: sessioni cloud,
# container, macchine remote, un ambiente aperto dal telefono.
#
#   ./regia-setup.sh            usa quello che trova nell'ambiente
#   ./regia-setup.sh --device   autentica col codice a schermo (tiene l'abbonamento)
#
# Tre strade, in quest'ordine:
#
#   1. Autenticazione già presente          niente da fare.
#   2. OPENAI_API_KEY nell'ambiente         non interattiva, ma SI PAGA A CONSUMO.
#   3. Codice a schermo (--device)          gratis, usa l'abbonamento: la macchina
#                                           mostra un codice, tu lo approvi da un
#                                           browser qualsiasi, anche dal telefono.
#
# La 3 è quella giusta per un ambiente che userai davvero: il flusso a
# dispositivo non richiede un browser QUI, solo un browser DA QUALCHE PARTE.
# La 2 serve quando non c'è nessuno ad approvare, per esempio in un setup
# script che gira da solo alla creazione dell'ambiente.
#
# Esce 0 solo se il canale ha davvero risposto: l'ultimo passo è una chiamata
# vera, perché "installato" e "funzionante" non sono la stessa cosa.

set -u

QUI="$(cd "$(dirname "$0")" && pwd)"
GPT="$QUI/gpt"
DEVICE="no"
[ "${1:-}" = "--device" ] && DEVICE="si"

rosso()  { printf '\033[31m%s\033[0m\n' "$*" >&2; }
giallo() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
verde()  { printf '\033[32m%s\033[0m\n' "$*" >&2; }
nota()   { printf '%s\n' "$*" >&2; }
passo()  { nota ""; nota "— $* —"; }

ESECUTORE="$("$GPT" esecutore 2>/dev/null || echo chatgpt)"
nota "canale da preparare: esecutore = $ESECUTORE"

installa_con_npm() {
    local pacchetto="$1" binario="$2"
    command -v "$binario" >/dev/null 2>&1 && {
        verde "✓ $binario già installato ($("$binario" --version 2>/dev/null))"
        return 0
    }
    command -v npm >/dev/null 2>&1 || {
        rosso "✗ manca sia $binario sia npm: qui non posso installarlo."
        nota  '  Rimedio: installa Node, poi rilancia questo script.'
        return 1
    }
    nota "installo $pacchetto…"
    npm install -g "$pacchetto" >/dev/null 2>&1 || {
        rosso "✗ npm install -g $pacchetto è fallito."
        nota  '  In un container può servire eseguirlo come root.'
        return 1
    }
    verde "✓ installato ($("$binario" --version 2>/dev/null))"
}

# ---------------------------------------------------------------- ChatGPT ---

prepara_chatgpt() {
    passo "la CLI codex"
    installa_con_npm @openai/codex codex || return 1

    passo "l'autenticazione"
    local stato
    stato="$(codex login status 2>&1)"
    case "$stato" in
        *ChatGPT*)
            verde "✓ già autenticato con l'account ChatGPT — si usa l'abbonamento"
            return 0 ;;
        *"API key"*)
            giallo "! già autenticato con una chiave API: si paga a consumo"
            return 0 ;;
    esac

    if [ "$DEVICE" = "si" ]; then
        nota ""
        nota "Ora codex mostra un indirizzo e un codice: apri quell'indirizzo da"
        nota "un browser qualsiasi — anche dal telefono — e inserisci il codice."
        nota "Così questa macchina eredita il tuo abbonamento, senza pagare a token."
        nota ""
        codex login --device-auth || { rosso "✗ autenticazione non completata."; return 1; }
        verde "✓ autenticato con l'account ChatGPT"
        return 0
    fi

    if [ -n "${OPENAI_API_KEY:-}" ]; then
        nota "autentico con OPENAI_API_KEY dall'ambiente…"
        printf '%s' "$OPENAI_API_KEY" | codex login --with-api-key >/dev/null 2>&1 || {
            rosso "✗ codex ha rifiutato la chiave."
            return 1
        }
        giallo "! autenticato con chiave API: da qui in poi si paga a consumo"
        return 0
    fi

    rosso "✗ non autenticato, e non c'è modo di farlo da solo."
    nota  ''
    nota  '  Se puoi approvare da un browser (anche il telefono), la strada'
    nota  '  buona è questa, perché tiene il tuo abbonamento e non costa nulla:'
    nota  ''
    nota  '      ./regia-setup.sh --device'
    nota  ''
    nota  '  Se invece qui non ci sarà mai nessuno ad approvare — un setup'
    nota  '  script che gira da solo — metti una chiave OpenAI nell ambiente:'
    nota  ''
    nota  '      OPENAI_API_KEY=…   (si crea su platform.openai.com)'
    nota  ''
    nota  '  Ma sappilo: la chiave API si paga a consumo, l abbonamento no.'
    return 1
}

# ----------------------------------------------------------------- Claude ---

prepara_claude() {
    passo "la CLI claude"
    installa_con_npm @anthropic-ai/claude-code claude || return 1

    passo "l'autenticazione"
    if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
        giallo "! ANTHROPIC_API_KEY è nell'ambiente: si paga a consumo"
        return 0
    fi
    nota "· nessuna ANTHROPIC_API_KEY: conto su un login già presente."
    nota "  Se non c'è, la prova qui sotto fallisce e te lo dice."
}

# ------------------------------------------------------------------ prova ---

case "$ESECUTORE" in
    claude)  prepara_claude  || exit 1 ;;
    *)       prepara_chatgpt || exit 1 ;;
esac

passo "la prova vera"
nota "una chiamata sola, per vedere se il canale risponde davvero…"
risposta="$("$GPT" chiedi --sforzo low --timeout 180 --tag setup \
            "Rispondi esattamente con la parola PRONTO, nient'altro." 2>&1)"
case "$risposta" in
    *PRONTO*)
        nota ""
        verde "canale pronto: $ESECUTORE risponde."
        exit 0 ;;
    *)
        nota ""
        rosso "✗ il canale non ha risposto come previsto."
        nota  "$risposta"
        exit 1 ;;
esac
