#!/usr/bin/env node
/**
 * Graziella — direzione generale vocale di InFormaMedica.
 *
 * Server minimale senza dipendenze npm: serve i file statici, fa da proxy
 * streaming verso l'API Claude (la chiave resta sul server, mai nel browser),
 * offre voce e dettatura ElevenLabs se configurate, e archivia su disco le
 * conversazioni e i documenti prodotti.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname, extname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const PERSONA_DIR = join(ROOT, 'persona');

// Se esiste un file .env accanto a questo script, le sue chiavi riempiono
// process.env (senza sovrascrivere variabili già impostate dalla shell).
// Comodo per un solo Mac in beta test: niente da esportare a ogni terminale,
// e il file resta locale (è in .gitignore, non finisce mai su git).
loadDotEnv(join(ROOT, '.env'));

function loadDotEnv(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return; // nessun .env: si usano solo le variabili d'ambiente reali
  }
  for (const riga of raw.split('\n')) {
    const t = riga.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const chiave = t.slice(0, eq).trim();
    let valore = t.slice(eq + 1).trim();
    if ((valore.startsWith('"') && valore.endsWith('"')) || (valore.startsWith("'") && valore.endsWith("'"))) {
      valore = valore.slice(1, -1);
    }
    if (!(chiave in process.env)) process.env[chiave] = valore;
  }
}

const DATA_DIR = resolve(process.env.GRAZIELLA_DATA_DIR || join(ROOT, 'data'));
const OUTPUT_DIR = join(DATA_DIR, 'output');
const SESSIONS_DIR = join(DATA_DIR, 'sessions');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_BASE = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
const MODEL = process.env.GRAZIELLA_MODEL || 'claude-sonnet-5';
const MODEL_DOC = process.env.GRAZIELLA_MODEL_DOC || MODEL;
const ACCESS_CODE = process.env.GRAZIELLA_ACCESS_CODE || '';
const EL_KEY = process.env.ELEVENLABS_API_KEY || '';
const EL_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2';
const EL_STT_MODEL = process.env.ELEVENLABS_STT_MODEL || 'scribe_v1';
const EL_VOCE_PREDEFINITA = process.env.ELEVENLABS_VOICE_ID || 'DVR8HkJ1RuPcPSuAW7Q9';
const MAX_BODY = 2 * 1024 * 1024;
const MAX_AUDIO = 20 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// ---------------------------------------------------------------- utilità

const sendJson = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
};

const readBody = (req, limit = MAX_BODY) =>
  new Promise((ok, ko) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        ko(new Error('corpo della richiesta troppo grande'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', ko);
  });

const readJsonBody = async (req) => {
  const raw = await readBody(req);
  if (!raw.length) return {};
  return JSON.parse(raw.toString('utf8'));
};

const readText = async (path, fallback = '') => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return fallback;
  }
};

const slug = (s) =>
  (s || 'documento')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'documento';

const nowRome = () =>
  new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'full', timeStyle: 'short' });

const todayStamp = () =>
  new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }); // YYYY-MM-DD

const safeName = (name) => basename(String(name || '')).replace(/[^A-Za-z0-9._-]/g, '');

// ------------------------------------------------------- prompt di sistema

const REGOLE_VOCE = `
# Regole di questo turno: stai parlando a voce
Rispondi in 2-4 frasi brevi, come al telefono. Vietati markdown, elenchi,
titoli, parentesi tecniche ed emoji: il testo viene letto ad alta voce.
Una sola domanda per turno. Se l'esito richiede un testo lungo (verbale, memo,
procedura, messaggio, caption), NON dettarlo: di' in una frase cosa hai in mano
e proponi di produrlo come documento, che comparirà scritto sullo schermo.`;

const REGOLE_TESTO = `
# Regole di questo turno: stai scrivendo in chat
Puoi usare markdown leggero (grassetto, elenchi brevi). Resta sintetica:
nessun preambolo, vai al punto. I documenti completi restano compito dei
pulsanti "finalità".`;

async function loadConfigFile() {
  const raw = await readText(join(PERSONA_DIR, 'finalita.json'), '{}');
  try {
    const parsed = JSON.parse(raw);
    return { operatori: parsed.operatori || [], finalita: parsed.finalita || [] };
  } catch (err) {
    console.error('[graziella] finalita.json non è JSON valido:', err.message);
    return { operatori: [], finalita: [] };
  }
}

async function buildSystem({ operatore, canale }) {
  const [persona, contesto] = await Promise.all([
    readText(join(PERSONA_DIR, 'graziella.md')),
    readText(join(PERSONA_DIR, 'contesto.md')),
  ]);
  const chi = operatore?.nome ? `${operatore.nome}${operatore.ruolo ? ` — ${operatore.ruolo}` : ''}` : 'non specificato';
  return [
    persona,
    '\n---\n',
    contesto,
    '\n---\n# Sessione in corso\n',
    `- Adesso: ${nowRome()} (Europe/Rome)\n`,
    `- Con chi stai parlando: ${chi}\n`,
    canale === 'voce' ? REGOLE_VOCE : REGOLE_TESTO,
  ].join('');
}

// Tiene solo i campi che l'API accetta e scarta i turni vuoti.
function normalizeMessages(messages) {
  const out = [];
  for (const m of Array.isArray(messages) ? messages : []) {
    const role = m?.role === 'assistant' ? 'assistant' : 'user';
    const content = typeof m?.content === 'string' ? m.content.trim() : '';
    if (!content) continue;
    if (out.length && out[out.length - 1].role === role) {
      out[out.length - 1].content += `\n\n${content}`; // due turni di fila dello stesso ruolo
    } else {
      out.push({ role, content });
    }
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out.slice(-60);
}

async function callClaude({ system, messages, maxTokens, model, stream }) {
  if (!ANTHROPIC_KEY) {
    const err = new Error('ANTHROPIC_API_KEY non è configurata sul server');
    err.status = 503;
    throw err;
  }
  const res = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || MODEL,
      max_tokens: maxTokens,
      system,
      messages,
      ...(stream ? { stream: true } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`API Claude ${res.status}: ${detail.slice(0, 600)}`);
    err.status = res.status === 401 ? 401 : 502;
    throw err;
  }
  return res;
}

// Legge lo stream SSE dell'API e produce i soli delta di testo.
async function* streamText(res) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let evt;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          yield { text: evt.delta.text };
        } else if (evt.type === 'message_delta' && evt.delta?.stop_reason) {
          yield { stop: evt.delta.stop_reason };
        } else if (evt.type === 'error') {
          yield { error: evt.error?.message || 'errore dello stream' };
        }
      }
    }
  }
}

// ------------------------------------------------------------------ rotte

async function handleChat(req, res) {
  const body = await readJsonBody(req);
  const messages = normalizeMessages(body.messages);
  if (!messages.length) return sendJson(res, 400, { error: 'nessun messaggio da inviare' });

  const canale = body.canale === 'testo' ? 'testo' : 'voce';
  const system = await buildSystem({ operatore: body.operatore, canale });

  // Con l'interruzione a voce il browser chiude questa richiesta molto più
  // spesso di prima (ogni volta che qualcuno le parla sopra): senza questa
  // guardia, scrivere su una connessione già chiusa manda in crash il server.
  let chiusa = false;
  res.on('close', () => {
    chiusa = true;
  });

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  const emit = (event, data) => {
    if (chiusa) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      chiusa = true;
    }
  };

  try {
    const upstream = await callClaude({
      system,
      messages,
      model: MODEL,
      maxTokens: canale === 'voce' ? 700 : 1800,
      stream: true,
    });
    for await (const part of streamText(upstream)) {
      if (chiusa) {
        upstream.body?.cancel?.().catch(() => {}); // interrotta: non generare oltre, si spreca solo
        break;
      }
      if (part.text) emit('delta', { text: part.text });
      else if (part.error) emit('error', { error: part.error });
    }
    emit('done', {});
  } catch (err) {
    emit('error', { error: err.message });
  }
  if (!chiusa) res.end();
}

async function handleDocumento(req, res) {
  const body = await readJsonBody(req);
  const { finalita } = await loadConfigFile();
  const scelta = finalita.find((f) => f.id === body.finalitaId);
  if (!scelta) return sendJson(res, 400, { error: 'finalità sconosciuta' });

  const messages = normalizeMessages(body.messages);
  if (!messages.length) return sendJson(res, 400, { error: 'la conversazione è vuota: prima parla con Graziella' });

  const system = await buildSystem({ operatore: body.operatore, canale: 'documento' });
  const richiesta = [
    `# Compito: produci il documento "${scelta.titolo}"`,
    scelta.istruzioni,
    '',
    'Basati esclusivamente sulla conversazione qui sopra. Rispondi con il solo',
    'documento in markdown, senza premesse né commenti finali. La prima riga',
    "deve essere il titolo come intestazione di primo livello (`# Titolo`).",
    body.note ? `\nIndicazione aggiuntiva di chi ha richiesto il documento: ${body.note}` : '',
  ].join('\n');

  try {
    const upstream = await callClaude({
      system,
      messages: [...messages, { role: 'user', content: richiesta }],
      model: MODEL_DOC,
      maxTokens: 4000,
      stream: false,
    });
    const data = await upstream.json();
    const markdown = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!markdown) return sendJson(res, 502, { error: 'il modello non ha restituito testo' });
    const titolo = (markdown.match(/^#\s+(.+)$/m)?.[1] || scelta.titolo).trim();
    sendJson(res, 200, { finalitaId: scelta.id, finalitaTitolo: scelta.titolo, titolo, markdown });
  } catch (err) {
    sendJson(res, err.status || 500, { error: err.message });
  }
}

async function handleSalva(req, res) {
  const body = await readJsonBody(req);
  const markdown = typeof body.markdown === 'string' ? body.markdown.trim() : '';
  if (!markdown) return sendJson(res, 400, { error: 'niente da salvare' });
  const nome = `${todayStamp()}-${slug(body.finalitaId)}-${slug(body.titolo)}.md`;
  const intestazione = [
    '---',
    `titolo: ${JSON.stringify(body.titolo || 'Documento')}`,
    `finalita: ${body.finalitaId || 'documento'}`,
    `richiesto_da: ${body.operatore?.nome || 'non specificato'}`,
    `creato: ${new Date().toISOString()}`,
    '---',
    '',
  ].join('\n');
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(join(OUTPUT_DIR, nome), intestazione + markdown + '\n', 'utf8');
  sendJson(res, 200, { file: nome });
}

async function handleArchivio(res) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const files = (await readdir(OUTPUT_DIR)).filter((f) => f.endsWith('.md')).sort().reverse();
  sendJson(res, 200, { files: files.slice(0, 200) });
}

async function handleArchivioFile(res, name) {
  const file = safeName(name);
  if (!file.endsWith('.md')) return sendJson(res, 400, { error: 'nome file non valido' });
  try {
    sendJson(res, 200, { file, markdown: await readFile(join(OUTPUT_DIR, file), 'utf8') });
  } catch {
    sendJson(res, 404, { error: 'documento non trovato' });
  }
}

async function handleSessioneSalva(req, res) {
  const body = await readJsonBody(req);
  const id = safeName(body.id);
  if (!id) return sendJson(res, 400, { error: 'id sessione mancante' });
  await mkdir(SESSIONS_DIR, { recursive: true });
  const record = {
    id,
    operatore: body.operatore || null,
    aggiornata: new Date().toISOString(),
    titolo: (body.messages?.find((m) => m.role === 'user')?.content || 'Conversazione').slice(0, 90),
    messages: Array.isArray(body.messages) ? body.messages.slice(-200) : [],
  };
  await writeFile(join(SESSIONS_DIR, `${id}.json`), JSON.stringify(record, null, 2), 'utf8');
  sendJson(res, 200, { ok: true });
}

async function handleSessioniLista(res) {
  await mkdir(SESSIONS_DIR, { recursive: true });
  const files = (await readdir(SESSIONS_DIR)).filter((f) => f.endsWith('.json'));
  const sessioni = [];
  for (const f of files) {
    try {
      const r = JSON.parse(await readFile(join(SESSIONS_DIR, f), 'utf8'));
      sessioni.push({ id: r.id, titolo: r.titolo, aggiornata: r.aggiornata, operatore: r.operatore, turni: r.messages?.length || 0 });
    } catch {
      /* file corrotto: lo ignoriamo invece di far cadere la lista */
    }
  }
  sessioni.sort((a, b) => String(b.aggiornata).localeCompare(String(a.aggiornata)));
  sendJson(res, 200, { sessioni: sessioni.slice(0, 50) });
}

async function handleSessioneLeggi(res, id) {
  const file = safeName(id);
  try {
    sendJson(res, 200, JSON.parse(await readFile(join(SESSIONS_DIR, `${file}.json`), 'utf8')));
  } catch {
    sendJson(res, 404, { error: 'sessione non trovata' });
  }
}

async function handleTts(req, res) {
  if (!EL_KEY) return sendJson(res, 503, { error: 'ElevenLabs non configurato' });
  const body = await readJsonBody(req);
  const text = String(body.text || '').slice(0, 2500);
  const voiceId = safeName(body.voiceId);
  if (!text.trim()) return sendJson(res, 400, { error: 'testo mancante' });
  if (!voiceId) return sendJson(res, 400, { error: 'voce non selezionata' });
  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'xi-api-key': EL_KEY },
      body: JSON.stringify({ text, model_id: EL_TTS_MODEL, language_code: 'it' }),
    },
  );
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    return sendJson(res, 502, { error: `ElevenLabs ${upstream.status}: ${detail.slice(0, 300)}` });
  }
  res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' });
  for await (const chunk of upstream.body) res.write(chunk);
  res.end();
}

async function handleVoci(res) {
  if (!EL_KEY) return sendJson(res, 200, { voci: [] });
  try {
    const upstream = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': EL_KEY } });
    if (!upstream.ok) return sendJson(res, 200, { voci: [], error: `ElevenLabs ${upstream.status}` });
    const data = await upstream.json();
    const voci = (data.voices || []).map((v) => ({
      id: v.voice_id,
      nome: v.name,
      genere: v.labels?.gender || '',
      lingua: v.labels?.language || v.fine_tuning?.language || '',
    }));
    // La voce di Graziella è fissa: se non è tra quelle salvate nell'account
    // (es. è una voce condivisa non aggiunta alla libreria), la recuperiamo
    // a parte così compare comunque nell'elenco ed è selezionabile.
    if (EL_VOCE_PREDEFINITA && !voci.some((v) => v.id === EL_VOCE_PREDEFINITA)) {
      const dettaglio = await fetch(`https://api.elevenlabs.io/v1/voices/${EL_VOCE_PREDEFINITA}`, {
        headers: { 'xi-api-key': EL_KEY },
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      voci.unshift({
        id: EL_VOCE_PREDEFINITA,
        nome: dettaglio?.name || 'Graziella',
        genere: dettaglio?.labels?.gender || '',
        lingua: dettaglio?.labels?.language || '',
      });
    }
    sendJson(res, 200, { voci, predefinita: EL_VOCE_PREDEFINITA });
  } catch (err) {
    sendJson(res, 200, { voci: [], error: err.message });
  }
}

async function handleStt(req, res) {
  if (!EL_KEY) return sendJson(res, 503, { error: 'ElevenLabs non configurato: la dettatura registrata non è disponibile' });
  const audio = await readBody(req, MAX_AUDIO);
  if (!audio.length) return sendJson(res, 400, { error: 'audio vuoto' });
  const tipo = req.headers['content-type'] || 'audio/webm';
  const form = new FormData();
  form.append('file', new Blob([audio], { type: tipo }), 'registrazione.webm');
  form.append('model_id', EL_STT_MODEL);
  form.append('language_code', 'ita');
  try {
    const upstream = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': EL_KEY },
      body: form,
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return sendJson(res, 502, { error: `ElevenLabs ${upstream.status}: ${detail.slice(0, 300)}` });
    }
    const data = await upstream.json();
    sendJson(res, 200, { testo: (data.text || '').trim() });
  } catch (err) {
    sendJson(res, 502, { error: err.message });
  }
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const full = resolve(PUBLIC_DIR, rel);
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('vietato');
    return;
  }
  try {
    const data = await readFile(full);
    res.writeHead(200, {
      'content-type': MIME[extname(full).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('non trovato');
  }
}

// ------------------------------------------------------------------ server

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;

  try {
    if (path.startsWith('/api/')) {
      // Il codice d'accesso protegge solo le API: i file statici non contengono nulla.
      if (ACCESS_CODE && path !== '/api/config') {
        const fornito = req.headers['x-graziella-code'] || url.searchParams.get('code') || '';
        if (fornito !== ACCESS_CODE) return sendJson(res, 401, { error: 'codice di accesso errato' });
      }

      if (path === '/api/config' && req.method === 'GET') {
        const { operatori, finalita } = await loadConfigFile();
        return sendJson(res, 200, {
          operatori,
          finalita: finalita.map(({ id, titolo, icona, descrizione }) => ({ id, titolo, icona, descrizione })),
          modello: MODEL,
          chiavePresente: Boolean(ANTHROPIC_KEY),
          elevenlabs: Boolean(EL_KEY),
          codiceRichiesto: Boolean(ACCESS_CODE),
        });
      }
      if (path === '/api/chat' && req.method === 'POST') return await handleChat(req, res);
      if (path === '/api/documento' && req.method === 'POST') return await handleDocumento(req, res);
      if (path === '/api/salva' && req.method === 'POST') return await handleSalva(req, res);
      if (path === '/api/archivio' && req.method === 'GET') return await handleArchivio(res);
      if (path.startsWith('/api/archivio/') && req.method === 'GET') return await handleArchivioFile(res, path.slice('/api/archivio/'.length));
      if (path === '/api/sessione' && req.method === 'POST') return await handleSessioneSalva(req, res);
      if (path === '/api/sessioni' && req.method === 'GET') return await handleSessioniLista(res);
      if (path.startsWith('/api/sessione/') && req.method === 'GET') return await handleSessioneLeggi(res, path.slice('/api/sessione/'.length));
      if (path === '/api/tts' && req.method === 'POST') return await handleTts(req, res);
      if (path === '/api/tts/voci' && req.method === 'GET') return await handleVoci(res);
      if (path === '/api/stt' && req.method === 'POST') return await handleStt(req, res);
      return sendJson(res, 404, { error: 'endpoint inesistente' });
    }
    await serveStatic(res, path);
  } catch (err) {
    console.error('[graziella]', err);
    if (!res.headersSent) sendJson(res, err.status || 500, { error: err.message });
    else res.end();
  }
});

await mkdir(OUTPUT_DIR, { recursive: true });
await mkdir(SESSIONS_DIR, { recursive: true });

server.listen(PORT, HOST, () => {
  console.log(`\n  Graziella è in ascolto su http://${HOST}:${PORT}\n`);
  console.log(`  modello        ${MODEL}${MODEL_DOC !== MODEL ? ` (documenti: ${MODEL_DOC})` : ''}`);
  console.log(`  chiave Claude  ${ANTHROPIC_KEY ? 'configurata' : 'MANCANTE — esporta ANTHROPIC_API_KEY'}`);
  console.log(`  ElevenLabs     ${EL_KEY ? 'attivo (voce naturale + dettatura)' : 'non configurato (voce del browser)'}`);
  console.log(`  accesso        ${ACCESS_CODE ? 'protetto da codice' : 'libero (solo rete locale)'}`);
  console.log(`  archivio       ${DATA_DIR}\n`);
});
