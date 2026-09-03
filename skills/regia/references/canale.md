# Il canale, sul campo

Tutto quello che sta qui è stato **misurato** su macOS (Apple Silicon) con
`codex-cli 0.153.0`, non ricordato a memoria. Se cambi versione, rimisura.

## Che cos'è

`codex` è la CLI ufficiale di OpenAI (`npm install -g @openai/codex`).
Quando è autenticata **con l'account ChatGPT** — `codex login status` dice
*Logged in using ChatGPT* — si consuma l'abbonamento e non si paga a token;
se invece dice *API key*, si paga a consumo, e `gpt check` te lo segnala.

Modello, sforzo di ragionamento e ricerca sul web di partenza vengono da
`~/.codex/config.toml`: non darli per scontati, `gpt check` te li stampa.
Se lì `web_search` è attivo, l'esecutore **può cercare sul web**.

## La forma di una chiamata

```bash
printf '%s' "$brief" > brief.txt
codex exec --skip-git-repo-check --color never \
           --sandbox read-only -C "$cartella" \
           -c model_reasoning_effort="high" \
           --json -o risposta.md - < brief.txt
```

- `--skip-git-repo-check` serve ogni volta che la cartella di lavoro non è
  un repository git: senza, `codex` si rifiuta di partire. Passarlo sempre
  costa niente.
- `-` fa leggere il prompt dallo standard input. È la forma giusta: evita i
  limiti di lunghezza e i disastri di quoting.
- `--json` manda gli eventi JSONL su stdout; `-o FILE` scrive **solo** la
  risposta finale. Servono entrambi: gli eventi per la diagnosi, il file per
  la risposta pulita.

## Le trappole, una per una

**Lo stdin è una tagliola.** Se lo stdin non è un terminale, `codex exec` lo
legge comunque — anche quando il prompt è già passato come argomento. Se è
una pipe che non si chiude, resta appeso per sempre senza fare nulla: è
stato misurato un blocco che non è arrivato neppure a un controllo locale
che altrove costa meno di un secondo. **Sempre** stdin da file o da
`/dev/null`, mai ereditato.

**`exec resume` non è `exec`.** Il sottocomando `resume` **non accetta**
`--color`, `-s/--sandbox`, `-C/--cd`, `--add-dir`. Passarglieli fa fallire
il comando prima di qualunque chiamata al modello. Equivalenze:

| su `exec` | su `exec resume` |
|---|---|
| `--sandbox read-only` | `-c sandbox_mode="read-only"` |
| `-C cartella` | nessuno: bisogna spostarsi con `cd` |
| `--color never` | non esiste, si omette |

E il resume **non eredita la cartella** della sessione originale: usa quella
del processo, e ci inietta l'`AGENTS.md` di *quella* cartella. Da dove lo
lanci cambia contesto e permessi.

**Il codice d'uscita mente sui rifiuti.** `codex exec` esce **0** anche
quando la sandbox ha respinto tutto e il compito non è stato svolto. Uno
script che si fida di `$?` crede di aver scritto file che non esistono.
Le stringhe da cercare nella traccia (sono letterali nel binario, quindi
stabili):

- `writing is blocked by read-only sandbox; rejected by user approval settings`
- `writing outside of the project; rejected by user approval settings`

L'uscita **1** copre solo i guasti *prima* della chiamata al modello
(cartella `-C` inesistente, schema mancante o rotto) e i guasti di rete o
autenticazione. Auth mancante, modello inesistente, schema invalido: tutti
exit 1, indistinguibili senza leggere stderr.

**Il fallimento per autenticazione è lento.** Un 401 non esce subito: cinque
tentativi su websocket, fallback su HTTPS, altri cinque tentativi, circa 30
secondi. Con un timeout stretto sembra un timeout. Per questo `gpt check`
guarda `codex login status` *prima*, che invece risponde in un istante
(exit 0 loggato / 1 no — e scrive su **stderr**, non su stdout: `out=$(codex
login status)` restituisce una stringa vuota in entrambi i casi).

**Le righe `ERROR:` finali sono stampate due volte**, identiche. Chi conta
gli errori conta doppio.

**Il file di `-o` non nasce se la run fallisce**, e quando nasce **non ha
newline finale**.

**Con `--json` lo stderr resta vuoto** e tutto sta su stdout; senza `--json`
succede il contrario (risposta su stdout, intestazione e `session id:` su
stderr). Le due modalità si escludono: un parser che cerca `session id:` su
stderr non trova niente in modalità `--json`.

**`Reading additional input from stdin...`** compare su stderr a ogni run
non interattiva, anche in quelle riuscite. Non è un sintomo di guasto.

**Non esistono `timeout` né `gtimeout`** su questa macchina (niente
coreutils). Chi scrive `timeout 120 codex …` prende *command not found*.
`scripts/gpt` si porta il proprio cane da guardia, che mette codex in un
gruppo di processi suo (`perl -e 'setpgrp(0,0); exec @ARGV'`) e alla scadenza
uccide il **gruppo**: codex lancia sottoprocessi, e ammazzare il solo pid
lascia orfani che continuano a lavorare — su `lavora` significa due
esecuzioni che scrivono sugli stessi file.

**Codex intercetta il SIGTERM e se ne va con exit 0.** Misurato: un
`--timeout 5` su una richiesta lunga produce un'uscita pulita, indistinguibile
da una fine regolare. Un guinzaglio che deduce il timeout dal codice d'uscita
(143/137) non lo vede mai e riporta «nessuna risposta» invece di «tempo
scaduto». L'unico testimone attendibile è il cane da guardia stesso: deve
lasciare un segno prima di sparare, e quel segno è la prova.

## Le sessioni

Con `--json` il primo evento è
`{"type":"thread.started","thread_id":"<uuid>"}`: è il modo affidabile per
prendere l'id da uno script. Gli altri eventi osservati: `turn.started`,
`item.completed` (con `.item.text`), `turn.completed` (con `.usage`).

- `codex exec resume <UUID> …` riprende davvero il contesto (verificato: si
  ricorda un numero detto nella chiamata precedente).
- `--last` riprende la più recente **filtrando per cartella corrente**;
  `--all` toglie il filtro. Passare l'UUID esplicito è più sicuro — per
  questo `gpt continua --ultimo` lo pesca dal proprio registro.
- Un UUID inesistente fallisce pulito: exit 1,
  `no rollout found for thread id … (code -32600)`.
- `--ephemeral` impedisce il resume: non lascia nulla su disco. Stampa
  comunque un `session id:` che **non è ripristinabile**.
- Ogni run non-ephemeral lascia un rollout in `~/.codex/sessions/AAAA/MM/GG/`,
  creato all'avvio, **anche se poi la run fallisce**.
- Esiste anche `codex exec fork <UUID>`, che biforca una sessione (non
  provato sul campo).

## La sandbox

Il flag esplicito **scavalca davvero** il `sandbox_mode` del config globale,
anche quando quello è `"danger-full-access"`: verificato leggendo
l'intestazione di sessione (`sandbox: read-only`) e controllando che il file
non venisse creato.

- `read-only`: la scrittura è bloccata. Il modello però **non si arrende in
  silenzio**: propone all'utente il comando shell da eseguire a mano. Non
  girare mai la sua risposta a un altro esecutore senza leggerla.
- `workspace-write` con `-C cartella`: scrive dentro quella cartella, e la
  scrittura fuori viene respinta (verificato). L'intestazione dichiara
  `[workdir, /tmp, $TMPDIR]` come radici scrivibili, ma `apply_patch` è più
  stretto di così: una scrittura sotto `/tmp` fuori dal progetto è stata
  comunque respinta. Non fidarsi dell'intestazione.
- `approval_policy` **non** viene toccata da `--sandbox`: resta `never` dal
  config globale. Nessuna approvazione interattiva arriverà mai.
- `-C` accetta percorsi **con spazi**, purché siano un solo argomento
  quotato: concatenare stringhe senza virgolette spezza il percorso in due
  argomenti. Se la cartella non esiste, il messaggio è nudo e non dice quale:
  `Error: No such file or directory (os error 2)`.

## Il parallelismo

Misurato: tre `codex exec` insieme costano **9,5 s** contro i 7,9 s di uno
solo — sono davvero paralleli, non messi in coda. Nessun errore 429, nessun
limite d'uso con 3-4 richieste contemporanee. Ogni processo prende una
sessione sua: nessuno stato condiviso.

Con `gpt squadra` il tetto è `--parallele` (3 di default). Alzarlo è
possibile ma non è stato misurato oltre 4: se cominciano a comparire
messaggi di limite d'uso, si aspetta, non si insiste.

## Altre cose che si sanno

- `--output-schema FILE` è controllato **subito**, prima della rete: file
  mancante o JSON rotto → exit 1 con messaggio preciso (riga e colonna).
- Un modello inesistente non viene intercettato dal client: parte la
  richiesta e il server risponde 400. Il warning `Model metadata … not found`
  da solo **non** è fatale e compare anche in casi legittimi.
- `codex review` esiste come sottocomando dedicato alla revisione di
  codice in un repository git. Qui la cartella non è un repo, quindi
  `gpt rivedi` usa `exec` in sola lettura.
- `codex` legge gli `AGENTS.md` della cartella in cui lavora: il brief
  eredita già le istruzioni del progetto senza che tu le ricopi.
