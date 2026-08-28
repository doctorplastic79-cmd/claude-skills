---
name: mega
description: |
  Installa e usa MEGA (mega.nz) dalla sessione: MEGAcmd ufficiale o megatools,
  con fallback sul workflow "MEGA Bridge" di karaoke-cloud quando la rete della
  sessione blocca i domini MEGA.
  Usare quando l'utente chiede di: installare MEGA/MEGAcmd/megatools; scaricare
  un link pubblico mega.nz; caricare file sul proprio account MEGA; esportare un
  link pubblico da MEGA; o menziona "mega" in relazione a download/upload di file.
  NON per: Google Drive, Dropbox o altri cloud; né per il MEGA Drive Sega.
argument-hint: "[link mega.nz | operazione]"
allowed-tools: Bash, Read, Write
---

# MEGA — installazione e uso

Ponte verso MEGA (mega.nz): installa gli strumenti a riga di comando e offre le
quattro operazioni del MEGA Bridge (download da link pubblico, download da
account, upload, esportazione link pubblico). Se la rete della sessione blocca
i domini MEGA, usa il workflow GitHub Actions già presente in `karaoke-cloud`.

## Passo 0 — Installazione

Eseguire lo script incluso:

```bash
bash scripts/install-mega.sh
```

Lo script:

1. verifica se `mega-cmd`/`megatools` sono già installati;
2. sonda la rete verso `g.api.mega.co.nz` (l'API di MEGA);
3. tenta il pacchetto **MEGAcmd ufficiale** (deb da `mega.nz/linux/repo`, con
   rilevamento di distribuzione e versione);
4. in mancanza, installa **megatools** dai repository della distribuzione;
5. stampa un riepilogo: quale strumento è disponibile e se l'API è raggiungibile.

Interpretare l'esito con onestà: *installato* non significa *funzionante*. Se lo
script segnala `API MEGA NON raggiungibile`, nessun comando locale potrà
collegarsi: passare direttamente al fallback MEGA Bridge, senza ritentare a vuoto.

### Domini da consentire nella rete della sessione

Nelle sessioni cloud (claude.ai/code) la network policy dell'environment deve
permettere questi domini, altrimenti vale solo il fallback:

| Dominio | Serve per |
|---|---|
| `mega.nz`, `mega.io` | pacchetto ufficiale MEGAcmd e link pubblici |
| `g.api.mega.co.nz` (e `*.api.mega.co.nz`) | API di MEGA (login, listing) |
| `*.userstorage.mega.co.nz` | trasferimento effettivo dei file |

Il blocco di default NON è fisso: su claude.ai/code, dal selettore environment
(icona a nuvola sopra la casella del messaggio) si imposta **Network access =
Custom** e si incollano in *Allowed domains*, una per riga: `mega.nz`,
`*.mega.nz`, `mega.co.nz`, `*.mega.co.nz`, `mega.io`, spuntando *Also include
default list of common package managers*. Nello stesso dialog si aggiungono le
variabili d'ambiente `MEGA_EMAIL`/`MEGA_PASSWORD` (o `MEGA_SESSION`) e, come
setup script, `bash scripts/install-mega.sh`. La modifica vale per le sessioni
avviate dopo. La guida completa del sistema a tre corsie (sessione diretta,
sync NAS via MEGAcmd, bridge GitHub Actions) è in
`doctorplastic79-cmd/karaoke-cloud`, file `docs/MEGA-GRATIS.md`.

## Uso diretto (rete permettendo)

### Con MEGAcmd (preferito)

```bash
mega-get 'https://mega.nz/file/...#...' ./download/     # link pubblico
mega-login "$MEGA_SESSION"                              # oppure email + password
mega-get /Percorso/Remoto ./download/                   # dal proprio account
mega-put ./file.bin /Percorso/Remoto                    # upload
mega-export -a -f /Percorso/Remoto/file.bin             # link pubblico
```

### Con megatools (fallback locale)

```bash
megadl 'https://mega.nz/file/...#...'                        # link pubblico
megals -u "$MEGA_EMAIL" -p "$MEGA_PASSWORD" /Root            # listing account
megaget -u "$MEGA_EMAIL" -p "$MEGA_PASSWORD" /Root/file.bin  # download account
megaput -u "$MEGA_EMAIL" -p "$MEGA_PASSWORD" --path /Root file.bin
megaexport -u "$MEGA_EMAIL" -p "$MEGA_PASSWORD" /Root/file.bin
```

Nota: megatools non supporta le sessioni MEGAcmd né gli account con 2FA; in
quei casi serve MEGAcmd oppure il fallback qui sotto.

## Fallback — MEGA Bridge su GitHub Actions

Il repository `doctorplastic79-cmd/karaoke-cloud` contiene il workflow
**MEGA Bridge** (`.github/workflows/mega-bridge.yml`), documentato in
`docs/MEGA-BRIDGE.md`. Gira sui runner GitHub, dove la rete verso MEGA è
aperta: funziona anche quando la sessione non può raggiungere MEGA.

Operazioni (`workflow_dispatch`, input `operation`):

| Operazione | Input principali | Risultato |
|---|---|---|
| `download-public-link` | `mega_link` | artifact `mega-bridge-result` (7 giorni) |
| `download-account-path` | `mega_remote_path` | artifact con i file scaricati |
| `upload-url` | `source_url`, `source_filename`, `mega_remote_path`, `make_public` | file su MEGA + link nel riepilogo |
| `export-account-path` | `mega_remote_path` | link pubblico nel riepilogo e in artifact |

Da una sessione cloud si lancia con i tool GitHub MCP (`actions_run_trigger`
sul workflow `mega-bridge.yml`, ramo `main`), poi si segue l'esecuzione con
`actions_get`/`actions_list` e si preleva l'artifact. Le operazioni
autenticate richiedono i secret già previsti dal workflow (vedi Sicurezza).

## Sicurezza

- Credenziali **solo** da variabili d'ambiente o secret GitHub: `MEGA_SESSION`
  (preferita, revocabile, compatibile 2FA) oppure `MEGA_EMAIL` + `MEGA_PASSWORD`.
- Mai stampare, loggare o committare credenziali o sessioni; mai passarle come
  input di workflow o argomenti visibili in `ps`.
- La sessione si genera su una macchina con MEGAcmd: `mega-login … && mega-session`.
- I link pubblici MEGA contengono la chiave di decifratura nel frammento `#…`:
  condividerli equivale a condividere il file.
