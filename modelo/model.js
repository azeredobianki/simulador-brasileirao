// Modelo Dixon-Coles (Poisson com correção de placares baixos) ajustado aos jogos da temporada
const fs = require('fs');
const CODES = ['CAP','CAM','BAH','BOT','CHA','COR','CTB','CRU','FLA','FLU','GRE','INT','MIR','PAL','RBB','REM','SAN','SPA','VAS','VIT'];
const IDX = Object.fromEntries(CODES.map((c, i) => [c, i]));
const T = CODES.length;
const MAXG = 10;

function loadData(wikiPath, turnoPath) {
  const wiki = fs.readFileSync(wikiPath, 'utf8');
  // rodada de cada confronto: turno 1 do arquivo, returno espelhado (r+19, mando invertido)
  const roundOf = {};
  for (const line of fs.readFileSync(turnoPath, 'utf8').trim().split(/\r?\n/)) {
    const [r, ...ps] = line.trim().split(/\s+/);
    const seen = new Set();
    for (const p of ps) {
      const [h, a] = p.split('-');
      if (!(h in IDX) || !(a in IDX) || seen.has(h) || seen.has(a)) throw new Error(`rodada ${r} inválida: ${p}`);
      seen.add(h); seen.add(a);
      roundOf[`${h}-${a}`] = +r; roundOf[`${a}-${h}`] = +r + 19;
    }
    if (seen.size !== 20) throw new Error(`rodada ${r} incompleta`);
  }
  if (Object.keys(roundOf).length !== 380) throw new Error('calendário incompleto');
  const played = [], pending = [];
  for (const m of wiki.matchAll(/^\|match_([A-Z]+)_([A-Z]+)=(.*)$/gm)) {
    const s = m[3].match(/(\d+)–(\d+)/);
    const g = { h: IDX[m[1]], a: IDX[m[2]], hc: m[1], ac: m[2], r: roundOf[`${m[1]}-${m[2]}`] };
    if (s) played.push({ ...g, x: +s[1], y: +s[2] }); else pending.push(g);
  }
  const base = CODES.map(c => {
    const m = wiki.match(new RegExp(`\\|win_${c}=(\\d+)\\s*\\|draw_${c}=(\\d+)\\s*\\|loss_${c}=(\\d+)\\s*\\|gf_${c}=(\\d+)\\s*\\|ga_${c}=(\\d+)`));
    const [W, D, L, GF, GA] = m.slice(1).map(Number);
    return { W, D, L, GF, GA };
  });
  // confere a tabela contra os placares do quadro de resultados
  const chk = CODES.map(() => ({ W: 0, D: 0, L: 0, GF: 0, GA: 0 }));
  for (const g of played) {
    const H = chk[g.h], A = chk[g.a];
    H.GF += g.x; H.GA += g.y; A.GF += g.y; A.GA += g.x;
    if (g.x > g.y) { H.W++; A.L++; } else if (g.x < g.y) { A.W++; H.L++; } else { H.D++; A.D++; }
  }
  const mismatch = CODES.filter((c, i) => ['W', 'D', 'L', 'GF', 'GA'].some(k => chk[i][k] !== base[i][k]));
  return { played, pending, base, mismatch };
}

const lfact = (() => { const a = [0]; for (let i = 1; i <= 40; i++) a[i] = a[i - 1] + Math.log(i); return a; })();
function tau(x, y, lh, la, rho) {
  if (x === 0 && y === 0) return 1 - lh * la * rho;
  if (x === 0 && y === 1) return 1 + lh * rho;
  if (x === 1 && y === 0) return 1 + la * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

// games: [{h,a,x,y,w}] ; retorna {mu, home, att, def, rho}
function fit(games, lam, init) {
  const p = init ? { mu: init.mu, home: init.home, att: init.att.slice(), def: init.def.slice() }
                 : { mu: 0.2, home: 0.2, att: new Array(T).fill(0), def: new Array(T).fill(0) };
  // Newton por blocos (mu, home, ataques, defesas): dentro de cada bloco os parâmetros são independentes,
  // então o passo diagonal é exato e a iteração converge de forma estável
  const pass = block => {
    const gr = new Array(T).fill(0), he = new Array(T).fill(0);
    let g0 = 0, h0 = 0;
    for (const g of games) {
      const lh = Math.exp(p.mu + p.home + p.att[g.h] - p.def[g.a]);
      const la = Math.exp(p.mu + p.att[g.a] - p.def[g.h]);
      const rh = g.w * (g.x - lh), ra = g.w * (g.y - la), wh = g.w * lh, wa = g.w * la;
      if (block === 0) { g0 += rh + ra; h0 += wh + wa; }
      else if (block === 1) { g0 += rh; h0 += wh; }
      else if (block === 2) { gr[g.h] += rh; he[g.h] += wh; gr[g.a] += ra; he[g.a] += wa; }
      else { gr[g.a] -= rh; he[g.a] += wh; gr[g.h] -= ra; he[g.h] += wa; }
    }
    if (block === 0) { const d = g0 / h0; p.mu += d; return Math.abs(d); }
    if (block === 1) { const d = g0 / h0; p.home += d; return Math.abs(d); }
    const v = block === 2 ? p.att : p.def;
    let m = 0;
    for (let t = 0; t < T; t++) { const d = (gr[t] - lam * v[t]) / (he[t] + lam); v[t] += d; m = Math.max(m, Math.abs(d)); }
    return m;
  };
  for (let it = 0; it < 500; it++) {
    const m = Math.max(pass(0), pass(1), pass(2), pass(3));
    if (m < 1e-8) break;
  }
  // rho por busca em grade (verossimilhança da correção DC)
  let best = 0, bestLL = -Infinity;
  for (let rho = -0.25; rho <= 0.25001; rho += 0.005) {
    let ll = 0;
    for (const g of games) {
      if (g.x > 1 || g.y > 1) continue;
      const lh = Math.exp(p.mu + p.home + p.att[g.h] - p.def[g.a]), la = Math.exp(p.mu + p.att[g.a] - p.def[g.h]);
      const t = tau(g.x, g.y, lh, la, rho);
      if (t <= 0) { ll = -Infinity; break; }
      ll += g.w * Math.log(t);
    }
    if (ll > bestLL) { bestLL = ll; best = rho; }
  }
  p.rho = best;
  return p;
}

// matriz de placares (MAXG+1)^2 normalizada
function scoreMatrix(p, h, a) {
  const lh = Math.exp(p.mu + p.home + p.att[h] - p.def[a]), la = Math.exp(p.mu + p.att[a] - p.def[h]);
  const M = new Float64Array((MAXG + 1) * (MAXG + 1));
  let s = 0;
  for (let x = 0; x <= MAXG; x++) for (let y = 0; y <= MAXG; y++) {
    const v = Math.exp(-lh + x * Math.log(lh) - lfact[x] - la + y * Math.log(la) - lfact[y]) * tau(x, y, lh, la, p.rho);
    M[x * (MAXG + 1) + y] = v; s += v;
  }
  for (let i = 0; i < M.length; i++) M[i] /= s;
  return { M, lh, la };
}
function hda(M) {
  let H = 0, D = 0, A = 0;
  for (let x = 0; x <= MAXG; x++) for (let y = 0; y <= MAXG; y++) {
    const v = M[x * (MAXG + 1) + y];
    if (x > y) H += v; else if (x === y) D += v; else A += v;
  }
  return [H, D, A];
}
const weightFor = (r, rMax, hl) => hl === Infinity ? 1 : Math.pow(0.5, (rMax - r) / hl);

module.exports = { CODES, IDX, T, MAXG, loadData, fit, scoreMatrix, hda, weightFor };
