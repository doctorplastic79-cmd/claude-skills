# Gli strumenti del cloud, e i loro limiti

Server MCP **Claude Code Remote**. I nomi arrivano come
`mcp__Claude_Code_Remote__<strumento>` oppure `mcp__claude-code-remote__<strumento>`
a seconda della sessione: controlla come sono scritti prima di chiamarli, e se
non sono caricati prendili con ToolSearch (`select:list_sessions,archive_session,...`).

## Sessioni

| Strumento | Cosa fa | Note |
|---|---|---|
| `list_sessions` | elenco delle sessioni | `limit` (max 100), `mine: true` per restare sulle proprie, `after_id` = `last_id` della pagina precedente finche' `has_more` e' vero. Output enorme: salvalo su file |
| `get_session` | dettaglio di una sessione | senza `session_id` descrive **questa** sessione: e' cosi' che ricavi l'id da non toccare |
| `archive_session` | mette in sola lettura e libera il container | **e' il massimo che si puo' fare**: non esiste la cancellazione |
| `unarchive_session` | annulla l'archiviazione | il container viene ricreato al primo messaggio |
| `set_session_title` | rinomina | max 500 caratteri |
| `set_session_tags` | aggiunge/toglie etichette | `add` e `remove`, su piu' sessioni in una chiamata |
| `interrupt_session` | ferma il turno in corso | solo su richiesta esplicita dell'utente |

### Campi che contano in `list_sessions`

- `session_status` — `RUNNING`, `IDLE`, `ARCHIVED`
- `status_bucket` — come e' finita: `COMPLETED`, `REVIEW_READY` (ha una PR
  pronta), `BLOCKED`, `FAILED`, `WORKING`
- `connection_status` — `connected` significa container ancora vivo
- `updated_at` — l'ultima attivita' vera
- `session_context.outcomes[].git_repository.git_info` — repo e rami prodotti:
  e' il modo per capire se una sessione ha lasciato lavoro da salvare
- `external_metadata.context_usage` — `used_tokens` / `max_tokens`, presente
  solo finche' il container e' vivo
- `post_turn_summary` — come si e' fermata: `status_category` (`need_input`,
  `review_ready`, ...), `status_detail` e soprattutto `needs_action`, cioe' la
  risposta che sta aspettando dall'utente. E' il campo che riconosce una chat
  "non andata a compimento" da una finita
- `task_summary` — l'ultimo passo, una riga
- `external_metadata.usage` — quanto e' costata **finora**: `cost_usd`,
  `cache_read_tokens`, `input_tokens`, `output_tokens`. E' storia gia' spesa,
  non un consumo in corso: una sessione ferma non spende piu' niente. Serve a
  capire quali lavori sono diventati pesanti da riprendere

## Routine (trigger programmati)

| Strumento | Cosa fa | Note |
|---|---|---|
| `list_triggers` | elenco delle Routine | `include_completed: true` mostra anche le one-shot gia' scattate (possono essere migliaia). Restituisce il **prompt intero** di ognuna |
| `update_trigger` | cambia nome, cron, prompt, stato | `enabled: false` la spegne senza perderne la storia. **Preferiscilo sempre a cancella-e-ricrea** |
| `delete_trigger` | la elimina | irreversibile, si perde la cronologia delle esecuzioni |
| `fire_trigger` | la fa scattare adesso | utile per verificare che una riparazione funzioni |
| `create_trigger` | ne crea una nuova | `create_new_session_on_fire: true` per una sessione pulita a ogni scatto |

### Campi che contano in `list_triggers`

- `enabled` — se manca ed esiste `ended_reason`, e' finita da sola
- `ended_reason` — `run_once_fired` (one-shot consumata),
  `auto_disabled_session_gone` (la sessione a cui era legata non esiste piu'):
  in entrambi i casi e' un residuo che non consuma
- `suspension_reason` — sospensione temporanea (es. abbonamento in pausa): si
  riattiva da sola, non toccarla
- `last_run.status` — `SUCCEEDED` / `FAILED`. **Attiva + FAILED = spreco**
- `persist_session` / `persistent_session_id` — scatta dentro una sessione fissa
  invece che in una nuova
- `derived_state.prompt` — il testo che gira a ogni scatto. Puo' contenere dati
  personali: resta nei file

Una Routine che gira su un computer (`bound_device`) accetta il cambio di
prompt solo con l'approvazione su quel computer: se la risposta e'
`needs_device_approval` non e' un errore da aggirare, e non si risolve
cancellando e ricreando. Riferiscilo e basta.

## Ambienti e repository

`list_environments` e `list_repos` servono se l'utente chiede dove girano le
sessioni o quali repository sono raggiungibili. Non c'e' niente da riordinare
li' dentro con questi strumenti.

## Quello che non esiste

- **Cancellare una sessione.** Solo archiviare.
- **Leggere la conversazione di un'altra sessione.** Nessuno strumento
  restituisce il transcript. Hai titolo, stato, ramo, `task_summary`: nient'altro.
  Se serve il contenuto, e' l'utente che deve aprirla e guardarla.
- **Compattare il contesto di un'altra sessione da fuori.** La compattazione
  possibile e' quella di questa skill: scheda di ripresa piu' sessione nuova.
- **Vedere le conversazioni dell'app claude.ai.** Fuori portata: si cancellano
  a mano dall'app.
- **Un preventivo di quanto costera' una sessione.** `external_metadata.usage`
  dice quanto e' gia' costata, non quanto costera' riprenderla; per quello
  guardi `context_usage`.

## Sessioni ancora vive

`SendMessage` (con `ListAgents` per trovare l'indirizzo) recapita un messaggio a
una sessione cloud viva — per esempio "scrivi la tua scheda di ripresa e
committala". Ma quella sessione **non puo' risponderti**: l'esito si vede solo
aprendola, o nel repository. Usalo solo se l'utente lo chiede, e non dare per
riuscito quello che non hai verificato.
