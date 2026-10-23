// Simulação realista: placares sorteados do modelo Dixon-Coles, incerteza da força dos times via bootstrap,
// desempate oficial (pontos, vitórias, saldo, gols pró, confronto direto entre 2; demais critérios por sorteio)
// Uso: node realistic.js wiki.txt turno1.txt N out.json
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const os = require('os');
const Mdl = require('./model.js');
const { T, MAXG, CODES } = Mdl;
const S = (MAXG + 1) * (MAXG + 1);
const LAM = 10, B = 200;

function prepare(wikiPath, turnoPath, oddsPath, oddsW = 30) {
  const { played, pending, base, mismatch } = Mdl.loadData(wikiPath, turnoPath);
  if (mismatch.length) throw new Error('tabela não bate com placares: ' + mismatch);
  const all = played.map(g => ({ ...g, w: 1 }));
  const full = Mdl.fit(all, LAM);
  // bootstrap: reamostra os jogos disputados e reajusta -> incerteza sobre a força real de cada time
  let seed = 20261013;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const sets = [];
  for (let b = 0; b < B; b++) {
    const sample = Array.from({ length: all.length }, () => all[Math.floor(rnd() * all.length)]);
    sets.push(Mdl.fit(sample, LAM, full));
  }
  // odds (opcional): forças deslocadas em direção ao mercado e jogos com odds reproduzem o mercado exatamente
  let market = null, fullAdj = full;
  if (oddsPath) {
    const Mk = require('./market.js');
    const odds = Mk.loadOdds(oddsPath);
    const { d, dh } = Mk.fitShift(full, odds, oddsW);
    fullAdj = Mk.shift(full, d, dh);
    for (let b = 0; b < B; b++) sets[b] = Mk.shift(sets[b], d, dh);
    market = {};
    for (const o of odds) market[`${o.hc}-${o.ac}`] = Mk.matchMarket(fullAdj, o.h, o.a, o.m);
  }
  const G = pending.length;
  const cdf = new Float64Array(B * G * S);
  const hdaAvg = pending.map(() => [0, 0, 0]);
  sets.forEach((p, b) => pending.forEach((g, i) => {
    const mk = market && market[`${g.hc}-${g.ac}`];
    const M = mk ? mk.M : Mdl.scoreMatrix(p, g.h, g.a).M;
    let c = 0; const off = (b * G + i) * S;
    for (let k = 0; k < S; k++) { c += M[k]; cdf[off + k] = c; }
    cdf[off + S - 1] = 1;
    Mdl.hda(M).forEach((v, o) => hdaAvg[i][o] += v / B);
  }));
  // pontos no confronto direto já disputado: h2h[i*T+j] = pontos de i contra j
  const h2h = new Int32Array(T * T);
  for (const g of played) {
    const ph = g.x > g.y ? 3 : g.x === g.y ? 1 : 0, pa = g.x < g.y ? 3 : g.x === g.y ? 1 : 0;
    h2h[g.h * T + g.a] += ph; h2h[g.a * T + g.h] += pa;
  }
  const marketLam = {};
  if (market) for (const k in market) marketLam[k] = [market[k].lh, market[k].la];
  return { played, pending, base, full: fullAdj, sets, cdf, hdaAvg, h2h, marketLam };
}

function run({ N, seed0, base, pending, cdf, h2h }) {
  const G = pending.length;
  const H = Int32Array.from(pending, g => g.h), A = Int32Array.from(pending, g => g.a);
  const pgame = new Int32Array(T * T).fill(-1);
  pending.forEach((g, i) => pgame[g.h * T + g.a] = i);
  const pts = new Int32Array(T), w = new Int32Array(T), gd = new Int32Array(T), gf = new Int32Array(T);
  const u = new Float64Array(T), key = new Float64Array(T), kb = new Float64Array(T);
  const sx = new Uint8Array(G), sy = new Uint8Array(G), oc = new Uint8Array(G);
  const cnt = new Float64Array(G * 3), rel = new Float64Array(G * 3 * T), decisive = new Float64Array(G), flip = new Float64Array(G * T);
  const relTot = new Float64Array(T), ptsSum = new Float64Array(T), posCount = new Float64Array(T * T);
  let h2hUsed = 0;
  let seed = seed0 >>> 0 || 1;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const draw = off => { // busca binária na CDF
    const r = rnd(); let lo = 0, hi = S - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[off + m] < r) lo = m + 1; else hi = m; }
    return lo;
  };
  const baseKey = (p, ww, g, f) => p * 1e8 + ww * 1e6 + (g + 300) * 1e3 + f;
  const z4 = () => {
    let mask = 0;
    for (let k = 0; k < 4; k++) {
      let best = -1, bv = Infinity;
      for (let t = 0; t < T; t++) if (!(mask >> t & 1) && key[t] < bv) { bv = key[t]; best = t; }
      mask |= 1 << best;
    }
    return mask;
  };
  const h2hPts = (i, j) => {
    let p = h2h[i * T + j];
    for (const [hh, aa, me] of [[i, j, 0], [j, i, 1]]) {
      const g = pgame[hh * T + aa];
      if (g < 0) continue;
      const o = oc[g]; // 0 mandante vence, 1 empate, 2 visitante vence
      p += o === 1 ? 1 : (o === 0) === (me === 0) ? 3 : 0;
    }
    return p;
  };
  for (let s = 0; s < N; s++) {
    const b = Math.floor(rnd() * B);
    for (let t = 0; t < T; t++) { const q = base[t]; pts[t] = 3 * q.W + q.D; w[t] = q.W; gd[t] = q.GF - q.GA; gf[t] = q.GF; u[t] = rnd() * 0.5; }
    for (let g = 0; g < G; g++) {
      const k = draw((b * G + g) * S), x = (k / (MAXG + 1)) | 0, y = k % (MAXG + 1), h = H[g], a = A[g];
      sx[g] = x; sy[g] = y; oc[g] = x > y ? 0 : x === y ? 1 : 2;
      gd[h] += x - y; gd[a] += y - x; gf[h] += x; gf[a] += y;
      if (x > y) { pts[h] += 3; w[h]++; } else if (x < y) { pts[a] += 3; w[a]++; } else { pts[h]++; pts[a]++; }
    }
    for (let t = 0; t < T; t++) kb[t] = baseKey(pts[t], w[t], gd[t], gf[t]);
    // confronto direto quando exatamente 2 times empatam em tudo
    for (let i = 0; i < T; i++) for (let j = i + 1; j < T; j++) {
      if (kb[i] !== kb[j]) continue;
      let others = 0;
      for (let k = 0; k < T; k++) if (k !== i && k !== j && kb[k] === kb[i]) others++;
      if (others) continue;
      const pi = h2hPts(i, j), pj = h2hPts(j, i);
      if (pi !== pj) { u[i] = pi > pj ? 0.75 : 0.25; u[j] = pi > pj ? 0.25 : 0.75; h2hUsed++; }
    }
    for (let t = 0; t < T; t++) { key[t] = kb[t] + u[t]; ptsSum[t] += pts[t]; }
    const m0 = z4();
    for (let t = 0; t < T; t++) {
      if (m0 >> t & 1) relTot[t]++;
      let better = 0; for (let j = 0; j < T; j++) if (key[j] > key[t]) better++;
      posCount[t * T + better]++;
    }
    for (let g = 0; g < G; g++) {
      const c = g * 3 + oc[g], h = H[g], a = A[g];
      cnt[c]++;
      for (let t = 0; t < T; t++) if (m0 >> t & 1) rel[c * T + t]++;
      // contrafactual: sorteia de novo só este placar (mesma força dos times), mantém o resto
      const k = draw((b * G + g) * S), x = (k / (MAXG + 1)) | 0, y = k % (MAXG + 1);
      if (x === sx[g] && y === sy[g]) continue;
      const kh = key[h], ka = key[a];
      const dp = (xx, yy) => xx > yy ? [3, 1, 0] : xx === yy ? [1, 0, 1] : [0, 0, 3];
      const [ph0, wh0, pa0] = dp(sx[g], sy[g]), [ph1, wh1, pa1] = dp(x, y);
      const wa0 = sy[g] > sx[g] ? 1 : 0, wa1 = y > x ? 1 : 0;
      key[h] = baseKey(pts[h] - ph0 + ph1, w[h] - wh0 + wh1, gd[h] - (sx[g] - sy[g]) + (x - y), gf[h] - sx[g] + x) + u[h];
      key[a] = baseKey(pts[a] - pa0 + pa1, w[a] - wa0 + wa1, gd[a] - (sy[g] - sx[g]) + (y - x), gf[a] - sy[g] + y) + u[a];
      const ch = z4() ^ m0;
      key[h] = kh; key[a] = ka;
      if (ch) { decisive[g]++; for (let t = 0; t < T; t++) if (ch >> t & 1) flip[g * T + t]++; }
    }
  }
  return { cnt, rel, decisive, flip, relTot, ptsSum, posCount, h2hUsed };
}

module.exports = { prepare };
if (isMainThread && require.main === module) {
  const [wikiPath, turnoPath, Nstr, outPath, oddsPath] = process.argv.slice(2);
  const N = +Nstr, P = Math.max(1, os.cpus().length - 1);
  const t0 = Date.now();
  const prep = prepare(wikiPath, turnoPath, oddsPath);
  console.log(`modelo ajustado + ${B} bootstraps em ${((Date.now() - t0) / 1000).toFixed(1)}s; mando de campo: x${Math.exp(prep.full.home).toFixed(2)} gols, rho ${prep.full.rho.toFixed(3)}`);
  let done = 0; const parts = [];
  for (let i = 0; i < P; i++) {
    const n = Math.floor(N / P) + (i < N % P ? 1 : 0);
    const wk = new Worker(__filename, { workerData: { N: n, seed0: 0x2545f491 ^ (i * 104729 + 7), base: prep.base, pending: prep.pending, cdf: prep.cdf, h2h: prep.h2h } });
    wk.on('message', m => {
      parts.push(m);
      if (++done < P) return;
      const sum = k => { const acc = new Array(parts[0][k].length).fill(0); for (const p of parts) p[k].forEach((v, j) => acc[j] += v); return acc; };
      fs.writeFileSync(outPath, JSON.stringify({
        N, codes: CODES, base: prep.base, games: prep.pending.map(g => ({ r: g.r, h: g.hc, a: g.ac })), hda: prep.hdaAvg,
        strength: CODES.map((c, t) => ({ c, att: prep.full.att[t], def: prep.full.def[t] })), mu: prep.full.mu, home: prep.full.home, rho: prep.full.rho,
        cnt: sum('cnt'), rel: sum('rel'), decisive: sum('decisive'), flip: sum('flip'), relTot: sum('relTot'), ptsSum: sum('ptsSum'), posCount: sum('posCount'),
        h2hUsed: parts.reduce((s, p) => s + p.h2hUsed, 0),
      }));
      console.log(`ok: ${N} simulações em ${P} threads, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    });
    wk.on('error', e => { console.error(e); process.exit(1); });
  }
} else if (!isMainThread) {
  const r = run(workerData);
  const o = {}; for (const k in r) o[k] = typeof r[k] === 'number' ? r[k] : Array.from(r[k]);
  parentPort.postMessage(o);
}
