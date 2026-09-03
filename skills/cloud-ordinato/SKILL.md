---
name: cloud-ordinato
description: Mette in ordine il cloud di Claude Code dell'utente - sessioni (chat) e Routine programmate - archiviando quelle concluse, preparando una scheda di ripresa per i lavori ancora aperti e spegnendo le Routine che scattano e falliscono consumando token a vuoto. Usare quando la richiesta riguarda il riordino o l'ottimizzazione del proprio cloud, anche detta con parole diverse: "metti in ordine il cloud", "fai pulizia nelle chat", "elimina le sessioni vecchie", "compatta le chat ancora aperte", "quali chat sono rimaste a meta'", "sto consumando token senza motivo", "quante sessioni ho aperte", "controlla le routine programmate", "questa routine fallisce ogni giorno", "libera spazio nel cloud", "cosa gira ancora in automatico". Usare anche prima di aprire un lavoro nuovo, se l'utente teme di avere troppa roba aperta. NON per la cronologia delle chat dell'app claude.ai (non e' raggiungibile da nessuno strumento), ne' per Google Drive, MEGA, iCloud o altri archivi di file.
---

# Cloud ordinato

Riordina il cloud di Claude Code: le **sessioni** (le chat aperte da
claude.ai/code, dal telefono, dal CLI) e le **Routine** (i trigger programmati
che aprono sessioni da soli). Il lavoro vero lo fa `scripts/cloud`, che legge i
dump degli strumenti MCP e produce un piano; gli strumenti li chiami tu.

I percorsi qui sotto sono relativi alla cartella di questa skill (`~/.claude/skills/cloud-ordinato`
sul Mac, `skills/cloud-ordinato` nel repository), non alla cartella di lavoro
della sessione: usa il percorso completo.

## Prima di promettere qualcosa: cosa consuma davvero

Non fingere risparmi che non ci sono. La verita', in tre righe:

| Cosa | Consuma token? |
|---|---|
| Una Routine **attiva** che scatta ogni giorno | **si', a ogni scatto** — anche quando fallisce e non produce niente |
| Una sessione lasciata a meta' | **no**, finche' nessuno la riapre |
| Riaprire una sessione con il contesto pieno | **si', a ogni turno**: si ripaga tutto il contesto |
| 200 chat vecchie ferme li' | **no**: e' disordine, non consumo |

Quindi il guadagno di token sta quasi tutto nelle Routine rotte e nelle
sessioni gonfie che l'utente continua a riaprire. Archiviare cinquanta chat
vecchie rimette ordine e libera i container, **non** fa risparmiare token: dillo
apertamente invece di vendere il contrario. Dettagli in `references/costi.md`.

## Gli strumenti, e cosa non esiste

Servono gli strumenti del server MCP **Claude Code Remote** (`mcp__Claude_Code_Remote__*`,
in certe sessioni `mcp__claude-code-remote__*`). Se non sono gia' caricati,
prendili con ToolSearch:

```
select:list_sessions,get_session,archive_session,unarchive_session,set_session_title,set_session_tags,list_triggers,update_trigger,delete_trigger
```

Due limiti da dire subito all'utente, se chiede quelle cose:

- **Una sessione non si cancella.** Esiste solo `archive_session`: la mette in
  sola lettura e libera il container. Si torna indietro con `unarchive_session`.
  Quando l'utente dice "elimina le chat", questo e' cio' che puoi fare — dillo.
- **Le conversazioni dell'app claude.ai non sono raggiungibili.** Questi
  strumenti vedono solo le sessioni di Claude Code e le Routine. Quelle si
  cancellano a mano dall'app.

Mappa completa in `references/strumenti.md`.

## Procedura

### 1. Capisci qual e' la sessione corrente

```
get_session            (senza session_id: descrive questa sessione)
```

Segnati l'`id`: e' l'unica sessione che non devi **mai** proporre di archiviare.

### 2. Inventario, senza leggerlo in conversazione

`list_sessions` e `list_triggers` restituiscono anche 50.000-100.000 caratteri
per pagina, prompt interi delle Routine compresi. Leggerli in conversazione
costerebbe piu' di tutto il riordino. Quindi:

```
list_sessions   limit 30, mine true      → poi, se has_more, di nuovo con after_id = last_id
list_triggers   limit 50
```

Se il risultato e' talmente grande che il tool lo salva da solo su file, usa
**quel percorso**: e' gia' quello che ti serve, non riaprirlo. Se invece torna
in linea, scrivilo in un file nella scratchpad con un heredoc, senza
ricopiarlo nel messaggio.

**I prompt delle Routine possono contenere dati personali** (mail, pazienti,
credenziali di connettori). Restano nei file: non ricopiarli in conversazione,
non metterli in un commit, cancella i dump quando hai finito.

### 3. Fatti dare il piano

```bash
scripts/cloud piano dump-sessioni.json dump-routine.json --io <id della sessione corrente>
```

Opzioni: `--giorni N` sposta la soglia di inattivita' (14 di default),
`--json` per rielaborarlo. `scripts/cloud analizza` da' la tabella completa
sessione per sessione, se l'utente la vuole vedere.

Il piano esce in sei blocchi, in ordine di utilita' reale: Routine che
consumano a vuoto, Routine residue, sessioni da archiviare, sessioni da
compattare, cose da controllare a mano, e in coda le sessioni che sono costate
di piu' finora (informazione, non azione: e' denaro gia' speso).

Le chat "rimaste a meta'" si riconoscono dal campo `post_turn_summary.needs_action`:
e' la domanda a cui l'utente non ha mai risposto. Quando c'e', riportagliela —
spesso bastano due parole per chiudere un lavoro fermo da settimane.

Le regole di classificazione, e come cambiarle, stanno in `references/decisioni.md`.

### 4. Fai vedere il piano e chiedi una conferma sola

Riporta all'utente i numeri (quante da archiviare, quante da compattare, quali
Routine sono rotte) e **chiedi una conferma unica** prima di eseguire, con
`AskUserQuestion` se serve una scelta secca. Non chiedere sessione per sessione:
e' un riordino, non un interrogatorio. Ma non partire nemmeno da solo.

Se l'utente vuole vedere prima cosa c'e' dentro una sessione, hai solo i
metadati (titolo, ramo, ultimo passo): **il testo di un'altra sessione non e'
leggibile da nessuno strumento**. Non inventarne il contenuto.

### 5. Esegui, nell'ordine che rende

1. **Routine rotte** — per ognuna: leggi l'errore dell'ultima esecuzione
   (`last_run`), poi o correggi il prompt (`update_trigger prompt: ...`) o la
   spegni (`update_trigger enabled: false`). Questo e' l'unico passo che
   fa risparmiare token davvero.
2. **Routine residue** — `delete_trigger` su quelle gia' scattate o
   auto-disattivate. Non toccare mai una Routine attiva e sana.
3. **Archiviazioni** — `archive_session` una per una, a lotti di dieci, e conta
   quante vanno a buon fine. Se una fallisce, riportalo: non arrotondare.
4. **Titoli** — `set_session_title` sulle sessioni chiamate "New session" che
   restano vive; `set_session_tags` se l'utente vuole raggrupparle per progetto.

### 6. Compatta i lavori ancora aperti

Per ogni sessione del blocco "da compattare" (lavoro non finito, o contesto
oltre il 60%):

```bash
scripts/cloud scheda dump-sessioni.json --id session_xxx --out /percorso/scheda.md
```

Riempi la scheda con **fatti verificabili**, non con ricordi: leggi i commit del
ramo, la PR, il diff. Poi archivia la sessione vecchia. Riprendere il lavoro da
una scheda di due pagine costa qualche migliaio di token; riprenderlo dentro una
sessione con 800.000 token di contesto li ripaga tutti a ogni turno — questa e'
la compattazione vera che il cloud permette.

Le schede vanno dove l'utente le ritrova: nel repository del progetto, o
consegnate con `SendUserFile`. Se una sessione da compattare e' ancora
connessa, chiedi prima all'utente: potrebbe averla aperta in questo momento.

### 7. Rami e PR rimasti indietro (facoltativo)

Ogni sessione che ha prodotto lavoro lascia un ramo `claude/...`. Con gli
strumenti GitHub trova quelli la cui PR e' merged o closed: sono residui.
**Cancellare un ramo non si annulla**: chiedi un via libera esplicito, separato
da quello del punto 4, e non toccare mai un ramo con una PR aperta.

### 8. Chiudi con i numeri veri

Quante sessioni archiviate, quante Routine spente o corrette, quante schede
scritte, cosa e' rimasto aperto e perche'. Se qualcosa non e' riuscito, dillo
con l'errore. E ricorda all'utente il punto onesto: il risparmio di token viene
dalle Routine sistemate, non dalle chat archiviate.

## Non fare mai

- Archiviare la sessione corrente, una sessione `running`, o una con il
  container ancora connesso senza chiedere.
- Cancellare una Routine attiva che funziona, o un ramo con una PR aperta.
- Dire "eliminate" delle sessioni: sono **archiviate**, ed e' reversibile.
- Ricopiare in conversazione i prompt delle Routine o i dump interi.
- Riassumere il contenuto di una sessione che non puoi leggere.
- Toccare sessioni che non sono dell'utente: in un contesto condiviso usa
  sempre `mine: true`.

## Tenerlo in ordine da solo

Se l'utente lo chiede, crea una Routine mensile con `create_trigger`
(`create_new_session_on_fire: true`, cron `0 8 1 * *`) il cui prompt dice di
eseguire questa skill e di riferire solo se c'e' qualcosa da fare. Una Routine
in piu' costa uno scatto al mese: proponila, non darla per scontata.

## Collaudo

Dopo ogni modifica a `scripts/cloud`:

```bash
tests/run-tests.sh
```

42 prove su dump finti, nessuna tocca il cloud.
