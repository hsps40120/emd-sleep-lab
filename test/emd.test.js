import * as E from '../js/emd.js';
import assert from 'node:assert/strict';
const fs = 100;
// 1. 重建誤差
const x = E.makeStage('n2', { fs, dur: 20 });
let t0 = Date.now();
const { imfs, residue } = E.emd(x);
console.log('EMD imfs', imfs.length, 'ms', Date.now() - t0);
const err = Math.max(...x.map((v, i) => Math.abs(v - imfs.reduce((s, m) => s + m[i], 0) - residue[i])));
assert.ok(err < 1e-9, 'reconstruction ' + err);
// 2. 兩個正弦可分離
const two = Array.from({ length: 2000 }, (_, i) => Math.sin(2 * Math.PI * 12 * i / fs) + Math.sin(2 * Math.PI * 1 * i / fs));
const d = E.emd(two);
const f1 = E.hilbert(d.imfs[0], fs).freq.slice(200, 1800), f2 = E.hilbert(d.imfs[1], fs).freq.slice(200, 1800);
console.log('IF imf1', E.mean(f1).toFixed(2), 'imf2', E.mean(f2).toFixed(2));
assert.ok(Math.abs(E.mean(f1) - 12) < 0.3 && Math.abs(E.mean(f2) - 1) < 0.2);
// 3. 各睡眠期 iPDF 峰度（依文獻預期 wake/REM > N3）
for (const s of Object.keys(E.STAGES)) {
  const res = [];
  for (const seed of [1, 2, 3]) {
    const y = E.makeStage(s, { fs, dur: 30, seed });
    res.push(E.ipdf(E.emd(y).imfs).map(p => p.kurt));
  }
  const avg = res[0].map((_, k) => E.mean(res.map(r => r[k] ?? NaN)));
  console.log(s.padEnd(5), avg.map(v => v.toFixed(2)).join(' '));
}
t0 = Date.now(); E.ceemd(x, { pairs: 20 }); console.log('CEEMD ms', Date.now() - t0);
t0 = Date.now(); const h = E.hhsa(imfs, fs); console.log('HHSA ms', Date.now() - t0);
console.log('ok');
