// Linha de corte do Z4: pontos do 16º e do 17º colocado e P(escapar | pontos finais)
const { prepare } = require('./realistic.js');
const { T, MAXG } = require('./model.js');
const [wikiPath, turnoPath, oddsPath, Nstr] = process.argv.slice(2);
const N = +Nstr;
const prep = prepare(wikiPath, turnoPath, oddsPath);
const { pending, base, cdf } = prep;
const G = pending.length, S = (MAXG + 1) ** 2, B = prep.sets.length;
let seed = 987654321;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
const pts = new Int32Array(T), w = new Int32Array(T), gd = new Int32Array(T), gf = new Int32Array(T), key = new Float64Array(T);
const p16 = new Float64Array(100), p17 = new Float64Array(100);
const safeAt = new Float64Array(100), allAt = new Float64Array(100);
const teamPts = Array.from({ length: T }, () => new Float64Array(100)), teamSafe = Array.from({ length: T }, () => new Float64Array(100));
for (let s = 0; s < N; s++) {
  const b = Math.floor(rnd() * B);
  for (let t = 0; t < T; t++) { const q = base[t]; pts[t] = 3 * q.W + q.D; w[t] = q.W; gd[t] = q.GF - q.GA; gf[t] = q.GF; }
  for (let g = 0; g < G; g++) {
    const off = (b * G + g) * S, r = rnd();
    let lo = 0, hi = S - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[off + m] < r) lo = m + 1; else hi = m; }
    const x = (lo / (MAXG + 1)) | 0, y = lo % (MAXG + 1), h = pending[g].h, a = pending[g].a;
    gd[h] += x - y; gd[a] += y - x; gf[h] += x; gf[a] += y;
    if (x > y) { pts[h] += 3; w[h]++; } else if (x < y) { pts[a] += 3; w[a]++; } else { pts[h]++; pts[a]++; }
  }
  for (let t = 0; t < T; t++) key[t] = pts[t] * 1e8 + w[t] * 1e6 + (gd[t] + 300) * 1e3 + gf[t] + rnd() * 0.5;
  const ord = [...Array(T).keys()].sort((i, j) => key[j] - key[i]);
  p16[pts[ord[15]]]++; p17[pts[ord[16]]]++;
  ord.forEach((t, k) => { allAt[pts[t]]++; if (k < 16) safeAt[pts[t]]++; teamPts[t][pts[t]]++; if (k < 16) teamSafe[t][pts[t]]++; });
}
console.log(`${N} simulações`);
console.log('pts | 16º (último fora) | 17º (1º do Z4) | P(escapar com esses pontos)');
for (let p = 34; p <= 52; p++) console.log(`${String(p).padStart(3)} | ${(100 * p16[p] / N).toFixed(1).padStart(5)}% | ${(100 * p17[p] / N).toFixed(1).padStart(5)}% | ${allAt[p] ? (100 * safeAt[p] / allAt[p]).toFixed(1) : '-'}%`);
const mean = a => a.reduce((s, v, i) => s + v * i, 0) / N;
const quant = (a, q) => { let c = 0; for (let i = 0; i < 100; i++) { c += a[i] / N; if (c >= q) return i; } };
console.log(`16º média ${mean(p16).toFixed(2)} mediana ${quant(p16, .5)} p90 ${quant(p16, .9)} p99 ${quant(p16, .99)}`);
console.log(`17º média ${mean(p17).toFixed(2)} mediana ${quant(p17, .5)}`);
// pontos que cada time em risco precisa: P(escapar | pontos finais do time)
const { CODES } = require('./model.js');
for (const c of ['GRE', 'INT', 'MIR', 'COR', 'VIT', 'VAS']) {
  const t = CODES.indexOf(c), cur = 3 * base[t].W + base[t].D, J = base[t].W + base[t].D + base[t].L;
  const line = [];
  for (let p = 38; p <= 50; p++) line.push(p + ':' + (teamPts[t][p] > 200 ? Math.round(100 * teamSafe[t][p] / teamPts[t][p]) + '%' : '-'));
  console.log(c, cur + 'pts', (38 - J) + 'j |', line.join(' '));
}
