# Sicurezza e limiti

## I tre livelli

| Livello | Cosa comprende | Regola |
|---|---|---|
| **Lettura** | stato, storage, elenco file, log, pacchetti, backup | libera, si esegue senza chiedere |
| **Scrittura** | upload, creazione, spostamento, eliminazione, start/stop pacchetti | serve `--yes` **e** un via libera esplicito dell'utente |
| **Vietato** | volumi, RAID, rete, account, spegnimento | non si esegue: si spiega come farlo da DSM |

## Cosa non fare mai da qui

- **Formattare o ridimensionare volumi e pool**, creare o ricostruire un RAID.
  Storage Manager tiene allineati anche i metadati DSM; la shell no.
- **Cambiare la configurazione di rete** del NAS. Un errore lo rende
  irraggiungibile e nessuno puo' rimediare da remoto.
- **Disattivare 2FA, Auto Block, firewall o il certificato.** Sono le barriere
  che rendono accettabile l'esposizione su Internet. Se ostacolano un'operazione,
  la risposta e' cambiare l'operazione.
- **Cancellare utenti o gruppi**, o modificare i permessi delle condivisioni.
  Si perdono accessi in modo difficile da ricostruire.
- **Spegnere o riavviare il NAS**, specie senza aver controllato che non ci
  siano backup, scrub o ricostruzioni in corso.
- **Aggiornare DSM.** Un aggiornamento fallito da remoto lascia il NAS in uno
  stato che richiede intervento fisico.
- **`rm -rf` via SSH** su percorsi dati: salta il Cestino e non si annulla.

Se l'utente chiede una di queste cose, non e' un rifiuto: spiega i passaggi
esatti da fare in DSM, e resta disponibile per la parte di diagnosi.

## Prima di cancellare

1. `ls` o `find` sul percorso, e mostrare l'elenco.
2. Dire quanti file e quanto spazio.
3. Aspettare una risposta.
4. Verificare se il Cestino e' attivo su quella condivisione: se non lo e', la
   cancellazione e' definitiva e va detto **prima**.

"Fai tu" e "gestisci il NAS in autonomia" riguardano la diagnosi e le operazioni
ordinarie, non danno licenza di cancellare senza mostrare cosa.

## Credenziali

- Stanno solo in `~/.config/nas-synology/config.env` (`chmod 600`) o nelle
  variabili d'ambiente. Il client avvisa se i permessi sono troppo larghi.
- Non vanno stampate in chat, ne' scritte in file del repository, messaggi di
  commit, descrizioni di pull request o log.
- Il file di sessione `~/.cache/nas-synology/session.json` contiene un SID
  valido e un device token: vale quanto una password finche' la sessione dura.
  `scripts/nas logout` lo invalida e lo cancella.
- Se una credenziale finisce in un posto sbagliato, cambiarla in DSM e' piu'
  rapido e piu' sicuro che tentare di ripulire il posto.

## Modalita' sola lettura

```bash
export NAS_READONLY=1
```

Blocca ogni scrittura anche con `--yes`. Utile quando si vuole solo un'analisi,
o quando si lavora su un NAS che non e' il proprio.

## Quando qualcosa e' gia' andato storto

- **File cancellato**: se il Cestino della condivisione e' attivo, e' in
  `/volume1/<condivisione>/#recycle`. Altrimenti, uno snapshot recente o
  Hyper Backup sono le uniche vie.
- **Sovrascritto da un `put --overwrite`**: solo snapshot o backup.
- **Account bloccato da Auto Block**: Pannello di controllo > Sicurezza >
  Blocco account, si rimuove l'IP. Da fuori casa serve prima accedere in LAN.
- **Servizio fermato per errore**: `scripts/nas package start <nome> --yes`,
  oppure da Centro pacchetti.

In tutti i casi: dire all'utente cosa e' successo davvero, subito e per intero.
Un errore riferito male costa piu' dell'errore.
