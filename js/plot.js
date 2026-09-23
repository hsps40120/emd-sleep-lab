// 輕量 canvas 繪圖工具（跟隨 CSS 變數，支援深淺色主題）

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function setup(canvas, height) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = height ?? canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '11px ' + css('--font-mono');
  return { ctx, w, h };
}

export const palette = () => ({
  ink: css('--ink'), muted: css('--muted'), grid: css('--grid'), accent: css('--accent'),
  a2: css('--accent-2'), a3: css('--accent-3'), a4: css('--accent-4'), bg: css('--panel'),
});

function extent(arrs) {
  let lo = Infinity, hi = -Infinity;
  for (const a of arrs) for (const v of a) { if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
  if (lo === hi) { lo -= 1; hi += 1; }
  return [lo, hi];
}

// 多條折線；series: [{y, color, width, dash, alpha}]
export function lines(canvas, series, { height = 140, x0 = 0, x1, yRange, label, xLabel, pad = { l: 44, r: 10, t: 16, b: 20 }, markers = [], shade } = {}) {
  const { ctx, w, h } = setup(canvas, height);
  const P = palette();
  const n = series[0].y.length;
  const X1 = x1 ?? n - 1;
  const [lo, hi] = yRange ?? extent(series.map((s) => s.y));
  const sx = (i) => pad.l + (i / (n - 1)) * (w - pad.l - pad.r);
  const sy = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
  ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.l, h - pad.b + 0.5); ctx.lineTo(w - pad.r, h - pad.b + 0.5); ctx.stroke();
  if (lo < 0 && hi > 0) { ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(pad.l, sy(0)); ctx.lineTo(w - pad.r, sy(0)); ctx.stroke(); ctx.setLineDash([]); }
  if (shade) { ctx.fillStyle = shade.color; ctx.globalAlpha = 0.15; ctx.fillRect(sx(shade.from), pad.t, sx(shade.to) - sx(shade.from), h - pad.t - pad.b); ctx.globalAlpha = 1; }
  for (const s of series) {
    ctx.strokeStyle = s.color ?? P.ink; ctx.lineWidth = s.width ?? 1.2; ctx.globalAlpha = s.alpha ?? 1;
    ctx.setLineDash(s.dash ?? []);
    ctx.beginPath();
    const step = Math.max(1, Math.floor(n / (w * 2)));
    for (let i = 0; i < n; i += step) { const X = sx(i), Y = sy(s.y[i]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  for (const m of markers) {
    ctx.fillStyle = m.color;
    for (const i of m.idx) { ctx.beginPath(); ctx.arc(sx(i), sy(m.y[i]), 2.6, 0, 7); ctx.fill(); }
  }
  ctx.fillStyle = P.muted;
  ctx.textAlign = 'right';
  ctx.fillText(fmt(hi), pad.l - 6, pad.t + 8); ctx.fillText(fmt(lo), pad.l - 6, h - pad.b);
  if (label) { ctx.textAlign = 'left'; ctx.fillStyle = P.ink; ctx.fillText(label, pad.l + 4, pad.t - 4); }
  if (xLabel !== undefined) {
    ctx.textAlign = 'left'; ctx.fillStyle = P.muted; ctx.fillText(fmt(x0), pad.l, h - 5);
    ctx.textAlign = 'right'; ctx.fillText(fmt(X1) + ' ' + xLabel, w - pad.r, h - 5);
  }
}

// x-y 曲線（x 非等距），例如頻譜
export function xy(canvas, series, { height = 160, xRange, yRange, logY = false, xLabel = '', yLabel = '', pad = { l: 44, r: 10, t: 16, b: 22 }, bars } = {}) {
  const { ctx, w, h } = setup(canvas, height);
  const P = palette();
  const tf = (v) => (logY ? Math.log10(Math.max(v, 1e-12)) : v);
  const [x0, x1] = xRange ?? extent(series.map((s) => s.x));
  const [lo, hi] = yRange ?? extent(series.map((s) => s.y.filter((_, i) => s.x[i] >= x0 && s.x[i] <= x1).map(tf)));
  const sx = (v) => pad.l + ((v - x0) / (x1 - x0)) * (w - pad.l - pad.r);
  const sy = (v) => pad.t + (1 - (tf(v) - lo) / (hi - lo)) * (h - pad.t - pad.b);
  ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.l, h - pad.b + 0.5); ctx.lineTo(w - pad.r, h - pad.b + 0.5); ctx.stroke();
  for (let t = Math.ceil(x0); t <= x1; t += niceStep(x1 - x0)) {
    ctx.fillStyle = P.muted; ctx.textAlign = 'center'; ctx.fillText(fmt(t), sx(t), h - 6);
    ctx.strokeStyle = P.grid; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(sx(t), pad.t); ctx.lineTo(sx(t), h - pad.b); ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (bars) {
    const bw = (w - pad.l - pad.r) / bars.y.length;
    ctx.fillStyle = bars.color; ctx.globalAlpha = 0.55;
    bars.y.forEach((v, i) => { const X = sx(bars.x[i]); const Y = sy(v); ctx.fillRect(X - bw / 2 + 0.5, Y, bw - 1, h - pad.b - Y); });
    ctx.globalAlpha = 1;
  }
  for (const s of series) {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width ?? 1.6; ctx.setLineDash(s.dash ?? []);
    ctx.beginPath();
    let started = false;
    s.x.forEach((xv, i) => {
      if (xv < x0 || xv > x1 || !Number.isFinite(s.y[i])) return;
      const X = sx(xv), Y = Math.max(pad.t, Math.min(h - pad.b, sy(s.y[i])));
      started ? ctx.lineTo(X, Y) : (ctx.moveTo(X, Y), (started = true));
    });
    ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.fillStyle = P.muted; ctx.textAlign = 'right';
  if (yLabel) { ctx.textAlign = 'left'; ctx.fillText(yLabel, pad.l + 4, pad.t - 4); }
  if (xLabel) { ctx.textAlign = 'right'; ctx.fillText(xLabel, w - pad.r, pad.t - 4); }
}

function niceStep(span) {
  const raw = span / 6;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/\.?0+$/, '') || '0';

// 熱圖：grid[row=y][col=x]，y 由下往上
export function heatmap(canvas, grid, { height = 220, xMax, yMax, xLabel = '', yLabel = '', pad = { l: 44, r: 12, t: 16, b: 24 }, gamma = 0.35 } = {}) {
  const { ctx, w, h } = setup(canvas, height);
  const P = palette();
  const rows = grid.length, cols = grid[0].length;
  let hi = 0;
  for (const r of grid) for (const v of r) if (v > hi) hi = v;
  const pw = (w - pad.l - pad.r) / cols, ph = (h - pad.t - pad.b) / rows;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const v = hi ? (grid[y][x] / hi) ** gamma : 0;
    if (v < 0.02) continue;
    ctx.fillStyle = colormap(v, dark);
    ctx.fillRect(pad.l + x * pw, h - pad.b - (y + 1) * ph, Math.ceil(pw), Math.ceil(ph));
  }
  ctx.strokeStyle = P.grid; ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, w - pad.l - pad.r, h - pad.t - pad.b);
  ctx.fillStyle = P.muted;
  ctx.textAlign = 'left'; ctx.fillText('0', pad.l, h - 7);
  ctx.textAlign = 'right'; ctx.fillText(fmt(xMax) + ' ' + xLabel, w - pad.r, h - 7);
  ctx.fillText(fmt(yMax), pad.l - 5, pad.t + 9); ctx.fillText('0', pad.l - 5, h - pad.b);
  ctx.save(); ctx.translate(12, pad.t + (h - pad.t - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(yLabel, 0, 0); ctx.restore();
}

// 依明度遞增的藍→青→黃序列色盤（深色模式下由暗到亮）
function colormap(v, dark) {
  const stops = [[38, 70, 150], [30, 140, 170], [110, 190, 120], [245, 200, 70], [255, 240, 190]];
  const s = v * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(s)), f = s - i;
  const c = stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * f));
  return `rgba(${c[0]},${c[1]},${c[2]},${dark ? 0.35 + 0.65 * v : 0.25 + 0.75 * v})`;
}
