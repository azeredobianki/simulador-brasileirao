// Validação "rodada a rodada": para cada rodada k de 16 a 30, ajusta com rodadas < k e prevê a rodada k
const M = require('./model.js');
const { played, pending, base, mismatch } = M.loadData(process.argv[2], process.argv[3]);
console.log(`jogados: ${played.length}, pendentes: ${pending.length}, divergências tabela x placares: ${mismatch.join(',') || 'nenhuma'}`);
const outc = g => g.x > g.y ? 0 : g.x === g.y ? 1 : 2;
const freq = [0, 0, 0]; played.forEach(g => freq[outc(g)]++);
console.log('frequência real M/E/V:', freq.map(f => (100 * f / played.length).toFixed(1) + '%').join(' / '));
const draws00 = played.filter(g => g.x === 0 && g.y === 0).length;
console.log(`0x0: ${(100 * draws00 / played.length).toFixed(1)}% | gols/jogo: ${(played.reduce((s, g) => s + g.x + g.y, 0) / played.length).toFixed(2)}`);

function evalCfg(hl, lam) {
  let ll = 0, brier = 0, n = 0, llBase = 0;
  for (let k = 16; k <= 30; k++) {
    const train = played.filter(g => g.r < k).map(g => ({ ...g, w: M.weightFor(g.r, k - 1, hl) }));
    const test = played.filter(g => g.r === k);
    const f = [0, 0, 0]; train.forEach(g => f[outc(g)]++);
    const pb = f.map(v => v / train.length);
    const p = M.fit(train, lam);
    for (const g of test) {
      const pr = M.hda(M.scoreMatrix(p, g.h, g.a).M), o = outc(g);
      ll -= Math.log(pr[o]); llBase -= Math.log(pb[o]);
      brier += pr.reduce((s, v, i) => s + (v - (i === o ? 1 : 0)) ** 2, 0);
      n++;
    }
  }
  return { ll: ll / n, brier: brier / n, llBase: llBase / n, n };
}
console.log(`\nreferência 1/3 cada: logloss ${Math.log(3).toFixed(4)}, brier ${(2 / 3).toFixed(4)}`);
const res = [];
for (const hl of [Infinity, 30, 20, 12])
  for (const lam of [2, 5, 10, 20, 40]) {
    const r = evalCfg(hl, lam);
    res.push({ hl, lam, ...r });
    console.log(`meia-vida ${String(hl).padStart(8)} rodadas | ridge ${String(lam).padStart(3)} | logloss ${r.ll.toFixed(4)} | brier ${r.brier.toFixed(4)} | (só taxa M/E/V: ${r.llBase.toFixed(4)}) n=${r.n}`);
  }
res.sort((a, b) => a.ll - b.ll);
console.log('\nmelhor:', res[0]);
