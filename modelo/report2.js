const fs = require('fs');
const Mdl = require('./model.js');
const R = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const U = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')); // resultado do modelo 1/3
const { N, codes, games, hda, cnt, rel, decisive, flip, relTot, ptsSum, posCount, strength } = R;
const T = codes.length;
const nm = {CAP:'Athletico',CAM:'Atlético-MG',BAH:'Bahia',BOT:'Botafogo',CHA:'Chapecoense',COR:'Corinthians',CTB:'Coritiba',CRU:'Cruzeiro',FLA:'Flamengo',FLU:'Fluminense',GRE:'Grêmio',INT:'Internacional',MIR:'Mirassol',PAL:'Palmeiras',RBB:'Bragantino',REM:'Remo',SAN:'Santos',SPA:'São Paulo',VAS:'Vasco',VIT:'Vitória'};
const pc = (x, d = 1) => (100 * x).toFixed(d) + '%';
const uni = Object.fromEntries(U.out.map(o => [o.code, o.rel]));

// calibração de empates nos jogos já disputados
const { played } = Mdl.loadData(process.argv[4], process.argv[5]);
const p = Mdl.fit(played.map(g => ({ ...g, w: 1 })), 10);
const avg = [0, 0, 0]; played.forEach(g => Mdl.hda(Mdl.scoreMatrix(p, g.h, g.a).M).forEach((v, i) => avg[i] += v / played.length));
console.log('calibração (modelo vs real) M/E/V:', avg.map(v => pc(v)).join(' / '), '| real 47.5% / 28.1% / 24.4%');
console.log(`desempate por confronto direto usado em ${pc(R.h2hUsed / N, 2)} das simulações\n`);

console.log('Força (gols esperados vs time médio, campo neutro): ataque x / defesa (gols sofridos) x');
const teams = codes.map((c, t) => ({ c, t, rel: relTot[t] / N, uni: uni[c], ep: ptsSum[t] / N, b: R.base[t], att: Math.exp(strength[t].att), def: Math.exp(-strength[t].def) }));
teams.sort((a, b) => b.rel - a.rel || a.ep - b.ep);
for (const x of teams) {
  const P = 3 * x.b.W + x.b.D;
  console.log(`${nm[x.c].padEnd(13)} ${String(P).padStart(2)} pts -> esperado ${x.ep.toFixed(1)} | ataque x${x.att.toFixed(2)} defesa x${x.def.toFixed(2)} | cai ${pc(x.rel, 2).padStart(7)} (modelo 1/3: ${pc(x.uni, 2)})`);
}
const atRisk = teams.filter(x => x.rel > 0.0005);
// importância: quanto o resultado do jogo move as chances de queda (soma, em p.p., ponderada pela prob. do resultado)
const rows = games.map((g, i) => {
  const cond = o => codes.map((c, t) => cnt[i * 3 + o] ? rel[(i * 3 + o) * T + t] / cnt[i * 3 + o] : 0);
  const C = [cond(0), cond(1), cond(2)];
  const po = [0, 1, 2].map(o => cnt[i * 3 + o] / N);
  let lev = 0;
  for (let t = 0; t < T; t++) for (let o = 0; o < 3; o++) lev += po[o] * Math.abs(C[o][t] - relTot[t] / N);
  const tops = codes.map((c, t) => ({ c, t, f: flip[i * T + t] / N })).sort((a, b) => b.f - a.f).filter(x => x.f > 0.003).slice(0, 2);
  return { ...g, i, dec: decisive[i] / N, lev, po, C, tops };
});
const fmtRow = x => {
  const eff = x.tops.map(o => `${nm[o.c]} ${pc(x.C[0][o.t], 0)}/${pc(x.C[1][o.t], 0)}/${pc(x.C[2][o.t], 0)}`).join(' · ');
  return `${(nm[x.h] + ' x ' + nm[x.a]).padEnd(27)} M/E/V ${pc(x.po[0], 0)}/${pc(x.po[1], 0)}/${pc(x.po[2], 0)} | decide ${pc(x.dec).padStart(5)} | mexe ${(100 * x.lev).toFixed(1).padStart(4)} p.p. | ${eff}`;
};
console.log('\n=== TOP 15 jogos mais importantes ===');
[...rows].sort((a, b) => b.lev - a.lev).slice(0, 15).forEach((x, k) => console.log(`${String(k + 1).padStart(2)}. R${x.r} ${fmtRow(x)}`));
for (const r of [...new Set(rows.map(x => x.r))]) {
  console.log(`\n--- Rodada ${r} ---`);
  rows.filter(x => x.r === r).sort((a, b) => b.lev - a.lev).forEach(x => console.log(fmtRow(x)));
}
fs.writeFileSync(process.argv[6], JSON.stringify({ teams, rows: rows.map(x => ({ r: x.r, h: x.h, a: x.a, dec: x.dec, lev: x.lev, po: x.po, C: x.C.map(v => Object.fromEntries(atRisk.map(t => [t.c, v[t.t]]))) })) }));
