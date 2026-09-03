---
name: regia
description: Fa eseguire il lavoro all'ALTRO modello mentre tu fai la regia: scrivi il brief, verifichi e integri. Da Claude delega a ChatGPT (CLI `codex`), da Codex delega a Claude (`claude -p`): sempre sull'abbonamento, mai chiavi API. Usare quando la richiesta suona come "fallo fare a ChatGPT", "chiedi a ChatGPT", "usa Codex", "chiedi a Claude", "delega questo", "senti anche l'altra AI", "voglio una seconda opinione", "confronta due modelli", "fai rileggere il tuo lavoro da qualcun altro"; e anche non richiesta, quando serve un parere indipendente su codice o testo scritto da te, quando c'e' molto materiale ripetitivo da produrre in parallelo, o quando conviene un contraddittorio prima di consegnare. Comprende brief, risposte JSON validate, esecuzione in parallelo, conversazioni a piu' turni e registro dei lavori. NON per pilotare a mano l'app ChatGPT, NON per chiavi API, NON per compiti che chiudi da solo in meno tempo di quanto serva a scrivere il brief.
---

# Regia

Tu sei il regista. L'esecutore è **l'altro modello**: se sei Claude deleghi a
ChatGPT (CLI `codex`), se sei Codex o ChatGPT deleghi a Claude (`claude -p`).
Non serve configurarlo: lo decide il posto in cui questa skill è installata.
In tutti e due i casi si consuma l'abbonamento — **non si paga a token**.

Che sia l'altro modello non è un dettaglio: un esecutore uguale a te
condivide i tuoi punti ciechi, e il suo "sono d'accordo" non vale niente.

La regola che tiene in piedi tutto: **quello che l'esecutore produce non è la
risposta all'utente finché tu non l'hai verificato.** Sei tu che firmi.

## Prima di tutto: verifica il canale

Primo comando di ogni sessione che userà la skill, prima di promettere
qualunque cosa:

```bash
scripts/gpt check
```

Ti dice chi esegue e se il canale è pronto. Se manca il login: `codex login`
oppure `claude login`, e lo fa l'utente perché apre il browser. Se manca la
CLI: `npm install -g @openai/codex`.

**Se `check` non gira affatto** — niente shell, niente CLI, come in una
sessione di chat su claude.ai — la skill non ha un canale e non può eseguire
niente. Dillo subito invece di provare: quello che resta utile è il metodo
(il brief in cinque blocchi, la verifica, il contraddittorio), non il
comando. Non fingere di aver delegato.

## Dove gira, e chi esegue

| Dove è installata | Regista | Esegue |
|---|---|---|
| `~/.claude/skills/regia` | Claude Code (CLI, app, sessioni cloud) | ChatGPT, via `codex` |
| `~/.codex/skills/regia` | Codex / ChatGPT | Claude, via `claude -p` |
| `<progetto>/.claude/skills/regia` | chi apre quel repository | ChatGPT |
| skill dell'account su claude.ai (chat) | — | **nessuno: manca la shell** |

La scelta è automatica e viene dal percorso: sotto `~/.codex/` il regista è
Codex, quindi l'esecutore dev'essere Claude. Per forzarla in un'installazione:
`scripts/gpt esecutore claude` (scrive `.esecutore` accanto alla skill, non
nella home: due installazioni sulla stessa macchina restano indipendenti).
Per una singola chiamata: `--esecutore`.

### Su una macchina che non è questa

Il canale ha bisogno della CLI dell'esecutore, autenticata. Su un computer
con browser si fa una volta con `codex login`. Altrove — sessione cloud,
container, ambiente aperto dal telefono — c'è uno script che prepara tutto e
chiude con una chiamata vera, perché *installato* e *funzionante* non sono la
stessa cosa:

```bash
scripts/regia-setup.sh --device   # codice a schermo: tiene l'abbonamento
scripts/regia-setup.sh            # non interattivo: usa $OPENAI_API_KEY
```

`--device` mostra un indirizzo e un codice da approvare da un browser
qualsiasi, anche dal telefono: la macchina remota eredita l'abbonamento e
**non si paga a token**. La via con `OPENAI_API_KEY` serve solo dove non ci
sarà mai nessuno ad approvare (un setup script che gira da solo), e lì **si
paga a consumo**: `gpt check` dice sempre quale delle due è in uso, e va
detto all'utente quando cambia il modo di pagare.

## Che cosa deleghi e che cosa non deleghi mai

| All'esecutore | Resta a te |
|---|---|
| Produrre molto materiale simile (varianti, traduzioni, test, dati finti) | Decidere che cosa si fa e perché |
| Esplorare una base di codice o un archivio che non hai ancora letto | Parlare con l'utente e fare le domande |
| Scrivere una prima stesura da rifinire | La stesura finale che va in mano all'utente |
| Dare un parere indipendente su codice o testo che hai scritto tu | Il giudizio su quel parere |
| Compiti meccanici e noiosi (rinomina, conversione, estrazione) | Tutto ciò che tocca credenziali, Portachiavi, servizi in produzione |
| Fare da avvocato del diavolo contro le tue conclusioni | Approvazioni, invii, pubblicazioni, cancellazioni |

Non delegare quando scrivere il brief costa più che fare la cosa: sotto i
due minuti di lavoro, fai e basta.

## Il brief: è qui che si vede la regia

Un esecutore bravo con un brief vago produce spazzatura plausibile. Cinque
blocchi, sempre, anche quando il brief è corto (dettagli ed esempi in
`references/briefing.md`):

```
OBIETTIVO   una frase: che cosa deve esistere quando hai finito
CONTESTO    dove sono i file, che cos'è questo progetto, che cosa ho già provato
VINCOLI     cosa NON toccare, lingua, stile, limiti di lunghezza, versioni
FORMATO     come dev'essere fatta la risposta (o lo schema JSON)
ACCETTAZIONE come faccio io a capire se hai fatto bene: la lista di controllo
```

Tre abitudini che cambiano la resa:

- **Dagli il pezzo di mondo, non il riassunto.** `--dir` gli fa leggere i
  file veri; un tuo riassunto gli fa ereditare i tuoi errori.
- **Chiedi il formato che ti serve a te**, non "una risposta chiara": se poi
  devi ciclare sul risultato, usa `json --schema`.
- **Scrivi il criterio di accettazione prima di lanciare.** Se non sai
  scriverlo, non sai ancora che cosa vuoi: fermati e pensa.

## I comandi

`scripts/gpt` è relativo alla cartella della skill. Se non sei lì dentro, usa
il percorso intero — è quello che funziona sempre:
`~/.claude/skills/regia/scripts/gpt`

```bash
scripts/gpt chiedi "brief"                       # risposta di testo, sola lettura
scripts/gpt chiedi --dir CARTELLA --file b.md    # brief da file, con contesto vero
scripts/gpt json --schema s.json "brief"         # risposta strutturata, validata
scripts/gpt lavora --dir CARTELLA "brief"        # può SCRIVERE, solo lì dentro
scripts/gpt rivedi --dir CARTELLA "brief"        # parere indipendente, sola lettura
scripts/gpt continua --ultimo "e adesso…"        # prosegue la stessa conversazione
scripts/gpt squadra --brief a.md --brief b.md    # più esecutori in parallelo
scripts/gpt lavori                               # registro
scripts/gpt mostra ID                            # brief + risposta + metadati
scripts/gpt esecutore                            # chi esegue adesso
scripts/gpt esecutore claude                     # cambialo per questa installazione
```

Opzioni utili: `--sforzo low|medium|high|xhigh|ultra|max` (quanto deve
ragionare: `low` per il meccanico, `high` di default, `ultra` per i nodi
veri), `--modello`, `--timeout` (secondi), `--tag`, `--prova` (stampa il
comando senza eseguirlo — non consuma l'abbonamento), `--immagine FILE`,
`--parallele N` (solo per `squadra`), `--sessione UUID` (solo per `continua`),
`--esecutore chatgpt|claude` (per una singola chiamata).

Ogni lavoro lascia una cartella in `~/.regia/lavori/` con brief, risposta,
eventi, comando e metadati. Citala all'utente quando riferisci: è la prova.

## Gli schemi di regia

Scegli lo schema in base alla posta in gioco, non all'abitudine. Comandi e
varianti in `references/schemi.md`.

- **Staffetta** — brief → esecuzione → *tu verifichi* → integri. Il caso
  normale. Non saltare mai il terzo passo.
- **Officina** — `lavora --dir`: l'esecutore scrive file dentro una cartella
  circoscritta. Prima guarda che cosa ha cambiato, poi decidi se tenerlo.
- **Contraddittorio** — tu (o lui) proponi, l'altro deve *demolire*. Il brief
  dice esplicitamente "cerca di dimostrare che è sbagliato, non essere
  gentile". Usalo prima di consegnare qualcosa di importante.
- **Doppia cieca** — lo stesso brief a due esecutori che non si vedono (due
  `--brief`, non `--parallele`), poi confronti. **Serve a far emergere le
  divergenze, non a confermare.** Due esecuzioni dello stesso modello che
  concordano hanno solo ripetuto lo stesso errore: non è una verifica, e non
  va mai presentata all'utente come tale.
- **Squadra** — N brief indipendenti in parallelo su N pezzi di lavoro.
  Nomina i file dei brief con il nome del pezzo: diventa il nome del lavoro.
- **Ping-pong** — `continua --ultimo` per rifinire senza rispiegare il
  contesto. Riprende solo ciò che è nato nella stessa cartella, e ti stampa
  la prima riga del brief che sta riprendendo: leggila prima di andare avanti.

## Verifica: il passo che non si salta

L'esecutore sbaglia in modo *plausibile*. La verifica ha un bersaglio già
scritto: **la lista di ACCETTAZIONE del tuo brief**. Riprendila punto per
punto e chiediti, per ciascuno, come fai a saperlo. Poi, prima di riferire,
fai almeno una di queste — e dì all'utente quale hai fatto:

- esegui il codice o il comando che ti ha dato;
- apri i file che dice di aver cambiato e leggili (`codex` esce 0 anche
  quando la sandbox gli ha impedito di scrivere: il messaggio può descrivere
  un lavoro mai avvenuto);
- controlla i fatti verificabili (percorsi, versioni, nomi di funzione)
  contro la macchina, non contro la memoria;
- se è un testo e non c'è niente da eseguire, verifica quello che *si può*
  verificare — nomi, numeri, date, citazioni, promesse fatte al lettore — e
  manda il resto in contraddittorio;
- se è un giudizio e non un fatto, mandalo in contraddittorio.

Due esecuzioni che dicono la stessa cosa **non** sono una verifica: sono lo
stesso modello che ripete sé stesso. E niente di tutto questo basta per una
domanda clinica: lì la verifica è una fonte primaria o una persona
competente, e se non ce l'hai la risposta onesta è dirlo.

Quando riferisci all'utente, sii esplicito su chi ha fatto che cosa: «la
prima stesura è dell'altro modello, l'ho verificata eseguendo i test» è
un'informazione che serve. Non spacciare per tuo il lavoro dell'esecutore,
e non scaricargli addosso la responsabilità: la firma resta tua.

## Sicurezza

- **Il brief esce dalla macchina.** Niente password, chiavi, token, dati
  sanitari o dati personali di terzi. Il canale rifiuta i brief che
  contengono credenziali scritte per esteso; `--consapevole` scavalca il
  blocco solo se il valore è finto. Se serve un segreto, lascialo nel
  Portachiavi e passa il *nome* dell'elemento, mai il valore.
- **Il blocco automatico guarda solo il brief.** Non vede i file che
  l'esecutore legge da `--dir`, né le immagini di `--immagine`: quelli
  escono dalla macchina senza passare da nessun controllo. È il punto in cui
  la skill si fida di te. Referti, cartelle cliniche, documenti riservati,
  fotografie di persone non si mandano — nemmeno dentro una cartella «tanto
  lì ci sono solo i file di lavoro». Guarda che cosa c'è davvero in `--dir`
  prima di passarla.
- **Sola lettura per difetto.** `chiedi`, `json`, `rivedi` non scrivono
  niente, e non si possono forzare a farlo. Solo `lavora --dir` apre la
  scrittura, e solo dentro quella cartella.
- Il registro (`~/.regia`) è a permessi `700` e i suoi file solo tuoi:
  contiene comunque copie in chiaro di tutto ciò che hai mandato. Se ti
  accorgi di avergli passato qualcosa che non doveva uscire, cancella la
  cartella del lavoro — e sappi che la copia dall'altra parte resta.
- Il config globale di `codex` può essere permissivo (capita di trovarci
  `sandbox_mode = "danger-full-access"`): la skill passa **sempre** un
  `--sandbox` esplicito, quindi non lo eredita — e `gpt check` ti avvisa se
  è quel caso. Non toglierlo mai, e non usare
  `--dangerously-bypass-approvals-and-sandbox`.
- L'esecutore legge tutta la cartella che gli dai. Un file di configurazione con
  dentro una password in chiaro capita più spesso di quanto sembri: prima di
  passare `--dir`, guardaci dentro, e nel dubbio restringi a una
  sottocartella.

## Quando l'esecutore non risponde

`gpt check` per prima cosa. Poi: `~/.regia/lavori/<id>/errori.txt` per il
messaggio vero, `eventi.jsonl` per la cronaca. Tempo scaduto (codice 4):
rilancia con `--timeout` più alto o `--sforzo` più basso, oppure spezza il
brief. Limite d'uso dell'abbonamento: si aspetta, non si insiste — e lo si
dice all'utente invece di far finta di niente.

## Approfondimenti

- `references/briefing.md` — come si scrive un brief, con esempi buoni e
  cattivi e i modelli pronti da copiare.
- `references/schemi.md` — gli schemi di regia in dettaglio, con i comandi.
- `references/canale.md` — la CLI `codex` sul campo: flag reali, sandbox,
  sessioni, schemi JSON, trappole misurate.
- `tests/run-tests.sh` — controlli del canale (offline e, con `--vivo`, una
  chiamata vera).
