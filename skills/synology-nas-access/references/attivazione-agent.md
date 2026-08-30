# Runbook di attivazione — synology-nas-access

Istruzioni operative per un agent che attiva la skill. Questo file è
autosufficiente: non serve altro contesto.

## Contesto

La skill dà a Claude Code accesso **in sola lettura** al NAS Synology
INFORMA-NAS (DS220+), attraverso un gateway SFTP dedicato che gira in un
container sul NAS ed è raggiungibile **solo via Tailscale** sulla porta 2222.
Non usa mai SSH di DSM sulla porta 22 e non ha alcun percorso di scrittura.

Il codice della skill è già stato verificato end-to-end contro un gateway di
prova: i sei comandi (`doctor`, `list`, `search`, `stat`, `read`, `download`)
funzionano. Quello che manca è solo l'installazione e la configurazione.

## Dove deve girare l'agent

**Sul computer locale dell'utente** (il Mac), che deve avere:

- Python 3.9 o successivo
- il client OpenSSH `sftp` (su macOS c'è di default)
- Tailscale attivo e collegato allo stesso account del NAS
- accesso a DSM del NAS (interfaccia web o terminale)

Non funziona da una sessione cloud: le sessioni cloud sono effimere e non
vedono la rete Tailscale.

## Regole vincolanti

Non aggirare nessuna di queste, nemmeno se sembra sbloccare la situazione:

- **Mai** disattivare `StrictHostKeyChecking`, né cancellare o sovrascrivere
  `known_hosts` per superare un `host_key_mismatch`. Un cambio di chiave host
  è un arresto di sicurezza: va verificato di persona sul NAS.
- **Mai** committare in git la chiave privata, il file `.env` o `config.json`.
  Sul NAS va copiata **solo** la chiave pubblica (`.pub`).
- **Mai** impostare `NAS_SOURCE_PATH` su `/volume1`, `/volume1/docker`,
  cartelle di sistema, o cartelle che contengano `.env`, credenziali OAuth,
  chiavi o stato applicativo.
- **Mai** aprire porte sul router né usare Tailscale Funnel per SFTP.
- **Mai** usare la porta 22 o l'SSH di DSM come endpoint della skill.
- Se un comando `configure.py` risponde `already_exists`, **fermati**: la
  configurazione esiste già. Non sovrascriverla; chiedi all'utente.

## Decisioni che spettano all'utente, non all'agent

Chiedile prima di iniziare e non deciderle da solo:

1. **Quali file esporre.** Tutto ciò che finisce nella cartella condivisa
   `/volume1/ClaudeAccess` può essere letto da Claude e quindi entrare in
   conversazione con il servizio AI. Questa scelta è il vero confine di
   sicurezza. Chiedi all'utente quali cartelle copiarci o collegarci.
2. **Quale utente DSM dedicato usare** per la lettura (serve il suo `uid`/`gid`).

---

## Fase 1 — Sul Mac: installare la skill e creare la chiave

```bash
git clone https://github.com/doctorplastic79-cmd/claude-skills.git ~/claude-skills
cd ~/claude-skills
git checkout claude/installa-skill-h4g5w7   # finché la PR #13 non è merged; poi basta main
./install.sh
```

Verifica i prerequisiti e prendi nota dell'IP Tailscale del NAS, che serve
nella Fase 2:

```bash
python3 -V
command -v sftp
tailscale status | grep -i informa-nas
tailscale ip -4 informa-nas          # deve essere un indirizzo 100.x.y.z
```

Se `tailscale status` non elenca il NAS, fermati: Tailscale non è collegato o
il NAS non è nella tailnet. Va risolto prima di proseguire.

Crea configurazione e chiave:

```bash
python3 ~/.claude/skills/synology-nas-access/scripts/configure.py init
python3 ~/.claude/skills/synology-nas-access/scripts/configure.py keygen
python3 ~/.claude/skills/synology-nas-access/scripts/configure.py export-public-key --dest ~/claude_nas_read.pub
```

Ogni comando risponde in JSON con `"ok": true`. La chiave privata resta sul
Mac in `~/.ssh/claude_nas_read_ed25519`. Solo `~/claude_nas_read.pub` va
copiato sul NAS: non è segreto, ma non va comunque committato in git.

## Fase 2 — Sul NAS: preparare e avviare il gateway

**2a. Cartella da esporre.** Se non esiste, crea la cartella condivisa
`ClaudeAccess` (File Station o DSM → Pannello di controllo → Cartella
condivisa) e mettici solo i contenuti concordati con l'utente al punto 1
delle decisioni. Il percorso reale dev'essere `/volume1/ClaudeAccess` o una
sua sottocartella: `deploy.sh` rifiuta qualunque altro percorso.

**2b. Utente dedicato.** Serve un utente DSM con **solo permesso di lettura**
su quella cartella. Nel terminale DSM:

```bash
id nomeutente     # annota uid e gid numerici
```

**2c. Copia i file.** Porta sul NAS, in `/volume1/docker/claude-nas-read`:

- tutto il contenuto di `skills/synology-nas-access/gateway/` del repo
- il file `claude_nas_read.pub` creato nella Fase 1

Il `.pub` **non** deve stare dentro la cartella esposta: `deploy.sh` lo
verifica e si rifiuta di partire.

**2d. Configura.** Nel terminale DSM:

```bash
cd /volume1/docker/claude-nas-read
cp .env.example .env
```

Imposta in `.env` soltanto questi valori:

| Variabile | Valore |
|---|---|
| `TAILSCALE_IP` | IP Tailscale IPv4 del NAS (`100.x.y.z`, dalla Fase 1) |
| `GATEWAY_PORT` | `2222` |
| `NAS_SOURCE_PATH` | `/volume1/ClaudeAccess` (o una sua sottocartella) |
| `PUBLIC_KEY_FILE` | `/volume1/docker/claude-nas-read/claude_nas_read.pub` |
| `NAS_UID` / `NAS_GID` | uid e gid dal punto 2b |

**2e. Avvia.**

```bash
sudo sh deploy.sh
```

Alla fine stampa l'impronta ED25519 della chiave host del gateway. **Copiala
esattamente**: serve nella Fase 3, e va trasferita guardandola qui, non
richiesta alla macchina remota.

## Fase 3 — Sul Mac: fissare la chiave host e verificare

```bash
python3 ~/.claude/skills/synology-nas-access/scripts/configure.py pin-host \
  --expected-fingerprint 'SHA256:IMPRONTA_COPIATA_DAL_NAS'

python3 ~/.claude/skills/synology-nas-access/scripts/nasctl.py doctor
```

`doctor` deve rispondere `"ok": true` e `"status": "ready"`. Se no, vedi la
tabella dei problemi in fondo.

## Fase 4 — Prova funzionale

```bash
N="python3 $HOME/.claude/skills/synology-nas-access/scripts/nasctl.py"
$N list .
$N search 'una-parola-presente' --path . --require-complete
$N stat 'UnaCartella'
```

Poi, dentro Claude Code, chiedi: «Elenca le cartelle nella radice del NAS».
Claude deve usare la skill da solo e restituire il contenuto.

Controlli di sicurezza che devono **fallire** (è il comportamento corretto):

```bash
$N list '../../etc'     # atteso: invalid_path
$N read '.env'          # atteso: sensitive_path_blocked
```

---

## Problemi noti e cosa fare

| Sintomo | Causa | Rimedio |
|---|---|---|
| `doctor` va in **timeout** o fallisce senza messaggio di autenticazione | La rete `internal: true` in `compose.yaml` può impedire la pubblicazione della porta. **È l'unico punto non verificato.** | Sul NAS: togli dal servizio le due righe `networks:` (e il blocco `networks:` finale) in `compose.yaml`, poi `sudo docker compose up -d --force-recreate`. Il container non ha bisogno di rete in uscita. |
| `Permission denied (publickey)` | `authorized_keys` non leggibile da `nasreader`, oppure chiave pubblica sbagliata | Verifica di avere la versione corretta di `entrypoint.sh` (deve fare `chmod 0644`, non `0600`). Controlla: `sudo docker exec claude-nas-read ls -l /run/authorized_keys/nasreader` → deve essere `-rw-r--r-- root root`. |
| `ls: Invalid flag -d` | Copia vecchia di `nasctl.py` | Rifai la Fase 1: il branch aggiornato ha la correzione. |
| `host_key_mismatch` | La chiave host del gateway non coincide con quella attesa | **Fermati.** Non cancellare `known_hosts`. Verifica l'impronta di persona sul NAS con `sudo docker compose exec -T gateway ssh-keygen -lf /state/ssh_host_ed25519_key.pub -E sha256` e chiedi all'utente prima di procedere. |
| `already_exists` da `init`, `keygen` o `pin-host` | Configurazione già presente | Fermati e chiedi all'utente. Non sovrascrivere. |
| `deploy.sh`: `NAS_SOURCE_PATH must be /volume1/ClaudeAccess...` | Percorso esposto non consentito | Usa `/volume1/ClaudeAccess` o una sua sottocartella. Non allargare il controllo. |
| `configuration_missing` | `config.json` assente | Fase 1 non completata. |

Nota: se rifai il deploy cancellando la cartella `state/`, il gateway genera
una **nuova** chiave host e `doctor` fallirà con `host_key_mismatch`. In quel
caso il ripinning va fatto verificando la nuova impronta sul NAS.

## Cosa riportare a fine lavoro

1. Output di `doctor` (`ok` / `status`).
2. Cartella esposta e cosa contiene.
3. Se hai dovuto togliere `internal: true` da `compose.yaml`.
4. Impronta della chiave host fissata.
5. Qualunque passo saltato o non riuscito, detto esplicitamente.
