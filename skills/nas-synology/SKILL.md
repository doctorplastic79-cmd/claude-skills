---
name: nas-synology
description: Accede al NAS Synology (DSM 7) dell'utente e lo gestisce in autonomia - stato di dischi e volumi, spazio libero, cartelle condivise, file (elenco, ricerca, download, upload, spostamento, eliminazione), pacchetti e container, utenti e connessioni, backup di Hyper Backup, aggiornamenti DSM, log e diagnosi. Usare quando l'utente dice "entra nel NAS", "controlla il NAS", "quanto spazio e' rimasto", "il NAS e' pieno", "prendi/metti questo file sul NAS", "come stanno i dischi", "fai partire il backup", "riavvia Docker sul NAS", o nomina Synology, DiskStation, DSM, QuickConnect. Funziona sia dal Mac (API + SSH) sia da cellulare via sessioni cloud (solo API). NON per NAS QNAP, TrueNAS, Unraid o per Google Drive e altri cloud.
---

# NAS Synology

Gestione autonoma di un NAS Synology con DSM 7 tramite `scripts/nas`, un client
dell'API Web che usa solo la libreria standard di Python: nessuna installazione,
funziona identico sul Mac e dentro una sessione cloud aperta dal cellulare.

## Prima di tutto: verifica il canale

Esegui **sempre** questo come primo comando della sessione, prima di promettere
qualunque operazione:

```bash
scripts/nas check
```

Dice in tre righe se le credenziali ci sono, se il NAS risponde e quale
trasporto e' disponibile. Se fallisce, leggi `references/setup.md` e guida
l'utente alla configurazione invece di tentare comandi a caso.

### I due trasporti, e quando ci sono

| Trasporto | Da dove funziona | Cosa permette |
|---|---|---|
| **API Web DSM** (HTTPS) | Mac **e** sessioni cloud/cellulare | stato, storage, file, pacchetti, utenti, backup, log |
| **SSH** | solo dove il NAS e' raggiungibile in rete: Mac su LAN o VPN | shell completa, `synopkg`, `btrfs`, `smartctl`, rsync |

Da cellulare la sessione gira in cloud: il NAS **deve** essere esposto su
Internet via HTTPS e il suo dominio ammesso dalla network policy dell'ambiente,
altrimenti nessun trasporto funziona. `nas check` lo dice subito. Non fingere
che un comando sia riuscito quando il canale non c'e'.

## Comandi

Diagnosi e stato:

```bash
scripts/nas health          # rapporto completo, il punto di partenza per "come sta il NAS?"
scripts/nas info            # modello, DSM, uptime, temperatura
scripts/nas storage         # volumi, spazio, dischi, SMART, RAID
scripts/nas usage           # CPU, RAM, rete, dischi adesso
scripts/nas connections     # chi e' connesso in questo momento
scripts/nas logs            # ultime voci del registro di sistema
```

File:

```bash
scripts/nas shares                        # cartelle condivise
scripts/nas ls /volume1/Drive             # elenco
scripts/nas find "*.mp4" --path /volume1  # ricerca ricorsiva
scripts/nas get /volume1/Drive/nota.txt ./nota.txt
scripts/nas put ./nota.txt /volume1/Drive --yes
scripts/nas mkdir /volume1/Drive/nuova --yes
scripts/nas mv /volume1/Drive/a.txt /volume1/Archivio --yes
scripts/nas rm /volume1/Drive/vecchio.txt --yes
```

Servizi e manutenzione:

```bash
scripts/nas packages        # pacchetti installati e stato
scripts/nas docker          # container di Container Manager
scripts/nas backups         # task di Hyper Backup e ultimo esito
scripts/nas updates         # aggiornamenti DSM disponibili
scripts/nas users           # utenti locali
scripts/nas package stop Docker --yes
scripts/nas ssh 'df -h'     # shell, solo dove SSH e' disponibile
```

Aggiungi `--json` a qualunque comando per avere i dati grezzi da elaborare.

## Quando manca un comando dedicato

DSM espone centinaia di API, molte non documentate e con nomi diversi da una
versione all'altra. Non inventare endpoint: **chiedi al NAS cosa sa fare.**

```bash
scripts/nas api list                 # tutte le API di QUESTO DSM
scripts/nas api list Certificate     # filtra per parola
scripts/nas api call SYNO.Core.Share list additional='["hidden"]'
```

`nas api call` accetta `chiave=valore`; i valori JSON validi (liste, oggetti,
numeri, booleani) vengono passati come tali. I metodi che non sono di sola
lettura richiedono `--yes`.

Se un comando risponde "nessuna API disponibile per X su questo DSM", il client
ha gia' provato le alternative note: cerca con `api list` e, quando trovi quella
giusta, dillo all'utente cosi' puo' essere aggiunta al dizionario `CANDIDATES`
in `scripts/nas`.

## Regole di condotta

1. **Leggi prima, scrivi dopo.** Guarda lo stato con i comandi di lettura e
   spiega cosa hai capito, prima di proporre una modifica.
2. **Ogni scrittura richiede `--yes`.** Non e' un ostacolo da aggirare in
   automatico: prima di usarlo, di' all'utente esattamente cosa cambierai (quale
   percorso, quanti file, quale servizio) e aspetta il via libera. Vale anche
   quando l'utente ha detto "fai tu": l'autonomia riguarda la diagnosi, non la
   cancellazione.
3. **Mai eliminare senza aver elencato.** Prima di `rm`, esegui `ls` o `find` sul
   percorso e mostra cosa sparira'. Il Cestino di DSM non copre tutte le
   condivisioni.
4. **Le operazioni vietate restano vietate** anche se l'utente insiste in fretta:
   riformattare volumi, ricostruire il RAID, cambiare la configurazione di rete
   che ti disconnetterebbe, disattivare 2FA o Auto Block, cancellare utenti,
   spegnere il NAS mentre un backup e' in corso. Per queste, spiega i passaggi e
   lascia che sia l'utente a farle da DSM.
5. **Le credenziali non si stampano e non si committano.** Stanno in
   `~/.config/nas-synology/config.env` o nelle variabili d'ambiente. Non
   scriverle in chat, nei file del repository o nei messaggi di commit.
6. **Se un dato non lo hai, dillo.** Un'API assente non e' un motivo per
   inventare numeri su spazio, temperature o backup.

Per mettere Claude in sola lettura per un'intera sessione:
`export NAS_READONLY=1` — blocca ogni scrittura anche con `--yes`.

## Situazioni ricorrenti

Le procedure passo-passo stanno in `references/operations.md`: volume quasi
pieno, disco che peggiora nello SMART, backup fallito, pacchetto che non parte,
NAS lento, pulizia di file duplicati o temporanei.

## Riferimenti

| File | Quando leggerlo |
|---|---|
| `references/setup.md` | prima configurazione, utente DSM, 2FA, accesso da fuori casa, SSH, sessioni cloud |
| `references/operations.md` | procedure per i problemi ricorrenti |
| `references/api-map.md` | mappa delle API DSM, codici di errore, come scoprirne di nuove |
| `references/ssh-playbook.md` | comandi shell di DSM, con quelli distruttivi segnalati |
| `references/safety.md` | cosa richiede conferma, cosa non si fa mai, come recuperare |
