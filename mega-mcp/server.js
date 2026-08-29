// MEGA MCP — connettore MCP remoto (Streamable HTTP) per un account MEGA.
//
// Espone il contenuto dell'account MEGA come tool MCP, così claude.ai (chat)
// può elencare cartelle, cercare file, leggere la quota e generare link
// pubblici. Le credenziali arrivano SOLO dalle variabili d'ambiente:
//
//   MEGA_EMAIL     email dell'account MEGA
//   MEGA_PASSWORD  password dell'account MEGA (2FA non supportata da megajs)
//   AUTH_TOKEN     segreto che protegge l'endpoint: l'URL del connettore è
//                  /mcp/<AUTH_TOKEN>, tutto il resto risponde 401
//   PORT           porta HTTP (default 10000, quella attesa da Render)

import express from 'express'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { Storage } from 'megajs'

const PORT = Number(process.env.PORT || 10000)
// Trim: un valore incollato nel pannello dell'hosting porta spesso spazi o un
// newline finale, che altrimenti farebbero fallire ogni confronto.
const AUTH_TOKEN = (process.env.AUTH_TOKEN || '').trim()

if (!AUTH_TOKEN) {
  console.error('AUTH_TOKEN mancante: rifiuto di partire senza protezione dell\'endpoint.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Sessione MEGA: login pigro e condiviso, con retry su sessione scaduta.
// ---------------------------------------------------------------------------

let storagePromise = null

function getStorage () {
  if (!storagePromise) {
    storagePromise = (async () => {
      const email = (process.env.MEGA_EMAIL || '').trim()
      const password = (process.env.MEGA_PASSWORD || '').trim()
      if (!email || !password) {
        throw new Error('MEGA_EMAIL o MEGA_PASSWORD non configurate nelle variabili d\'ambiente del server.')
      }
      const storage = new Storage({ email, password, userAgent: 'MegaMCP/1.0' })
      await storage.ready
      return storage
    })()
    // Un login fallito non deve avvelenare le chiamate successive.
    storagePromise.catch(() => { storagePromise = null })
  }
  return storagePromise
}

async function withStorage (fn) {
  try {
    return await fn(await getStorage())
  } catch (err) {
    // Sessione scaduta o connessione persa: un solo tentativo di re-login.
    storagePromise = null
    return fn(await getStorage())
  }
}

// ---------------------------------------------------------------------------
// Navigazione dell'albero dei file.
// ---------------------------------------------------------------------------

function splitPath (path) {
  return String(path || '/').split('/').map(s => s.trim()).filter(Boolean)
}

function resolvePath (storage, path) {
  let node = storage.root
  for (const part of splitPath(path)) {
    const children = node.children || []
    const next = children.find(c => c.name === part) ||
      children.find(c => (c.name || '').toLowerCase() === part.toLowerCase())
    if (!next) {
      const available = children.map(c => c.name).join(', ') || '(vuota)'
      throw new Error(`Percorso non trovato: "${part}" non esiste in "/${splitPath(path).slice(0, splitPath(path).indexOf(part)).join('/')}". Contenuto disponibile: ${available}`)
    }
    node = next
  }
  return node
}

function humanSize (bytes) {
  if (bytes == null) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes; let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function describeNode (node, path) {
  return {
    name: node.name,
    path,
    type: node.directory ? 'cartella' : 'file',
    size: node.directory ? undefined : humanSize(node.size),
    sizeBytes: node.directory ? undefined : node.size,
    modified: node.timestamp ? new Date(node.timestamp * 1000).toISOString() : undefined,
    items: node.directory ? (node.children || []).length : undefined
  }
}

function walk (node, path, visit) {
  visit(node, path)
  if (node.directory) {
    for (const child of node.children || []) {
      walk(child, `${path === '/' ? '' : path}/${child.name}`, visit)
    }
  }
}

// ---------------------------------------------------------------------------
// Definizione del server MCP (stateless: uno per richiesta).
// ---------------------------------------------------------------------------

function textResult (data) {
  return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] }
}

function buildServer () {
  const server = new McpServer({ name: 'mega', version: '1.0.0' })

  server.tool(
    'mega_list',
    'Elenca il contenuto di una cartella dell\'account MEGA. Usa "/" per la radice (Cloud Drive).',
    { path: z.string().default('/').describe('Percorso della cartella, es. "/" oppure "/Foto/2025"') },
    async ({ path }) => withStorage(async (storage) => {
      const node = resolvePath(storage, path)
      if (!node.directory) return textResult(describeNode(node, path))
      const base = splitPath(path).join('/')
      const entries = (node.children || [])
        .map(c => describeNode(c, `/${base ? base + '/' : ''}${c.name}`))
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'cartella' ? -1 : 1))
      return textResult({ path: `/${base}`, entries, total: entries.length })
    })
  )

  server.tool(
    'mega_find',
    'Cerca file e cartelle per nome (sottostringa, senza distinzione maiuscole) in tutto l\'account MEGA.',
    { query: z.string().min(1).describe('Testo da cercare nel nome, es. "fattura" o ".mp3"') },
    async ({ query }) => withStorage(async (storage) => {
      const q = query.toLowerCase()
      const matches = []
      walk(storage.root, '/', (node, path) => {
        if (node !== storage.root && (node.name || '').toLowerCase().includes(q)) {
          matches.push(describeNode(node, path))
        }
      })
      return textResult({ query, matches: matches.slice(0, 100), total: matches.length, truncated: matches.length > 100 })
    })
  )

  server.tool(
    'mega_quota',
    'Mostra lo spazio usato e totale dell\'account MEGA.',
    {},
    async () => withStorage(async (storage) => {
      const info = await storage.getAccountInfo()
      return textResult({
        spaceUsed: humanSize(info.spaceUsed),
        spaceTotal: humanSize(info.spaceTotal),
        spaceUsedBytes: info.spaceUsed,
        spaceTotalBytes: info.spaceTotal
      })
    })
  )

  server.tool(
    'mega_export_link',
    'Genera un link pubblico mega.nz per un file dell\'account. ATTENZIONE: il link contiene la chiave di decifratura, chiunque lo riceve può scaricare il file.',
    { path: z.string().min(1).describe('Percorso completo del file, es. "/Documenti/contratto.pdf"') },
    async ({ path }) => withStorage(async (storage) => {
      const node = resolvePath(storage, path)
      if (node.directory) throw new Error('Il percorso indica una cartella: l\'esportazione è supportata solo per i file.')
      const link = await node.link()
      return textResult({ path, link, warning: 'Link pubblico: condividerlo equivale a condividere il file.' })
    })
  )

  return server
}

// ---------------------------------------------------------------------------
// HTTP (Streamable HTTP transport, stateless).
// ---------------------------------------------------------------------------

const app = express()
app.use(express.json({ limit: '4mb' }))

app.get('/', (req, res) => res.type('text/plain').send('MEGA MCP attivo. Endpoint: POST /mcp/<AUTH_TOKEN>'))

app.all('/mcp/:token', async (req, res) => {
  if (decodeURIComponent(req.params.token).trim() !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'token non valido' })
  }
  // Un GET dal browser è il modo più semplice per verificare l'URL a mano:
  // rispondere in chiaro che il token è corretto evita di dover indovinare.
  if (req.method !== 'POST') {
    return res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Token corretto: questo URL e quello giusto da incollare nel connettore. Endpoint accessibile solo via POST (MCP).'
      },
      id: null
    })
  }
  try {
    const server = buildServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => { transport.close(); server.close() })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (err) {
    console.error('Errore MCP:', err)
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: `Errore interno: ${err.message}` },
        id: null
      })
    }
  }
})

app.listen(PORT, () => {
  console.log(`MEGA MCP in ascolto sulla porta ${PORT}`)
})
