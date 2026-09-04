---
name: kits
description: |
  Ponte sicuro verso l'API di Kits.ai per la conversione voce-a-voce (voice-to-voice):
  elenca i modelli vocali dell'account e converte file audio WAV/MP3 con un modello scelto.
  Usare quando l'utente chiede di: usare Kits o Kits.ai; convertire/sostituire la voce di una
  canzone o di un audio con un modello vocale (es. il modello "dario"); elencare i propri
  modelli vocali Kits; fare un test di connessione a Kits; cambiare tonalità/ottava di una
  voce convertita; o menziona la repo "elevenlab" in relazione a Kits.
  NON per: text-to-speech (l'API TTS di Kits è stata dismessa il 22/09/2025 — per il TTS
  usare ElevenLabs), né per la generazione di musica da zero.
argument-hint: "[models | convert --input file.wav --voice-model-id ID]"
homepage: https://docs.kits.ai/api-reference/introduction/getting-started
allowed-tools: Bash, Read, Write, WebFetch
metadata:
  openclaw:
    requires:
      env:
        - KITS_API_KEY
    primaryEnv: KITS_API_KEY
---

# Kits.ai — conversione vocale

Skill autonoma: il client Python completo è incluso in `scripts/`, non serve
clonare nessuna repo. La fonte originale è la repo privata
`doctorplastic79-cmd/elevenlab` (che contiene anche il workflow GitHub Actions
"Test Kits.ai connection"); se serve quella, in una sessione Claude Code remota
si collega con `add_repo`.

## Sicurezza (regola assoluta)

Il token API vive SOLO nella variabile d'ambiente `KITS_API_KEY`. Mai:
stamparlo, scriverlo in file committati, incollarlo in chat, log o issue.
Se `KITS_API_KEY` non è impostata, fermarsi e chiedere all'utente di
configurarla (variabili d'ambiente dell'environment su claude.ai/code, oppure
`.env` locale non committato), senza farsi dettare il token in chat.

## Setup (una volta per sessione)

```bash
python3 -m pip install -q "requests>=2.32.0,<3.0.0"
test -n "$KITS_API_KEY" && echo "KITS_API_KEY presente" || echo "MANCA KITS_API_KEY"
```

## Test di connessione / elenco modelli

```bash
python3 "${SKILL_DIR}/scripts/kits_cli.py" models --mine --output kits_models.json
```

Senza `--mine` elenca tutti i modelli disponibili (paginato: `--page`,
`--per-page`, `--order asc|desc`). Un elenco restituito con successo È il test
di connessione riuscito. Riportare all'utente titolo e ID numerico di ogni
modello.

## Conversione di un audio

```bash
python3 "${SKILL_DIR}/scripts/kits_cli.py" convert \
  --input sorgente.wav \
  --voice-model-id 2185846 \
  --conversion-strength 0.7 \
  --model-volume-mix 0.5 \
  --pitch-shift 0 \
  --output convertito.wav
```

Il comando crea il job, fa polling fino al completamento (default: ogni 5 s,
timeout 900 s) e scarica il risultato. Intervalli validati dal client:

- `--conversion-strength`: 0–1 (quanto la voce del modello sostituisce l'originale);
- `--model-volume-mix`: 0–1 (bilanciamento del volume del modello nel mix);
- `--pitch-shift`: da −24 a +24 semitoni (−12 = un'ottava sotto).

## Contesto dell'account

- Modello vocale personale dell'utente: **dario**, ID `2185846` — è il default
  giusto quando chiede "con la mia voce" o non specifica un modello.
- Richieste ricorrenti già viste: sostituire la voce solista di una canzone
  preservando i cori; versione un'ottava sotto (`--pitch-shift -12`).
- Per isolare la voce solista dai cori/strumentale prima della conversione,
  o rimontare il mix dopo, usare FFmpeg (o un separatore di stem se
  disponibile): Kits converte il file audio che riceve, non separa le tracce.

## Riferimenti API

- https://docs.kits.ai/api-reference/introduction/getting-started
- https://docs.kits.ai/api-reference/api-endpoints/voice-model-api/fetch-voice-models
- https://docs.kits.ai/api-reference/api-endpoints/voice-conversion-api/create-new-voice-conversion-job
