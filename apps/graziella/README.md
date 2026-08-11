# Graziella — Direzione Generale vocale di InFormaMedica

App per parlare con Graziella come si parlerebbe con ChatGPT o Claude in
modalità vocale: microfono, risposta a voce, conversazione continua. La
differenza è che Graziella conosce già InFormaMedica (`persona/contesto.md`),
ha un ruolo preciso (`persona/graziella.md`) e ogni conversazione può essere
chiusa in un documento pronto da usare — memo, verbale, procedura, messaggio,
brief social — tramite i pulsanti "Finalità" a lato.

Nessuna dipendenza da installare: un solo processo Node che serve l'interfaccia
e fa da proxy verso l'API Claude, così la chiave resta sul server e non nel
browser di chi usa l'app.

## Avvio rapido

```bash
cd apps/graziella
cp .env.example .env
nano .env        # incolla la tua ANTHROPIC_API_KEY, salva (Ctrl+O, Ctrl+X)
npm start
```

Apri `http://localhost:8787`. Serve Node 18.17 o più recente (`node --version`);
su Mac senza Node: `brew install node`, oppure il pacchetto da nodejs.org.

Il file `.env` resta solo sul tuo computer: è in `.gitignore`, non finisce mai
su git. In alternativa, senza `.env`, puoi esportare la chiave nella shell
prima di ogni avvio: `export ANTHROPIC_API_KEY=sk-ant-...`.

## Configurazione (variabili d'ambiente)

| Variabile | Obbligatoria | A cosa serve |
|---|---|---|
| `ANTHROPIC_API_KEY` | sì | chiave dell'API Claude, usata dal server per rispondere |
| `PORT` | no | porta del server, default `8787` |
| `HOST` | no | default `127.0.0.1` (solo rete locale). Per usarla da altri dispositivi in clinica: `0.0.0.0` |
| `GRAZIELLA_ACCESS_CODE` | no | se impostata, l'app chiede questo codice prima di ogni chiamata: consigliata se `HOST=0.0.0.0` |
| `GRAZIELLA_MODEL` | no | default `claude-sonnet-5` |
| `GRAZIELLA_MODEL_DOC` | no | modello per la generazione dei documenti, se vuoi differenziarlo dalla conversazione |
| `GRAZIELLA_DATA_DIR` | no | dove salvare archivio e conversazioni, default `./data` |
| `ELEVENLABS_API_KEY` | no | attiva voce naturale in italiano e dettatura registrata (vedi sotto) |
| `ELEVENLABS_VOICE_ID` | no | voce predefinita di Graziella; default `DVR8HkJ1RuPcPSuAW7Q9`. Compare comunque nel menu "Voce" anche se non è nella libreria dell'account |

## Voce: due modalità, una sola a costo zero

- **Voce del browser (default, nessuna chiave in più).** Usa la sintesi e il
  riconoscimento vocale già dentro Chrome, Edge o Safari. Basta il microfono
  del dispositivo. Firefox non ha il riconoscimento vocale integrato: su
  Firefox l'app segnala il limite e propone la scrittura da tastiera.
- **Voce naturale ElevenLabs (opzionale).** Con `ELEVENLABS_API_KEY`
  impostata, in "Impostazioni → Voce" compaiono le voci ElevenLabs, più
  naturali, e in "Modalità di ascolto" l'opzione "Registra e trascrivi" (usa
  la trascrizione ElevenLabs invece di quella del browser — utile se il
  riconoscimento del browser fatica con termini medici o accento).

Il microfono richiede **contesto sicuro**: `https://` oppure `http://localhost`.
Da un altro dispositivo della rete clinica (`http://192.168.x.x:8787`) il
browser blocca il microfono — servirebbe un reverse proxy con HTTPS (es. un
tunnel Cloudflare/Tailscale, o un certificato locale). In locale sullo stesso
computer, `localhost` funziona senza altro.

## Come si usa

1. In alto a sinistra scegli **chi sta parlando** (Dario, staff di direzione,
   reception…): cambia solo il modo in cui Graziella si rivolge a chi parla,
   non i suoi limiti.
2. Premi il **microfono** e parla. Graziella ascolta, capisce quando hai
   finito la frase (una pausa) e risponde a voce, breve, come al telefono.
   "Conversazione continua" riattiva il microfono da sola dopo ogni risposta,
   per un dialogo a mani libere; disattivala se preferisci premere il
   microfono a ogni turno.
3. Quando la conversazione contiene abbastanza materiale, apri la colonna
   **Finalità** e scegli cosa produrre: il documento appare scritto a schermo,
   mai dettato a voce. Da lì puoi copiarlo, scaricarlo in `.md` o salvarlo
   nell'**Archivio** del server.
4. **Conversazioni** a lato permette di riprendere uno scambio precedente
   (salvato automaticamente) anche da un altro dispositivo, se punta allo
   stesso server.

Si può anche solo scrivere, dal campo di testo in basso: utile in un ambiente
rumoroso o per chi preferisce non parlare ad alta voce.

## Cosa fa Graziella e cosa no

Il comportamento è definito in `persona/graziella.md` (tono, limiti) e
`persona/contesto.md` (fatti sulla clinica: sedi, contatti, brand voice).
Non serve toccare il codice per cambiarli: sono file di testo, riletti a ogni
richiesta. In sintesi, Graziella:

- non dà pareri clinici — gira le domande mediche al Dottore;
- non scrive dati sanitari identificabili nei documenti (usa iniziali/codici);
- rispetta la normativa italiana sulla pubblicità sanitaria in ogni testo
  verso l'esterno (niente promesse di risultato, niente urgenza artificiosa);
- non pubblica né invia nulla da sola: prepara i testi, l'invio resta a una
  persona (i post social restano compito dello skill `social-informamedica`,
  a cui il brief prodotto da Graziella può essere passato).

Il file `persona/finalita.json` elenca gli operatori e le finalità disponibili
nella colonna laterale: aggiungerne una nuova significa aggiungere una voce a
quell'array, senza toccare il server.

## Dati e privacy

- Le conversazioni si salvano in `data/sessions/` e i documenti prodotti in
  `data/output/`, sul disco del server — non su servizi di terzi. La cartella
  `data/` non entra in git (vedi `.gitignore`): resta locale a chi fa girare
  il server.
- La chiave `ANTHROPIC_API_KEY` non tocca mai il browser: le richieste
  passano dal server (`server.mjs`), che aggiunge la chiave lato suo.
- Se esponi l'app oltre `localhost` (`HOST=0.0.0.0`), imposta sempre
  `GRAZIELLA_ACCESS_CODE`.

## Struttura

```
apps/graziella/
├── server.mjs            server Node (nessuna dipendenza npm)
├── public/                interfaccia (HTML/CSS/JS puri)
├── persona/
│   ├── graziella.md        chi è Graziella, tono, limiti
│   ├── contesto.md         fatti sulla clinica — modificalo liberamente
│   └── finalita.json       operatori + elenco dei documenti producibili
└── data/                   archivio e conversazioni (creata al primo avvio)
```
