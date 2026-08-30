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
in `~/.cache/nas-synology/session.json`: dai login successivi il codice non
serve piu'. Se cancelli quel file, il segreto (o un codice) torna necessario.

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
| `NAS_URL` | indirizzo completo, con schema e porta (`https://host:5001`) |
| `NAS_USER`, `NAS_PASS` | credenziali DSM |
| `NAS_OTP_SECRET` | segreto base32 della 2FA; il client calcola il codice |
| `NAS_OTP_CODE` | codice 2FA gia' pronto, per un singolo comando |
| `NAS_VERIFY_TLS` | `no` disattiva la verifica del certificato: solo su LAN |
| `NAS_CA_BUNDLE` | file PEM con il certificato del NAS, alternativa pulita a `NAS_VERIFY_TLS=no` |
| `NAS_READONLY` | `1` blocca ogni scrittura, anche con `--yes` |
| `NAS_SSH_HOST`, `NAS_SSH_USER`, `NAS_SSH_PORT`, `NAS_SSH_KEY` | trasporto SSH |
| `NAS_TIMEOUT` | secondi di attesa per richiesta (default 30). Alzalo a 90 se il NAS e' sotto carico o lo raggiungi da un relay QuickConnect: la richiesta parte, ma la risposta arriva tardi |
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

**b. VPN o Tailscale.** Piu' sicuro (niente porte aperte) ma il NAS resta
invisibile alle sessioni cloud: dal cellulare non funzionerebbe. Buona scelta se
ti basta usare la skill dal Mac.

**c. QuickConnect.** Comodo per le app Synology. L'API web spesso risponde
anche attraverso il relay, quindi come `NAS_URL` puo' funzionare, ma con due
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

Le sessioni aperte da telefono girano in un container in cloud: non vedono ne'
il tuo Mac ne' la tua LAN, e non ereditano `~/.config`. Perche' la skill
funzioni li' servono due cose:

1. **Le variabili nell'ambiente cloud.** Nelle impostazioni del cloud
   environment (claude.ai/code), campo variabili d'ambiente: `NAS_URL`,
   `NAS_USER`, `NAS_PASS`, `NAS_OTP_SECRET`. Restano dentro l'ambiente, non nel
   repository.
2. **Il dominio del NAS ammesso dalla network policy** dell'ambiente. Il traffico
   in uscita passa da un proxy che blocca i domini non previsti: se
   `qualcosa.synology.me` non e' ammesso, ogni chiamata fallisce con "impossibile
   raggiungere". E' una impostazione dell'environment, non qualcosa che la skill
   possa aggirare.

Da cellulare SSH non c'e': funzionano solo i comandi basati su API. Tutto cio'
che richiede la shell va rimandato a quando sei al Mac.

## 7. Controllo finale

```bash
scripts/nas check
scripts/nas health
```

Se `check` passa e `health` mostra volumi e dischi, la configurazione e'
completa.
