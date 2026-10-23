// Gera o JSON embutido na página do simulador
const fs = require('fs');
const { prepare } = require('./realistic.js');
const { CODES } = require('./model.js');
const [wikiPath, turnoPath, oddsPath, roundsPath, outPath, refPath, updated] = process.argv.slice(2);
const prep = prepare(wikiPath, turnoPath, oddsPath);
const names = {CAP:'Athletico-PR',CAM:'Atlético-MG',BAH:'Bahia',BOT:'Botafogo',CHA:'Chapecoense',COR:'Corinthians',CTB:'Coritiba',CRU:'Cruzeiro',FLA:'Flamengo',FLU:'Fluminense',GRE:'Grêmio',INT:'Internacional',MIR:'Mirassol',PAL:'Palmeiras',RBB:'Bragantino',REM:'Remo',SAN:'Santos',SPA:'São Paulo',VAS:'Vasco',VIT:'Vitória'};
const short = {CAP:'CAP',CAM:'CAM',BAH:'BAH',BOT:'BOT',CHA:'CHA',COR:'COR',CTB:'CFC',CRU:'CRU',FLA:'FLA',FLU:'FLU',GRE:'GRE',INT:'INT',MIR:'MIR',PAL:'PAL',RBB:'RBB',REM:'REM',SAN:'SAN',SPA:'SAO',VAS:'VAS',VIT:'VIT'};
// Tabela Detalhada CBF (31-34) — horário de Brasília
const det = `MIR INT 2026-10-16 sex 20:00
BOT CHA 2026-10-17 sáb 18:00
CAM CTB 2026-10-17 sáb 18:30
CAP PAL 2026-10-17 sáb 19:30
SPA VAS 2026-10-17 sáb 21:00
FLU SAN 2026-10-18 dom 16:00
GRE CRU 2026-10-18 dom 16:00
BAH FLA 2026-10-18 dom 18:30
REM RBB 2026-10-18 dom 19:30
COR VIT 2026-10-19 seg 20:00
CRU REM 2026-10-23 sex 20:00
MIR SPA 2026-10-24 sáb 16:30
INT BOT 2026-10-24 sáb 16:30
VIT CAP 2026-10-24 sáb 16:30
VAS COR 2026-10-24 sáb 18:30
PAL RBB 2026-10-24 sáb 18:30
CHA FLU 2026-10-24 sáb 19:30
SAN BAH 2026-10-24 sáb 21:00
CTB GRE 2026-10-26 seg 19:30
FLA CAM 2026-10-26 seg 20:00
FLU INT 2026-10-28 qua 19:30
SAN PAL 2026-10-28 qua 19:30
RBB CHA 2026-10-28 qua 19:30
BAH SPA 2026-10-28 qua 21:30
REM BOT 2026-10-28 qua 21:30
CAM CRU 2026-10-29 qui 19:30
CTB VIT 2026-10-29 qui 19:30
VAS FLA 2026-10-29 qui 20:00
GRE CAP 2026-10-29 qui 21:30
COR MIR 2026-10-30 sex 20:00
RBB SAN 2026-11-02 seg 20:00
CHA MIR 2026-11-03 ter 19:30
INT CTB 2026-11-03 ter 21:30
FLA GRE 2026-11-04 qua 19:30
CAP VAS 2026-11-04 qua 19:30
BOT CAM 2026-11-04 qua 21:30
SPA COR 2026-11-04 qua 21:30
PAL REM 2026-11-05 qui 19:30
CRU BAH 2026-11-05 qui 21:30
VIT FLU 2026-11-06 sex 20:00`.split('\n').map(l => l.split(' '));
const when = {};
det.forEach(([h, a, d, wd, hr], i) => { const [, m, dd] = d.split('-'); when[`${h}-${a}`] = { k: i, label: `${wd} ${dd}/${m} · ${hr}` }; });
const roundDates = { 35: 'qua 18 ou qui 19/11', 36: '21 a 23/11', 37: 'sáb 28 ou dom 29/11', 38: 'qua 02/12' };
fs.readFileSync(roundsPath, 'utf8').trim().split(/\r?\n/).map(l => l.trim().split(/\s+/)).forEach(([r, h, a], i) => {
  const k = `${h}-${a}`;
  if (!when[k]) when[k] = { k: r === '21' ? 9999 : 1000 + i, label: r === '21' ? 'data a definir' : 'horário a definir' };
});
const r4 = v => Math.round(v * 1e4) / 1e4;
const games = prep.pending.map(g => ({ id: `${g.hc}-${g.ac}`, r: g.r, h: g.h, a: g.a, k: when[`${g.hc}-${g.ac}`].k, when: when[`${g.hc}-${g.ac}`].label,
  mk: prep.marketLam[`${g.hc}-${g.ac}`] ? prep.marketLam[`${g.hc}-${g.ac}`].map(r4) : null }))
  .sort((x, y) => x.k - y.k);
const data = {
  updated, played: prep.played.length,
  ref: (() => { const r = JSON.parse(fs.readFileSync(refPath, 'utf8')); return { N: r.N, pos: r.posCount }; })(),
  teams: CODES.map((c, t) => ({ c, n: names[c], s: short[c], ...prep.base[t] })),
  games, roundDates,
  rho: r4(prep.full.rho),
  sets: prep.sets.map(p => [r4(p.mu), r4(p.home), ...p.att.map(r4), ...p.def.map(r4)]),
  h2h: Array.from(prep.h2h),
};
fs.writeFileSync(outPath, JSON.stringify(data));
console.log('ok', games.length, 'jogos', (JSON.stringify(data).length / 1024).toFixed(0) + 'KB');
