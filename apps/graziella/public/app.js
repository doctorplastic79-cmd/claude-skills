/* Graziella — logica del client: voce, conversazione, documenti. */

const $ = (sel) => document.querySelector(sel);
const el = {
  trascrizione: $('#trascrizione'),
  interim: $('#interim'),
  mic: $('#btn-mic'),
  statoVoce: $('#stato-voce'),
  maniLibere: $('#mani-libere'),
  stopVoce: $('#btn-stop-voce'),
  nuova: $('#btn-nuova'),
  formTesto: $('#form-testo'),
  inputTesto: $('#input-testo'),
  operatore: $('#operatore'),
  voce: $('#voce'),
  finalita: $('#finalita'),
  archivio: $('#archivio'),
  sessioni: $('#sessioni'),
  banner: $('#stato-banner'),
  dlgDoc: $('#dlg-doc'),
  docTitolo: $('#doc-titolo'),
  docCorpo: $('#doc-corpo'),
  docStato: $('#doc-stato'),
  btnCopia: $('#btn-copia'),
  btnScarica: $('#btn-scarica'),
  btnArchivia: $('#btn-archivia'),
  dlgImp: $('#dlg-imp'),
  btnImp: $('#btn-impostazioni'),
  impCodice: $('#imp-codice'),
  impModoStt: $('#imp-modo-stt'),
  impVelocita: $('#imp-velocita'),
  impLeggi: $('#imp-leggi'),
  impDiag: $('#imp-diagnostica'),
  btnArchivioAgg: $('#btn-aggiorna-archivio'),
  btnSessioniAgg: $('#btn-aggiorna-sessioni'),
};

const PREF = 'graziella:';
const pref = {
  get: (k, def) => {
    const v = localStorage.getItem(PREF + k);
    return v === null ? def : v;
  },
  set: (k, v) => localStorage.setItem(PREF + k, String(v)),
};

const S = {
  config: null,
  messaggi: [],
  sessionId: pref.get('sessione', '') || `s-${Date.now().toString(36)}`,
  operatore: null,
  micAttivo: false,
  inAttesa: false,
  maniLibere: pref.get('maniLibere', '1') === '1',
  leggi: pref.get('leggi', '1') === '1',
  velocita: Number(pref.get('velocita', '1')),
  modoStt: pref.get('modoStt', 'auto'),
  codice: pref.get('codice', ''),
  voceScelta: pref.get('voce', ''),
  vociBrowser: [],
  vociEleven: [],
  vocePredefinitaEleven: '',
  documento: null,
};
pref.set('sessione', S.sessionId);

// ------------------------------------------------------------------ rete

async function api(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (S.codice) headers['x-graziella-code'] = S.codice;
  return fetch(url, { ...opts, headers });
}

async function apiJson(url, opts) {
  const res = await api(url, opts);
  const dato = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dato.error || `errore ${res.status}`);
  return dato;
}

// --------------------------------------------------------------- banner

let bannerTimer = null;
function avvisa(testo, tipo = 'avviso', durata = 0) {
  clearTimeout(bannerTimer);
  if (!testo) {
    el.banner.hidden = true;
    return;
  }
  el.banner.textContent = testo;
  el.banner.className = `banner${tipo === 'errore' ? ' errore' : ''}`;
  el.banner.hidden = false;
  if (durata) bannerTimer = setTimeout(() => (el.banner.hidden = true), durata);
}

// -------------------------------------------------------------- markdown

function renderMarkdown(src) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]*\bda\b[^\]]*)\]/gi, '<mark>[$1]</mark>');

  const out = [];
  let lista = null;
  let tabella = false;
  const chiudi = () => {
    if (lista) {
      out.push(`</${lista}>`);
      lista = null;
    }
    if (tabella) {
      out.push('</tbody></table>');
      tabella = false;
    }
  };

  for (const grezza of src.split('\n')) {
    const riga = grezza.trimEnd();
    if (!riga.trim()) {
      chiudi();
      continue;
    }
    const h = riga.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      chiudi();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(riga)) {
      const celle = riga.trim().slice(1, -1).split('|').map((c) => c.trim());
      if (celle.every((c) => /^:?-{2,}:?$/.test(c))) continue; // riga di separazione
      if (!tabella) {
        chiudi();
        out.push(`<table><thead><tr>${celle.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>`);
        tabella = true;
        continue;
      }
      out.push(`<tr>${celle.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`);
      continue;
    }
    const punto = riga.match(/^\s*[-*]\s+(.*)$/);
    const numero = riga.match(/^\s*\d+[.)]\s+(.*)$/);
    if (punto || numero) {
      const tipo = punto ? 'ul' : 'ol';
      if (lista !== tipo) {
        chiudi();
        out.push(`<${tipo}>`);
        lista = tipo;
      }
      out.push(`<li>${inline((punto || numero)[1])}</li>`);
      continue;
    }
    if (/^-{3,}$/.test(riga)) {
      chiudi();
      out.push('<hr />');
      continue;
    }
    chiudi();
    out.push(`<p>${inline(riga)}</p>`);
  }
  chiudi();
  return out.join('\n');
}

// ------------------------------------------------------------ messaggi

function aggiungiBolla(role, testo, extra = '') {
  const benvenuto = el.trascrizione.querySelector('.benvenuto');
  if (benvenuto) benvenuto.remove();
  const div = document.createElement('div');
  div.className = `msg ${role}${extra ? ` ${extra}` : ''}`;
  const chi = document.createElement('span');
  chi.className = 'msg-chi';
  chi.textContent = role === 'user' ? S.operatore?.nome || 'Tu' : role === 'assistant' ? 'Graziella' : 'Attenzione';
  const corpo = document.createElement('span');
  corpo.className = 'msg-corpo';
  corpo.textContent = testo;
  div.append(chi, corpo);
  el.trascrizione.append(div);
  el.trascrizione.scrollTop = el.trascrizione.scrollHeight;
  return corpo;
}

function scrollaGiu() {
  el.trascrizione.scrollTop = el.trascrizione.scrollHeight;
}

// ------------------------------------------------------------- voce out

const perVoce = (t) =>
  t
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>|]/g, '')
    .replace(/\[(.+?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

class Voce {
  constructor() {
    this.coda = [];
    this.attiva = false;
    this.streamAperto = false;
    this.audio = null;
    this.onFine = null;
  }

  get occupata() {
    return this.attiva || this.coda.length > 0;
  }

  apriStream() {
    this.streamAperto = true;
  }

  chiudiStream() {
    this.streamAperto = false;
    if (!this.occupata) this.onFine?.();
  }

  dici(testo) {
    const pulito = perVoce(testo);
    if (!S.leggi || !pulito) return;
    this.coda.push(pulito);
    this.pompa();
  }

  async pompa() {
    if (this.attiva) return;
    const testo = this.coda.shift();
    if (testo === undefined) {
      if (!this.streamAperto) this.onFine?.();
      return;
    }
    this.attiva = true;
    statoVoce('parla');
    try {
      if (voceEleven()) await this.eleven(testo);
      else await this.browser(testo);
    } catch (err) {
      console.warn('[voce]', err);
      if (voceEleven()) {
        // se ElevenLabs non risponde si continua con la voce del browser
        avvisa(`Voce naturale non disponibile (${err.message}): passo alla voce del browser.`, 'avviso', 6000);
        el.voce.value = vociBrowserPreferita() || '';
        S.voceScelta = el.voce.value;
        pref.set('voce', S.voceScelta);
        try {
          await this.browser(testo);
        } catch {
          /* niente audio: la risposta resta comunque scritta */
        }
      }
    }
    this.attiva = false;
    this.pompa();
  }

  browser(testo) {
    return new Promise((ok) => {
      if (!('speechSynthesis' in window)) return ok();
      const u = new SpeechSynthesisUtterance(testo);
      const nome = S.voceScelta.startsWith('browser:') ? S.voceScelta.slice(8) : '';
      const scelta = S.vociBrowser.find((v) => v.name === nome) || S.vociBrowser[0];
      if (scelta) u.voice = scelta;
      u.lang = scelta?.lang || 'it-IT';
      u.rate = S.velocita;
      u.onend = () => ok();
      u.onerror = () => ok();
      speechSynthesis.speak(u);
    });
  }

  async eleven(testo) {
    const res = await api('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: testo, voiceId: S.voceScelta.slice(7) }),
    });
    if (!res.ok) {
      const dato = await res.json().catch(() => ({}));
      throw new Error(dato.error || `errore ${res.status}`);
    }
    const url = URL.createObjectURL(await res.blob());
    await new Promise((ok) => {
      const audio = new Audio(url);
      audio.playbackRate = S.velocita;
      this.audio = audio;
      audio.onended = ok;
      audio.onerror = ok;
      audio.play().catch(ok);
    });
    URL.revokeObjectURL(url);
    this.audio = null;
  }

  taci() {
    this.coda = [];
    this.streamAperto = false;
    this.onFine = null; // interruzione voluta: non riprendere l'ascolto da qui
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    this.attiva = false;
  }
}

const voce = new Voce();
const voceEleven = () => S.voceScelta.startsWith('eleven:');

// ------------------------------------------------------------- voce in

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const SILENZIO_MS = 1200;

class AscoltoBrowser {
  constructor({ onFrase, onInterim, onStato, onAttivita }) {
    this.onFrase = onFrase;
    this.onInterim = onInterim;
    this.onStato = onStato;
    this.onAttivita = onAttivita;
    this.attivo = false;
    this.pendente = '';
    this.timer = null;
    this.rec = null;
  }

  static supportato() {
    return Boolean(SR);
  }

  avvia() {
    if (this.attivo) return;
    const rec = new SR();
    this.rec = rec;
    rec.lang = 'it-IT';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      let vociva = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const testo = r[0].transcript;
        if (r.isFinal) this.pendente += `${testo.trim()} `;
        else interim += testo;
        if (testo.trim().length >= 2) vociva = true;
      }
      this.onInterim(this.pendente + interim);
      // parla per davvero (non un rumore isolato): se Graziella sta ancora
      // parlando o pensando, questo è il segnale per farla smettere e ascoltare
      if (vociva) this.onAttivita?.();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.chiudiFrase(), SILENZIO_MS);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.attivo = false;
        this.onStato('negato');
        return;
      }
      console.warn('[ascolto]', e.error);
    };
    rec.onend = () => {
      // il riconoscimento del browser si spegne da solo: se serve ancora, riparte
      if (this.attivo) {
        try {
          rec.start();
        } catch {
          /* riavvio troppo rapido: al prossimo giro */
        }
      }
    };
    this.attivo = true;
    try {
      rec.start();
      this.onStato('ascolto');
    } catch (err) {
      this.attivo = false;
      this.onStato('errore');
      console.warn('[ascolto]', err);
    }
  }

  chiudiFrase() {
    const frase = this.pendente.trim();
    this.pendente = '';
    this.onInterim('');
    if (frase) this.onFrase(frase);
  }

  ferma({ scarta = false } = {}) {
    clearTimeout(this.timer);
    this.attivo = false;
    if (scarta) {
      this.pendente = '';
      this.onInterim('');
    }
    try {
      this.rec?.stop();
    } catch {
      /* già ferma */
    }
    this.onStato('spento');
  }
}

class AscoltoRegistrato {
  constructor({ onFrase, onInterim, onStato }) {
    this.onFrase = onFrase;
    this.onInterim = onInterim;
    this.onStato = onStato;
    this.attivo = false;
    this.recorder = null;
    this.pezzi = [];
    this.stream = null;
  }

  static supportato() {
    return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  }

  async avvia() {
    if (this.attivo) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.onStato('negato');
      return;
    }
    this.pezzi = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => e.data.size && this.pezzi.push(e.data);
    this.recorder.onstop = () => this.trascrivi();
    this.recorder.start();
    this.attivo = true;
    this.onStato('registra');
  }

  async trascrivi() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const blob = new Blob(this.pezzi, { type: this.recorder?.mimeType || 'audio/webm' });
    this.pezzi = [];
    if (blob.size < 1200) return; // click involontario
    this.onInterim('Trascrivo…');
    try {
      const dato = await apiJson('/api/stt', {
        method: 'POST',
        headers: { 'content-type': blob.type },
        body: blob,
      });
      this.onInterim('');
      if (dato.testo) this.onFrase(dato.testo);
      else avvisa('Non ho sentito nulla di comprensibile.', 'avviso', 4000);
    } catch (err) {
      this.onInterim('');
      avvisa(`Trascrizione non riuscita: ${err.message}`, 'errore', 8000);
    }
  }

  ferma({ scarta = false } = {}) {
    if (!this.attivo) return;
    this.attivo = false;
    if (scarta) this.pezzi = [];
    try {
      this.recorder?.stop();
    } catch {
      /* già ferma */
    }
    this.onStato('spento');
  }
}

let ascolto = null;
let controllerAttuale = null; // richiesta /api/chat in corso, se Graziella sta rispondendo

// Interrompe Graziella a metà: ferma la voce e annulla la risposta che stava
// arrivando. Sicura da chiamare anche quando non sta succedendo niente.
function interrompiRisposta() {
  voce.taci();
  if (controllerAttuale) controllerAttuale.abort();
}

function creaAscolto() {
  const opzioni = {
    onFrase: (frase) => inviaTurno(frase),
    onInterim: (t) => (el.interim.textContent = t),
    onAttivita: () => {
      // stai parlando davvero: se Graziella sta rispondendo o parlando, si ferma
      if (S.inAttesa || voce.occupata) interrompiRisposta();
    },
    onStato: (s) => {
      if (s === 'negato') {
        S.micAttivo = false;
        statoVoce('spento');
        avvisa(
          'Il browser non mi dà accesso al microfono. Consenti il microfono per questo sito; ' +
            'serve anche una connessione sicura (https) oppure l\'indirizzo localhost.',
          'errore',
        );
      } else if (s === 'errore') {
        S.micAttivo = false;
        statoVoce('spento');
      }
    },
  };
  if (S.modoStt === 'registra') return new AscoltoRegistrato(opzioni);
  return new AscoltoBrowser(opzioni);
}

function statoVoce(stato) {
  const testi = {
    spento: 'Microfono spento',
    ascolto: 'Ti ascolto…',
    registra: 'Sto registrando — premi di nuovo per inviare',
    attesa: 'Sto pensando…',
    parla: 'Graziella sta parlando',
  };
  el.statoVoce.textContent = testi[stato] || testi.spento;
  el.mic.dataset.stato = stato === 'spento' ? '' : stato === 'registra' ? 'ascolto' : stato;
}

function avviaAscolto() {
  if (!ascolto) ascolto = creaAscolto();
  const classe = S.modoStt === 'registra' ? AscoltoRegistrato : AscoltoBrowser;
  if (!classe.supportato()) {
    avvisa(
      S.modoStt === 'registra'
        ? 'Questo browser non sa registrare audio: usa la modalità automatica o scrivi nel campo di testo.'
        : 'Questo browser non ha il riconoscimento vocale (succede su Firefox). Apri l\'app in Chrome, Edge o Safari, ' +
            'oppure passa in Impostazioni a “Registra e trascrivi”, o scrivi nel campo di testo.',
      'avviso',
    );
    return;
  }
  interrompiRisposta();
  S.micAttivo = true;
  ascolto.avvia();
}

function fermaAscolto(opzioni) {
  S.micAttivo = false;
  ascolto?.ferma(opzioni);
}

// --------------------------------------------------------------- turni

let bufferVoce = '';

function svuotaBufferVoce(tutto = false) {
  if (tutto) {
    if (bufferVoce.trim()) voce.dici(bufferVoce);
    bufferVoce = '';
    return;
  }
  // legge man mano che le frasi si completano, così la risposta parte subito
  const match = bufferVoce.match(/^([\s\S]*?[.!?…:])(\s|$)/);
  if (match && match[1].trim().length >= 25) {
    voce.dici(match[1]);
    bufferVoce = bufferVoce.slice(match[0].length);
  }
}

async function inviaTurno(testo) {
  const contenuto = testo.trim();
  if (!contenuto || S.inAttesa) return;

  // in modalità automatica con conversazione continua il microfono resta
  // acceso anche mentre Graziella pensa e parla: è quello che permette di
  // interromperla parlandole sopra, come in una telefonata vera.
  const ascoltoContinuo = S.modoStt === 'auto' && S.maniLibere;
  const eraInAscolto = S.micAttivo;
  if (eraInAscolto && !ascoltoContinuo) fermaAscolto();

  S.inAttesa = true;
  el.interim.textContent = '';
  statoVoce('attesa');
  aggiungiBolla('user', contenuto);
  S.messaggi.push({ role: 'user', content: contenuto });

  const corpo = aggiungiBolla('assistant', '');
  corpo.parentElement.classList.add('scrive');
  let risposta = '';
  let interrotta = false;
  bufferVoce = '';
  voce.apriStream();

  const controller = new AbortController();
  controllerAttuale = controller;

  try {
    const res = await api('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: S.messaggi,
        operatore: S.operatore,
        canale: 'voce',
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const dato = await res.json().catch(() => ({}));
      throw new Error(dato.error || `errore ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let errore = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buffer.indexOf('\n\n')) !== -1) {
        const blocco = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        let evento = 'message';
        let dati = '';
        for (const riga of blocco.split('\n')) {
          if (riga.startsWith('event:')) evento = riga.slice(6).trim();
          else if (riga.startsWith('data:')) dati += riga.slice(5).trim();
        }
        if (!dati) continue;
        const payload = JSON.parse(dati);
        if (evento === 'delta' && payload.text) {
          risposta += payload.text;
          corpo.textContent = risposta;
          bufferVoce += payload.text;
          svuotaBufferVoce();
          scrollaGiu();
        } else if (evento === 'error') {
          errore = payload.error;
        }
      }
    }
    svuotaBufferVoce(true);
    if (errore) throw new Error(errore);
    if (!risposta.trim()) throw new Error('risposta vuota dal modello');
  } catch (err) {
    if (err.name === 'AbortError') {
      interrotta = true; // interruzione voluta: non è un errore da segnalare
    } else if (!risposta.trim()) {
      corpo.parentElement.remove();
      aggiungiBolla('assistant', `Non sono riuscita a rispondere: ${err.message}`, 'errore');
      S.messaggi.pop(); // togli il turno utente rimasto senza risposta
    }
  } finally {
    corpo.parentElement.classList.remove('scrive');
    if (risposta.trim()) {
      S.messaggi.push({ role: 'assistant', content: risposta });
      aggiornaFinalita();
      salvaSessione();
    } else if (interrotta && corpo.parentElement.isConnected) {
      corpo.parentElement.remove(); // interrotta prima che arrivasse una sola parola
    }
    controllerAttuale = null;
    S.inAttesa = false;
    voce.chiudiStream();
    const riprendi = ascoltoContinuo || eraInAscolto;
    if (!voce.occupata) riprendiDopoVoce(riprendi);
    else voce.onFine = () => riprendiDopoVoce(riprendi);
  }
}

function riprendiDopoVoce(eraInAscolto) {
  voce.onFine = null;
  if (S.inAttesa) return;
  if (S.micAttivo) return statoVoce('ascolto'); // il microfono non si è mai fermato
  if (eraInAscolto && S.maniLibere) avviaAscolto();
  else statoVoce('spento');
}

// ------------------------------------------------------------ finalità

function aggiornaFinalita() {
  const pronto = S.messaggi.some((m) => m.role === 'assistant') && !S.inAttesa;
  el.finalita.querySelectorAll('button').forEach((b) => (b.disabled = !pronto));
}

function costruisciFinalita() {
  el.finalita.innerHTML = '';
  for (const f of S.config.finalita) {
    const b = document.createElement('button');
    b.type = 'button';
    b.disabled = true;
    b.innerHTML = `<span class="icona">${f.icona || '·'}</span><span><strong></strong><small></small></span>`;
    b.querySelector('strong').textContent = f.titolo;
    b.querySelector('small').textContent = f.descrizione;
    b.addEventListener('click', () => produciDocumento(f));
    el.finalita.append(b);
  }
  aggiornaFinalita();
}

async function produciDocumento(finalita) {
  interrompiRisposta();
  fermaAscolto();
  statoVoce('spento');
  S.documento = null;
  el.docTitolo.textContent = finalita.titolo;
  el.docCorpo.innerHTML = '<p>Sto scrivendo il documento…</p>';
  el.docStato.textContent = '';
  [el.btnCopia, el.btnScarica, el.btnArchivia].forEach((b) => (b.disabled = true));
  el.dlgDoc.showModal();
  try {
    const dato = await apiJson('/api/documento', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        finalitaId: finalita.id,
        messages: S.messaggi,
        operatore: S.operatore,
      }),
    });
    S.documento = dato;
    el.docTitolo.textContent = dato.titolo;
    el.docCorpo.innerHTML = renderMarkdown(dato.markdown);
    el.docStato.textContent = `${finalita.titolo} · rivedilo prima di usarlo`;
    [el.btnCopia, el.btnScarica, el.btnArchivia].forEach((b) => (b.disabled = false));
  } catch (err) {
    el.docCorpo.innerHTML = '';
    el.docCorpo.append(Object.assign(document.createElement('p'), { textContent: `Non è andata: ${err.message}` }));
  }
}

// ------------------------------------------------------------- archivio

async function caricaArchivio() {
  try {
    const { files } = await apiJson('/api/archivio');
    el.archivio.innerHTML = '';
    if (!files.length) {
      el.archivio.innerHTML = '<li class="vuota">Ancora nessun documento salvato.</li>';
      return;
    }
    for (const f of files) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = f.replace(/\.md$/, '').replace(/^(\d{4}-\d{2}-\d{2})-/, '$1 · ');
      b.addEventListener('click', () => apriArchiviato(f));
      li.append(b);
      el.archivio.append(li);
    }
  } catch (err) {
    el.archivio.innerHTML = `<li class="vuota">Archivio non leggibile: ${err.message}</li>`;
  }
}

async function apriArchiviato(file) {
  try {
    const dato = await apiJson(`/api/archivio/${encodeURIComponent(file)}`);
    const senzaFront = dato.markdown.replace(/^---\n[\s\S]*?\n---\n/, '');
    S.documento = { titolo: file, markdown: senzaFront, finalitaId: 'archivio' };
    el.docTitolo.textContent = senzaFront.match(/^#\s+(.+)$/m)?.[1] || file;
    el.docCorpo.innerHTML = renderMarkdown(senzaFront);
    el.docStato.textContent = `dall'archivio · ${file}`;
    el.btnCopia.disabled = false;
    el.btnScarica.disabled = false;
    el.btnArchivia.disabled = true;
    el.dlgDoc.showModal();
  } catch (err) {
    avvisa(`Documento non apribile: ${err.message}`, 'errore', 6000);
  }
}

// ------------------------------------------------------------ sessioni

let timerSalva = null;
function salvaSessione() {
  clearTimeout(timerSalva);
  timerSalva = setTimeout(async () => {
    try {
      await apiJson('/api/sessione', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: S.sessionId, operatore: S.operatore, messages: S.messaggi }),
      });
    } catch (err) {
      console.warn('[sessione]', err.message);
    }
  }, 1200);
}

async function caricaSessioni() {
  try {
    const { sessioni } = await apiJson('/api/sessioni');
    el.sessioni.innerHTML = '';
    if (!sessioni.length) {
      el.sessioni.innerHTML = '<li class="vuota">Nessuna conversazione archiviata.</li>';
      return;
    }
    for (const s of sessioni) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const quando = new Date(s.aggiornata).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      b.textContent = `${quando} · ${s.titolo}`;
      b.title = `${s.turni} turni${s.operatore?.nome ? ` · ${s.operatore.nome}` : ''}`;
      b.addEventListener('click', () => riprendiSessione(s.id));
      li.append(b);
      el.sessioni.append(li);
    }
  } catch (err) {
    el.sessioni.innerHTML = `<li class="vuota">Non leggibili: ${err.message}</li>`;
  }
}

async function riprendiSessione(id) {
  try {
    const dato = await apiJson(`/api/sessione/${encodeURIComponent(id)}`);
    interrompiRisposta();
    fermaAscolto({ scarta: true });
    S.sessionId = dato.id;
    pref.set('sessione', S.sessionId);
    S.messaggi = (dato.messages || []).filter((m) => m.content);
    el.trascrizione.innerHTML = '';
    for (const m of S.messaggi) aggiungiBolla(m.role, m.content);
    aggiornaFinalita();
    avvisa('Conversazione ripresa: puoi continuare a voce da dove eravate.', 'avviso', 5000);
  } catch (err) {
    avvisa(`Non riesco a riprenderla: ${err.message}`, 'errore', 6000);
  }
}

function nuovaConversazione() {
  interrompiRisposta();
  fermaAscolto({ scarta: true });
  S.messaggi = [];
  S.sessionId = `s-${Date.now().toString(36)}`;
  pref.set('sessione', S.sessionId);
  el.trascrizione.innerHTML = '<div class="benvenuto"><h1>Ti ascolto.</h1><p>Premi il microfono e comincia.</p></div>';
  aggiornaFinalita();
  caricaSessioni();
  statoVoce('spento');
}

// ------------------------------------------------------------- voci out

function vociBrowserPreferita() {
  const it = S.vociBrowser.filter((v) => v.lang?.toLowerCase().startsWith('it'));
  const scelta = it.find((v) => /Alice|Federica|Elsa|Google italiano|Paola/i.test(v.name)) || it[0] || S.vociBrowser[0];
  return scelta ? `browser:${scelta.name}` : '';
}

function costruisciVoci() {
  el.voce.innerHTML = '';
  const gruppoEleven = document.createElement('optgroup');
  gruppoEleven.label = 'Voce di Graziella (fissa)';
  for (const v of S.vociEleven) {
    const o = document.createElement('option');
    o.value = `eleven:${v.id}`;
    o.textContent = `${v.nome}${v.genere ? ` · ${v.genere}` : ''}`;
    gruppoEleven.append(o);
  }
  if (S.vociEleven.length) el.voce.append(gruppoEleven);

  const gruppoBrowser = document.createElement('optgroup');
  gruppoBrowser.label = 'Voce del browser (di riserva)';
  const italiane = S.vociBrowser.filter((v) => v.lang?.toLowerCase().startsWith('it'));
  for (const v of italiane.length ? italiane : S.vociBrowser) {
    const o = document.createElement('option');
    o.value = `browser:${v.name}`;
    o.textContent = `${v.name} (${v.lang})`;
    gruppoBrowser.append(o);
  }
  el.voce.append(gruppoBrowser);

  const disponibili = [...el.voce.options].map((o) => o.value);
  if (!disponibili.includes(S.voceScelta)) {
    const preferitaDisponibile =
      S.vocePredefinitaEleven && S.vociEleven.some((v) => v.id === S.vocePredefinitaEleven);
    S.voceScelta = preferitaDisponibile
      ? `eleven:${S.vocePredefinitaEleven}`
      : S.vociEleven.length
        ? `eleven:${S.vociEleven[0].id}`
        : vociBrowserPreferita();
    pref.set('voce', S.voceScelta);
  }
  el.voce.value = S.voceScelta;
}

function caricaVociBrowser() {
  if (!('speechSynthesis' in window)) return;
  S.vociBrowser = speechSynthesis.getVoices();
  if (S.vociBrowser.length) costruisciVoci();
}

// -------------------------------------------------------------- avvio

async function avvio() {
  // il codice serve prima di ogni altra chiamata: /api/config è l'unica libera
  try {
    S.config = await apiJson('/api/config');
  } catch (err) {
    avvisa(`Il server non risponde: ${err.message}`, 'errore');
    return;
  }

  for (const o of S.config.operatori) {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = o.nome;
    el.operatore.append(opt);
  }
  const salvato = pref.get('operatore', S.config.operatori[0]?.id || '');
  el.operatore.value = [...el.operatore.options].some((o) => o.value === salvato) ? salvato : el.operatore.value;
  S.operatore = S.config.operatori.find((o) => o.id === el.operatore.value) || null;

  costruisciFinalita();
  caricaVociBrowser();
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = caricaVociBrowser;

  if (S.config.elevenlabs) {
    try {
      const { voci, predefinita } = await apiJson('/api/tts/voci');
      S.vociEleven = voci || [];
      S.vocePredefinitaEleven = predefinita || '';
    } catch (err) {
      console.warn('[voci]', err.message);
    }
  }
  costruisciVoci();

  if (!S.config.chiavePresente) {
    avvisa(
      'Sul server manca ANTHROPIC_API_KEY: Graziella non può rispondere. Esporta la chiave e riavvia il server.',
      'errore',
    );
  } else if (S.config.codiceRichiesto && !S.codice) {
    avvisa('Questo server chiede un codice di accesso: inseriscilo in Impostazioni.', 'avviso');
  } else if (!AscoltoBrowser.supportato() && S.modoStt === 'auto') {
    avvisa(
      S.config.elevenlabs
        ? 'Questo browser non ha il riconoscimento vocale: in Impostazioni passa a “Registra e trascrivi”.'
        : 'Questo browser non ha il riconoscimento vocale: usa Chrome, Edge o Safari, oppure scrivi nel campo di testo.',
      'avviso',
    );
  }

  el.impDiag.textContent = [
    `Modello: ${S.config.modello}`,
    `Chiave Claude sul server: ${S.config.chiavePresente ? 'sì' : 'no'}`,
    `ElevenLabs (voce naturale e dettatura): ${S.config.elevenlabs ? 'attivo' : 'non configurato'}`,
    `Riconoscimento vocale del browser: ${AscoltoBrowser.supportato() ? 'disponibile' : 'assente'}`,
    `Contesto sicuro (https o localhost): ${window.isSecureContext ? 'sì' : 'no — il microfono resterà bloccato'}`,
  ].join('\n');

  caricaArchivio();
  caricaSessioni();
  statoVoce('spento');
}

// ------------------------------------------------------------- eventi

el.mic.addEventListener('click', () => {
  if (S.modoStt === 'registra' && ascolto?.attivo) {
    fermaAscolto(); // secondo click: chiude la registrazione e la manda a trascrivere
    return;
  }
  if (S.micAttivo) {
    if (ascolto instanceof AscoltoBrowser) ascolto.chiudiFrase();
    fermaAscolto();
    return;
  }
  avviaAscolto(); // interrompe da sola una risposta in corso, se c'è
});

el.stopVoce.addEventListener('click', () => {
  interrompiRisposta();
  if (!S.micAttivo) statoVoce('spento');
});

el.nuova.addEventListener('click', nuovaConversazione);

el.formTesto.addEventListener('submit', (e) => {
  e.preventDefault();
  const testo = el.inputTesto.value;
  el.inputTesto.value = '';
  inviaTurno(testo);
});

el.operatore.addEventListener('change', () => {
  S.operatore = S.config.operatori.find((o) => o.id === el.operatore.value) || null;
  pref.set('operatore', el.operatore.value);
});

el.voce.addEventListener('change', () => {
  S.voceScelta = el.voce.value;
  pref.set('voce', S.voceScelta);
  voce.taci();
});

el.maniLibere.checked = S.maniLibere;
el.maniLibere.addEventListener('change', () => {
  S.maniLibere = el.maniLibere.checked;
  pref.set('maniLibere', S.maniLibere ? '1' : '0');
});

el.btnImp.addEventListener('click', () => {
  el.impCodice.value = S.codice;
  el.impModoStt.value = S.modoStt;
  el.impVelocita.value = String(S.velocita);
  el.impLeggi.checked = S.leggi;
  el.dlgImp.showModal();
});

el.impCodice.addEventListener('change', () => {
  S.codice = el.impCodice.value.trim();
  pref.set('codice', S.codice);
  avvisa('Codice salvato in questo browser.', 'avviso', 3000);
  caricaArchivio();
  caricaSessioni();
});

el.impModoStt.addEventListener('change', () => {
  S.modoStt = el.impModoStt.value;
  pref.set('modoStt', S.modoStt);
  fermaAscolto({ scarta: true });
  ascolto = creaAscolto();
  if (S.modoStt === 'registra' && !S.config?.elevenlabs) {
    avvisa('La dettatura registrata richiede ELEVENLABS_API_KEY sul server.', 'errore', 7000);
  }
});

el.impVelocita.addEventListener('input', () => {
  S.velocita = Number(el.impVelocita.value);
  pref.set('velocita', S.velocita);
});

el.impLeggi.addEventListener('change', () => {
  S.leggi = el.impLeggi.checked;
  pref.set('leggi', S.leggi ? '1' : '0');
  if (!S.leggi) voce.taci();
});

el.btnCopia.addEventListener('click', async () => {
  if (!S.documento) return;
  try {
    await navigator.clipboard.writeText(S.documento.markdown);
    el.docStato.textContent = 'Copiato negli appunti.';
  } catch {
    el.docStato.textContent = 'Il browser ha bloccato la copia: seleziona il testo a mano.';
  }
});

el.btnScarica.addEventListener('click', () => {
  if (!S.documento) return;
  const nome = `${new Date().toISOString().slice(0, 10)}-${S.documento.titolo}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([S.documento.markdown], { type: 'text/markdown;charset=utf-8' }));
  a.download = `${nome}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
});

el.btnArchivia.addEventListener('click', async () => {
  if (!S.documento) return;
  el.btnArchivia.disabled = true;
  try {
    const dato = await apiJson('/api/salva', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...S.documento, operatore: S.operatore }),
    });
    el.docStato.textContent = `Salvato in archivio: ${dato.file}`;
    caricaArchivio();
  } catch (err) {
    el.docStato.textContent = `Non salvato: ${err.message}`;
    el.btnArchivia.disabled = false;
  }
});

el.btnArchivioAgg.addEventListener('click', caricaArchivio);
el.btnSessioniAgg.addEventListener('click', caricaSessioni);

document.querySelectorAll('[data-chiudi]').forEach((b) =>
  b.addEventListener('click', () => b.closest('dialog').close()),
);

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    el.mic.click();
  }
  if (e.key === 'Escape' && (voce.occupata || S.inAttesa)) interrompiRisposta();
});

window.addEventListener('beforeunload', () => voce.taci());

avvio();
