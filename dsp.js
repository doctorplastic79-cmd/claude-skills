/* Karaoke Studio Mobile — motore audio interamente in JavaScript.
   Gira sul telefono: niente server. Stesse idee della versione Python:
   separazione mid/side, analisi effetti (RT60, EQ, dinamica), pitch shift
   con phase vocoder, allineamento per correlazione, riverbero Freeverb. */
"use strict";

const DSP = (() => {

  const HOP = 512;

  /* ---------------- FFT radix-2 (in place) ---------------- */

  function fft(re, im, inverse) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j |= bit;
      if (i < j) {
        const tr = re[i]; re[i] = re[j]; re[j] = tr;
        const ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (inverse ? 2 : -2) * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      const half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const ar = re[i + k], ai = im[i + k];
          const br = re[i + k + half] * cr - im[i + k + half] * ci;
          const bi = re[i + k + half] * ci + im[i + k + half] * cr;
          re[i + k] = ar + br; im[i + k] = ai + bi;
          re[i + k + half] = ar - br; im[i + k + half] = ai - bi;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }

  /* ---------------- filtri biquad (formule RBJ) ---------------- */

  function biquadCoef(type, f0, sr, Q, gainDb = 0) {
    const A = Math.pow(10, gainDb / 40);
    const w = 2 * Math.PI * f0 / sr;
    const cw = Math.cos(w), sw = Math.sin(w);
    const alpha = sw / (2 * Q);
    let b0, b1, b2, a0, a1, a2;
    if (type === "lowpass") {
      b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0;
      a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
    } else if (type === "highpass") {
      b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0;
      a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
    } else if (type === "bandpass") {
      b0 = alpha; b1 = 0; b2 = -alpha;
      a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
    } else { // peaking
      b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
    }
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  }

  function biquadApply(x, c) {
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }

  /* ---------------- inviluppo RMS e utilità ---------------- */

  function rmsEnvelope(x) {
    const n = Math.floor(x.length / HOP);
    const env = new Float32Array(n);
    for (let b = 0; b < n; b++) {
      let s = 0;
      for (let i = b * HOP; i < (b + 1) * HOP; i++) s += x[i] * x[i];
      env[b] = Math.sqrt(s / HOP);
    }
    return env;
  }

  const toDb = (a) => 20 * Math.log10(Math.max(a, 1e-9));

  function activeBlocks(env) {
    let max = 0;
    for (const v of env) max = Math.max(max, v);
    const idx = [];
    for (let i = 0; i < env.length; i++)
      if (toDb(env[i]) - toDb(max) > -35) idx.push(i);
    return idx;
  }

  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    const i = (sorted.length - 1) * p / 100;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  /* ---------------- separazione mid/side ----------------
     La voce di solito sta al centro dello stereo: base = lati + bassi
     centrali (cassa e basso stanno anch'essi al centro, vanno tenuti),
     voce stimata = centro senza i bassi. */

  function separate(L, R, sr) {
    const n = L.length;
    const mid = new Float32Array(n), side = new Float32Array(n);
    let sideEnergy = 0, midEnergy = 0;
    for (let i = 0; i < n; i++) {
      mid[i] = (L[i] + R[i]) / 2;
      side[i] = (L[i] - R[i]) / 2;
      sideEnergy += side[i] * side[i];
      midEnergy += mid[i] * mid[i];
    }
    const isMono = sideEnergy < midEnergy * 1e-4;
    const lowMid = biquadApply(mid, biquadCoef("lowpass", 160, sr, 0.707));
    const vocals = new Float32Array(n);
    for (let i = 0; i < n; i++) vocals[i] = mid[i] - lowMid[i];
    let baseL, baseR;
    if (isMono) {
      baseL = L; baseR = R;   // niente stereo: si canta sopra il brano intero
    } else {
      baseL = new Float32Array(n); baseR = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        baseL[i] = side[i] + lowMid[i];
        baseR[i] = -side[i] + lowMid[i];
      }
    }
    return { baseL, baseR, vocals, isMono };
  }

  /* ---------------- profilo effetti della voce originale ---------------- */

  const EQ_BANDS = [120, 250, 500, 1000, 2000, 4000, 8000, 12000];

  function bandLevelsDb(x, sr) {
    const env = rmsEnvelope(x);
    const act = activeBlocks(env);
    const levels = [];
    for (const f of EQ_BANDS) {
      const y = biquadApply(x, biquadCoef("bandpass", Math.min(f, sr * 0.45), sr, 1.0));
      const e = rmsEnvelope(y);
      let s = 0;
      for (const i of act) s += e[i];
      levels.push(toDb(act.length ? s / act.length : 1e-9));
    }
    const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
    return levels.map((v) => Math.round((v - mean) * 100) / 100);
  }

  function crestDb(x) {
    const env = rmsEnvelope(x);
    const act = activeBlocks(env);
    if (!act.length) return 12;
    let rms = 0, peak = 0;
    for (const b of act) {
      rms += env[b];
      for (let i = b * HOP; i < (b + 1) * HOP && i < x.length; i++)
        peak = Math.max(peak, Math.abs(x[i]));
    }
    rms /= act.length;
    return Math.min(25, Math.max(3, toDb(peak) - toDb(rms)));
  }

  function estimateRT60(x, sr) {
    const env = rmsEnvelope(x);
    if (env.length < 20) return 0.3;
    let max = 0;
    for (const v of env) max = Math.max(max, v);
    const db = Array.from(env, (v) => toDb(v) - toDb(max));
    const dt = HOP / sr;
    const horizon = Math.floor(3.0 / dt);
    const durations = [];
    for (let i = 0; i < db.length - 2; i++) {
      if (db[i] <= -25) continue;
      const target = db[i] - 20;
      const end = Math.min(i + horizon, db.length);
      for (let j = i + 1; j < end; j++) {
        if (db[j] > db[i]) break;
        if (db[j] <= target) { durations.push((j - i) * dt); break; }
      }
    }
    if (durations.length < 3) return 0.3;
    durations.sort((a, b) => a - b);
    const t20 = percentile(durations, 10);
    return Math.min(3, Math.max(0.1, t20 * 3));
  }

  function noiseFloorDb(x) {
    const env = rmsEnvelope(x);
    const db = Array.from(env, toDb).sort((a, b) => a - b);
    return percentile(db, 10);
  }

  function analyzeVocal(x, sr) {
    const env = rmsEnvelope(x);
    const act = activeBlocks(env);
    let vr = 0;
    for (const b of act) vr += env[b];
    vr = act.length ? vr / act.length : 1e-6;
    const rt60 = estimateRT60(x, sr);
    return {
      bands_db: bandLevelsDb(x, sr),
      crest_db: Math.round(crestDb(x) * 100) / 100,
      rt60: Math.round(rt60 * 1000) / 1000,
      reverb_room: Math.min(0.9, Math.max(0.15, rt60 / 2)),
      reverb_wet: Math.min(0.45, Math.max(0.04, (rt60 - 0.15) / 2.5)),
      vocal_rms: vr,
    };
  }

  /* ---------------- intonazione (autocorrelazione) ---------------- */

  const NOTE_IT = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
  const hzToMidi = (f) => 69 + 12 * Math.log2(f / 440);
  const midiToNote = (m) => {
    m = Math.round(m);
    return NOTE_IT[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  };

  function acfPitchFrame(x, start, sr) {
    const N = 2048;
    const minLag = Math.floor(sr / 1047), maxLag = Math.min(Math.floor(sr / 65), N - 1);
    let e0 = 0;
    for (let i = 0; i < N; i++) { const v = x[start + i] || 0; e0 += v * v; }
    if (e0 < 1e-6) return null;
    const vals = new Float32Array(maxLag + 1);
    let bestVal = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0, e1 = 0;
      for (let i = 0; i < N - lag; i++) {
        const a = x[start + i] || 0, b = x[start + i + lag] || 0;
        s += a * b; e1 += b * b;
      }
      vals[lag] = s / Math.sqrt(e0 * e1 + 1e-12);
      if (vals[lag] > bestVal) bestVal = vals[lag];
    }
    if (bestVal < 0.55) return null;
    // contro l'errore d'ottava: il PICCO (massimo locale) più corto che sia
    // quasi buono quanto il migliore
    let bestLag = 0;
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (vals[lag] >= bestVal * 0.9 &&
          vals[lag] >= vals[lag - 1] && vals[lag] >= vals[lag + 1]) {
        bestLag = lag;
        break;
      }
    }
    if (!bestLag) return null;
    // affinamento parabolico attorno al picco
    const y0 = vals[bestLag - 1], y1 = vals[bestLag], y2 = vals[bestLag + 1];
    const denom = y0 - 2 * y1 + y2;
    const frac = Math.abs(denom) > 1e-9 ? 0.5 * (y0 - y2) / denom : 0;
    return { freq: sr / (bestLag + Math.max(-0.5, Math.min(0.5, frac))), conf: bestVal };
  }

  function pitchStats(x, sr, wholeClip) {
    const env = rmsEnvelope(x);
    const act = new Set(activeBlocks(env));
    const midis = [];
    // sulle canzoni lunghe si campiona: max ~800 frame, bastano per i percentili
    let step = wholeClip ? HOP : HOP * 2;
    if (!wholeClip) {
      const candidates = Math.floor(x.length / step);
      if (candidates > 800) step = Math.floor(x.length / 800 / HOP) * HOP;
    }
    for (let s = 0; s + 2048 < x.length; s += step) {
      if (!act.has(Math.floor(s / HOP))) continue;
      const p = acfPitchFrame(x, s, sr);
      if (p) midis.push(hzToMidi(p.freq));
    }
    if (midis.length < 8) return null;
    midis.sort((a, b) => a - b);
    if (wholeClip) {
      const med = percentile(midis, 50);
      return { lo: med, hi: med, med };
    }
    return { lo: percentile(midis, 5), hi: percentile(midis, 95), med: percentile(midis, 50) };
  }

  function recommendShift(song, user) {
    const overflow = (shift) => {
      const overHi = Math.max(0, song.hi + shift - user.hi);
      const overLo = Math.max(0, user.lo - (song.lo + shift));
      return 1.5 * overHi + overLo;
    };
    let bestS = 0, bestPen = Infinity;
    for (let s = -6; s <= 6; s++) {
      let pen = Math.min(overflow(s - 12), overflow(s), overflow(s + 12));
      pen += 0.15 * Math.abs(s);
      if (pen < bestPen - 1e-9) { bestPen = pen; bestS = s; }
    }
    return bestS;
  }

  /* ---------------- pitch shift (phase vocoder) ---------------- */

  function hann(N) {
    const w = new Float32Array(N);
    for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    return w;
  }

  async function stretch(x, factor, onProgress) {
    const N = 2048, hopS = 512, hopA = hopS / factor;
    const win = hann(N);
    const frames = Math.max(1, Math.floor((x.length - N) / hopA));
    const outLen = frames * hopS + N;
    const out = new Float32Array(outLen), norm = new Float32Array(outLen);
    const re = new Float32Array(N), im = new Float32Array(N);
    const prevPhase = new Float32Array(N / 2 + 1);
    const sumPhase = new Float32Array(N / 2 + 1);
    const TWO_PI = 2 * Math.PI;
    for (let t = 0; t < frames; t++) {
      const start = Math.round(t * hopA);
      for (let i = 0; i < N; i++) { re[i] = (x[start + i] || 0) * win[i]; im[i] = 0; }
      fft(re, im, false);
      for (let k = 0; k <= N / 2; k++) {
        const mag = Math.hypot(re[k], im[k]);
        const ph = Math.atan2(im[k], re[k]);
        let d = ph - prevPhase[k] - TWO_PI * k * hopA / N;
        prevPhase[k] = ph;
        d -= TWO_PI * Math.round(d / TWO_PI);
        const trueFreq = TWO_PI * k / N + d / hopA;
        sumPhase[k] += trueFreq * hopS;
        re[k] = mag * Math.cos(sumPhase[k]);
        im[k] = mag * Math.sin(sumPhase[k]);
      }
      for (let k = N / 2 + 1; k < N; k++) { re[k] = re[N - k]; im[k] = -im[N - k]; }
      fft(re, im, true);
      const off = t * hopS;
      for (let i = 0; i < N; i++) { out[off + i] += re[i] * win[i]; norm[off + i] += win[i] * win[i]; }
      if (t % 250 === 0) {
        if (onProgress) onProgress(t / frames);
        await new Promise((r) => setTimeout(r, 0));   // respiro per la UI
      }
    }
    for (let i = 0; i < outLen; i++) if (norm[i] > 1e-6) out[i] /= norm[i];
    return out;
  }

  function resample(x, step) {
    const n = Math.floor(x.length / step);
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * step, j = Math.floor(p), f = p - j;
      y[i] = x[j] * (1 - f) + (x[j + 1] || 0) * f;
    }
    return y;
  }

  /* Cambia tonalità senza cambiare la durata. */
  async function pitchShift(x, semitones, onProgress) {
    const ratio = Math.pow(2, semitones / 12);
    const st = await stretch(x, ratio, onProgress);
    return resample(st, ratio);
  }

  /* ---------------- allineamento ---------------- */

  function bestOffsetSeconds(user, ref, sr, maxShift = 6) {
    const a0 = rmsEnvelope(user), b0 = rmsEnvelope(ref);
    const n = Math.min(a0.length, b0.length);
    if (n < 20) return 0;
    const normz = (e) => {
      let m = 0, sd = 0;
      for (let i = 0; i < n; i++) m += e[i];
      m /= n;
      for (let i = 0; i < n; i++) sd += (e[i] - m) ** 2;
      sd = Math.sqrt(sd / n) + 1e-9;
      const o = new Float32Array(n);
      for (let i = 0; i < n; i++) o[i] = (e[i] - m) / sd;
      return o;
    };
    const a = normz(a0), b = normz(b0);
    const maxLag = Math.floor(maxShift * sr / HOP);
    let bestLag = 0, bestVal = -Infinity;
    for (let lag = -maxLag; lag <= maxLag; lag++) {
      let s = 0;
      for (let i = 0; i < n; i++) {
        const j = i + lag;
        if (j >= 0 && j < n) s += a[j] * b[i];
      }
      if (s > bestVal) { bestVal = s; bestLag = lag; }
    }
    return -bestLag * HOP / sr;
  }

  function shiftSamples(x, offsetSeconds, sr) {
    const n = Math.round(Math.abs(offsetSeconds) * sr);
    if (!n) return x;
    if (offsetSeconds > 0) {
      const y = new Float32Array(x.length + n);
      y.set(x, n);
      return y;
    }
    return x.subarray(Math.min(n, x.length));
  }

  /* ---------------- catena effetti sulla voce utente ---------------- */

  function gate(x, thresholdDb) {
    const env = rmsEnvelope(x);
    const y = new Float32Array(x.length);
    let g = 1;
    for (let b = 0; b < env.length; b++) {
      const target = toDb(env[b]) > thresholdDb ? 1 : 0.08;
      for (let i = b * HOP; i < (b + 1) * HOP && i < x.length; i++) {
        g += (target - g) * (target > g ? 0.05 : 0.002);   // apre svelto, chiude piano
        y[i] = x[i] * g;
      }
    }
    return y;
  }

  function compress(x, thresholdDb, ratio, sr) {
    const atk = Math.exp(-1 / (0.005 * sr)), rel = Math.exp(-1 / (0.12 * sr));
    const y = new Float32Array(x.length);
    let env = 0;
    const slope = 1 - 1 / ratio;
    for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i]);
      env = a > env ? atk * env + (1 - atk) * a : rel * env + (1 - rel) * a;
      const eDb = toDb(env);
      const gDb = eDb > thresholdDb ? -(eDb - thresholdDb) * slope : 0;
      y[i] = x[i] * Math.pow(10, gDb / 20);
    }
    return y;
  }

  /* Riverbero alla Freeverb: 8 comb + 4 allpass, coda tarata sull'RT60. */
  function reverb(x, sr, rt60, wet) {
    const scale = sr / 44100;
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
      .map((d) => Math.round(d * scale));
    const allp = [556, 441, 341, 225].map((d) => Math.round(d * scale));
    const out = new Float32Array(x.length);
    const damp = 0.4;
    for (const d of combs) {
      const buf = new Float32Array(d);
      const fb = Math.min(0.98, Math.pow(10, (-3 * d) / (rt60 * sr)));
      let idx = 0, store = 0;
      for (let i = 0; i < x.length; i++) {
        const yv = buf[idx];
        store = yv * (1 - damp) + store * damp;
        buf[idx] = x[i] + store * fb;
        out[i] += yv;
        if (++idx === d) idx = 0;
      }
    }
    for (const d of allp) {
      const buf = new Float32Array(d);
      let idx = 0;
      for (let i = 0; i < x.length; i++) {
        const bufout = buf[idx];
        const v = out[i];
        buf[idx] = v + bufout * 0.5;
        out[i] = bufout - v * 0.5;
        if (++idx === d) idx = 0;
      }
    }
    const y = new Float32Array(x.length);
    const wetG = wet * 0.3, dryG = 1 - wet * 0.5;   // le 8 comb sommate vanno riscalate
    for (let i = 0; i < x.length; i++) y[i] = x[i] * dryG + out[i] * wetG;
    return y;
  }

  function processVocal(user, profile, sr) {
    let y = biquadApply(user, biquadCoef("highpass", 80, sr, 0.707));
    const gateDb = Math.min(-30, Math.max(-60, noiseFloorDb(y) + 8));
    y = gate(y, gateDb);
    const userBands = bandLevelsDb(y, sr);
    for (let i = 0; i < EQ_BANDS.length; i++) {
      const g = Math.min(6, Math.max(-6, profile.bands_db[i] - userBands[i]));
      if (Math.abs(g) >= 0.75)
        y = biquadApply(y, biquadCoef("peaking", EQ_BANDS[i], sr, 1.0, g));
    }
    const userCrest = crestDb(y);
    const ratio = Math.min(8, Math.max(1.5, 1.5 + (userCrest - profile.crest_db) * 0.5));
    const env = rmsEnvelope(y);
    const act = activeBlocks(env);
    let level = 0;
    for (const b of act) level += env[b];
    level = toDb(act.length ? level / act.length : 1e-6);
    y = compress(y, level + 3, ratio, sr);
    y = reverb(y, sr, Math.max(0.2, profile.rt60), profile.reverb_wet);
    let peak = 0;
    for (const v of y) peak = Math.max(peak, Math.abs(v));
    if (peak > 0.89) { const g = 0.89 / peak; for (let i = 0; i < y.length; i++) y[i] *= g; }
    return y;
  }

  /* ---------------- mix e formato WAV ---------------- */

  function mix(baseL, baseR, vocal, profile, gainDb) {
    const env = rmsEnvelope(vocal);
    const act = activeBlocks(env);
    let cur = 0;
    for (const b of act) cur += env[b];
    cur = act.length ? cur / act.length : 1e-6;
    const target = profile.vocal_rms || cur;
    let g = (target / Math.max(cur, 1e-9)) * Math.pow(10, gainDb / 20);
    g = Math.min(20, Math.max(0.05, g));
    const n = Math.max(baseL.length, vocal.length);
    const L = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = (vocal[i] || 0) * g;
      L[i] = (baseL[i] || 0) + v;
      R[i] = (baseR[i] || 0) + v;
    }
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    if (peak > 0.98) {
      const s = 0.98 / peak;
      for (let i = 0; i < n; i++) { L[i] *= s; R[i] *= s; }
    }
    return { L, R };
  }

  function encodeWav(L, R, sr) {
    const n = L.length, blockAlign = 4, dataSize = n * blockAlign;
    const buf = new ArrayBuffer(44 + dataSize);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + dataSize, true); str(8, "WAVE");
    str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 2, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * blockAlign, true); v.setUint16(32, blockAlign, true);
    v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, dataSize, true);
    let o = 44;
    for (let i = 0; i < n; i++) {
      v.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); o += 2;
      v.setInt16(o, Math.max(-1, Math.min(1, R[i])) * 32767, true); o += 2;
    }
    return buf;
  }

  return {
    HOP, EQ_BANDS,
    fft, biquadCoef, biquadApply, rmsEnvelope, toDb,
    separate, analyzeVocal, noiseFloorDb, estimateRT60, crestDb, bandLevelsDb,
    hzToMidi, midiToNote, pitchStats, recommendShift,
    pitchShift, bestOffsetSeconds, shiftSamples,
    processVocal, mix, encodeWav, reverb,
  };
})();

if (typeof module !== "undefined") module.exports = DSP;   // per i test in Node
