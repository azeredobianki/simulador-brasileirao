// Gera o JSON embutido na página do simulador
const fs = require('fs');
const { prepare } = require('./realistic.js');
const { CODES } = require('./model.js');
const [wikiPath, turnoPath, oddsPath, roundsPath, outPath, refPath, updated] = process.argv.slice(2);
const prep = prepare(wikiPath, turnoPath, oddsPath);
const names = {CAP:'Athletico-PR',CAM:'Atlético-MG',BAH:'Bahia',BOT:'Botafogo',CHA:'Chapecoense',COR:'Corinthians',CTB:'Coritiba',CRU:'Cruzeiro',FLA:'Flamengo',FLU:'Fluminense',GRE:'Grêmio',INT:'Internacional',MIR:'Mirassol',PAL:'Palmeiras',RBB:'Bragantino',REM:'Remo',SAN:'Santos',SPA:'São Paulo',VAS:'Vasco',VIT:'Vitória'};
const short = {CAP:'CAP',CAM:'CAM',BAH:'BAH',BOT:'BOT',CHA:'CHA',COR:'COR',CTB:'CFC',CRU:'CRU',FLA:'FLA',FLU:'FLU',GRE:'GRE',INT:'INT',MIR:'MIR',PAL:'PAL',RBB:'RBB',REM:'REM',SAN:'SAN',SPA:'SAO',VAS:'VAS',VIT:'VIT'};
// Tabela Detalhada CBF (jogo atrasado e 35-38) — horário de Brasília
const det = `CHA VAS 2026-11-14 sáb 20:30
MIR CAM 2026-11-14 sáb 18:30
CTB SAN 2026-11-18 qua 19:30
REM CHA 2026-11-18 qua 20:00
FLA CAP 2026-11-18 qua 20:30
CRU PAL 2026-11-18 qua 20:30
COR BOT 2026-11-18 qua 21:30
GRE BAH 2026-11-18 qua 21:30
VAS INT 2026-11-19 qui 19:30
VIT RBB 2026-11-19 qui 19:30
SPA FLU 2026-11-19 qui 21:30
PAL FLA 2026-11-21 sáb 16:30
BAH CTB 2026-11-21 sáb 17:30
CHA CRU 2026-11-21 sáb 21:00
CAP REM 2026-11-22 dom 16:00
FLU MIR 2026-11-22 dom 18:30
RBB VAS 2026-11-22 dom 19:30
INT VIT 2026-11-23 seg 19:30
BOT SPA 2026-11-23 seg 20:00
SAN GRE 2026-11-23 seg 21:00
CAM COR 2026-11-25 qua 20:00
CHA PAL 2026-11-24 ter 18:00
SPA REM 2026-11-26 qui 20:00
FLU CRU 2026-11-27 sex 20:00
BOT BAH 2026-11-28 sáb 21:00
CTB FLA 2026-11-29 dom 16:00
VIT SAN 2026-11-29 dom 16:00
COR GRE 2026-11-29 dom 18:30
MIR CAP 2026-11-29 dom 18:30
INT RBB 2026-11-29 dom 18:30
CAM VAS 2026-11-29 dom 19:30
FLA CHA 2026-12-02 qua 21:30
VAS VIT 2026-12-02 qua 21:30
SAN BOT 2026-12-02 qua 21:30
PAL CTB 2026-12-02 qua 21:30
RBB FLU 2026-12-02 qua 21:30
CRU INT 2026-12-02 qua 21:30
GRE MIR 2026-12-02 qua 21:30
CAP SPA 2026-12-02 qua 21:30
BAH CAM 2026-12-02 qua 21:30
REM COR 2026-12-02 qua 21:30`.split('\n').map(l => l.split(' '));
const when = {};
det.forEach(([h, a, d, wd, hr], i) => { const [, m, dd] = d.split('-'); when[`${h}-${a}`] = { k: i, label: `${wd} ${dd}/${m} · ${hr}` }; });
const roundDates = { 35: '14 a 19/11', 36: '21 a 25/11', 37: '24 a 29/11', 38: 'qua 02/12' };
fs.readFileSync(roundsPath, 'utf8').trim().split(/\r?\n/).map(l => l.trim().split(/\s+/)).forEach(([r, h, a], i) => {
  const k = `${h}-${a}`;
  if (!when[k]) when[k] = { k: r === '21' ? 9999 : 1000 + i, label: r === '21' ? 'data a definir' : 'horário a definir' };
});
const r4 = v => Math.round(v * 1e4) / 1e4;
const games = prep.pending.map(g => ({ id: `${g.hc}-${g.ac}`, r: g.r, h: g.h, a: g.a, k: when[`${g.hc}-${g.ac}`].k, when: when[`${g.hc}-${g.ac}`].label,
  mk: prep.marketLam[`${g.hc}-${g.ac}`] ? prep.marketLam[`${g.hc}-${g.ac}`].map(r4) : null, lm: prep.lam[prep.pending.indexOf(g)].map(r4) }))
  .sort((x, y) => x.k - y.k);
const data = {
  updated, played: prep.played.length,
  ref: (() => { const r = JSON.parse(fs.readFileSync(refPath, 'utf8')); return { N: r.N, pos: r.posCount, lib: r.libTot }; })(),
  teams: CODES.map((c, t) => ({ c, n: names[c], s: short[c], ...prep.base[t] })),
  games, roundDates,
  // resultados reais, para comparar com os palpites salvos no navegador
  results: prep.played.map(g => [`${g.hc}-${g.ac}`, g.r, g.x, g.y]),
  rho: r4(prep.full.rho),
  sets: prep.sets.map(p => [r4(p.mu), r4(p.home), ...p.att.map(r4), ...p.def.map(r4)]),
  h2h: Array.from(prep.h2h),
};
fs.writeFileSync(outPath, JSON.stringify(data));
console.log('ok', games.length, 'jogos', (JSON.stringify(data).length / 1024).toFixed(0) + 'KB');
