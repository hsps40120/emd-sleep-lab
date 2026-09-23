// EMD / CEEMD / Hilbert / iPDF / HHSA — 純 JavaScript 實作，瀏覽器與 Node 共用。
// 參考：Huang et al. 1998 (EMD)、Wu & Huang 2009 (EEMD)、Yeh, Shieh & Huang 2010 (CEEMD)、
//       Huang et al. 2016 (HHSA)、Huang et al. 2025 (iPDF)。

// ---------- 亂數 ----------
export function rng(seed = 1) {
  let a = seed >>> 0;
  const uni = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => {
    let u = 0;
    while (u === 0) u = uni();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uni());
  };
  return { uni, gauss };
}

// ---------- 基本統計 ----------
export const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length;
export function std(x) {
  const m = mean(x);
  return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / x.length);
}
export function kurtosis(x) {
  // 超額峰度（常態 = 0；> 0 為 super-Gaussian / 厚尾）
  const m = mean(x);
  let m2 = 0, m4 = 0;
  for (const v of x) { const d = v - m; m2 += d * d; m4 += d ** 4; }
  m2 /= x.length; m4 /= x.length;
  return m4 / (m2 * m2) - 3;
}

// ---------- FFT ----------
export const nextPow2 = (n) => 1 << Math.ceil(Math.log2(Math.max(2, n)));

export function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI / len) * (inverse ? 1 : -1);
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

// 以 FFT 產生帶通雜訊（單位標準差）
export function bandNoise(n, fs, f1, f2, r) {
  const N = nextPow2(n);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = r.gauss();
  fft(re, im);
  for (let k = 0; k < N; k++) {
    const f = (k <= N / 2 ? k : N - k) * fs / N;
    if (f < f1 || f > f2) { re[k] = 0; im[k] = 0; }
  }
  fft(re, im, true);
  const out = Array.from(re.subarray(0, n));
  const s = std(out) || 1;
  return out.map((v) => v / s);
}

// 單邊功率譜
export function powerSpectrum(x, fs) {
  const N = nextPow2(x.length);
  const re = new Float64Array(N), im = new Float64Array(N);
  const m = mean(x);
  for (let i = 0; i < x.length; i++) {
    const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (x.length - 1)); // Hann
    re[i] = (x[i] - m) * w;
  }
  fft(re, im);
  const f = [], p = [];
  for (let k = 0; k <= N / 2; k++) { f.push(k * fs / N); p.push((re[k] ** 2 + im[k] ** 2) / N); }
  return { f, p };
}

// ---------- Hilbert：解析訊號 → 瞬時振幅與瞬時頻率 ----------
export function hilbert(x, fs) {
  const n = x.length;
  // 兩端鏡像延伸以減少邊界效應
  const pad = Math.min(n - 1, Math.round(n / 4));
  const ext = [];
  for (let i = pad; i > 0; i--) ext.push(x[i]);
  for (let i = 0; i < n; i++) ext.push(x[i]);
  for (let i = n - 2; i >= n - 1 - pad; i--) ext.push(x[i]);
  const N = nextPow2(ext.length);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < ext.length; i++) re[i] = ext[i];
  fft(re, im);
  for (let k = 1; k < N; k++) {
    const h = k < N / 2 ? 2 : k === N / 2 ? 1 : 0;
    re[k] *= h; im[k] *= h;
  }
  fft(re, im, true);
  const amp = new Array(n), phase = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = re[i + pad], b = im[i + pad];
    amp[i] = Math.hypot(a, b);
    phase[i] = Math.atan2(b, a);
  }
  // 相位展開
  for (let i = 1; i < n; i++) {
    let d = phase[i] - phase[i - 1];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    phase[i] = phase[i - 1] + d;
  }
  const freq = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = phase[Math.max(0, i - 1)], b = phase[Math.min(n - 1, i + 1)];
    const dt = (Math.min(n - 1, i + 1) - Math.max(0, i - 1)) / fs;
    freq[i] = Math.max(0, (b - a) / (2 * Math.PI * dt));
  }
  return { amp, phase, freq };
}

// ---------- EMD ----------
function extrema(x) {
  const maxI = [], minI = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (x[i] > x[i - 1] && x[i] >= x[i + 1]) maxI.push(i);
    else if (x[i] < x[i - 1] && x[i] <= x[i + 1]) minI.push(i);
  }
  return { maxI, minI };
}

function zeroCrossings(x) {
  let z = 0;
  for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) z++;
  return z;
}

// 自然三次樣條，於 0..n-1 每個整數點取值
function spline(xs, ys, n) {
  const m = xs.length;
  const out = new Float64Array(n);
  if (m < 2) { out.fill(m ? ys[0] : 0); return out; }
  if (m === 2) {
    for (let i = 0; i < n; i++) out[i] = ys[0] + (ys[1] - ys[0]) * (i - xs[0]) / (xs[1] - xs[0]);
    return out;
  }
  const h = new Float64Array(m - 1);
  for (let i = 0; i < m - 1; i++) h[i] = xs[i + 1] - xs[i];
  // 三對角系統求二階導數 M
  const a = new Float64Array(m), b = new Float64Array(m), c = new Float64Array(m), d = new Float64Array(m);
  b[0] = 1; b[m - 1] = 1;
  for (let i = 1; i < m - 1; i++) {
    a[i] = h[i - 1]; b[i] = 2 * (h[i - 1] + h[i]); c[i] = h[i];
    d[i] = 6 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1]);
  }
  for (let i = 1; i < m; i++) { const w = a[i] / b[i - 1]; b[i] -= w * c[i - 1]; d[i] -= w * d[i - 1]; }
  const M = new Float64Array(m);
  M[m - 1] = d[m - 1] / b[m - 1];
  for (let i = m - 2; i >= 0; i--) M[i] = (d[i] - c[i] * M[i + 1]) / b[i];
  let k = 0;
  for (let t = 0; t < n; t++) {
    while (k < m - 2 && t > xs[k + 1]) k++;
    const A = (xs[k + 1] - t) / h[k], B = (t - xs[k]) / h[k];
    out[t] = A * ys[k] + B * ys[k + 1] + ((A ** 3 - A) * M[k] + (B ** 3 - B) * M[k + 1]) * h[k] * h[k] / 6;
  }
  return out;
}

// 邊界處理：將靠近兩端的極值點對邊界鏡射
function envelope(x, idx, nsym = 2) {
  const n = x.length;
  const xs = [], ys = [];
  const L = idx.slice(0, nsym), R = idx.slice(-nsym);
  for (let i = L.length - 1; i >= 0; i--) { xs.push(-L[i]); ys.push(x[L[i]]); }
  for (const i of idx) { xs.push(i); ys.push(x[i]); }
  for (let i = R.length - 1; i >= 0; i--) { xs.push(2 * (n - 1) - R[i]); ys.push(x[R[i]]); }
  return spline(xs, ys, n);
}

// 一次 sifting：回傳上下包絡、均值與新 h（供步進動畫使用）
export function siftOnce(h) {
  const { maxI, minI } = extrema(h);
  if (maxI.length < 2 || minI.length < 2) return null;
  const upper = envelope(h, maxI), lower = envelope(h, minI);
  const m = new Float64Array(h.length);
  const next = new Array(h.length);
  for (let i = 0; i < h.length; i++) { m[i] = (upper[i] + lower[i]) / 2; next[i] = h[i] - m[i]; }
  return { upper: Array.from(upper), lower: Array.from(lower), mean: Array.from(m), next, maxI, minI };
}

export function isMonotonic(x) {
  const { maxI, minI } = extrema(x);
  return maxI.length + minI.length < 3;
}

// 固定 sifting 次數（S = 10，Wu & Huang 2009 建議）
export function emd(x, { maxImf = 10, sifts = 10 } = {}) {
  let r = Array.from(x);
  const imfs = [];
  while (imfs.length < maxImf && !isMonotonic(r)) {
    let h = r.slice();
    for (let s = 0; s < sifts; s++) {
      const step = siftOnce(h);
      if (!step) break;
      h = step.next;
    }
    imfs.push(h);
    r = r.map((v, i) => v - h[i]);
  }
  return { imfs, residue: r };
}

// CEEMD（Yeh, Shieh & Huang 2010）：成對加入 ±白雜訊後做 EMD 並平均
export function ceemd(x, { pairs = 20, noise = 0.2, maxImf, sifts = 10, seed = 7 } = {}) {
  const n = x.length;
  const K = maxImf ?? Math.max(1, Math.floor(Math.log2(n)) - 2);
  const acc = Array.from({ length: K }, () => new Float64Array(n));
  const s = std(x) * noise;
  const r = rng(seed);
  for (let p = 0; p < pairs; p++) {
    const w = Array.from({ length: n }, () => r.gauss() * s);
    for (const sign of [1, -1]) {
      const { imfs } = emd(x.map((v, i) => v + sign * w[i]), { maxImf: K, sifts });
      for (let k = 0; k < Math.min(K, imfs.length); k++) for (let i = 0; i < n; i++) acc[k][i] += imfs[k][i];
    }
  }
  const imfs = acc.map((a) => Array.from(a, (v) => v / (2 * pairs)));
  const residue = x.map((v, i) => v - imfs.reduce((s2, m) => s2 + m[i], 0));
  return { imfs, residue };
}

// ---------- Hilbert 譜（時間 × 頻率） ----------
export function hilbertSpectrum(imfs, fs, { tBins = 200, fMax = 30, fBins = 90 } = {}) {
  const n = imfs[0].length;
  const grid = Array.from({ length: fBins }, () => new Float64Array(tBins));
  const marginal = new Float64Array(fBins);
  const info = imfs.map((c) => hilbert(c, fs));
  for (const { amp, freq } of info) {
    for (let i = 0; i < n; i++) {
      const f = freq[i];
      if (!(f > 0 && f < fMax)) continue;
      const fb = Math.floor(f / fMax * fBins);
      const tb = Math.floor(i / n * tBins);
      const e = amp[i] ** 2;
      grid[fb][tb] += e;
      marginal[fb] += e / n;
    }
  }
  return { grid, marginal, fMax, info };
}

// ---------- iPDF（Huang et al. 2025） ----------
// 由高頻往低頻累加 IMF：S_k = c_1 + … + c_k，對每一個尺度計算機率密度與峰度
export function ipdf(imfs, { bins = 41, range = 5, trim = 100 } = {}) {
  // trim：去除兩端樣本，避免 EMD 邊界效應汙染尾端分布
  imfs = imfs.map((c) => c.slice(trim, c.length - trim));
  const n = imfs[0].length;
  const out = [];
  const S = new Float64Array(n);
  for (let k = 0; k < imfs.length; k++) {
    for (let i = 0; i < n; i++) S[i] += imfs[k][i];
    const arr = Array.from(S);
    const m = mean(arr), s = std(arr) || 1;
    const z = arr.map((v) => (v - m) / s);
    const hist = new Float64Array(bins);
    const w = (2 * range) / bins;
    for (const v of z) {
      const b = Math.floor((v + range) / w);
      if (b >= 0 && b < bins) hist[b]++;
    }
    for (let b = 0; b < bins; b++) hist[b] /= n * w;
    out.push({ k: k + 1, kurt: kurtosis(z), hist: Array.from(hist), binW: w, range });
  }
  return out;
}

// ---------- HHSA（Huang et al. 2016）：載波頻率 fc × 調幅頻率 fam ----------
export function hhsa(imfs, fs, { fcMax = 30, famMax = 8, bins = 40, maxLayer2 = 6 } = {}) {
  const grid = Array.from({ length: bins }, () => new Float64Array(bins)); // [fam][fc]
  const n = imfs[0].length;
  for (const c of imfs) {
    const h1 = hilbert(c, fs);
    // 第二層：對振幅包絡再做一次 EMD，得到「振幅的調變」
    const env = h1.amp;
    const { imfs: am } = emd(env.map((v) => v - mean(env)), { maxImf: maxLayer2, sifts: 8 });
    for (const d of am) {
      const h2 = hilbert(d, fs);
      for (let i = 0; i < n; i += 2) {
        const fc = h1.freq[i], fam = h2.freq[i];
        if (!(fc > 0 && fc < fcMax && fam > 0 && fam < famMax)) continue;
        if (fam > fc) continue; // 調幅頻率不可能高於載波
        const x = Math.floor(fc / fcMax * bins), y = Math.floor(fam / famMax * bins);
        grid[y][x] += h2.amp[i] ** 2;
      }
    }
  }
  return { grid, fcMax, famMax };
}

// ---------- 教學用合成睡眠腦波 ----------
// 注意：以下訊號是依據各睡眠期的典型特徵人工合成，僅供說明演算法，並非真實 PSG 資料。
export const STAGES = {
  wake: { name: 'Wake（閉眼清醒）', short: 'W' },
  n2: { name: 'N2（紡錘波 + K 複合波）', short: 'N2' },
  n3: { name: 'N3（慢波睡眠）', short: 'N3' },
  rem: { name: 'REM（快速動眼期）', short: 'REM' },
};

function burstEnvelope(n, fs, r, { rate = 0.25, durMin = 0.6, durMax = 1.6, floor = 0.08 }) {
  const env = new Float64Array(n).fill(floor);
  let t = r.uni() * 2;
  const T = n / fs;
  while (t < T) {
    const d = durMin + r.uni() * (durMax - durMin);
    const c = t + d / 2, sig = d / 5;
    const a = 0.7 + 0.6 * r.uni();
    for (let i = Math.max(0, Math.floor((c - 3 * sig) * fs)); i < Math.min(n, Math.ceil((c + 3 * sig) * fs)); i++) {
      env[i] += a * Math.exp(-(((i / fs - c) / sig) ** 2) / 2);
    }
    t += d + (1 / rate) * (0.5 + r.uni());
  }
  return env;
}

export function makeStage(stage, { fs = 100, dur = 20, noise = 0.15, seed = 3 } = {}) {
  const n = fs * dur;
  const r = rng(seed * 101 + stage.length);
  const t = Array.from({ length: n }, (_, i) => i / fs);
  const bn = (a, b) => bandNoise(n, fs, a, b, r);
  let x;
  if (stage === 'wake') {
    // 閉眼 α 波（8–12 Hz）呈現「漸強漸弱」的紡錘狀調幅；少量 β
    const alpha = bn(8.5, 11.5);
    const env = burstEnvelope(n, fs, r, { rate: 0.6, durMin: 0.8, durMax: 2.5, floor: 0.12 });
    const beta = bn(15, 25), bg = bn(1, 7);
    x = t.map((_, i) => 1.6 * env[i] * alpha[i] + 0.25 * beta[i] + 0.3 * bg[i]);
  } else if (stage === 'n2') {
    // θ 背景 + 12–14 Hz 紡錘波 + 偶發 K 複合波
    const theta = bn(3, 7), delta = bn(0.7, 2.5);
    const env = burstEnvelope(n, fs, r, { rate: 0.2, durMin: 0.6, durMax: 1.5, floor: 0 });
    const kc = new Float64Array(n);
    for (const c of [5.3, 13.8]) {
      for (let i = 0; i < n; i++) {
        const u = t[i] - c;
        kc[i] += -2.6 * Math.exp(-((u / 0.18) ** 2)) + 1.6 * Math.exp(-(((u - 0.45) / 0.25) ** 2));
      }
    }
    x = t.map((ti, i) => 0.5 * theta[i] + 0.4 * delta[i] + 1.4 * env[i] * Math.sin(2 * Math.PI * 13 * ti + 0.4 * Math.sin(2 * Math.PI * 0.7 * ti)) + kc[i]);
  } else if (stage === 'n3') {
    // 大振幅、連續、相對「均勻」的 δ 慢波（0.5–2 Hz）
    const delta = bn(0.5, 2), theta = bn(3, 7), sig = bn(10, 15);
    x = t.map((_, i) => 2.2 * delta[i] + 0.3 * theta[i] + 0.12 * sig[i]);
  } else if (stage === 'rem') {
    // 低振幅混合頻率 + 鋸齒波（2–5 Hz）叢集 + β
    const theta = bn(4, 7.5), beta = bn(14, 28), alpha = bn(8, 11);
    const env = burstEnvelope(n, fs, r, { rate: 0.3, durMin: 0.8, durMax: 1.8, floor: 0 });
    const envB = burstEnvelope(n, fs, r, { rate: 0.8, durMin: 0.3, durMax: 0.9, floor: 0.1 });
    const saw = t.map((ti) => { const p = (ti * 3.2) % 1; return p < 0.75 ? p / 0.75 * 2 - 1 : 1 - (p - 0.75) / 0.25 * 2; });
    x = t.map((_, i) => 0.4 * theta[i] + 0.6 * envB[i] * beta[i] + 0.2 * alpha[i] + 1.8 * env[i] * saw[i]);
  } else throw new Error('unknown stage ' + stage);
  const white = Array.from({ length: n }, () => r.gauss());
  return x.map((v, i) => v + noise * white[i]);
}

// 非線性波（內波調頻）：x = cos(ωt + ε sin ωt)
export function makeNonlinear({ fs = 100, dur = 10, f0 = 1.5, eps = 0.5 } = {}) {
  const n = fs * dur;
  return Array.from({ length: n }, (_, i) => {
    const w = 2 * Math.PI * f0 * i / fs;
    return Math.cos(w + eps * Math.sin(w));
  });
}

// 間歇訊號（模態混疊經典例）：慢波 + 斷斷續續的高頻紡錘
export function makeIntermittent({ fs = 100, dur = 10, seed = 5 } = {}) {
  const n = fs * dur;
  return Array.from({ length: n }, (_, i) => {
    const t = i / fs;
    const burst = [1.5, 4.2, 7.3].reduce((s, c) => s + Math.exp(-(((t - c) / 0.35) ** 2)), 0);
    return Math.sin(2 * Math.PI * 1 * t) + 0.6 * burst * Math.sin(2 * Math.PI * 13 * t);
  });
}
