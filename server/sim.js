// 随机机器人自对弈测试：node server/sim.js [局数]
const { Game, RuleError, GUEST_BY_ID, EMP_BY_ID } = require('./game');
const D = require('./data');
const R = a => a[Math.floor(Math.random() * a.length)];

function tryDo(g, pi, msg) {
  try { g.handle(pi, msg); return true; }
  catch (e) { if (e instanceof RuleError) return false; throw e; }
}
function resolve(g, pi) {
  const p = g.players[pi]; const t = p.pending[0];
  const cells = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) cells.push([r, c]);
  switch (t.k) {
    case 'food': return tryDo(g, pi, { type: 'pend', assign: t.tokens.map(c => { const s = p.cafe.findIndex(x => x && g.remaining(x).includes(c)); return s; }) }) || tryDo(g, pi, { type: 'pend', assign: [] });
    case 'anyFood': return tryDo(g, pi, { type: 'pend', colors: Array.from({ length: t.n }, () => R(D.FOOD)) });
    case 'act12': { const a = Math.ceil(t.n / 2); return tryDo(g, pi, { type: 'pend', a, b: t.n - a }); }
    case 'act4': { const r = Math.floor(Math.random() * (t.n + 1)); return tryDo(g, pi, { type: 'pend', royal: r, money: t.n - r }); }
    case 'act6': return tryDo(g, pi, { type: 'pend', action: 1 + Math.floor(Math.random() * 5) });
    case 'rooms': for (const [r, c] of cells.sort(() => Math.random() - .5)) if (tryDo(g, pi, { type: 'pend', r, c })) return true; return tryDo(g, pi, { type: 'pend', done: true });
    case 'flip': for (const [r, c] of cells) if (tryDo(g, pi, { type: 'pend', r, c })) return true; return tryDo(g, pi, { type: 'pend', skip: true });
    case 'play': for (const id of p.hand) if (tryDo(g, pi, { type: 'pend', id })) return true; return tryDo(g, pi, { type: 'pend', skip: true });
    case 'd3p': for (const id of t.cards) if (tryDo(g, pi, { type: 'pend', id })) return true; return tryDo(g, pi, { type: 'pend', skip: true });
    case 'guest': return tryDo(g, pi, { type: 'pend', i: 4 }) || tryDo(g, pi, { type: 'pend', skip: true });
    case 'deliver': return tryDo(g, pi, { type: 'pend', slot: p.cafe.findIndex(x => x && !g.satisfied(x)) });
    case 'choice': return tryDo(g, pi, { type: 'pend', code: R(t.opts).code });
    case 'ret': return tryDo(g, pi, { type: 'pend', ids: p.hand.slice(0, t.n) });
    case 'discEnd': return tryDo(g, pi, { type: 'pend', id: p.played.find(e => EMP_BY_ID[e.id].type === 'end').id });
  }
  throw new Error('unknown pending ' + t.k);
}

function playGame(n, side) {
  const g = new Game(Array.from({ length: n }, (_, i) => ({ name: 'P' + i })), { side, empVariant: Math.random() < .5 ? 'starter' : 'random' });
  let steps = 0;
  while (g.phase !== 'ended') {
    if (++steps > 20000) throw new Error('stuck in phase ' + g.phase + ' ' + JSON.stringify(g.turn));
    // 任何有待处理步骤的玩家
    let acted = false;
    for (let i = 0; i < n; i++) {
      const p = g.players[i];
      if (p.pending.length && (g.phase !== 'play' || g.turn.p === i)) { if (!resolve(g, i)) throw new Error('cannot resolve ' + JSON.stringify(p.pending[0])); acted = true; break; }
    }
    if (acted) continue;
    if (g.phase === 'setupGuests') { if (!tryDo(g, g.turn.p, { type: 'takeGuest', i: Math.floor(Math.random() * 5) })) throw new Error('setup'); continue; }
    if (g.phase !== 'play') throw new Error('phase ' + g.phase + ' with no pending');
    const pi = g.turn.p, p = g.players[pi], T = g.turn;
    // 入住
    let did = false;
    for (let s = 0; s < 3 && !did; s++) for (let r = 0; r < 4 && !did; r++) for (let c = 0; c < 5 && !did; c++) if (p.cafe[s] && g.satisfied(p.cafe[s])) did = tryDo(g, pi, { type: 'checkin', slot: s, r, c });
    if (did) continue;
    for (const pc of g.politics) if (!did && g.politicsOk(p, pc.id)) did = tryDo(g, pi, { type: 'politic', id: pc.id });
    if (did) continue;
    for (const e of p.played) if (!did && !e.used && EMP_BY_ID[e.id].type === 'round') did = tryDo(g, pi, { type: 'useEmp', id: e.id });
    if (did) continue;
    // 上菜
    if (Math.random() < .5) {
      const moves = [];
      const kit = Object.assign({}, p.kitchen);
      p.cafe.forEach((x, s) => { if (x) for (const c of g.remaining(x)) if (kit[c] > 0 && moves.length < 3) { kit[c]--; moves.push({ c, s }); } });
      if (moves.length && tryDo(g, pi, { type: 'serve', moves })) continue;
    }
    if (!T.guestTaken && !T.dieTaken && !T.bonus && Math.random() < .7) { if (tryDo(g, pi, { type: 'takeGuest', i: 2 + Math.floor(Math.random() * 3) })) continue; }
    if (!T.dieTaken && !T.bonus) {
      if (Math.random() < .05 && !T.guestTaken) { tryDo(g, pi, { type: 'skip' }); continue; }
      const vs = [1, 2, 3, 4, 5, 6].filter(v => g.dice[v]);
      if (tryDo(g, pi, { type: 'takeDie', v: R(vs), boost: Math.random() < .2 })) continue;
      if (tryDo(g, pi, { type: 'takeDie', v: vs.find(v => v !== 6) || 6 })) continue;
      if (!tryDo(g, pi, { type: 'skip' })) throw new Error('cannot take die nor skip');
      continue;
    }
    if (!tryDo(g, pi, { type: 'endTurn' })) throw new Error('cannot end turn ' + JSON.stringify(p.pending));
  }
  return g;
}

const N = +process.argv[2] || 200;
const scores = [];
for (let k = 0; k < N; k++) {
  const n = 2 + (k % 3);
  const g = playGame(n, k % 2 ? 'sun' : 'moon');
  scores.push(...g.players.map(p => p.score));
  // 简单的序列化检查（视图）
  JSON.stringify(g.view(0));
}
console.log('ok games', N, 'avg score', (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1), 'max', Math.max(...scores), 'min', Math.min(...scores));
