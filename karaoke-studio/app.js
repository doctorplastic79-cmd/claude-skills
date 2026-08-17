/* Karaoke Studio Mobile - tutta l'elaborazione avviene qui, sul dispositivo. */
"use strict";

const $ = (id) => document.getElementById(id);

/* Stato della sessione (tutto in memoria) */
const S = {
  sr: 44100,
  song: null,          // { L, R } originale
  base: null,          // { L, R } base corrente (eventualmente trasportata)
  base0: null,         // base nella tonalità originale
  vocals: null,        // stima della voce originale (per analisi/allineamento)
  profile: null,
  semitones: 0,
  shiftedCache: {},    // semitoni -> {L,R}
  userRange: null,
  processedVocal: null,
  isMono: false,
};

let audioCtx = null;
let mediaRecorder = null;
let recChunks = [];
let timerHandle = null;
let recStartedAt = 0;
let wakeLock = null;
let meterRAF = null;
let mixBlob = null;

function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function pickMime() {
  if (window.MediaRecorder) {
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
    if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  }
  return "";
}

async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* facoltativo */ }
}

function primeAudio(el) {
  el.muted = true;
  const p = el.play();
  if (p && p.catch) p.catch(() => {});
  el.pause();
  el.currentTime = 0;
  el.muted = false;
}

function wavUrl(L, R) {
  const buf = DSP.encodeWav(L, R, S.sr);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

function showStatus(id, text, isError = false) {
  const el = $(id);
  el.textContent = text;
  el.classList.remove("hidden");
  el.classList.toggle("error", isError);
}

const pause = () => new Promise((r) => setTimeout(r, 30)); // fa respirare la UI

/* ---------- Passo 1: apertura e preparazione del brano ---------- */

$("file-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("file-name").textContent = file.name;
  try {
    showStatus("prepare-status", "Leggo il file…");
    const arr = await file.arrayBuffer();
    const decoded = await ctx().decodeAudioData(arr);
    S.sr = decoded.sampleRate;
    const L = decoded.getChannelData(0);
    const R = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : L;
    S.song = { L: new Float32Array(L), R: new Float32Array(R) };

    showStatus("prepare-status", "Separo voce e musica…");
    await pause();
    const sep = DSP.separate(S.song.L, S.song.R, S.sr);
    S.base0 = { L: sep.baseL, R: sep.baseR };
    S.base = S.base0;
    S.vocals = sep.vocals;
    S.isMono = sep.isMono;
    S.semitones = 0;
    S.shiftedCache = {};

    showStatus("prepare-status", "Analizzo effetti e tonalità della voce…");
    await pause();
    S.profile = DSP.analyzeVocal(S.vocals, S.sr);
    S.profile.song_range = DSP.pitchStats(S.vocals, S.sr, false);

    $("song-title").textContent = "— " + file.name.replace(/\.[^.]+$/, "");
    $("audio-original").src = URL.createObjectURL(file);
    $("audio-base").src = wavUrl(S.base.L, S.base.R);
    let info = `Effetti rilevati: riverbero ≈ ${S.profile.rt60.toFixed(2)}s, ` +
      `dinamica ${S.profile.crest_db.toFixed(1)} dB. Verranno applicati alla tua voce.`;
    const r = S.profile.song_range;
    if (r) info += ` Estensione della voce originale (stimata): ` +
      `${DSP.midiToNote(r.lo)} – ${DSP.midiToNote(r.hi)}.`;
    if (S.isMono) info += " ⚠️ Il file è mono: non posso attenuare la voce, canterai sopra il brano intero.";
    $("profile-info").textContent = info;

    $("step-listen").classList.remove("hidden");
    $("step-key").classList.remove("hidden");
    $("step-record").classList.remove("hidden");
    showStatus("prepare-status", "Pronto! Passa al punto 2.");
    refreshMicList();
  } catch (err) {
    showStatus("prepare-status", "Errore nella lettura del file: " + err.message, true);
  }
});

/* ---------- Microfono ---------- */

function micConstraints() {
  const c = {
    echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    channelCount: 1, sampleRate: 48000,
  };
  const dev = $("mic-select").value;
  if (dev) c.deviceId = { exact: dev };
  return { audio: c };
}

async function openMic() {
  try {
    return await navigator.mediaDevices.getUserMedia(micConstraints());
  } catch {
    alert("Non riesco ad accedere al microfono: controlla i permessi.");
    return null;
  }
}

async function refreshMicList() {
  const probe = await openMic();
  if (!probe) return;
  probe.getTracks().forEach((t) => t.stop());
  const devices = (await navigator.mediaDevices.enumerateDevices())
    .filter((d) => d.kind === "audioinput");
  const sel = $("mic-select");
  const saved = localStorage.getItem("karaoke-mic") || "";
  sel.innerHTML = '<option value="">predefinito</option>';
  let zoomId = null;
  for (const d of devices) {
    const opt = document.createElement("option");
    opt.value = d.deviceId;
    opt.textContent = d.label || "Microfono";
    if (/zoom/i.test(d.label)) { opt.textContent += " ⭐"; zoomId = d.deviceId; }
    sel.appendChild(opt);
  }
  if (saved && [...sel.options].some((o) => o.value === saved)) sel.value = saved;
  else if (zoomId) sel.value = zoomId;
  if (zoomId) $("mic-verdict").textContent = "Ho trovato uno Zoom: selezionato automaticamente. ⭐";
}

$("btn-mic-refresh").addEventListener("click", refreshMicList);
$("mic-select").addEventListener("change", () =>
  localStorage.setItem("karaoke-mic", $("mic-select").value));

function startMeter(stream) {
  const src = ctx().createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let peak = 0;
  const bar = $("level-bar");
  (function tick() {
    analyser.getFloatTimeDomainData(buf);
    let p = 0;
    for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
    peak = Math.max(peak, p);
    bar.style.width = Math.min(100, p * 130) + "%";
    bar.className = p > 0.95 ? "clip" : p > 0.6 ? "hot" : "";
    meterRAF = requestAnimationFrame(tick);
  })();
  return {
    stop() { cancelAnimationFrame(meterRAF); src.disconnect(); bar.style.width = "0"; },
    get peak() { return peak; },
  };
}

$("btn-mic-test").addEventListener("click", async () => {
  const stream = await openMic();
  if (!stream) return;
  $("btn-mic-test").disabled = true;
  $("mic-verdict").textContent = "Canta forte per 5 secondi, come nella canzone…";
  const meter = startMeter(stream);
  await new Promise((r) => setTimeout(r, 5000));
  meter.stop();
  stream.getTracks().forEach((t) => t.stop());
  const peak = meter.peak;
  let verdict;
  if (peak > 0.95) verdict = "⚠️ Il segnale satura: abbassa il gain sul microfono.";
  else if (peak < 0.1) verdict = "⚠️ Segnale troppo debole: alza il gain o avvicinati.";
  else if (peak < 0.3) verdict = "Livello un po' basso ma utilizzabile.";
  else verdict = "✅ Livello perfetto: sei pronto per registrare.";
  $("mic-verdict").textContent = verdict;
  $("btn-mic-test").disabled = false;
});

async function recordClip(seconds, phaseLabel) {
  const stream = await openMic();
  if (!stream) return null;
  const cd = $("countdown");
  cd.classList.remove("hidden");
  for (let i = 3; i > 0; i--) { cd.textContent = i; await new Promise((r) => setTimeout(r, 1000)); }
  cd.classList.add("hidden");
  if (phaseLabel) $("range-phase").textContent = phaseLabel;
  const meter = startMeter(stream);
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((resolve) => { rec.onstop = () => resolve(); });
  rec.start();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  rec.stop();
  await done;
  meter.stop();
  stream.getTracks().forEach((t) => t.stop());
  return new Blob(chunks, { type: mime || "audio/webm" });
}

/* Decodifica una registrazione in mono alla frequenza della sessione */
async function decodeBlobMono(blob) {
  const arr = await blob.arrayBuffer();
  const buf = await ctx().decodeAudioData(arr);
  let mono = buf.getChannelData(0);
  if (buf.sampleRate !== S.sr) {
    // riallinea alla frequenza del brano con interpolazione lineare
    const step = buf.sampleRate / S.sr;
    const out = new Float32Array(Math.floor(mono.length / step));
    for (let i = 0; i < out.length; i++) {
      const p = i * step, j = Math.floor(p), f = p - j;
      out[i] = mono[j] * (1 - f) + (mono[j + 1] || 0) * f;
    }
    mono = out;
  }
  return new Float32Array(mono);
}

/* ---------- Passo 3: estensione vocale e tonalità ---------- */

$("btn-range-test").addEventListener("click", async () => {
  $("btn-range-test").disabled = true;
  try {
    $("range-phase").textContent = "Preparati: nota BASSA…";
    const low = await recordClip(4, "Canta la tua nota più BASSA comoda: aaah…");
    if (!low) return;
    $("range-phase").textContent = "Ora la nota ALTA…";
    await new Promise((r) => setTimeout(r, 800));
    const high = await recordClip(4, "Canta la tua nota più ALTA comoda: aaah…");
    if (!high) return;
    $("range-phase").textContent = "Analizzo…";
    await pause();
    const pLow = DSP.pitchStats(await decodeBlobMono(low), S.sr, true);
    const pHigh = DSP.pitchStats(await decodeBlobMono(high), S.sr, true);
    if (!pLow || !pHigh)
      throw new Error("non ho sentito una nota chiara: canta 'aaah' per 4 secondi vicino al microfono.");
    S.userRange = {
      lo: Math.min(pLow.med, pHigh.med),
      hi: Math.max(pLow.med, pHigh.med),
    };
    $("range-phase").textContent = "";
    let txt = `La tua estensione: ${DSP.midiToNote(S.userRange.lo)} – ${DSP.midiToNote(S.userRange.hi)}.`;
    const song = S.profile.song_range;
    if (song) {
      const rec = DSP.recommendShift(song, S.userRange);
      txt += ` Il brano: ${DSP.midiToNote(song.lo)} – ${DSP.midiToNote(song.hi)}.`;
      txt += rec === 0
        ? " 🎯 La tonalità originale va già bene per te!"
        : ` 🎯 Tonalità consigliata: ${rec > 0 ? "+" : ""}${rec} semitoni.`;
      $("key-value").textContent = rec;
    }
    const el = $("range-result");
    el.textContent = txt;
    el.classList.remove("hidden");
  } catch (err) {
    $("range-phase").textContent = "";
    showStatus("range-result", "Errore: " + err.message, true);
  } finally {
    $("btn-range-test").disabled = false;
  }
});

$("key-minus").addEventListener("click", () => bumpKey(-1));
$("key-plus").addEventListener("click", () => bumpKey(1));
function bumpKey(d) {
  const v = Math.max(-6, Math.min(6, parseInt($("key-value").textContent, 10) + d));
  $("key-value").textContent = v;
}

$("btn-apply-key").addEventListener("click", async () => {
  const semitones = parseInt($("key-value").textContent, 10);
  if (semitones === S.semitones) {
    showStatus("key-status", "La base è già in questa tonalità.");
    return;
  }
  $("btn-apply-key").disabled = true;
  keepAwake(true);
  try {
    if (semitones === 0) {
      S.base = S.base0;
    } else if (S.shiftedCache[semitones]) {
      S.base = S.shiftedCache[semitones];
    } else {
      const wrap = $("key-progress-wrap"), bar = $("key-progress");
      wrap.classList.remove("hidden");
      showStatus("key-status", "Cambio tonalità sul telefono… tieni l'app aperta.");
      const prog = (ch) => (p) => { bar.style.width = ((ch + p) / 2 * 100).toFixed(0) + "%"; };
      const L = await DSP.pitchShift(S.base0.L, semitones, prog(0));
      const R = await DSP.pitchShift(S.base0.R, semitones, prog(1));
      S.shiftedCache[semitones] = { L, R };
      S.base = S.shiftedCache[semitones];
      wrap.classList.add("hidden");
    }
    S.semitones = semitones;
    $("audio-base").src = wavUrl(S.base.L, S.base.R);
    showStatus("key-status",
      semitones === 0 ? "Tonalità originale ripristinata."
        : `Base ora a ${semitones > 0 ? "+" : ""}${semitones} semitoni. Riascoltala al punto 2!`);
  } catch (err) {
    showStatus("key-status", "Errore: " + err.message, true);
  } finally {
    $("btn-apply-key").disabled = false;
    keepAwake(false);
  }
});

/* ---------- Passo 4: registrazione ---------- */

$("btn-record").addEventListener("click", async () => {
  primeAudio($("audio-base"));   // sblocca l'autoplay su Safari, va fatto nel tocco
  const stream = await openMic();
  if (!stream) return;
  $("btn-record").classList.add("hidden");
  keepAwake(true);

  const cd = $("countdown");
  cd.classList.remove("hidden");
  for (let i = 3; i > 0; i--) {
    cd.textContent = i;
    await new Promise((r) => setTimeout(r, 1000));
  }
  cd.classList.add("hidden");

  recChunks = [];
  const mime = pickMime();
  mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
  const meter = startMeter(stream);
  mediaRecorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    meter.stop();
    stream.getTracks().forEach((t) => t.stop());
    keepAwake(false);
    processRecording(new Blob(recChunks, { type: mime || "audio/webm" }));
  };

  const base = $("audio-base");
  base.currentTime = 0;
  mediaRecorder.start();
  await base.play();

  recStartedAt = Date.now();
  $("btn-stop").classList.remove("hidden");
  $("rec-timer").classList.remove("hidden");
  timerHandle = setInterval(() => {
    const s = Math.floor((Date.now() - recStartedAt) / 1000);
    $("rec-timer").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 500);
  base.onended = () => stopRecording();
});

$("btn-stop").addEventListener("click", stopRecording);

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  clearInterval(timerHandle);
  $("audio-base").pause();
  $("audio-base").onended = null;
  mediaRecorder.stop();
  $("btn-stop").classList.add("hidden");
  $("rec-timer").classList.add("hidden");
  $("btn-record").classList.remove("hidden");
}

/* Elaborazione locale: decodifica -> allineamento -> effetti -> mix */
async function processRecording(blob) {
  try {
    keepAwake(true);
    showStatus("record-status", "Converto la tua registrazione…");
    await pause();
    let user = await decodeBlobMono(blob);

    showStatus("record-status", "Allineo il tuo canto alla base…");
    await pause();
    let offset = ($("manual-offset").valueAsNumber || 0) / 1000;
    if ($("auto-align").checked)
      offset += DSP.bestOffsetSeconds(user, S.vocals, S.sr);
    user = DSP.shiftSamples(user, offset, S.sr);

    showStatus("record-status", "Applico gli effetti dell'originale alla tua voce…");
    await pause();
    S.processedVocal = DSP.processVocal(user, S.profile, S.sr);

    showStatus("record-status", "Mixo voce e base…");
    await pause();
    remixLocal();

    showStatus("record-status", "Fatto! Ascolta il risultato al punto 5.");
    $("offset-info").textContent =
      `Allineamento applicato: ${(offset * 1000).toFixed(0)} ms.`;
    $("step-result").classList.remove("hidden");
    $("step-result").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    showStatus("record-status", "Errore: " + err.message, true);
  } finally {
    keepAwake(false);
  }
}

function remixLocal() {
  const gain = $("vocal-gain").valueAsNumber || 0;
  const m = DSP.mix(S.base.L, S.base.R, S.processedVocal, S.profile, gain);
  const buf = DSP.encodeWav(m.L, m.R, S.sr);
  mixBlob = new Blob([buf], { type: "audio/wav" });
  const url = URL.createObjectURL(mixBlob);
  $("audio-mix").src = url;
  $("dl-mix").href = url;
  $("audio-myvoice").src = wavUrl(S.processedVocal, S.processedVocal);
}

/* ---------- Passo 5: remix e condivisione ---------- */

$("vocal-gain").addEventListener("input", () => {
  $("vocal-gain-val").textContent = `${$("vocal-gain").value} dB`;
});

$("btn-remix").addEventListener("click", async () => {
  if (!S.processedVocal) return;
  $("btn-remix").disabled = true;
  await pause();
  remixLocal();
  $("btn-remix").disabled = false;
});

$("btn-share").addEventListener("click", async () => {
  if (!mixBlob) return;
  const file = new File([mixBlob], "karaoke-mix.wav", { type: "audio/wav" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Il mio karaoke" }); } catch { /* annullato */ }
  } else {
    $("dl-mix").click();
  }
});

/* ---------- app offline ---------- */

if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("sw.js").catch(() => {});
