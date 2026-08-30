# Procedure ricorrenti

Ogni procedura parte dalla lettura e arriva alla proposta. L'esecuzione delle
parti che scrivono va sempre confermata dall'utente.

## "Come sta il NAS?"

```bash
scripts/nas health
```

Cosa guardare, nell'ordine:

1. **SMART dei dischi diverso da `normal`** - la cosa piu' urgente: e' l'unico
   sintomo che anticipa una perdita di dati. Dillo subito e per primo.
2. **Volume oltre l'85%** - btrfs degrada quando si avvicina al pieno, e sotto
   il 5% libero gli snapshot e i backup iniziano a fallire.
3. **Temperatura dischi oltre 50 C** o sistema oltre 60 C - ventilazione o
   posizione.
4. **Backup con esito diverso da riuscito** - un backup che fallisce da settimane
   equivale a non averlo.
5. **Aggiornamenti DSM in sospeso**, specie se marcati come di sicurezza.

Riporta all'utente solo quello che non e' normale, con il numero preciso. Se una
sezione non e' leggibile (permessi o API assente), dillo invece di ometterla:
un rapporto incompleto presentato come completo e' peggio di nessun rapporto.

## Volume quasi pieno

```bash
scripts/nas storage
scripts/nas ssh 'sudo du -sh /volume1/* | sort -h'      # se hai SSH
scripts/nas find "*.mkv" --path /volume1 --limit 50      # altrimenti, per tipo
```

Dove si nasconde lo spazio su un Synology, in ordine di resa:

- **Cestino delle condivisioni** (`#recycle`): spesso decine di GB. Si svuota da
  DSM, oppure per condivisione.
- **Snapshot di Snapshot Replication**: `sudo btrfs subvolume list /volume1`.
  Vanno tolti dall'interfaccia, che aggiorna anche la pianificazione.
- **Versioni di Hyper Backup** sul volume locale.
- **Cartella `@docker`** con immagini non piu' usate: `docker image prune` le
  rimuove, e va confermato.
- **Home degli utenti** e cartelle di download incompiuti.

Proponi una lista con quanto libera ciascuna voce, e fai scegliere. Non
cancellare niente di iniziativa: quello che sembra un file temporaneo puo'
essere l'unica copia di qualcosa.

## Un disco peggiora

Sintomi: SMART `warning` o `critical`, settori riallocati in aumento, errori di
I/O (codice 417) durante le operazioni sui file.

1. `scripts/nas storage` per identificare il disco e il pool.
2. Con SSH: `sudo smartctl -a /dev/sataN` per i contatori
   (`Reallocated_Sector_Ct`, `Current_Pending_Sector`, `Offline_Uncorrectable`).
3. **Prima di ogni altra cosa: verificare che un backup recente esista e sia
   completo.** `scripts/nas backups`.
4. La sostituzione fisica e la ricostruzione del RAID si fanno da Storage
   Manager, con il NAS acceso se il modello e' hot-swap. Non toccare `mdadm`
   dalla shell.

Un pool degradato regge un solo guasto: fino a ricostruzione avvenuta, evitare
scritture pesanti e scrub.

## Backup fallito

```bash
scripts/nas backups
scripts/nas logs
```

Cause piu' frequenti, in ordine: destinazione piena, destinazione non montata o
irraggiungibile, credenziali scadute su una destinazione remota, il task si
sovrappone al precedente ancora in corso.

Riportare da quando fallisce e con quale messaggio. Un backup rotto e' un
problema da segnalare con chiarezza, non da archiviare in una riga.

## Un pacchetto non parte

```bash
scripts/nas packages
scripts/nas logs
scripts/nas package stop Docker --yes
scripts/nas package start Docker --yes
```

Se il riavvio non basta, con SSH: `sudo synopkg status <pkg>` e i log in
`/var/log/packages/`. Reinstallare un pacchetto e' l'ultima spiaggia: alcune
disinstallazioni portano via i dati.

## NAS lento

```bash
scripts/nas usage
scripts/nas connections
scripts/nas docker
```

Sospetti tipici: indicizzazione multimediale dopo un caricamento grosso, uno
scrub o una ricostruzione RAID in corso, un container che consuma tutta la RAM,
un backup che gira in orario di lavoro, o semplicemente un volume quasi pieno.
Controlla anche `scripts/nas tasks`: spesso e' un'attivita' pianificata male.

## Ordinare i file

```bash
scripts/nas ls /volume1/Drive
scripts/nas find "IMG_*" --path /volume1/foto
scripts/nas mkdir /volume1/foto/2026 --yes
scripts/nas mv /volume1/foto/IMG_0001.jpg /volume1/foto/2026 --yes
```

Su molti file: mostra prima l'elenco completo di cosa verra' spostato e da
dove a dove, poi esegui. Se qualcosa va storto a meta', un elenco gia' mostrato
permette di ricostruire; una riorganizzazione fatta al buio no.

## Prendere o portare un file

```bash
scripts/nas get /volume1/Drive/relazione.pdf ./relazione.pdf
scripts/nas put ./relazione.pdf /volume1/Drive --yes --overwrite
```

`--overwrite` sostituisce senza chiedere: usalo solo se l'utente lo ha detto.
Oltre 256 MB il client si ferma e rimanda a `rsync`: vedi
`references/ssh-playbook.md`.
