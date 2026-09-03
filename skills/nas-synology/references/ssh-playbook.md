# Comandi shell su DSM

Solo dove SSH e' disponibile: Mac in LAN o in VPN. Dalle sessioni cloud e dal
cellulare questo file non serve, usa i comandi basati su API.

DSM e' Linux, ma con una distribuzione ridotta: niente `apt`, niente `systemd`
classico, e molti strumenti hanno un equivalente `syno*`. Le uniche cose
davvero installabili sono i pacchetti Synology e Entware, e non e' il caso di
metterceli di iniziativa propria.

```bash
scripts/nas ssh 'df -h'
scripts/nas ssh 'sudo synopkg list' --yes
```

Senza `--yes` il client esegue solo comandi che riconosce come di sola lettura.
La lista e' euristica, non una sandbox: la responsabilita' di cosa esegui resta
tua.

## Lettura: sicuri

| Comando | Cosa mostra |
|---|---|
| `df -h` | spazio per volume, in forma leggibile |
| `du -sh /volume1/* \| sort -h` | chi occupa spazio in una condivisione |
| `free -m`, `uptime`, `top -b -n1 \| head -20` | memoria e carico |
| `cat /proc/mdstat` | stato del RAID software |
| `sudo smartctl -a /dev/sata1` | SMART completo di un disco |
| `sudo btrfs filesystem usage /volume1` | uso reale su btrfs, snapshot inclusi |
| `sudo btrfs subvolume list /volume1` | snapshot esistenti |
| `synopkg list --name` | pacchetti installati |
| `synopkg status Docker` | stato di un pacchetto |
| `synoservice --status` | stato dei servizi |
| `docker ps -a`, `docker stats --no-stream` | container |
| `cat /etc/VERSION` | versione esatta di DSM |
| `sudo synonet --show` | interfacce di rete |

## Scrittura: solo dopo conferma esplicita

| Comando | Effetto |
|---|---|
| `sudo synopkg start\|stop <pkg>` | avvia o ferma un pacchetto |
| `sudo synoservice --restart <servizio>` | riavvia un servizio |
| `docker restart <container>` | riavvia un container |
| `sudo synoservice --disable <servizio>` | disattiva un servizio |
| `rsync -a --delete src/ dst/` | sincronizza: `--delete` cancella nella destinazione |

## Da non eseguire

Non c'e' un caso in cui valga la pena lanciarli da qui invece che da DSM:

- `mkfs`, `fdisk`, `parted`, `synostgvolume`, `synostgpool` - formattazione e
  gestione volumi: si fa da Storage Manager, che gestisce anche i metadati DSM
- `mdadm --create`, `--fail`, `--remove` - il RAID si tocca da Storage Manager
- `sudo poweroff`, `sudo reboot` - un riavvio durante un backup o uno scrub
  lascia il lavoro a meta'; da DSM il sistema chiude prima i servizi
- `rm -rf` su `/volume1/...` - salta il Cestino e non ha annullamento
- modifiche a `/etc/synoinfo.conf`, `synosetkeyvalue` - un errore qui puo'
  rendere DSM non avviabile
- `sudo synoupgrade` - gli aggiornamenti DSM vanno fatti dall'interfaccia

## Trasferimenti grandi

L'upload via API tiene il file in memoria: oltre qualche centinaio di MB usa
la shell dal Mac.

```bash
rsync -avh --progress ~/Filmati/ claude@192.168.1.10:/volume1/video/
scp -i ~/.ssh/id_ed25519_nas file.zip claude@192.168.1.10:/volume1/Drive/
```

`rsync` senza `--delete` non cancella niente sulla destinazione: e' la forma da
preferire quando non e' esplicitamente richiesto uno specchio esatto.

## Percorsi tipici

| Percorso | Cosa contiene |
|---|---|
| `/volume1/<condivisione>` | i dati delle cartelle condivise |
| `/volume1/@docker` | dati di Container Manager |
| `/var/log/messages`, `/var/log/synolog/` | log di sistema |
| `/etc/VERSION`, `/etc/synoinfo.conf` | versione e configurazione DSM |
| `/volume1/#recycle` | Cestino della condivisione, se attivo |
