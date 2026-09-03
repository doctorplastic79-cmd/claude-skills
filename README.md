# claude-skills

Skill per Claude Code, tenute fuori dai repo di progetto così restano
riutilizzabili e non appesantiscono il codice delle applicazioni.

## Cosa c'è dentro

| Skill | A cosa serve |
|---|---|
| `skills/video-shotcraft` | video promo di prodotto con Remotion: 104 shot recipe cards, gallery di anteprime, template completo, 5 BGM e 149 SFX |
| `skills/heygen-avatar` | crea un avatar HeyGen persistente (volto + voce) per l'agente, l'utente o un personaggio |
| `skills/heygen-video` | genera video HeyGen con presenter, dall'idea allo script al video finito |
| `skills/heygen-translate` | traduce e doppia un video esistente in un'altra lingua, con voice cloning e lip-sync |
| `skills/nas-synology` | entra nel NAS Synology e lo gestisce: dischi, spazio, file, pacchetti, backup, log |
| `skills/cloud-ordinato` | mette in ordine il cloud di Claude Code: sessioni da archiviare, lavori da compattare, Routine che consumano a vuoto |

| Preset | A cosa serve |
|---|---|
| `presets/social-verticale` | reel 1080x1920 da foto e video propri, per Instagram, TikTok e Storie |

---

## Dove una skill viene vista

Claude Code cerca le skill in tre posti diversi, e da quale la installi dipende
"dove si vede":

| Posizione | Dove è attiva |
|---|---|
| `~/.claude/skills/` | **ovunque** — ogni progetto, ogni sessione, locale e cloud |
| `<progetto>/.claude/skills/` | solo nelle sessioni aperte su quel repository |
| plugin installato da un marketplace | ovunque in locale, con aggiornamenti |

Le sessioni su claude.ai/code partono da un container nuovo: dentro ci finiscono
le skill del tuo account claude.ai (quelle caricate da *Impostazioni → Capacità →
Skill*) e quelle del repository su cui stai lavorando. Quello che hai installato
a mano sul tuo Mac non ci arriva.

---

## Installare

### Come skill del tuo account claude.ai — ovunque, senza configurazione

È l'unica strada che copre tutto: le skill abilitate sull'account vengono
sincronizzate all'avvio di ogni sessione, cloud e Cowork comprese.

L'upload però ha due limiti: meno di 30 MB non compressi e un tetto al numero
di file. `video-shotcraft` sfora entrambi (49 MB, ~660 file), quindi si carica
il **loader** in `bootstrap/video-shotcraft/`: un solo `SKILL.md` che al primo
uso clona la libreria completa in `~/.cache/video-shotcraft` e poi la segue.

```bash
cd bootstrap && zip -r video-shotcraft.zip video-shotcraft/
```

Poi su claude.ai: *Impostazioni → Capacità → Skill → Carica skill*.

Il `description` nel frontmatter è identico all'originale, quindi la skill si
attiva sulle stesse richieste. Clona dal repository pubblico originale, non da
questo, così non serve rendere pubblica questa repo. Serve accesso di rete a
`github.com`, incluso nel livello *Trusted*; senza rete il loader si ferma e lo
dice, invece di improvvisare i risultati.

Con questa strada non si perde niente: arrivano anche le 5 tracce BGM che il
pacchetto ridotto di `package-for-claude-ai.sh` deve lasciare fuori.

### In locale, per tutti i progetti

```bash
git clone https://github.com/doctorplastic79-cmd/claude-skills.git
cd claude-skills && ./install.sh
```

Copia ogni skill in `~/.claude/skills/`. Per aggiornare: `git pull && ./install.sh`.
Per Codex: `CLAUDE_SKILLS_DIR=~/.codex/skills ./install.sh`.

### In locale, come plugin (con aggiornamenti)

```
/plugin marketplace add doctorplastic79-cmd/claude-skills
/plugin install video-shotcraft@doctorplastic-skills
```

Scegli lo scope utente e la skill vale per tutti i progetti.
`/plugin marketplace update` porta le novità. Funziona solo dal CLI:
nelle sessioni web il comando `/plugin` non esiste.

### Nelle sessioni cloud (claude.ai/code), per ogni repository

Nelle impostazioni del cloud environment, campo **Setup script**:

```bash
#!/bin/bash
git clone --depth 1 https://github.com/doctorplastic79-cmd/claude-skills.git \
  /opt/claude-skills || true
/opt/claude-skills/install.sh || true
```

Gira come root prima che Claude Code parta, e il risultato viene messo in cache
come snapshot del filesystem: si esegue una volta sola, non a ogni sessione.
Da quel momento la skill c'è in ogni sessione cloud di quell'environment,
qualunque repository tu stia usando.

Perché funzioni la repo deve essere **pubblica**: il setup script parte prima
che la sessione riceva le credenziali git, quindi un `clone` di una repo privata
fallisce. `github.com` è già fra i domini permessi dal livello di rete *Trusted*.

### In un singolo repository

Copia la cartella della skill in `<repo>/.claude/skills/`. Serve solo se vuoi
che la skill valga per quel progetto e per chi ci lavora, e mettilo in conto:
`video-shotcraft` pesa 49 MB, che ogni clone e ogni build CI si porta dietro.

---

## Aggiungere una skill

Una skill è una cartella con dentro un `SKILL.md` che apre con un frontmatter
`name` + `description`: è la descrizione che decide quando l'agente la usa.
Metti la cartella sotto `skills/`, aggiungi una riga alla tabella in cima e una
voce in `.claude-plugin/marketplace.json`.

## Skill HeyGen

`heygen-avatar`, `heygen-video` e `heygen-translate` vengono dal repository
pubblico [heygen-com/skills](https://github.com/heygen-com/skills) (v3.2.0) e
sono indipendenti tra loro: `heygen-avatar` crea l'identità (volto + voce) che
`heygen-video` riusa; `heygen-translate` lavora su un video già esistente e
non dipende dalle altre due.

Per funzionare serve una `HEYGEN_API_KEY` (da
[app.heygen.com/api](https://app.heygen.com/api)), oppure il server MCP di
HeyGen se già collegato all'agente — impostare la chiave disattiva la ricerca
automatica dell'MCP. La chiave va messa nell'ambiente di chi usa la skill
(shell profile o `.env` locale), mai in questo repository. Dettagli completi
nei singoli `SKILL.md` e nel repository originale.

## Skill NAS Synology

`nas-synology` fa entrare Claude nel NAS di casa e glielo fa gestire: stato di
dischi e volumi, spazio libero, cartelle condivise, file, pacchetti e container,
backup di Hyper Backup, log. Il client `scripts/nas` parla l'API Web di DSM 7
usando solo la libreria standard di Python, quindi funziona uguale sul Mac e
dentro una sessione cloud aperta dal cellulare.

Tutto quello che serve sta in un comando solo:

```bash
skills/nas-synology/scripts/nas-setup.sh
```

Aggiorna il repository e installa le skill, esegue le 116 prove del client,
cerca il NAS in rete, chiede le credenziali, offre di creare e installare la
chiave SSH, scrive `~/.config/nas-synology/config.env` con permessi `600` e
chiude mostrando lo stato del NAS. Se un passo fallisce si ferma dicendo quale
e perche'. Con `--non-interattivo` fa lo stesso senza domande, leggendo
`NAS_URL`, `NAS_USER` e `NAS_PASS` dall'ambiente: e' la forma per gli ambienti
cloud. Le credenziali stanno solo in quel file o nell'ambiente, mai in questo
repository.

Una sola configurazione vale ovunque: `NAS_URL` elenca gli indirizzi del NAS
(LAN, Tailscale, QuickConnect) e il client, che riconosce da solo se gira sul
Mac o in un container cloud, usa il primo raggiungibile.

Perche' funzioni **anche dal cellulare** servono tre cose, e
`skills/nas-synology/scripts/nas cloud` le stampa gia' compilate: il dominio
QuickConnect (o DDNS) del NAS **ammesso dalla network policy** dell'environment
cloud - verificato: senza, il proxy di uscita rifiuta la connessione - le
variabili `NAS_URL`, `NAS_USER`, `NAS_PASS`, `NAS_OTP_SECRET` nell'environment,
e la skill caricata sull'account. La skill pesa 90 KB, quindi si carica intera,
senza il loader che serve a `video-shotcraft`:

```bash
./package-for-claude-ai.sh nas-synology
```

e poi *Impostazioni > Capacita' > Skill > Carica skill* su claude.ai. Dal Mac in
LAN si aggiunge il trasporto SSH, che apre la shell di DSM.

Il client ha un collaudo che non richiede un NAS, da eseguire dopo ogni
modifica:

```bash
skills/nas-synology/tests/run-tests.sh
```

Le operazioni che modificano il NAS richiedono il flag `--yes`; formattazioni,
RAID, rete, account e spegnimento restano fuori dalla portata della skill e
vanno fatte da DSM. `NAS_READONLY=1` mette tutto in sola lettura. Dettagli in
`skills/nas-synology/references/`.

## Skill cloud ordinato

`cloud-ordinato` riordina il cloud di Claude Code: le sessioni (le chat aperte
dal web, dal telefono, dal CLI) e le Routine programmate. Fa tre cose: archivia
le sessioni concluse, prepara una scheda di ripresa per i lavori lasciati a
meta' cosi' si riparte in una sessione nuova invece che dentro un contesto
gonfio, e trova le Routine attive che scattano e falliscono - le uniche che
consumino token davvero.

```bash
skills/cloud-ordinato/scripts/cloud piano dump-sessioni.json dump-routine.json --io <sessione corrente>
```

Lo script non chiama nessuna API: legge i dump di `list_sessions` e
`list_triggers` - che pesano decine di migliaia di caratteri e non vanno letti
in conversazione - e ne ricava un piano di azioni. Ad archiviare e spegnere ci
pensa l'agente, dopo una conferma sola.

Due limiti dichiarati invece che aggirati: una sessione **non si cancella**, si
archivia (ed e' reversibile), e le conversazioni dell'app claude.ai non sono
raggiungibili da nessuno strumento. Il conto onesto e' in
`skills/cloud-ordinato/references/costi.md`: archiviare cento chat vecchie
rimette ordine e libera container, il risparmio di token viene dalle Routine
sistemate.

```bash
skills/cloud-ordinato/tests/run-tests.sh
```

42 prove su dump finti, nessuna tocca il cloud.

## Licenze

Ogni skill mantiene la licenza originale, nel file `LICENSE` della sua cartella.

- `video-shotcraft` — Apache-2.0, di [Vincentwei1021](https://github.com/Vincentwei1021/video-shotcraft).
  Gli asset audio hanno licenze proprie, elencate in
  `skills/video-shotcraft/assets/audio/ATTRIBUTION.md`.
- `heygen-avatar`, `heygen-video`, `heygen-translate` — MIT, di
  [HeyGen](https://github.com/heygen-com/skills).
- `nas-synology` — MIT, scritta per questo repository.
- `cloud-ordinato` — MIT, scritta per questo repository.

