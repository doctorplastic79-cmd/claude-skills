# Configurazione una tantum — INFORMA-NAS

Questa procedura crea un accesso autonomo **in sola lettura** per Claude Code. Il gateway gira in un container separato e vede soltanto la cartella condivisa scelta.

Quando Claude legge un file, il contenuto entra nella conversazione con Claude. Esponi quindi soltanto una cartella `ClaudeAccess` selezionata e priva di credenziali o dati che non vuoi inviare al servizio AI.

## 1. Installa la skill sul computer che esegue Claude Code

Il computer deve avere Python 3.9 o successivo, il client OpenSSH `sftp` e Tailscale collegato allo stesso account del NAS.

Dal pacchetto estratto:

```bash
python3 install.py
python3 ~/.claude/skills/synology-nas-access/scripts/configure.py init
python3 ~/.claude/skills/synology-nas-access/scripts/configure.py keygen
python3 ~/.claude/skills/synology-nas-access/scripts/configure.py export-public-key --dest ./claude_nas_read.pub
```

La chiave privata rimane sul computer. Il file `.pub` non è segreto e va copiato sul NAS.

## 2. Prepara il gateway sul Synology DS220+

Usa Container Manager. Copia la cartella `gateway/` del pacchetto in `/volume1/docker/claude-nas-read`, insieme a `claude_nas_read.pub`.

Nel terminale DSM:

```bash
cd /volume1/docker/claude-nas-read
cp .env.example .env
```

Modifica soltanto questi valori in `.env`:

- `TAILSCALE_IP`: indirizzo Tailscale IPv4 di INFORMA-NAS;
- `NAS_SOURCE_PATH`: una singola cartella condivisa contenente i dati che Claude può leggere;
- `PUBLIC_KEY_FILE`: percorso assoluto del file pubblico copiato sul NAS.
- `NAS_UID` e `NAS_GID`: identificativi numerici di un utente DSM dedicato con il solo permesso di lettura sulla cartella scelta (si ottengono con `id nomeutente`).

Non impostare `NAS_SOURCE_PATH` su `/volume1`, `/volume1/docker`, cartelle di sistema, cartelle con `.env`, credenziali OAuth, chiavi o stato applicativo. Questa cartella selezionata e priva di segreti è il vero confine di sicurezza; il filtro del client è soltanto una protezione aggiuntiva.

Avvia:

```bash
sudo sh deploy.sh
```

Il servizio ascolta sulla porta 2222 dell'indirizzo Tailscale, non sulla LAN pubblica e non sulla porta SSH DSM 22. Non aprire porte sul router e non usare Tailscale Funnel per SFTP.

## 3. Verifica e fissa la chiave host

Sul NAS, `deploy.sh` mostra l'impronta ED25519 del gateway. Copiala esattamente e, sul computer con Claude Code, esegui:

```bash
python3 ~/.claude/skills/synology-nas-access/scripts/configure.py pin-host --expected-fingerprint 'SHA256:IMPRONTA_MOSTRATA_DAL_NAS'
python3 ~/.claude/skills/synology-nas-access/scripts/nasctl.py doctor
```

Un cambio futuro della chiave host è un arresto di sicurezza: non cancellare o sostituire `known_hosts` senza verificare la nuova impronta direttamente sul NAS.

## 4. Prova in Claude Code

Chiedi: “Elenca le cartelle nella radice del NAS”. Claude dovrebbe usare automaticamente la skill e restituire il contenuto del gateway in sola lettura.

## Limiti intenzionali

- Nessuna modifica o eliminazione sul NAS.
- Nessun accesso al sistema DSM o alla shell del NAS.
- Nessuna password memorizzata nella skill.
- Un pacchetto caricato soltanto su claude.ai non entra nella rete Tailscale; per quel caso serve un connettore MCP HTTPS separato.
