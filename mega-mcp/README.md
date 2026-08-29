# MEGA MCP — il tuo MEGA dentro Claude chat

Connettore MCP remoto che espone l'account MEGA (mega.nz) come **connettore
personalizzato** di claude.ai. Una volta attivato, in qualsiasi chat di Claude
(anche dal telefono) si può chiedere:

- *«Cosa ho nella cartella MEGA?»* → `mega_list`
- *«Cerca i file che contengono "fattura"»* → `mega_find`
- *«Quanto spazio mi resta su MEGA?»* → `mega_quota`
- *«Dammi un link pubblico per quel file»* → `mega_export_link`

Il server è un piccolo servizio Node (Express + `megajs` + SDK MCP ufficiale,
transport Streamable HTTP stateless). Le credenziali MEGA vivono **solo** nelle
variabili d'ambiente del servizio di hosting, mai nella chat.

## Deploy su Render (gratuito, ~5 minuti, si può fare dal telefono)

1. Crea un account gratuito su [render.com](https://render.com) (login con
   GitHub è la via più rapida).
2. Dashboard → **New** → **Blueprint** → collega il repository
   `doctorplastic79-cmd/claude-skills`. Render legge il file `render.yaml`
   alla radice del repo e propone il servizio `mega-mcp`.
3. Alla richiesta delle variabili d'ambiente inserisci:
   - `MEGA_EMAIL` = email dell'account MEGA
   - `MEGA_PASSWORD` = password dell'account MEGA
   - `AUTH_TOKEN` viene generato automaticamente da Render (è il segreto che
     protegge l'endpoint).
4. Avvia il deploy e attendi che lo stato diventi **Live**. Annota:
   - l'URL del servizio, es. `https://mega-mcp-xxxx.onrender.com`
   - il valore di `AUTH_TOKEN` (pagina del servizio → Environment).

Verifica rapida: aprire `https://mega-mcp-xxxx.onrender.com/` nel browser deve
mostrare «MEGA MCP attivo».

## Collegamento a claude.ai

1. Su claude.ai → **Impostazioni** → **Connettori** → **Aggiungi connettore
   personalizzato**.
2. Come URL inserisci endpoint + token:

   ```
   https://mega-mcp-xxxx.onrender.com/mcp/IL_TUO_AUTH_TOKEN
   ```

3. Salva. Nelle nuove chat abilita il connettore "mega" dal menu strumenti e
   chiedi ad esempio *«elenca la mia cartella MEGA»*.

## Limiti e sicurezza

- **Piano gratuito Render**: il servizio si addormenta dopo ~15 minuti di
  inattività; la prima richiesta successiva può impiegare 30–60 secondi
  (Claude di solito riprova da sola). Per eliminarlo serve un piano a
  pagamento — per l'uso personale il free tier basta.
- **2FA**: la libreria `megajs` non supporta la verifica in due passaggi.
  Se l'account MEGA ha la 2FA attiva il login fallisce.
- **AUTH_TOKEN è parte dell'URL**: chi conosce l'URL completo può
  interrogare il tuo MEGA. Non condividerlo; per revocarlo, rigenera
  `AUTH_TOKEN` su Render e aggiorna il connettore.
- **`mega_export_link` rende il file pubblico**: il link mega.nz generato
  contiene la chiave di decifratura nel frammento `#…` — condividerlo
  equivale a condividere il file.
- Il connettore è **in sola lettura** (elenco, ricerca, quota, export link):
  niente upload né cancellazioni, per design.

## Sviluppo locale

```bash
cd mega-mcp
npm install
AUTH_TOKEN=test MEGA_EMAIL=... MEGA_PASSWORD=... npm start
# endpoint: http://localhost:10000/mcp/test
```
