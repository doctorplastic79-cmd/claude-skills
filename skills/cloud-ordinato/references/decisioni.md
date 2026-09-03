# Come `scripts/cloud` decide

Le regole sono in `valuta_sessione()` e `valuta_routine()`. Sono deliberatamente
prudenti: quando i dati non bastano lo script dice **chiedi**, non tira a
indovinare. Se cambi una regola, aggiungi la prova corrispondente in
`tests/run-tests.sh`.

## Sessioni

Nell'ordine, la prima che si applica vince.

| Condizione | Azione | Perche' |
|---|---|---|
| e' l'id passato con `--io` | `tieni` | e' la sessione da cui stai lavorando |
| `session_status: ARCHIVED` | `gia' a posto` | niente da fare |
| `session_status: RUNNING` | `chiedi` | sta lavorando: fermarla e' una decisione dell'utente |
| `connection_status: connected` | `chiedi` | container vivo: probabilmente e' una scheda aperta adesso |
| `post_turn_summary.needs_action` presente, sessione recente | `tieni` | sta aspettando una risposta dall'utente: e' viva, non abbandonata |
| in attesa da N giorni, con un ramo | `compatta` | il lavoro c'e', la domanda e' rimasta senza risposta |
| in attesa da N giorni, senza ramo | `archivia` | la risposta non e' mai arrivata e non c'e' niente da salvare |
| `status_bucket: REVIEW_READY` e ha un ramo | `verifica-pr` | c'e' lavoro consegnato: prima si guarda se la PR e' stata fusa |
| `BLOCKED`/`FAILED`, ha un ramo, ferma da N giorni | `compatta` | lavoro non finito e recuperabile: scheda di ripresa, poi archivia |
| `BLOCKED`/`FAILED`, ha un ramo, recente | `tieni` | potrebbe riprenderla adesso |
| `BLOCKED`/`FAILED`, nessun ramo, ferma da N giorni | `archivia` | e' finita male senza lasciare niente |
| `context_usage` ≥ 60% | `compatta` | riaprirla costa tutto il contesto a ogni turno |
| titolo generico e ferma da N giorni | `archivia` | non c'e' niente da salvare |
| ferma da N giorni | `archivia` | conclusa |
| titolo generico ma recente | `rinomina` | dalle un nome prima di perderla di vista |
| resto | `tieni` | recente |

`N` e' `--giorni`, 14 di default. Titoli considerati generici: vuoto,
`New session`, `Nuova sessione`, `untitled`, `senza titolo`.

Il ramo si legge in `session_context.outcomes`: e' il segnale che distingue
"chat di prova" da "lavoro lasciato a meta'". Una sessione senza ramo non ha
prodotto niente di recuperabile, e archiviarla non perde nulla.

### La soglia del 60% sul contesto

Sotto quella quota riprendere la sessione conviene ancora: si porta dietro tutto
il filo del discorso. Sopra, il costo per turno supera quello di ripartire da una
scheda. Non e' una legge di natura, e' il punto in cui il rapporto si inverte
nella pratica; con `--giorni` non si tocca, si cambia nel codice.

Ricorda che `context_usage` **manca** sulle sessioni vecchie e risulta 0: in quel
caso la regola non scatta, e va bene cosi'. Non trattare uno 0 come "contesto
vuoto".

## Routine

| Condizione | Azione |
|---|---|
| `ended_reason: run_once_fired` | `elimina` — residuo di una one-shot, non consuma |
| `ended_reason: auto_disabled_*` | `elimina` — si e' spenta da sola |
| `suspension_reason` presente | `chiedi` — sospensione temporanea, si riattiva da sola |
| disattivata a mano | `chiedi` — solo l'utente sa se la riprendera' |
| **attiva + `last_run: FAILED`** | **`ripara`** — da guardare per primo, ma il motivo va letto prima di agire |
| attiva, cron, dentro una sessione fissa | `verifica` — la sessione bersaglio potrebbe non esistere piu' |
| attiva, e' scattata ma senza esito | `verifica` |
| attiva e sana | `tieni` |

`ripara` non vuol dire spegnere. `list_triggers` dice **che** l'ultimo scatto e'
fallito, mai **perche'**: il motivo sta in `get_session` sulla sessione
dell'esecuzione (`last_run.session_id`), campo `post_turn_summary.status_detail`.
Due esiti opposti:

- **limite d'uso raggiunto** ("You've hit your weekly / session limit",
  `rate_limit_info.status: rejected`) - lo scatto e' stato rifiutato prima di
  partire, non ha consumato niente. Spegnerla non fa risparmiare e toglie
  all'utente una cosa che gli serve. E' invece la spia che la quota se la sta
  prendendo il lavoro interattivo.
- **errore vero** (connettore scollegato, strumento mancante, prompt rotto) - il
  modello e' girato per produrre un errore, e lo rifara' a ogni scatto. Qui si
  interviene: riconnettere se e' un connettore, `update_trigger prompt` se e' il
  testo, `update_trigger enabled: false` come seconda scelta. `delete_trigger`
  e' la terza e fa perdere la cronologia.

## Il blocco delle piu' costose

`external_metadata.usage.cost_usd` dice quanto e' costata una sessione **fino a
oggi**. E' informazione, non un'azione: quei soldi sono spesi, archiviare non li
restituisce. Serve a una cosa sola, ed e' scritta nel piano: se una di quelle
sessioni verra' ripresa, va compattata prima, perche' e' diventata cara proprio
a forza di essere riaperta con il contesto pieno.

## Cosa lo script non fa apposta

- Non chiama nessuna API: non puo' archiviare, spegnere o cancellare niente.
  Produce un piano, l'esecuzione passa dagli strumenti MCP e dalla conferma
  dell'utente.
- Non legge il contenuto delle sessioni: non e' esposto da nessuno strumento.
- Non ordina per "importanza": non c'e' un dato che la misuri. Ordina per
  azione e per eta'.
