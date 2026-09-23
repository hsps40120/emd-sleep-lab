import * as E from './emd.js';
import * as P from './plot.js';

const $ = (id) => document.getElementById(id);
const FS = 100;
const nextFrame = () => new Promise((r) => setTimeout(r, 16));
const imfColor = (k) => { const p = P.palette(); return [p.accent, p.a2, p.a3, p.a4][k % 4]; };

// ---------- 主題切換 ----------
$('theme').onclick = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('theme', root.dataset.theme); } catch {}
  redrawAll();
};
try { const t = localStorage.getItem('theme'); if (t) document.documentElement.dataset.theme = t; } catch {}

// ================= 1. 非線性波 =================
function drawWhy() {
  const eps = +$('eps').value, f0 = +$('f0').value;
  $('epsOut').textContent = eps.toFixed(2); $('f0Out').textContent = f0.toFixed(1) + ' Hz';
  const x = E.makeNonlinear({ fs: FS, dur: 20, f0, eps });
  const pal = P.palette();
  P.lines($('cWave'), [{ y: x.slice(0, 400), color: pal.ink, width: 1.6 }], { height: 170, x1: 4, xLabel: 's' });
  const { f, p } = E.powerSpectrum(x, FS);
  const pmax = Math.max(...p);
  P.xy($('cFourier'), [{ x: f, y: p.map((v) => v / pmax), color: pal.accent }], { height: 170, xRange: [0, Math.min(20, f0 * 8)], xLabel: 'Hz', yRange: [0, 1.05] });
  const { imfs } = E.emd(x);
  const h = E.hilbert(imfs[0], FS);
  const seg = h.freq.slice(200, 600);
  P.lines($('cIF'), [
    { y: seg, color: pal.a2, width: 1.8 },
    { y: seg.map(() => f0), color: pal.muted, dash: [4, 4] },
  ], { height: 150, x1: 4, xLabel: 's', yRange: [0, f0 * 2.2], label: '瞬時頻率 (Hz)；虛線 = f₀' });
  const harm = [2, 3, 4].map((k) => { const i = Math.round(k * f0 * (f.length - 1) * 2 / FS); return p[i] / pmax; });
  $('whyNote').innerHTML = eps < 0.05
    ? '當 ε ≈ 0，波形就是純餘弦：傅立葉只有一根譜線，Hilbert 瞬時頻率也是一條水平線，兩種方法看法一致。'
    : `ε = ${eps.toFixed(2)} 時，傅立葉在 2f₀ 的能量是基頻的 <b>${(harm[0] * 100).toFixed(1)}%</b>、3f₀ 是 <b>${(harm[1] * 100).toFixed(1)}%</b>，但訊號裡其實沒有這些「振盪」。
       EMD 只取出 <b>${imfs.filter((c) => E.std(c) > 0.05).length} 個</b>有意義的 IMF，瞬時頻率在一個週期內於 ${(f0 * (1 - eps)).toFixed(2)}–${(f0 * (1 + eps)).toFixed(2)} Hz 擺盪。<b>波形失真，在 HHT 裡是「頻率的變化」，在傅立葉裡是「多出來的頻率」。</b>`;
}
['eps', 'f0'].forEach((id) => $(id).addEventListener('input', drawWhy));

// ================= 2. Sifting 步進 =================
const sift = { x: null, h: null, step: null, count: 0, imfs: [], residue: null };
function siftSignal() {
  const v = $('siftSig').value;
  if (v === 'intermittent') return E.makeIntermittent({ fs: FS, dur: 8 });
  return E.makeStage(v, { fs: FS, dur: 8, noise: 0.05, seed: 2 });
}
function siftReset() {
  sift.x = siftSignal(); sift.h = sift.x.slice(); sift.residue = sift.x.slice();
  sift.count = 0; sift.imfs = []; sift.step = E.siftOnce(sift.h);
  drawSift();
}
function siftDo(n = 1) {
  for (let i = 0; i < n; i++) {
    if (!sift.step) break;
    sift.h = sift.step.next; sift.count++;
    if (sift.count >= 10) {
      sift.imfs.push(sift.h);
      sift.residue = sift.residue.map((v, j) => v - sift.h[j]);
      sift.h = sift.residue.slice(); sift.count = 0;
    }
    sift.step = E.isMonotonic(sift.h) ? null : E.siftOnce(sift.h);
  }
  drawSift();
}
function drawSift() {
  const pal = P.palette();
  const s = sift.step;
  const series = [{ y: sift.h, color: pal.ink, width: 1.2 }];
  if (s) series.push({ y: s.upper, color: pal.accent, width: 1.4 }, { y: s.lower, color: pal.a3, width: 1.4 }, { y: s.mean, color: pal.a2, width: 2 });
  P.lines($('cSift'), series, {
    height: 220, x1: 8, xLabel: 's',
    markers: s ? [{ idx: s.maxI, y: sift.h, color: pal.accent }, { idx: s.minI, y: sift.h, color: pal.a3 }] : [],
  });
  const c = $('cSiftImfs');
  if (!sift.imfs.length) { P.lines(c, [{ y: new Array(800).fill(0), color: pal.grid }], { height: 60, label: '（尚未取出 IMF：按「完成此 IMF」）' }); }
  else {
    // 堆疊繪製
    const rows = [...sift.imfs, sift.residue];
    drawStack(c, rows, rows.map((_, k) => (k < sift.imfs.length ? `IMF ${k + 1}` : '殘餘')), { rowH: 54, x1: 8 });
  }
  const zc = zeroX(sift.h);
  const ex = s ? s.maxI.length + s.minI.length : 0;
  const meanAbs = s ? E.mean(s.mean.map(Math.abs)) / (E.std(sift.h) || 1) : 0;
  $('siftStatus').textContent = s
    ? `正在取 IMF ${sift.imfs.length + 1}，第 ${sift.count} 次 sifting ｜ 極值 ${ex}、過零 ${zc}（差 ${Math.abs(ex - zc)}）｜ |m(t)|/σ = ${meanAbs.toFixed(3)}`
    : `殘餘量已是單調趨勢：分解完成，共 ${sift.imfs.length} 個 IMF`;
}
function zeroX(x) { let z = 0; for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) z++; return z; }
$('siftStep').onclick = () => siftDo(1);
$('siftImf').onclick = () => siftDo(10 - sift.count);
$('siftReset').onclick = siftReset;
$('siftSig').onchange = siftReset;

// 堆疊 IMF 圖
function drawStack(canvas, rows, labels, { rowH = 46, x1, highlight = -1, notes = [] } = {}) {
  const { ctx, w, h } = P.setup(canvas, rows.length * rowH + 20);
  const pal = P.palette();
  const L = 56, R = notes.length ? 56 : 8;
  rows.forEach((y, k) => {
    const top = k * rowH + 6, mid = top + rowH / 2;
    const amp = Math.max(...y.map(Math.abs)) || 1;
    ctx.globalAlpha = highlight < 0 || highlight === k ? 1 : 0.3;
    ctx.fillStyle = pal.muted; ctx.textAlign = 'right'; ctx.fillText(labels[k], L - 8, mid + 4);
    ctx.strokeStyle = pal.grid; ctx.beginPath(); ctx.moveTo(L, mid); ctx.lineTo(w - R, mid); ctx.stroke();
    ctx.strokeStyle = k === rows.length - 1 && labels[k] === '殘餘' ? pal.muted : imfColor(k);
    ctx.lineWidth = 1.1; ctx.beginPath();
    const n = y.length, step = Math.max(1, Math.floor(n / ((w - L - R) * 2)));
    for (let i = 0; i < n; i += step) {
      const X = L + (i / (n - 1)) * (w - L - R), Y = mid - (y[i] / amp) * (rowH * 0.45);
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    }
    ctx.stroke();
    if (notes[k]) { ctx.fillStyle = pal.ink; ctx.textAlign = 'left'; ctx.fillText(notes[k], w - R + 6, mid + 4); }
    ctx.globalAlpha = 1;
  });
  if (x1) { ctx.fillStyle = pal.muted; ctx.textAlign = 'right'; ctx.fillText(x1 + ' s', w - R, h - 4); ctx.textAlign = 'left'; ctx.fillText('0', L, h - 4); }
  return { rowH, top: 6 };
}

// ================= 3. 拆解睡眠腦波 =================
const dec = { stage: 'n2', seed: 3, result: null, x: null, hl: -1 };
function makeSeg(el, onPick, initial) {
  for (const [k, v] of Object.entries(E.STAGES)) {
    const b = document.createElement('button');
    b.textContent = v.short; b.title = v.name; b.dataset.k = k;
    if (k === initial) b.classList.add('on');
    b.onclick = () => { el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); onPick(k); };
    el.appendChild(b);
  }
}
makeSeg($('stageSeg'), (k) => { dec.stage = k; runDecompose(); }, 'n2');
$('method').onchange = () => runDecompose();
$('noise').addEventListener('input', () => { $('noiseOut').textContent = (+$('noise').value).toFixed(2); });
$('noise').addEventListener('change', () => runDecompose());
$('reseed').onclick = () => { dec.seed++; runDecompose(); };
$('cImfs').addEventListener('click', (e) => {
  if (!dec.result) return;
  const r = e.target.getBoundingClientRect();
  const k = Math.floor((e.clientY - r.top - 6) / 46);
  dec.hl = k === dec.hl || k < 0 || k >= dec.result.imfs.length ? -1 : k;
  drawDecompose();
});

let decToken = 0;
async function runDecompose() {
  const tok = ++decToken;
  const noise = +$('noise').value;
  dec.x = E.makeStage(dec.stage, { fs: FS, dur: 20, noise, seed: dec.seed });
  $('decStatus').textContent = '計算中…';
  await nextFrame();
  const t0 = performance.now();
  const method = $('method').value;
  const res = method === 'ceemd' ? E.ceemd(dec.x, { pairs: 10, noise: 0.2, maxImf: 8 }) : E.emd(dec.x, { maxImf: 8 });
  if (tok !== decToken) return;
  const hs = E.hilbertSpectrum(res.imfs, FS, { tBins: 240, fBins: 80, fMax: 30 });
  dec.result = { ...res, hs }; dec.hl = -1;
  $('decStatus').textContent = `${E.STAGES[dec.stage].name} ｜ ${method.toUpperCase()} → ${res.imfs.length} 個 IMF ｜ ${(performance.now() - t0).toFixed(0)} ms（在你的瀏覽器裡算的）`;
  drawDecompose();
}
function drawDecompose() {
  if (!dec.result) return;
  const pal = P.palette();
  const { imfs, residue, hs } = dec.result;
  P.lines($('cRaw'), [{ y: dec.x, color: pal.ink, width: 1 }], { height: 120, x1: 20, xLabel: 's' });
  const trim = (a) => a.slice(100, -100);
  const notes = hs.info.map((h, k) => {
    const a = trim(h.amp), f = trim(h.freq);
    const wsum = a.reduce((s, v) => s + v * v, 0) || 1;
    return (f.reduce((s, v, i) => s + v * a[i] * a[i], 0) / wsum).toFixed(1) + ' Hz';
  });
  drawStack($('cImfs'), [...imfs, residue], [...imfs.map((_, k) => `IMF ${k + 1}`), '殘餘'], { rowH: 46, x1: 20, highlight: dec.hl, notes: [...notes, ''] });
  let grid = hs.grid;
  if (dec.hl >= 0) grid = E.hilbertSpectrum([imfs[dec.hl]], FS, { tBins: 240, fBins: 80, fMax: 30 }).grid;
  P.heatmap($('cHS'), grid, { height: 230, xMax: 20, yMax: 30, xLabel: 's', yLabel: 'Hz' });
  const { f, p } = E.powerSpectrum(dec.x, FS);
  const fb = hs.marginal.length;
  const mf = Array.from({ length: fb }, (_, i) => (i + 0.5) * hs.fMax / fb);
  const mm = Math.max(...hs.marginal);
  // 傅立葉：合併到同樣的頻率格子方便比較
  const fp = new Float64Array(fb);
  f.forEach((fv, i) => { const b = Math.floor(fv / hs.fMax * fb); if (b >= 0 && b < fb) fp[b] += p[i]; });
  const fm = Math.max(...fp);
  P.xy($('cMarg'), [
    { x: mf, y: Array.from(fp, (v) => v / fm), color: pal.accent, width: 1.4 },
    { x: mf, y: Array.from(hs.marginal, (v) => v / mm), color: pal.a2, width: 1.8 },
  ], { height: 150, xRange: [0, 30], yRange: [0, 1.05], xLabel: 'Hz' });
}

// ================= 4. 模態混疊 =================
$('mixNoise').addEventListener('input', () => { $('mixNoiseOut').textContent = (+$('mixNoise').value).toFixed(2); });
$('mixPairs').addEventListener('input', () => { $('mixPairsOut').textContent = $('mixPairs').value; });
const mix = { x: null, a: null, b: null };
async function runMix() {
  mix.x = E.makeIntermittent({ fs: FS, dur: 10 });
  $('mixRun').disabled = true; $('mixStatus').textContent = 'CEEMD 計算中（每一對雜訊都要做兩次完整 EMD）…';
  await nextFrame();
  const t0 = performance.now();
  mix.a = E.emd(mix.x, { maxImf: 6 });
  mix.b = E.ceemd(mix.x, { pairs: +$('mixPairs').value, noise: +$('mixNoise').value, maxImf: 8 });
  $('mixStatus').textContent = `完成 ｜ ${(performance.now() - t0).toFixed(0)} ms`;
  $('mixRun').disabled = false;
  drawMix();
}
// 以相關係數衡量混疊：理想狀況下紡錘波（或慢波）完整落在單一 IMF，與真實成分的相關接近 1
function purity(imfs, truth) {
  const corr = (a, b) => {
    let ab = 0, aa = 0, bb = 0;
    for (let i = 100; i < a.length - 100; i++) { ab += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
    return aa * bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
  };
  const r = imfs.map((c) => corr(c, truth));
  const k = r.indexOf(Math.max(...r));
  return [k + 1, r[k]];
}
function drawMix() {
  if (!mix.a) return;
  const pal = P.palette();
  P.lines($('cMixRaw'), [{ y: mix.x, color: pal.ink }], { height: 110, x1: 10, xLabel: 's' });
  const A = mix.a.imfs.slice(0, 3), B = mix.b.imfs.slice(0, 4);
  const slow = mix.x.map((_, i) => Math.sin(2 * Math.PI * i / FS));
  const sp = mix.x.map((v, i) => v - slow[i]);
  drawStack($('cMixA'), A, A.map((_, k) => `IMF ${k + 1}`), { rowH: 56, x1: 10 });
  drawStack($('cMixB'), B, B.map((_, k) => `IMF ${k + 1}`), { rowH: 56, x1: 10 });
  const [ia, va] = purity(mix.a.imfs, sp), [ib, vb] = purity(mix.b.imfs, sp);
  const [ja, wa] = purity(mix.a.imfs, slow), [jb, wb] = purity(mix.b.imfs, slow);
  $('mixNote').innerHTML = `看左圖 EMD 的 IMF 1：沒有紡錘波的時段，它會「借」慢波的一部分來填空，同一個 IMF 裡混了兩種尺度。
    量化（IMF 與真實成分的相關係數，1 = 完全分離）：紡錘波 EMD 為 IMF ${ia} 的 <b>${va.toFixed(2)}</b>，CEEMD 為 IMF ${ib} 的 <b>${vb.toFixed(2)}</b>；
    1 Hz 慢波 EMD <b>${wa.toFixed(2)}</b>（IMF ${ja}），CEEMD <b>${wb.toFixed(2)}</b>（IMF ${jb}）。
    代價是計算量：CEEMD 要做 ${2 * +$('mixPairs').value} 次完整 EMD。試著把雜訊對數調到 2，看平均不足時殘留的雜訊。`;
}
$('mixRun').onclick = runMix;

// ================= 5. HHSA =================
const hh = { stage: 'wake', cache: {} };
makeSeg($('hhsaSeg'), (k) => { hh.stage = k; runHHSA(); }, 'wake');
async function runHHSA() {
  const k = hh.stage;
  if (!hh.cache[k]) {
    $('hhsaStatus').textContent = '兩層 EMD 計算中…';
    await nextFrame();
    const t0 = performance.now();
    const x = E.makeStage(k, { fs: FS, dur: 30, noise: 0.1, seed: 4 });
    const { imfs } = E.emd(x, { maxImf: 7 });
    const res = E.hhsa(imfs, FS, { fcMax: 24, famMax: 4, bins: 48 });
    const energies = imfs.map((c) => E.std(c));
    const main = energies.indexOf(Math.max(...energies));
    hh.cache[k] = { res, imfs, main, ms: performance.now() - t0 };
  }
  if (hh.stage !== k) return;
  const c = hh.cache[k];
  $('hhsaStatus').textContent = `${E.STAGES[k].name} ｜ 第一層 ${c.imfs.length} 個 IMF，每個包絡再做 EMD ｜ ${c.ms.toFixed(0)} ms`;
  drawHHSA();
}
function drawHHSA() {
  const c = hh.cache[hh.stage];
  if (!c) return;
  const pal = P.palette();
  P.heatmap($('cHHSA'), c.res.grid, { height: 260, xMax: 24, yMax: 4, xLabel: 'Hz (fc)', yLabel: 'fam (Hz)', gamma: 0.4 });
  const imf = c.imfs[c.main].slice(0, 1000);
  const env = E.hilbert(c.imfs[c.main], FS).amp.slice(0, 1000);
  P.lines($('cEnv'), [{ y: imf, color: pal.accent, width: 1 }, { y: env, color: pal.a2, width: 2 }, { y: env.map((v) => -v), color: pal.a2, width: 1, alpha: 0.5 }], { height: 260, x1: 10, xLabel: 's', label: `IMF ${c.main + 1}（前 10 秒）` });
  // 找出能量最大的 (fc, fam)
  let best = [0, 0, 0];
  c.res.grid.forEach((row, y) => row.forEach((v, x) => { if (v > best[0]) best = [v, x, y]; }));
  const fc = (best[1] + 0.5) * 24 / 48, fam = (best[2] + 0.5) * 4 / 48;
  const text = {
    wake: 'α 載波（約 10 Hz）被 1 Hz 以下的慢節奏調幅，對應 α 波「漸強漸弱」的紡錘狀包絡。這種調幅在一般功率譜上完全看不到。',
    n2: '紡錘波載波約 13 Hz，包絡約每 4–5 秒出現一次，調幅能量集中在很低的 fam；θ 背景的調幅則分散。',
    n3: '能量集中在 δ 載波（&lt;2 Hz），而且調幅相對弱且分散：慢波「一直都在」，很少忽強忽弱。這正是第 6 節 iPDF 在 N3 接近高斯分布的原因。',
    rem: '鋸齒波（2–4 Hz）與 β 叢集都有明顯的間歇調幅；REM 的「混合頻率、低振幅」在 HHSA 上呈現為多個分散的調幅島。',
  };
  $('hhsaNote').innerHTML = `最亮點：<b>fc ≈ ${fc.toFixed(1)} Hz、fam ≈ ${fam.toFixed(2)} Hz</b>。${text[hh.stage]}`;
}

// ================= 6. iPDF =================
const ip = { data: null, seed: 11 };
$('ipdfK').addEventListener('input', () => { $('ipdfKOut').textContent = $('ipdfK').value; drawIpdf(); });
$('ipdfRun').onclick = () => { ip.seed++; runIpdf(); };
async function runIpdf() {
  $('ipdfRun').disabled = true;
  $('ipdfStatus').textContent = '對四個睡眠期各做 EMD…';
  await nextFrame();
  const t0 = performance.now();
  ip.data = {};
  for (const k of Object.keys(E.STAGES)) {
    const x = E.makeStage(k, { fs: FS, dur: 30, noise: 0.15, seed: ip.seed });
    ip.data[k] = E.ipdf(E.emd(x, { maxImf: 8 }).imfs);
    await nextFrame();
  }
  $('ipdfStatus').textContent = `完成 ｜ 每期 30 秒 ｜ ${(performance.now() - t0).toFixed(0)} ms`;
  $('ipdfRun').disabled = false;
  buildIpdfGrid();
  drawIpdf();
}
function buildIpdfGrid() {
  const g = $('ipdfGrid');
  g.innerHTML = '';
  for (const [k, v] of Object.entries(E.STAGES)) {
    const d = document.createElement('div');
    d.className = 'cell';
    d.innerHTML = `<h4>${v.name}</h4><div class="kv" id="kv-${k}"></div><canvas id="pdf-${k}"></canvas>`;
    g.appendChild(d);
  }
}
function drawIpdf() {
  if (!ip.data) return;
  const pal = P.palette();
  const K = +$('ipdfK').value;
  const gauss = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  for (const k of Object.keys(E.STAGES)) {
    const arr = ip.data[k];
    const p = arr[Math.min(K, arr.length) - 1];
    const zs = p.hist.map((_, b) => -p.range + (b + 0.5) * p.binW);
    P.xy($(`pdf-${k}`), [{ x: zs, y: zs.map(gauss), color: pal.muted, dash: [4, 3], width: 1.2 }], {
      height: 150, xRange: [-p.range, p.range], yRange: [-4, 0], logY: true,
      bars: { x: zs, y: p.hist.map((v) => Math.max(v, 1e-4)), color: stageColor(k) }, xLabel: 'z', yLabel: 'log p',
    });
    const tag = p.kurt > 1 ? 'super-Gaussian' : p.kurt > 0.3 ? '略厚尾' : '≈ Gaussian';
    $(`kv-${k}`).innerHTML = `${p.kurt.toFixed(2)} <small>峰度 · ${tag}</small>`;
  }
  const maxK = Math.max(...Object.values(ip.data).map((a) => a.length));
  const xs = Array.from({ length: maxK }, (_, i) => i + 1);
  P.xy($('cKurt'), [
    ...Object.keys(E.STAGES).map((k) => ({ x: xs, y: xs.map((i) => ip.data[k][i - 1]?.kurt ?? NaN), color: stageColor(k), width: 2.2 })),
    { x: [1, maxK], y: [0, 0], color: pal.muted, dash: [4, 4], width: 1 },
  ], { height: 200, xRange: [1, maxK], yRange: [-1, 8], xLabel: 'k（累加的 IMF 數）', yLabel: '超額峰度（截斷顯示 −1 ~ 8）' });
  legend($('cKurt'));
}
function stageColor(k) { const p = P.palette(); return { wake: p.accent, n2: p.a4, n3: p.a3, rem: p.a2 }[k]; }
function legend(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.clientWidth;
  let x = w - 280;
  for (const [k, v] of Object.entries(E.STAGES)) {
    ctx.fillStyle = stageColor(k); ctx.fillRect(x, 26, 14, 3);
    ctx.fillStyle = P.palette().ink; ctx.textAlign = 'left'; ctx.fillText(v.short, x + 18, 31);
    x += 64;
  }
}

// ---------- 啟動與重繪 ----------
function redrawAll() { drawWhy(); drawSift(); drawDecompose(); drawMix(); drawHHSA(); drawIpdf(); }
let rt;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(redrawAll, 150); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redrawAll);

(async () => {
  try { await document.fonts.ready; } catch {}
  drawWhy();
  siftReset();
  await runDecompose();
  await runHHSA();
  await runMix();
  await runIpdf();
})();
