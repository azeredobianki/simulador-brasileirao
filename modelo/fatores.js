// Fatores além da força dos times, usados igualmente pela simulação de referência (Node) e pela página (navegador):
//  1. vagas da Libertadores 2027 que dependem das finais (Libertadores, Sul-Americana e Copa do Brasil);
//  2. chance de escalar reservas perto das finais;
//  3. queda de rendimento de quem não tem mais nada em jogo;
//  4. "entrega": time sem objetivo que relaxa contra o adversário direto do seu rival na briga contra a queda.
// Este arquivo é injetado no worker da página por montar_pagina.js: não use require/import aqui.
const FAT = {
  // Probabilidade de título nas finais. Não há odds publicadas; são estimativas (ver README) e podem ser trocadas
  // por odds de mercado quando saírem.
  finals: {
    lib: { team: 'PAL', p: 0.62, round: 38 },   // Palmeiras x Estudiantes, 28/11, Montevidéu (jogo único)
    sula: { team: 'CAM', p: 0.50, round: 36 },  // Atlético-MG x Boca Juniors, 21/11, Barranquilla (jogo único)
    cdb: { a: 'PAL', b: 'GRE', pA: 0.66 },      // Palmeiras x Grêmio, 06/12, Brasília (jogo único, depois da 38ª)
  },
  // Efeitos no placar, em log da razão de gols: o time afetado perde metade em ataque e o adversário ganha metade.
  // 0,35 ≈ 10 p.p. a menos de vitória num jogo equilibrado; 0,10 ≈ 3 p.p.
  RES: 0.35,   // time reserva/misto
  MOT: 0.10,   // sem nada em jogo contra quem ainda disputa algo
  ENT: 0.35,   // "corpo mole" deliberado
  pEnt: 0.20,  // chance de o corpo mole acontecer quando a situação existe
  // Chance de reservas: p quando o time ainda disputa algo no Brasileirão, pFree quando não disputa mais nada
  reserves: [
    { h: 'PAL', a: 'FLA', team: 'PAL', p: 0.10, pFree: 0.40 }, // 21/11, 7 dias antes da final da Libertadores
    { h: 'CHA', a: 'PAL', team: 'PAL', p: 0.50, pFree: 0.90 }, // 24/11, 4 dias antes da final da Libertadores
    { h: 'PAL', a: 'CTB', team: 'PAL', p: 0.45, pFree: 0.90 }, // 02/12, entre a final da Libertadores e a da Copa do Brasil
    { h: 'CAM', a: 'COR', team: 'CAM', p: 0.40, pFree: 0.80 }, // 25/11, 4 dias depois da final da Sul-Americana
    { h: 'CAM', a: 'VAS', team: 'CAM', p: 0.10, pFree: 0.50 }, // 29/11
    { h: 'COR', a: 'GRE', team: 'GRE', p: 0.05, pFree: 0.60 }, // 29/11, 7 dias antes da final da Copa do Brasil
    { h: 'GRE', a: 'MIR', team: 'GRE', p: 0.10, pFree: 0.85 }, // 02/12, 4 dias antes da final da Copa do Brasil
  ],
  // clássicos: quem não tem objetivo pode facilitar contra o adversário direto do rival na briga contra a queda
  rivals: [['GRE', 'INT'], ['CAM', 'CRU'], ['BAH', 'VIT'], ['CAP', 'CTB'], ['PAL', 'COR'], ['SPA', 'COR'], ['SAN', 'COR'],
    ['PAL', 'SPA'], ['SAN', 'SPA'], ['PAL', 'SAN'], ['FLA', 'FLU'], ['FLA', 'VAS'], ['FLA', 'BOT'], ['FLU', 'VAS'], ['FLU', 'BOT'], ['BOT', 'VAS']],
  ROUND_ORDER: [21, 35, 36, 37, 38],
};

// prepara as estruturas por índice de time/jogo. games: [{h, a, r}] (índices de time), codes: siglas na ordem dos índices
// on: { vagas, reservas, motivacao, entrega } liga/desliga cada fator (para medir o impacto)
function fatSetup(codes, games, on) {
  const T = codes.length, I = Object.fromEntries(codes.map((c, i) => [c, i])), G = games.length;
  const ord = FAT.ROUND_ORDER;
  const blockOf = g => { const k = ord.indexOf(games[g].r); return k < 0 ? ord.length : k; };
  const order = Array.from({ length: G }, (_, g) => g).sort((x, y) => blockOf(x) - blockOf(y) || x - y);
  const block = order.map(blockOf);
  // jogos restantes de cada time a partir de cada bloco
  const nb = ord.length + 1, rem = new Int32Array(nb * T);
  for (let g = 0; g < G; g++) for (let b = 0; b <= blockOf(g); b++) { rem[b * T + games[g].h]++; rem[b * T + games[g].a]++; }
  const res = new Array(G).fill(null);
  if (on.reservas) for (const e of FAT.reserves) {
    const g = games.findIndex(x => x.h === I[e.h] && x.a === I[e.a]);
    if (g >= 0) res[g] = { t: I[e.team], p: e.p, pFree: e.pFree };
  }
  const rivalOf = Array.from({ length: T }, () => []);
  for (const [x, y] of FAT.rivals) { rivalOf[I[x]].push(I[y]); rivalOf[I[y]].push(I[x]); }
  const F = FAT.finals;
  return { T, G, order, block, rem, nb, res, rivalOf, on,
    L: I[F.lib.team], pL: F.lib.p, lRound: F.lib.round, S: I[F.sula.team], pS: F.sula.p, sRound: F.sula.round,
    CA: I[F.cdb.a], CB: I[F.cdb.b], pCA: F.cdb.pA };
}

// situação de cada time no início de um bloco de jogos (só pontos e jogos restantes, sem desempates: conservador)
// st[t]: bit0 ainda pode cair, bit1 já caiu, bit2 ainda pode ser campeão, bit3 ainda disputa vaga, bit4 tem algo em jogo
function fatState(fs, b, pts, fin, roundNow, st) {
  const T = fs.T, rem = fs.rem;
  for (let t = 0; t < T; t++) {
    const mx = pts[t] + 3 * rem[b * T + t];
    let below = 0, above = 0, abovePossible = 0;
    for (let q = 0; q < T; q++) {
      if (q === t) continue;
      const mq = pts[q] + 3 * rem[b * T + q];
      if (mq < pts[t]) below++;           // q não alcança t
      if (pts[q] > mx) above++;           // q já está fora do alcance de t
      if (mq >= pts[t]) abovePossible++;  // q ainda pode terminar à frente
    }
    const canFall = below < 4 && above < 16, fell = above >= 16;
    const canTitle = above === 0;
    // vaga: ainda pode entrar no G9 (maior zona possível) e não tem G4 garantido nem título continental já conquistado
    const qualifiedByTitle = (fin.L && t === fs.L && roundNow >= fs.lRound) || (fin.S && t === fs.S && roundNow >= fs.sRound);
    const canLib = above < 9 && abovePossible >= 4 && !qualifiedByTitle;
    st[t] = (canFall ? 1 : 0) | (fell ? 2 : 0) | (canTitle ? 4 : 0) | (canLib ? 8 : 0) | (canFall || canTitle || canLib ? 16 : 0);
  }
}

// deslocamento (log da razão de gols contra o mandante) de um jogo, dado o estado; rnd para os sorteios
function fatShift(fs, g, h, a, st, rnd) {
  const on = fs.on;
  let dh = 0, da = 0;
  const r = fs.res[g];
  if (r) {
    const has = st[r.t] & 16;
    if (rnd() < (has ? r.p : r.pFree)) { if (r.t === h) dh += FAT.RES; else da += FAT.RES; }
  }
  const sh = st[h] & 16, sa = st[a] & 16;
  if (on.motivacao) {
    if (!sh && sa && !fs.rivalOf[h].includes(a)) dh += FAT.MOT;
    if (!sa && sh && !fs.rivalOf[a].includes(h)) da += FAT.MOT;
  }
  if (on.entrega) {
    // time sem objetivo X contra Y: se Y briga contra a queda com o rival R de X, X pode facilitar
    const ent = (x, y) => { if (st[x] & 16 || !(st[y] & 1)) return false; for (const R of fs.rivalOf[x]) if (R !== y && st[R] & 1) return true; return false; };
    if (ent(h, a) && rnd() < FAT.pEnt) dh += FAT.ENT;
    if (ent(a, h) && rnd() < FAT.pEnt) da += FAT.ENT;
  }
  return dh - da;
}

// sorteio das finais: L e S (o time brasileiro é campeão?), C = campeão da Copa do Brasil, V = vice
function fatFinals(fs, rnd, fin) {
  fin.L = fs.on.vagas && rnd() < fs.pL; fin.S = fs.on.vagas && rnd() < fs.pS;
  const a = rnd() < fs.pCA; fin.C = a ? fs.CA : fs.CB; fin.V = a ? fs.CB : fs.CA;
}

// vagas na Libertadores 2027. byPos[p] = time na posição p (0 = campeão). Devolve [máscara de vaga, máscara de fase de grupos, zona do Brasileirão]
// Regras: G4 + campeão da Copa do Brasil na fase de grupos; 5º e vice da Copa na preliminar. Campeões da Libertadores e da
// Sul-Americana ganham vaga extra na fase de grupos. Vaga de quem já está classificado passa adiante na tabela; se o campeão
// da Copa já tem vaga, o vice sobe para a fase de grupos. Rebaixado não disputa a Libertadores.
function fatLib(fs, byPos, fin) {
  if (!fs.on.vagas) { let m = 0, gm = 0; for (let p = 0; p < 5; p++) { m |= 1 << byPos[p]; if (p < 4) gm |= 1 << byPos[p]; } return [m, gm, 5]; }
  let rel = 0; for (let p = 16; p < 20; p++) rel |= 1 << byPos[p];
  const GS = 5 + (fin.L ? 1 : 0) + (fin.S ? 1 : 0), TOT = GS + 2;
  let m = 0, gm = 0, nG = 0, n = 0, zone = 0;
  const add = t => { if (m >> t & 1) return false; m |= 1 << t; n++; if (nG < GS) { gm |= 1 << t; nG++; } return true; };
  if (fin.L) add(fs.L);
  if (fin.S) add(fs.S);
  if (!(rel >> fin.C & 1)) add(fin.C);
  for (let p = 0; p < 4; p++) { add(byPos[p]); zone = p + 1; }
  if (!(rel >> fin.V & 1)) add(fin.V);
  for (let p = 4; p < 16 && n < TOT; p++) if (add(byPos[p])) zone = p + 1;
  return [m, gm, zone];
}

if (typeof module !== 'undefined') module.exports = { FAT, fatSetup, fatState, fatShift, fatFinals, fatLib };
