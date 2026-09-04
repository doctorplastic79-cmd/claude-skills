# Cosa consuma davvero, e cosa no

Da leggere prima di promettere un risparmio. Un riordino onesto separa tre cose
che vengono spesso confuse: **token consumati**, **container occupati**,
**disordine**.

## Token

Un token si consuma solo quando un modello elabora qualcosa. Nel cloud succede
in tre casi, e basta.

### 1. Una Routine attiva che scatta

Ogni scatto apre una sessione e fa girare il modello sul prompt della Routine.
Costa **anche quando fallisce**: il modello ha comunque letto il prompt, provato
gli strumenti, prodotto l'errore. Una Routine giornaliera che fallisce da un
mese ha consumato trenta esecuzioni per zero risultati.

Sono il primo posto dove guardare, e spesso l'unico che dia un guadagno
misurabile. Segnali:

- `enabled: true` e `last_run.status` = `ROUTINE_RUN_STATUS_FAILED`
- `enabled: true` con un `cron_expression` fitto (ogni ora, ogni due ore) su un
  lavoro che non serve piu'
- `persist_session: true` puntata a una sessione che non esiste piu': lo scatto
  parte e non trova la conversazione

Le Routine gia' `enabled: false` o con un `ended_reason` **non consumano nulla**:
eliminarle e' ordine, non risparmio. Dirlo.

### Il caso che sembra spreco e non lo e'

`last_run.status: FAILED` da solo non dice niente. Il motivo sta nel
`post_turn_summary.status_detail` della sessione che ha eseguito lo scatto
(`get_session` su `last_run.session_id`), e cambia completamente la conclusione:

| status_detail | Cosa e' successo | Cosa fare |
|---|---|---|
| "You've hit your weekly / session limit" (`rate_limit_info.status: rejected`) | lo scatto e' stato **rifiutato prima di partire**: nessun modello e' girato, costo circa zero | non spegnerla. E' una spia: la quota se la sta prendendo altro, di solito il lavoro interattivo |
| connettore scollegato, strumento mancante, prompt che non sta in piedi | il modello ha girato e ha prodotto un errore | **questo si' che consuma a ogni scatto**: correggere o spegnere |

Spegnere una Routine perche' e' stata rifiutata per limite d'uso non fa
risparmiare niente e toglie all'utente una cosa che gli serviva: e' il tipo di
"ottimizzazione" che questa skill esiste per non fare.

### 2. Riprendere una sessione con il contesto pieno

Il contesto di una sessione viene ripagato a ogni turno. Una sessione a 800.000
token su un milione costa, per ogni singola domanda, quasi un milione di token
di lettura. Riprendere lo stesso lavoro in una sessione nuova, partendo da una
scheda di ripresa di due pagine, costa qualche migliaio.

Il campo si legge in `external_metadata.context_usage` (`used_tokens` su
`max_tokens`). Attenzione: e' popolato solo finche' il container e' vivo. Su una
sessione vecchia risulta `0`, e **non vuol dire che il contesto sia vuoto** —
vuol dire che il dato non c'e' piu'. Non presentarlo come "sessione leggera".

### 3. Il riordino stesso

`list_triggers` restituisce il prompt intero di ogni Routine: su un account
con dieci Routine sono decine di migliaia di token, per una lettura sola. Per
questo la skill passa dai file e non dalla conversazione. Un riordino fatto
leggendo tutto a schermo costa piu' di quello che fa risparmiare.

## Container

Una sessione `idle` con `connection_status: connected` tiene ancora un container
allocato. Archiviarla lo rilascia. Non e' un risparmio di token: e' spazio di
esecuzione, e conta se l'utente si trova sessioni lente o rifiutate.

Una sessione idle e disconnessa non tiene niente.

## Disordine

Duecento chat "New session" non costano un token. Costano all'utente: non trova
piu' il lavoro vero, riapre la sessione sbagliata, rifa cose gia' fatte.
Archiviarle e dare un titolo a quelle vive e' il grosso del valore di questa
skill — ed e' onesto chiamarlo cosi', ordine, non ottimizzazione.

## La frase da non dire

> "Ho archiviato 40 chat, adesso consumi molto meno."

Non e' vero. La versione vera:

> "Ho archiviato 40 chat: il cloud e' navigabile e ho liberato 3 container. Il
> consumo lo tagli spegnendo la Routine X, che scattava ogni sera e falliva da
> tre settimane."
