# Mappa delle API DSM

## Come e' fatta una chiamata

Tutto passa da `/webapi/<path>.cgi` con almeno `api`, `version`, `method`.
Il catalogo delle API disponibili e delle loro versioni si chiede al NAS:

```
GET /webapi/query.cgi?api=SYNO.API.Info&version=1&method=query&query=all
```

Il client fa questo all'avvio e ne mette in cache il risultato per 24 ore in
`~/.cache/nas-synology/apiinfo.json`, quindi non serve mai indovinare un path o
una versione: `nas api list` mostra quello che questo DSM espone davvero.

Il login (`SYNO.API.Auth`, `method=login`) restituisce un `sid` e un
`synotoken`. Il client li salva in `session.json` (permessi 600), passa il `sid`
in query string e il token nell'header `X-SYNO-TOKEN`, e rifa' il login da solo
se la sessione scade.

## API usate dai comandi

| Comando | API tentate, in ordine |
|---|---|
| `info` | `SYNO.Core.System.info` |
| `usage` | `SYNO.Core.System.Utilization.get` |
| `storage` | `SYNO.Storage.CGI.Storage.load_info`, poi `SYNO.Core.Storage.Volume.list` |
| `shares` | `SYNO.Core.Share.list`, poi `SYNO.FileStation.List.list_share` |
| `packages` | `SYNO.Core.Package.list` |
| `services` | `SYNO.Core.Service.list` |
| `users` / `groups` | `SYNO.Core.User.list` / `SYNO.Core.Group.list` |
| `connections` | `SYNO.Core.CurrentConnection.list` |
| `updates` | `SYNO.Core.Upgrade.Server.check`, poi `SYNO.Core.Upgrade.status` |
| `backups` | `SYNO.Backup.Task.list`, poi `SYNO.SDS.Backup.Client.Common.Task.list` |
| `tasks` | `SYNO.Core.TaskScheduler.list` |
| `docker` | `SYNO.Docker.Container.list` |
| `logs` | `SYNO.Core.SyslogClient.Log.list`, poi `SYNO.Core.SysLog.list` |
| `ls` / `find` | `SYNO.FileStation.List.list` / `SYNO.FileStation.Search` |
| `get` / `put` | `SYNO.FileStation.Download` / `SYNO.FileStation.Upload` |
| `rm` / `mv` / `cp` / `mkdir` | `SYNO.FileStation.Delete`, `.CopyMove`, `.CreateFolder` |

Solo `SYNO.API.Info`, `SYNO.API.Auth` e la famiglia `SYNO.FileStation` sono
documentate ufficialmente da Synology. Tutte le `SYNO.Core.*` sono ricavate
dall'uso dell'interfaccia DSM: **cambiano fra le versioni**. Per questo ogni
voce e' una lista di tentativi e il fallimento di una non e' un errore fatale.

## Aggiungere un'API che manca

1. `nas api list <parola>` per trovare il nome esatto su questo DSM.
2. `nas api call <API> list` per vedere la forma della risposta.
3. Se e' utile in modo ricorrente, aggiungi la tupla
   `(api, metodo, versione, parametri)` al dizionario `CANDIDATES` in
   `scripts/nas` e un renderer accanto agli altri.

Un modo affidabile per scoprire i parametri di un'API non documentata: apri
DSM nel browser, apri gli strumenti di sviluppo sulla scheda Rete, fai
l'operazione dall'interfaccia e leggi la richiesta che parte.

## Operazioni asincrone

`Delete`, `CopyMove` e `Search` non finiscono nella chiamata iniziale:
`method=start` restituisce un `taskid`, poi si interroga `method=status` finche'
`finished` diventa vero. Il client lo fa da solo (fino a 5 minuti) e riporta gli
errori contenuti nel risultato, che l'API restituisce **dentro una risposta di
successo**: un `success: true` non significa che l'eliminazione sia riuscita.

## Codici di errore

Autenticazione:

| Codice | Significato | Cosa fare |
|---|---|---|
| 400 | account o password sbagliati | ricontrolla `NAS_USER` / `NAS_PASS` |
| 401 | account disabilitato | riattivalo in DSM |
| 402 | permesso negato | serve un utente amministratore |
| 403 | manca il codice 2FA | imposta `NAS_OTP_SECRET` o `NAS_OTP_CODE` |
| 404 | codice 2FA sbagliato | orologio del Mac fuori sincrono, o segreto errato |
| 407 | IP bloccato da Auto Block | sbloccalo in Sicurezza > Blocco account |
| 409 / 410 | password scaduta | cambiala da DSM |

Generici:

| Codice | Significato |
|---|---|
| 102 / 103 | API o metodo inesistenti su questa versione di DSM |
| 104 | la versione richiesta non copre questa funzione |
| 105 | la sessione non ha i permessi: utente non amministratore |
| 106 / 107 / 119 | sessione scaduta o invalidata: il client rifa' il login da solo |
| 120 | parametri non validi: manca un campo o ha il tipo sbagliato |

File Station:

| Codice | Significato |
|---|---|
| 408 | file o cartella inesistente |
| 411 | filesystem in sola lettura |
| 414 | esiste gia' un file con quel nome (usa `--overwrite`) |
| 415 / 416 | quota superata / spazio esaurito |
| 417 | errore di I/O: sospetta un disco che sta cedendo |
| 421 | risorsa occupata |

## Percorsi

Le API vogliono percorsi assoluti che iniziano dalla condivisione, non dal
filesystem: `/Drive/documenti/nota.txt`, oppure `/volume1/Drive/...` a seconda
di come sono definite le condivisioni. `nas shares` mostra la forma giusta per
questo NAS; `nas ls /` elenca le condivisioni.

## Fonti

- [DSM Login Web API Guide](https://kb.synology.com/en-global/DG/DSM_Login_Web_API_Guide/2)
- [File Station API Guide (PDF)](https://global.download.synology.com/download/Document/Software/DeveloperGuide/Package/FileStation/All/enu/Synology_File_Station_API_Guide.pdf)
- [Application Authentication](https://help.synology.com/developer-guide/integrate_dsm/web_authentication.html)
