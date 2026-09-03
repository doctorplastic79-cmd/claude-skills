# Configurazione

Da fare una volta sola, sul Mac. Poi la skill funziona anche dal cellulare.

## 1. Un utente DSM dedicato

Non usare l'account personale. In DSM: **Pannello di controllo > Utente e
gruppo > Crea**.

- nome: `claude` (o quello che preferisci)
- password lunga e casuale, diversa da tutte le altre
- **Applicazioni**: consenti `DSM` e `File Station`, nega tutto il resto
- **Cartelle condivise**: dai accesso solo a quelle che vuoi far gestire

Cosa cambia in base ai privilegi:

| Gruppo dell'utente | Cosa funziona |
|---|---|
| `users` normale | file (`ls`, `find`, `get`, `put`, `rm`), condivisioni visibili, ricerca |
| `administrators` | in piu': `storage`, `usage`, `packages`, `users`, `updates`, `backups`, `logs`, `docker` |

Un utente non amministratore riceve `codice 105` o `402` sulle API di sistema.
E' il compromesso da decidere: meno privilegi significa meno diagnosi
automatica, e piu' operazioni da fare a mano su DSM. Per il solo uso "controlla
lo stato e sistemami i file", un utente normale + un secondo account
amministratore usato solo quando serve e' la scelta piu' prudente.

## 2. Verifica in due passaggi

Tienila attiva. In fase di attivazione DSM mostra un QR code e, sotto, una
**stringa base32**: e' quella che serve alla skill.

- copiala in `NAS_OTP_SECRET`: il client genera il codice a 6 cifre da solo
- in alternativa lascia `NAS_OTP_SECRET` vuoto e passa un codice al volo con
  `NAS_OTP_CODE=123456`

Al primo accesso con OTP il NAS rilascia un *device token* che il client salva
in `~/.cache/nas-synology/session.json` e usa per tutti i login successivi:
DSM vede **un** dispositivo attendibile ("claude-nas-skill"), non uno per ogni
comando. Il codice torna necessario solo se DSM rifiuta il token, o se cancelli
quel file.

Con la password sbagliata il client fa **un** tentativo e poi si ferma per
tutta la durata del comando: sei tentativi di fila farebbero scattare l'Auto
Block di DSM, che blocca l'IP anche con la password giusta.

Conservare il segreto 2FA accanto alla password indebolisce la seconda barriera:
chi legge il file ha entrambi i fattori. Va bene per un accesso automatico, ma
il file deve essere `chmod 600` e non deve finire in nessun backup condiviso.

## 3. Il file di configurazione

```bash
skills/nas-synology/scripts/nas-setup.sh
```

Chiede i dati, scrive `~/.config/nas-synology/config.env` con permessi `600` e
lancia subito una verifica. Oppure scrivilo a mano:

```bash
mkdir -p ~/.config/nas-synology
cat > ~/.config/nas-synology/config.env <<'EOF'
NAS_URL=https://casa.synology.me:5001
NAS_USER=claude
NAS_PASS=...
NAS_OTP_SECRET=...
NAS_SSH_HOST=192.168.1.10
NAS_SSH_USER=claude
NAS_SSH_KEY=~/.ssh/id_ed25519_nas
EOF
chmod 600 ~/.config/nas-synology/config.env
```

### Tutte le variabili

| Variabile | Serve a |
|---|---|
| `NAS_URL` | uno o piu' indirizzi completi, separati da virgola, in ordine di preferenza: `https://192.168.10.139:5001,https://100.73.172.85:5001,https://<id>.quickconnect.to`. Risponde il primo raggiungibile; l'ultimo che ha risposto viene ricordato e provato per primo la volta dopo |
| `NAS_AMBIENTE` | forza il rilevamento dell'ambiente (`mac`, `cloud`, `altro`), per i casi che il riconoscimento automatico non prevede |
| `NAS_USER`, `NAS_PASS` | credenziali DSM |
| `NAS_OTP_SECRET` | segreto base32 della 2FA; il client calcola il codice |
| `NAS_OTP_CODE` | codice 2FA gia' pronto, per un singolo comando |
| `NAS_VERIFY_TLS` | `no` disattiva la verifica del certificato **solo per gli indirizzi locali o Tailscale**; un indirizzo pubblico nella stessa lista resta sempre verificato |
| `NAS_CA_BUNDLE` | file PEM con il certificato del NAS, alternativa pulita a `NAS_VERIFY_TLS=no` |
| `NAS_READONLY` | `1` blocca ogni scrittura, anche con `--yes` |
| `NAS_SSH_HOST`, `NAS_SSH_USER`, `NAS_SSH_PORT`, `NAS_SSH_KEY` | trasporto SSH |
| `NAS_TIMEOUT` | secondi di attesa per richiesta (default 30; **90 da solo** quando l'indirizzo scelto e' un relay QuickConnect). Alzalo se il NAS e' sotto carico: la richiesta parte, ma la risposta arriva tardi |
| `NAS_UPLOAD_LIMIT_MB` | tetto per l'upload via API (default 256) |
| `NAS_CONFIG`, `NAS_CACHE_DIR` | percorsi alternativi di config e cache |

Le variabili d'ambiente hanno la precedenza sul file: comodo per sovrascrivere
un valore in una singola sessione.

## 4. Raggiungere il NAS da fuori casa

Serve per l'uso da cellulare. Tre strade, dalla migliore alla peggiore:

**a. DDNS + certificato Let's Encrypt + reverse proxy** *(consigliata)*
1. Pannello di controllo > Accesso esterno > DDNS: registra un nome
   `qualcosa.synology.me`
2. Sicurezza > Certificato: richiedi un certificato Let's Encrypt per quel nome
3. Portale di accesso > Proxy inverso: pubblica DSM su `443`, cosi' esponi una
   sola porta standard invece della 5001
4. Sul router inoltra solo la 443 verso il NAS
5. `NAS_URL=https://qualcosa.synology.me`

Con un certificato valido la verifica TLS funziona e `NAS_VERIFY_TLS=no` non
serve mai.

**b. Tailscale o un'altra VPN mesh.** *Dal Mac e' la strada migliore*, meglio
anche della (a): non apre nessuna porta sul router, la connessione e' diretta e
cifrata invece di passare da un relay, e **SSH funziona**, cosa impossibile con
QuickConnect. Installa il pacchetto Tailscale sul NAS dal Centro pacchetti e usa
l'indirizzo `100.x.y.z` che ti assegna:

```
NAS_URL=https://100.73.172.85:5001
NAS_SSH_HOST=100.73.172.85
NAS_VERIFY_TLS=no
```

`NAS_VERIFY_TLS=no` qui non e' una rinuncia: il certificato autofirmato di DSM
non e' verificabile per un indirizzo IP, e l'autenticazione del peer la fa gia'
Tailscale, che e' una garanzia piu' forte. Su un indirizzo pubblico, invece, la
stessa riga sarebbe un errore grave. Se vuoi comunque la verifica, Tailscale sa
emettere un certificato valido per il nome MagicDNS (`tailscale cert`), da
installare poi in DSM.

L'unico limite: il NAS resta invisibile alle sessioni cloud, quindi **dal
cellulare Tailscale da solo non basta**. Le due strade convivono senza problemi:
Tailscale dal Mac, QuickConnect o DDNS dal telefono.

**c. QuickConnect.** Comodo per le app Synology, e **l'unica strada che
funziona dalle sessioni cloud** senza aprire porte: l'API web risponde
attraverso il relay (verificato: 872 API esposte). Va messo in `NAS_URL` dopo
LAN e Tailscale, cosi' viene usato solo quando gli altri non rispondono. Due
avvertenze che contano:

- **SSH non passa da QuickConnect.** Il relay inoltra il traffico web di DSM,
  non SSH: un indirizzo `*.quickconnect.to` risolve a un server Synology, non
  al tuo NAS. `nas-setup.sh` se ne accorge e chiede l'indirizzo locale invece
  di installare la chiave su una macchina di terzi.
- **Il traffico passa da un relay Synology**, non e' una connessione diretta.

Per un uso serio da fuori casa, la strada (a) resta migliore.

Qualunque strada scegli, tieni attivi **Auto Block** (Sicurezza > Protezione) e
il firewall di DSM, e limita l'accesso ai paesi da cui ti connetti davvero.

## 5. SSH, per l'uso dal Mac

Pannello di controllo > Terminale e SNMP > **Attiva servizio SSH**. Cambia la
porta di default se il NAS e' esposto, e non aprire mai la porta SSH sul router.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_nas -C "claude-nas"
ssh-copy-id -i ~/.ssh/id_ed25519_nas.pub claude@192.168.1.10
ssh -i ~/.ssh/id_ed25519_nas claude@192.168.1.10 'uname -a'
```

Su DSM la home dell'utente deve esistere (Pannello di controllo > Utente e
gruppo > Avanzate > **Abilita servizio home utente**), altrimenti la chiave non
puo' essere installata.

I comandi che toccano il sistema richiedono `sudo`, che chiede la password in
modo interattivo: la skill non la fornisce. Se ti serve l'automazione su
comandi privilegiati, valuta una singola regola `sudoers` mirata al comando
specifico, non un `NOPASSWD: ALL`.

## 6. Uso dal cellulare (sessioni cloud)

Le sessioni aperte da telefono o dal web (claude.ai/code) girano in un
container in cloud: non vedono ne' il tuo Mac ne' la tua LAN ne' Tailscale, e
non ereditano `~/.config`. **Verificato da un container reale**: senza le tre
cose qui sotto, il proxy di uscita risponde `403` alla connessione verso il NAS
e la skill non puo' fare nulla.

Tutto quello che serve lo stampa, gia' compilato dalla configurazione del Mac
e senza la password:

```bash
scripts/nas cloud
```

1. **Il dominio del NAS nella network policy** dell'environment: su
   claude.ai/code, impostazioni dell'environment, sezione Network, aggiungi
   `<id>.<regione>.quickconnect.to` (o il tuo DDNS). Il traffico in uscita passa
   da un proxy con allowlist: un dominio non elencato e' rifiutato, e la skill
   te lo dice con quel nome esatto invece di un generico "non raggiungibile".
2. **Le variabili nell'environment**: `NAS_URL` (solo gli indirizzi pubblici),
   `NAS_USER`, `NAS_PASS`, `NAS_OTP_SECRET` se attiva, `NAS_TIMEOUT=90` perche'
   QuickConnect e' un relay lento. Restano nell'environment, mai nel repository.
3. **La skill**: caricata sull'account (Impostazioni > Capacita' > Skill, lo
   zip di `./package-for-claude-ai.sh nas-synology`) oppure installata dal
   Setup script dell'environment, come nel README.

Da cellulare SSH non c'e': funzionano solo i comandi basati su API. Tutto cio'
che richiede la shell va rimandato a quando sei al Mac. Il client se ne accorge
da solo (`Ambiente cloud` in `check`) e non prova nemmeno LAN e Tailscale.

Una cosa da sapere sul certificato, nel cloud: il proxy di uscita del container
termina il TLS e lo rifa' con un certificato suo, che il container considera
valido. Quindi li' `NAS_VERIFY_TLS` e `NAS_CA_BUNDLE` riguardano il tratto
fino al proxy, non il certificato del NAS; e' il proxy a verificare quello. In
pratica: nel cloud non servono, e un errore di certificato che compare li'
non parla del NAS.

## 7. La configurazione consigliata, tutta insieme

Un solo `NAS_URL` con i tre indirizzi, e la stessa riga vale ovunque:

```
NAS_URL=https://192.168.10.139:5001,https://100.73.172.85:5001,https://<id>.<regione>.quickconnect.to
NAS_SSH_HOST=100.73.172.85
NAS_VERIFY_TLS=no
NAS_TIMEOUT=90
```

In casa risponde la LAN (veloce, SSH), fuori casa Tailscale (SSH), e nel cloud
solo QuickConnect: il client sceglie da solo. `NAS_VERIFY_TLS=no` toglie la
verifica del certificato ai primi due, che sono locali, e non tocca il terzo.

## 8. Controllo finale

```bash
scripts/nas check
scripts/nas health
```

Se `check` passa e `health` mostra volumi e dischi, la configurazione e'
completa.
