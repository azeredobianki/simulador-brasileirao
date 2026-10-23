// Integração das odds: probabilidades sem margem, ajuste das forças ao mercado e placares calibrados
const fs = require('fs');
const Mdl = require('./model.js');
const { IDX, T, MAXG } = Mdl;

function loadOdds(path) {
  return fs.readFileSync(path, 'utf8').trim().split(/\r?\n/).map(l => {
    const [h, a, ...o] = l.trim().split(/\s+/);
    const inv = o.map(x => 1 / +x), s = inv.reduce((u, v) => u + v, 0);
    return { h: IDX[h], a: IDX[a], hc: h, ac: a, odds: o.map(Number), margin: s - 1, m: inv.map(v => v / s) };
  });
}

const shift = (p, d, dh) => ({ ...p, home: p.home + dh, att: p.att.map((v, t) => v + d[t] / 2), def: p.def.map((v, t) => v + d[t] / 2) });

// ajusta deslocamentos de força por time (d) e de mando (dh) para aproximar o mercado,
// com penalização ridge: o mercado conta como W "jogos de evidência" por partida, prior sd = SD
function fitShift(p, games, W = 10, SD = 0.15) {
  const kappa = 1 / (SD * SD);
  let d = new Array(T).fill(0), dh = 0;
  const obj = (d, dh) => {
    const q = shift(p, d, dh);
    let f = 0;
    for (const g of games) {
      const pr = Mdl.hda(Mdl.scoreMatrix(q, g.h, g.a).M);
      g.m.forEach((m, o) => f -= W * m * Math.log(pr[o]));
    }
    return f + kappa / 2 * (d.reduce((s, v) => s + v * v, 0) + dh * dh);
  };
  // gradiente numérico + descida com passo adaptativo (21 parâmetros, barato)
  let f0 = obj(d, dh), lr = 0.002;
  for (let it = 0; it < 3000; it++) {
    const eps = 1e-5, gd = d.map((v, t) => { const e = d.slice(); e[t] += eps; return (obj(e, dh) - f0) / eps; });
    const gh = (obj(d, dh + eps) - f0) / eps;
    const nd = d.map((v, t) => v - lr * gd[t]), nh = dh - lr * gh, f1 = obj(nd, nh);
    if (f1 < f0) { d = nd; dh = nh; if (f0 - f1 < 1e-10) { f0 = f1; break; } f0 = f1; lr *= 1.2; } else lr /= 2;
  }
  return { d, dh };
}

// matriz de placares Dixon-Coles com λ escolhidos para reproduzir exatamente M/E/V do mercado
function matchMarket(p, h, a, target) {
  const base = Mdl.scoreMatrix(p, h, a);
  let x = [Math.log(base.lh), Math.log(base.la)];
  const mat = x => {
    const q = { mu: 0, home: 0, att: new Array(T).fill(0), def: new Array(T).fill(0), rho: p.rho };
    q.att[h] = x[0]; q.att[a] = x[1];
    return Mdl.scoreMatrix(q, h, a).M;
  };
  for (let it = 0; it < 100; it++) {
    const r = Mdl.hda(mat(x)), F = [r[0] - target[0], r[2] - target[2]];
    if (Math.abs(F[0]) + Math.abs(F[1]) < 1e-9) break;
    const e = 1e-6, J = [[0, 0], [0, 0]];
    for (let k = 0; k < 2; k++) {
      const y = x.slice(); y[k] += e;
      const s = Mdl.hda(mat(y));
      J[0][k] = (s[0] - r[0]) / e; J[1][k] = (s[2] - r[2]) / e;
    }
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    x = [x[0] - (J[1][1] * F[0] - J[0][1] * F[1]) / det, x[1] - (-J[1][0] * F[0] + J[0][0] * F[1]) / det];
  }
  return { M: mat(x), lh: Math.exp(x[0]), la: Math.exp(x[1]) };
}

module.exports = { loadOdds, fitShift, shift, matchMarket };

if (require.main === module) {
  const [wikiPath, turnoPath, oddsPath] = process.argv.slice(2);
  const { played } = Mdl.loadData(wikiPath, turnoPath);
  const p = Mdl.fit(played.map(g => ({ ...g, w: 1 })), 10);
  const odds = loadOdds(oddsPath);
  const pc = v => (100 * v).toFixed(0).padStart(3) + '%';
  console.log('jogo           | mercado M/E/V      | modelo M/E/V       | margem');
  let ll = 0, llm = 0;
  for (const g of odds) {
    const pr = Mdl.hda(Mdl.scoreMatrix(p, g.h, g.a).M);
    console.log(`${(g.hc + ' x ' + g.ac).padEnd(14)} | ${g.m.map(pc).join(' ')} | ${pr.map(pc).join(' ')} | ${(100 * g.margin).toFixed(1)}%`);
  }
  for (const [W, SD] of [[10, 0.15], [30, 0.15]]) {
    const { d, dh } = fitShift(p, odds, W, SD);
    const q = shift(p, d, dh);
    let err = 0, err0 = 0;
    for (const g of odds) {
      const a = Mdl.hda(Mdl.scoreMatrix(q, g.h, g.a).M), b = Mdl.hda(Mdl.scoreMatrix(p, g.h, g.a).M);
      g.m.forEach((m, o) => { err += Math.abs(a[o] - m); err0 += Math.abs(b[o] - m); });
    }
    console.log(`\nW=${W}: mando ${dh >= 0 ? '+' : ''}${dh.toFixed(3)} | erro médio vs mercado ${(100 * err0 / 30).toFixed(1)}pp -> ${(100 * err / 30).toFixed(1)}pp`);
    console.log(Mdl.CODES.map((c, t) => `${c} ${d[t] >= 0 ? '+' : ''}${d[t].toFixed(3)}`).join('  '));
  }
}
