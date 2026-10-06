// 奥地利大饭店 — 规则引擎（服务器权威）
const D = require('./data');
const { FOOD, FOOD_NAME, FREE } = D;

const GUEST_BY_ID = Object.fromEntries(D.GUESTS.map(g => [g.id, g]));
const EMP_BY_ID = Object.fromEntries(D.EMPLOYEES.map(e => [e.id, e]));
const COLOR_CN = { blue: '蓝色', yellow: '黄色', red: '红色', green: '绿色' };

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
class RuleError extends Error {}
function fail(msg) { throw new RuleError(msg); }

function computeZones(rows) {
  // 同色相邻客房组成一个区域
  const zoneOf = rows.map(r => r.split('').map(() => -1));
  const zones = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
    if (zoneOf[r][c] >= 0) continue;
    const ch = rows[r][c]; const cells = []; const st = [[r, c]]; zoneOf[r][c] = zones.length;
    while (st.length) {
      const [y, x] = st.pop(); cells.push([y, x]);
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = y + dy, nx = x + dx;
        if (ny < 0 || ny > 3 || nx < 0 || nx > 4) continue;
        if (zoneOf[ny][nx] >= 0 || rows[ny][nx] !== ch) continue;
        zoneOf[ny][nx] = zones.length; st.push([ny, nx]);
      }
    }
    zones.push({ color: D.CELL_COLOR[ch], cells });
  }
  return { zoneOf, zones };
}

class Game {
  constructor(seats, settings) {
    this.settings = Object.assign({ side: 'moon', empVariant: 'starter' }, settings || {});
    const n = seats.length;
    this.n = n;
    this.logs = [];
    this.round = 1;
    this.phase = 'setupGuests';
    this.guestDeck = shuffle(D.GUESTS.map(g => g.id));
    this.guestDiscard = [];
    this.guestRow = [];
    for (let i = 0; i < 5; i++) this.guestRow.push(this.guestDeck.pop());
    // 政务卡与皇室板块：每组随机一张
    this.politics = ['A', 'B', 'C'].map(g => ({ id: pick(D.POLITICS.filter(p => p.grp === g)).id, marks: [] }));
    this.royalTiles = ['A', 'B', 'C'].map(g => pick(D.ROYAL_TILES.filter(p => p.grp === g)).id);
    this.dice = [0, 0, 0, 0, 0, 0, 0];
    this.totalDice = D.DICE_BY_PLAYERS[n];
    this.trash = 0;
    // 起始玩家随机；按座位顺时针分配回合顺位板块
    const start = Math.floor(Math.random() * n);
    const sides = ['A', 'B', 'C', 'D'];
    this.players = seats.map((s, i) => {
      const side = this.settings.side === 'sun' ? sides[i] : 'moon';
      const rows = D.BOARDS[side];
      const z = computeZones(rows);
      return {
        name: s.name, color: D.PLAYER_COLORS[i], side, rows,
        zoneOf: z.zoneOf, zones: z.zones, zonesClaimed: [],
        money: 10, royal: 0, score: 0,
        kitchen: { brown: 1, white: 1, red: 1, black: 1 },
        cafe: [null, null, null],
        rooms: [0, 1, 2, 3].map(() => [null, null, null, null, null]),
        hand: [], played: [], politics: [],
        tile: null, covered: [false, false],
        pending: [], final: null, left: false, leftScore: null,
      };
    });
    const T = D.TURN_TILES[n];
    for (let k = 0; k < n; k++) this.players[(start + k) % n].tile = T[k].slice();
    // 员工卡
    let deck = D.EMPLOYEES.map(e => e.id);
    if (this.settings.empVariant === 'starter') {
      const letters = ['A', 'B', 'C', 'D'];
      for (let k = 0; k < n; k++) {
        const p = this.players[(start + k) % n];
        p.hand = D.STARTER_SETS[letters[k]].slice();
        deck = deck.filter(id => !p.hand.includes(id));
      }
      this.empDeck = shuffle(deck);
    } else {
      this.empDeck = shuffle(deck);
      for (const p of this.players) p.hand = this.empDeck.splice(0, 6);
    }
    this.log(`游戏开始！起始玩家：${this.players[start].name}`);
    this.log(`政务卡：${this.politics.map(p => p.id).join(' / ')}；皇室板块：${this.royalTiles.join(' / ')}`);
    // 准备阶段：从末位玩家开始逆时针选择宾客
    this.setupOrder = this.players.map((p, i) => i).sort((a, b) => this.players[b].tile[0] - this.players[a].tile[0]);
    this.setupIdx = 0;
    this.turn = { p: this.setupOrder[0] };
    this.waiting = new Set();
    this.version = 0;
  }

  // ---------- 工具 ----------
  log(s) { this.logs.push({ r: this.round, s }); if (this.logs.length > 400) this.logs.shift(); }
  has(p, id) { return p.played.some(x => x.id === id); }
  addMoney(p, n) { p.money = Math.max(0, Math.min(D.MONEY_MAX, p.money + n)); }
  addPts(p, n) { p.score += n; }
  addRoyal(p, n) {
    p.royal += n;
    if (p.royal > 13) { const extra = p.royal - 13; p.royal = 13; p.score += extra; }
    if (p.royal < 0) p.royal = 0;
  }
  drawEmp(n) {
    const out = [];
    for (let i = 0; i < n && this.empDeck.length; i++) out.push(this.empDeck.shift());
    return out;
  }
  drawGuest() {
    if (!this.guestDeck.length && this.guestDiscard.length) { this.guestDeck = shuffle(this.guestDiscard); this.guestDiscard = []; }
    return this.guestDeck.pop() || null;
  }
  takeFromRow(i) {
    const id = this.guestRow[i];
    for (let k = i; k > 0; k--) this.guestRow[k] = this.guestRow[k - 1];
    this.guestRow[0] = this.drawGuest();
    return id;
  }
  remaining(g) {
    const need = GUEST_BY_ID[g.id].req.slice();
    for (const c of g.filled) { const k = need.indexOf(c); if (k >= 0) need.splice(k, 1); }
    return need;
  }
  satisfied(g) { return g && this.remaining(g).length === 0; }
  countRooms(p, pred) { let k = 0; for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) if (pred(p.rooms[r][c], r, c)) k++; return k; }
  occ(p, color) { return this.countRooms(p, (x, r, c) => x && x.s === 'occ' && (!color || D.CELL_COLOR[p.rows[r][c]] === color)); }

  // ---------- 客房 ----------
  canPlace(p, r, c, opts = {}) {
    if (r < 0 || r > 3 || c < 0 || c > 4) return false;
    if (p.rooms[r][c]) return false;
    if (opts.maxFloor != null && r > opts.maxFloor) return false;
    const any = p.rooms.some(row => row.some(x => x));
    if (!any) return r === 0 && c === 0;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dy, dx]) => {
      const y = r + dy, x = c + dx; return y >= 0 && y <= 3 && x >= 0 && x <= 4 && p.rooms[y][x];
    });
  }
  roomCost(p, r, c, d) {
    const color = D.CELL_COLOR[p.rows[r][c]];
    if (d >= FREE) return 0;
    if ((color === 'blue' && this.has(p, 9)) || (color === 'red' && this.has(p, 10)) || (color === 'yellow' && this.has(p, 11))) return 0;
    return Math.max(0, D.FLOOR_COST[r] - (d || 0));
  }
  anyPlaceable(p, task) {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++)
      if (this.canPlace(p, r, c, task) && this.roomCost(p, r, c, task.d) <= p.money) return true;
    return false;
  }
  placeRoom(p, r, c, task) {
    if (!this.canPlace(p, r, c, task)) fail('这里不能放置客房（必须从左下角开始，并与已有客房相邻）');
    const cost = this.roomCost(p, r, c, task.d);
    if (cost > p.money) fail('克朗不足');
    p.money -= cost;
    p.rooms[r][c] = { s: task.occupy ? 'occ' : 'ready' };
    const pts = D.ROOM_PTS[`${r}-${c}`] || 0;
    if (pts) this.addPts(p, pts);
    this.log(`${p.name} 准备了${COLOR_CN[D.CELL_COLOR[p.rows[r][c]]]}客房 ${r + 1}${String(c + 1).padStart(2, '0')}${cost ? `（-${cost}克朗）` : '（免费）'}${pts ? ` +${pts}分` : ''}${task.occupy ? '，并立即入住' : ''}`);
    if (task.occupy) this.checkZones(p);
  }
  flipRoom(p, r, c) {
    const x = p.rooms[r] && p.rooms[r][c];
    if (!x || x.s !== 'ready') fail('只能翻转已准备（空闲）的客房');
    x.s = 'occ';
    this.checkZones(p);
  }
  checkZones(p) {
    p.zones.forEach((z, zi) => {
      if (p.zonesClaimed.includes(zi)) return;
      if (!z.cells.every(([r, c]) => p.rooms[r][c] && p.rooms[r][c].s === 'occ')) return;
      p.zonesClaimed.push(zi);
      const v = D.ZONE_REWARD[z.color][Math.min(4, z.cells.length) - 1];
      if (z.color === 'blue') { this.addPts(p, v); this.log(`${p.name} 完成蓝色区域（${z.cells.length}间）：+${v}分`); }
      if (z.color === 'red') { this.addMoney(p, v); this.log(`${p.name} 完成红色区域（${z.cells.length}间）：+${v}克朗`); }
      if (z.color === 'yellow') { this.addRoyal(p, v); this.log(`${p.name} 完成黄色区域（${z.cells.length}间）：皇室+${v}`); }
    });
  }

  // ---------- 效果与待处理任务 ----------
  pushTask(p, t, front = false) { if (front) p.pending.unshift(t); else p.pending.push(t); }
  applyFx(p, fx, front = false) {
    const tasks = [];
    for (const e of fx) {
      switch (e.t) {
        case 'royal': this.addRoyal(p, e.n); break;
        case 'money': this.addMoney(p, e.n); break;
        case 'pts': this.addPts(p, e.n); break;
        case 'food': tasks.push({ k: 'food', tokens: Array(e.n).fill(e.c) }); break;
        case 'anyFood': tasks.push({ k: 'anyFood', n: e.n }); break;
        case 'draw': { const got = this.drawEmp(e.n); p.hand.push(...got); this.log(`${p.name} 抽了${got.length}张员工卡`); break; }
        case 'play': tasks.push({ k: 'play', d: e.d }); break;
        case 'd3p': tasks.push({ k: 'd3p', d: e.d }); break;
        case 'room': tasks.push({ k: 'rooms', n: e.n || 1, d: e.d, placed: 0 }); break;
        case 'roomLow': tasks.push({ k: 'rooms', n: 1, d: FREE, maxFloor: 1, placed: 0 }); break;
        case 'roomOcc': tasks.push({ k: 'rooms', n: 1, d: FREE, maxFloor: e.maxFloor, occupy: true, placed: 0 }); break;
        case 'flip': tasks.push({ k: 'flip', n: e.n, done: 0 }); break;
        case 'guest': tasks.push({ k: 'guest' }); break;
        case 'deliver': tasks.push({ k: 'deliver' }); break;
        case 'extraTurn': if (this.turn) this.turn.extraTurn = true; break;
      }
    }
    if (front) p.pending.unshift(...tasks); else p.pending.push(...tasks);
    this.normalize(p);
  }
  gainFood(p, tokens, front = false) { if (tokens.length) this.pushTask(p, { k: 'food', tokens }, front); }

  // 自动处理无法执行或无需选择的任务
  normalize(p) {
    for (let guard = 0; guard < 50 && p.pending.length; guard++) {
      const t = p.pending[0];
      let drop = false;
      switch (t.k) {
        case 'food': {
          const needy = p.cafe.some(g => g && this.remaining(g).some(c => t.tokens.includes(c)));
          if (!needy) { for (const c of t.tokens) p.kitchen[c]++; drop = true; this.log(`${p.name} 获得 ${t.tokens.map(c => FOOD_NAME[c]).join('、')}（放入厨房）`); }
          break;
        }
        case 'rooms': if (!this.anyPlaceable(p, t)) { if (t.placed === 0 && !t.setup) this.log(`${p.name} 没有可放置（或负担得起）的客房位置`); drop = true; } break;
        case 'flip': if (!this.countRooms(p, x => x && x.s === 'ready')) drop = true; break;
        case 'play': if (!p.hand.some(id => this.empCost(p, id, t.d) <= p.money)) drop = true; break;
        case 'd3p': if (!t.cards) { t.cards = this.drawEmp(3); } if (!t.cards.length) drop = true; break;
        case 'guest': if (!p.cafe.includes(null) || !this.guestRow.some(x => x)) drop = true; break;
        case 'deliver': if (!p.cafe.some(g => g && !this.satisfied(g))) drop = true; break;
        case 'ret': if (!p.hand.length) drop = true; else if (p.hand.length <= t.n) { this.empDeck.push(...p.hand); this.log(`${p.name} 将${p.hand.length}张手牌放回牌堆底`); p.hand = []; drop = true; } break;
        case 'act4': if (t.both) { this.addRoyal(p, t.n); this.addMoney(p, t.n); this.log(`${p.name} 皇室+${t.n}，资金+${t.n}（擦鞋匠）`); drop = true; } break;
      }
      if (drop) p.pending.shift(); else break;
    }
  }
  empCost(p, id, d) { if (d >= FREE) return 0; return Math.max(0, EMP_BY_ID[id].cost - (d || 0)); }
  playEmployee(p, id, d) {
    const i = p.hand.indexOf(id);
    if (i < 0) fail('手牌中没有这张员工');
    const cost = this.empCost(p, id, d);
    if (cost > p.money) fail('克朗不足');
    p.money -= cost;
    p.hand.splice(i, 1);
    const e = EMP_BY_ID[id];
    p.played.push({ id, used: false });
    this.log(`${p.name} 雇用了【${e.name}】${cost ? `（-${cost}克朗）` : '（免费）'}`);
    if (e.type === 'once') this.applyFx(p, e.fx, true);
  }

  // ---------- 入住 ----------
  checkIn(p, slot, r, c) {
    const g = p.cafe[slot];
    if (!g) fail('这里没有宾客');
    if (!this.satisfied(g)) fail('宾客的点餐需求还没有满足');
    const room = p.rooms[r] && p.rooms[r][c];
    if (!room || room.s !== 'ready') fail('请选择一间空闲（已准备）的客房');
    const card = GUEST_BY_ID[g.id];
    const rc = D.CELL_COLOR[p.rows[r][c]];
    if (card.color !== 'green' && card.color !== rc) fail(`${COLOR_CN[card.color]}宾客只能入住${COLOR_CN[card.color]}客房`);
    room.s = 'occ';
    p.cafe[slot] = null;
    this.guestDiscard.push(g.id);
    this.addPts(p, card.pts);
    let extra = [];
    if (card.color === 'red' && this.has(p, 5)) { this.addMoney(p, 2); extra.push('马夫+2克朗'); }
    if (card.color === 'blue' && this.has(p, 6)) { this.addRoyal(p, 1); extra.push('饲养员 皇室+1'); }
    if (card.color === 'yellow' && this.has(p, 7)) { this.addMoney(p, 1); extra.push('女按摩师+1克朗'); }
    if (card.color === 'green' && this.has(p, 8)) { this.addPts(p, 2); extra.push('导游+2分'); }
    if (this.has(p, 23)) { this.addMoney(p, 1); extra.push('监管人+1克朗'); }
    if (card.req.length >= 4 && this.has(p, 33)) { this.addPts(p, 4); extra.push('楼层男主管+4分'); }
    this.log(`${p.name} 让【${card.name}】入住客房 ${r + 1}${String(c + 1).padStart(2, '0')}，+${card.pts}分${extra.length ? '；' + extra.join('，') : ''}`);
    this.checkZones(p);
    this.applyFx(p, card.fx, true);
  }

  // ---------- 政务 ----------
  politicsOk(p, id) {
    const fullFloors = [0, 1, 2, 3].filter(r => p.rooms[r].every(x => x && x.s === 'occ')).length;
    const fullCols = [0, 1, 2, 3, 4].filter(c => [0, 1, 2, 3].every(r => p.rooms[r][c] && p.rooms[r][c].s === 'occ')).length;
    const fullZones = p.zones.filter(z => z.cells.every(([r, c]) => p.rooms[r][c] && p.rooms[r][c].s === 'occ')).length;
    const colorAll = ['blue', 'red', 'yellow'].some(col => {
      let tot = 0, ok = 0;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) if (D.CELL_COLOR[p.rows[r][c]] === col) { tot++; if (p.rooms[r][c] && p.rooms[r][c].s === 'occ') ok++; }
      return tot > 0 && tot === ok;
    });
    const R = this.occ(p, 'red'), Y = this.occ(p, 'yellow'), B = this.occ(p, 'blue');
    switch (id) {
      case 'A1': return p.money >= 20;
      case 'A2': return p.royal >= 10;
      case 'A3': return p.played.length >= 6;
      case 'A4': return this.countRooms(p, x => x) >= 12;
      case 'B1': return fullFloors >= 2;
      case 'B2': return fullCols >= 2;
      case 'B3': return fullZones >= 6;
      case 'B4': return colorAll;
      case 'C1': return R >= 3 && Y >= 3 && B >= 3;
      case 'C2': return R >= 4 && Y >= 3;
      case 'C3': return Y >= 4 && B >= 3;
      case 'C4': return B >= 4 && R >= 3;
    }
    return false;
  }

  // ---------- 骰子 ----------
  rollDice(n) {
    this.dice = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) this.dice[1 + Math.floor(Math.random() * 6)]++;
  }
  diceLeft() { return this.dice.reduce((a, b) => a + b, 0); }

  startRound() {
    this.phase = 'play';
    this.rollDice(this.totalDice);
    this.trash = 0;
    this.waiting = new Set();
    for (const p of this.players) { p.covered = p.left ? [true, true] : [false, false]; for (const e of p.played) e.used = false; }
    this.log(`—— 第 ${this.round} 轮开始，骰子：${[1, 2, 3, 4, 5, 6].map(v => `${v}×${this.dice[v]}`).join(' ')} ——`);
    this.nextTurn();
  }
  nextNumber(p) { for (let k = 0; k < 2; k++) if (!p.covered[k]) return p.tile[k]; return null; }
  nextTurn() {
    if (this.diceLeft() === 0) return this.endRound();
    let best = null, bi = -1;
    this.players.forEach((p, i) => {
      if (this.waiting.has(i)) return;
      const n = this.nextNumber(p); if (n != null && (best == null || n < best)) { best = n; bi = i; }
    });
    if (bi < 0) {
      // 只剩跳过的玩家：最小数字者重投骰子
      this.players.forEach((p, i) => {
        const n = this.nextNumber(p); if (n != null && (best == null || n < best)) { best = n; bi = i; }
      });
      if (bi < 0) return this.endRound();
      const left = this.diceLeft() - 1;
      this.trash++;
      if (left <= 0) { this.dice = [0, 0, 0, 0, 0, 0, 0]; this.log('最后一颗骰子被移入垃圾桶'); return this.endRound(); }
      this.rollDice(left);
      this.waiting = new Set();
      this.log(`${this.players[bi].name} 移除1颗骰子并重投剩余 ${left} 颗：${[1, 2, 3, 4, 5, 6].map(v => `${v}×${this.dice[v]}`).join(' ')}`);
    }
    this.turn = { p: bi, guestTaken: false, dieTaken: false, boostUsed: false, bonus: false, extraTurn: false };
    this.version++;
  }
  endRound() {
    if (this.round === 3 || this.round === 5 || this.round === 7) return this.royalScoring();
    this.afterRound();
  }
  afterRound() {
    if (this.round >= 7) return this.finishGame();
    // 回合顺位板块顺时针传递
    const tiles = this.players.map(p => p.tile);
    this.players.forEach((p, i) => { p.tile = tiles[(i - 1 + this.n) % this.n]; });
    this.round++;
    this.startRound();
  }

  royalScoring() {
    this.phase = 'royal';
    this.turn = null;
    const tile = this.royalTiles[this.round === 3 ? 0 : this.round === 5 ? 1 : 2];
    const back = D.ROYAL_BACK[this.round];
    this.log(`—— 第 ${this.round} 轮结束：皇室计分（板块 ${tile}，倒退${back}格）——`);
    for (const p of this.players) {
      if (p.left) continue;
      const pts = D.ROYAL_PTS[p.royal];
      this.addPts(p, pts);
      p.royal = Math.max(0, p.royal - back);
      let msg = `${p.name} 获得${pts}分，倒退至第${p.royal}格`;
      if (p.royal >= 3) { msg += '，获得皇室奖励'; this.royalReward(p, tile); }
      else if (p.royal === 0) {
        if (this.has(p, 26) && p.money >= 1) {
          p.pending.push({ k: 'choice', title: '会议经理：支付1克朗免除皇室惩罚？', opts: [{ code: 'avoid', label: '支付1克朗免除惩罚' }, { code: 'accept:' + tile, label: '接受惩罚' }] });
          msg += '，可用会议经理免除惩罚';
        } else { msg += '，受到皇室惩罚'; this.royalPenalty(p, tile); }
      } else msg += '，无奖励也无惩罚';
      this.log(msg);
      this.normalize(p);
    }
    this.checkRoyalDone();
  }
  royalReward(p, tile) {
    if (this.has(p, 42)) { this.addPts(p, 5); this.log(`${p.name} 园丁 +5分`); }
    switch (tile) {
      case 'A1': this.addMoney(p, 3); break;
      case 'A2': this.applyFx(p, [{ t: 'anyFood', n: 2 }]); break;
      case 'A3': this.applyFx(p, [{ t: 'd3p', d: 3 }]); break;
      case 'A4': this.applyFx(p, [{ t: 'room', d: FREE, n: 1 }]); break;
      case 'B1': this.gainFood(p, ['brown', 'white', 'red', 'black']); break;
      case 'B2': this.addMoney(p, 5); break;
      case 'B3': this.applyFx(p, [{ t: 'd3p', d: FREE }]); break;
      case 'B4': this.applyFx(p, [{ t: 'roomOcc', maxFloor: 1 }]); break;
      case 'C1': this.addPts(p, 8); break;
      case 'C2': this.applyFx(p, [{ t: 'roomOcc' }]); break;
      case 'C3': this.addPts(p, 2 * p.played.length); break;
      case 'C4': this.applyFx(p, [{ t: 'play', d: FREE }]); break;
    }
    this.normalize(p);
  }
  royalPenalty(p, tile) {
    const ch = (title, opts) => {
      const ok = opts.filter(o => o.ok !== false);
      if (ok.length === 1) this.applyOpt(p, ok[0].code);
      else p.pending.push({ k: 'choice', title, opts: ok });
    };
    const unocc = this.countRooms(p, x => x && x.s === 'ready');
    switch (tile) {
      case 'A1': ch('皇室惩罚', [{ code: 'money:3', label: '失去3克朗', ok: p.money >= 3 }, { code: 'pts:5', label: '失去5分' }]); break;
      case 'A2': for (const c of FOOD) p.kitchen[c] = 0; break;
      case 'A3': ch('皇室惩罚', [{ code: 'ret:2', label: '将2张手牌放回牌堆底', ok: p.hand.length >= 2 }, { code: 'pts:5', label: '失去5分' }]); break;
      case 'A4': ch('皇室惩罚', [{ code: 'pts:5', label: '失去5分' }, { code: 'rm:1', label: '移除1间最高层未入住客房', ok: unocc >= 1 }]); break;
      case 'B1': for (const c of FOOD) p.kitchen[c] = 0; for (const g of p.cafe) if (g) g.filled = []; break;
      case 'B2': ch('皇室惩罚', [{ code: 'money:5', label: '失去5克朗', ok: p.money >= 5 }, { code: 'pts:7', label: '失去7分' }]); break;
      case 'B3': ch('皇室惩罚', [{ code: 'ret:3', label: '将3张手牌放回牌堆底', ok: p.hand.length >= 3 }, { code: 'pts:7', label: '失去7分' }]); break;
      case 'B4': ch('皇室惩罚', [{ code: 'pts:7', label: '失去7分' }, { code: 'rm:2', label: '移除2间最高层未入住客房', ok: unocc >= 2 }]); break;
      case 'C1': this.addPts(p, -8); break;
      case 'C2': this.removeRooms(p, 2, 'occ'); break;
      case 'C3': this.addPts(p, -2 * p.played.length); break;
      case 'C4': ch('皇室惩罚', [{ code: 'discEnd', label: '弃掉1张已打出的【游戏结束】员工', ok: p.played.some(e => EMP_BY_ID[e.id].type === 'end') }, { code: 'pts:10', label: '失去10分' }]); break;
    }
  }
  removeRooms(p, n, state) {
    for (let r = 3; r >= 0 && n > 0; r--) for (let c = 4; c >= 0 && n > 0; c--) {
      if (p.rooms[r][c] && p.rooms[r][c].s === state) { p.rooms[r][c] = null; n--; }
    }
  }
  applyOpt(p, code) {
    const [k, v] = code.split(':');
    const n = Number(v);
    switch (k) {
      case 'money': p.money -= n; this.log(`${p.name} 失去${n}克朗`); break;
      case 'pts': this.addPts(p, -n); this.log(`${p.name} 失去${n}分`); break;
      case 'ret': p.pending.push({ k: 'ret', n }); break;
      case 'rm': this.removeRooms(p, n, 'ready'); this.log(`${p.name} 移除${n}间未入住客房`); break;
      case 'discEnd': p.pending.push({ k: 'discEnd' }); break;
      case 'avoid': p.money -= 1; this.log(`${p.name} 支付1克朗免除了皇室惩罚（会议经理）`); break;
      case 'accept': this.royalPenalty(p, v); break;
    }
  }
  checkRoyalDone() {
    if (this.phase !== 'royal') return;
    if (this.players.every(p => !p.pending.length)) this.afterRound();
  }
  checkSetupRoomsDone() {
    if (this.phase !== 'setupRooms') return;
    if (this.players.every(p => !p.pending.length)) this.startRound();
  }

  finishGame() {
    this.phase = 'ended';
    this.turn = null;
    const endIds = new Set();
    for (const p of this.players) for (const e of p.played) if (EMP_BY_ID[e.id].type === 'end' && e.id !== 29) endIds.add(e.id);
    for (const p of this.players) {
      if (p.left) { p.score = p.leftScore; p.final = { left: true, start: p.leftScore, emp: 0, empDetail: [], rooms: 0, money: 0, food: 0, cafe: 0, total: p.leftScore, tie: -1 }; continue; }
      const b = { start: p.score };
      const empPts = id => this.endEmpPoints(p, id);
      let emp = 0; const detail = [];
      for (const e of p.played) {
        if (EMP_BY_ID[e.id].type !== 'end') continue;
        if (e.id === 29) {
          // 秘书：复制其他玩家的游戏结束员工中对自己最有利的一张
          let best = 0, bid = null;
          for (const q of this.players) if (q !== p) for (const x of q.played) if (EMP_BY_ID[x.id].type === 'end' && x.id !== 29) { const v = empPts(x.id); if (v > best) { best = v; bid = x.id; } }
          emp += best; detail.push(`秘书(复制${bid ? EMP_BY_ID[bid].name : '无'}) ${best}`);
        } else { const v = empPts(e.id); emp += v; detail.push(`${EMP_BY_ID[e.id].name} ${v}`); }
      }
      let rooms = 0; for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) if (p.rooms[r][c] && p.rooms[r][c].s === 'occ') rooms += D.FLOOR_PTS[r];
      const food = FOOD.reduce((a, c) => a + p.kitchen[c], 0);
      const cafe = p.cafe.filter(Boolean).length * -5;
      b.emp = emp; b.empDetail = detail; b.rooms = rooms; b.money = p.money; b.food = food; b.cafe = cafe;
      p.score += emp + rooms + p.money + food + cafe;
      b.total = p.score; b.tie = food + p.money;
      p.final = b;
    }
    const ranking = this.players.map((p, i) => i).sort((a, b) => (this.players[b].score - this.players[a].score) || (this.players[b].final.tie - this.players[a].final.tie));
    this.ranking = ranking;
    this.log(`游戏结束！获胜者：${this.players[ranking[0]].name}（${this.players[ranking[0]].score}分）`);
  }
  endEmpPoints(p, id) {
    switch (id) {
      case 27: return 3 * this.occ(p, 'red');
      case 28: return 3 * this.occ(p, 'blue');
      case 30: return 3 * this.occ(p, 'yellow');
      case 31: return this.occ(p);
      case 32: return 2 * p.played.length;
      case 34: return this.countRooms(p, x => x);
      case 37: return 2 * p.zones.filter(z => z.cells.every(([r, c]) => p.rooms[r][c] && p.rooms[r][c].s === 'occ')).length;
      case 40: return 5 * p.politics.length;
      case 41: return 2 * p.royal;
      case 46: return 5 * [0, 1, 2, 3].filter(r => p.rooms[r].every(x => x && x.s === 'occ')).length;
      case 47: return 5 * [0, 1, 2, 3, 4].filter(c => [0, 1, 2, 3].every(r => p.rooms[r][c] && p.rooms[r][c].s === 'occ')).length;
      case 48: return 4 * Math.min(this.occ(p, 'red'), this.occ(p, 'yellow'), this.occ(p, 'blue'));
    }
    return 0;
  }

  // ---------- 消息处理 ----------
  handle(pi, msg) {
    const snap = structuredClone(Object.assign({}, this));
    try { this._handle(pi, msg); }
    catch (e) { for (const k of Object.keys(this)) delete this[k]; Object.assign(this, snap); throw e; }
  }
  _handle(pi, msg) {
    const p = this.players[pi];
    if (!p) fail('无效玩家');
    if (p.left) fail('你已离开本局游戏');
    if (this.phase === 'ended') fail('游戏已结束');
    const t = msg.type;
    if (t === 'pend') { this.resolvePending(pi, msg); }
    else if (this.phase === 'setupGuests') {
      if (t !== 'takeGuest') fail('请先选择一位起始宾客');
      if (this.turn.p !== pi) fail('还没轮到你选择宾客');
      const i = msg.i | 0; if (!this.guestRow[i]) fail('无效的宾客');
      const id = this.takeFromRow(i);
      p.cafe[p.cafe.indexOf(null)] = { id, filled: [] };
      this.log(`${p.name} 选择了起始宾客【${GUEST_BY_ID[id].name}】`);
      this.setupIdx++;
      this.advanceSetup();
    }
    else if (this.phase === 'play') {
      if (!this.turn || this.turn.p !== pi) fail('还没轮到你');
      if (p.pending.length && !['politic'].includes(t)) fail('请先完成当前待处理的步骤');
      this.handleTurn(pi, p, msg);
    }
    else fail('当前阶段不能执行此操作');
    this.version++;
  }

  handleTurn(pi, p, msg) {
    const T = this.turn;
    switch (msg.type) {
      case 'takeGuest': {
        if (T.guestTaken) fail('本回合已经拿取过宾客');
        if (T.dieTaken) fail('拿取宾客必须在拿骰子之前');
        const i = msg.i | 0; const id = this.guestRow[i];
        if (!id) fail('无效的宾客');
        const slot = p.cafe.indexOf(null); if (slot < 0) fail('咖啡厅已满');
        const cost = this.has(p, 25) ? 0 : D.GUEST_SLOT_COST[i];
        if (cost > p.money) fail('克朗不足');
        p.money -= cost;
        this.takeFromRow(i);
        p.cafe[slot] = { id, filled: [] };
        T.guestTaken = true;
        this.log(`${p.name} 拿取宾客【${GUEST_BY_ID[id].name}】${cost ? `（-${cost}克朗）` : '（免费）'}`);
        break;
      }
      case 'takeDie': {
        if (T.dieTaken || T.bonus) fail('本回合已经拿过骰子');
        const v = msg.v | 0; if (v < 1 || v > 6 || !this.dice[v]) fail('该行动格没有骰子');
        const boost = !!msg.boost && !T.boostUsed;
        let cost = (boost ? 1 : 0) + (v === 6 && !this.has(p, 17) ? 1 : 0);
        if (cost > p.money) {
          if (boost || v !== 6) fail('克朗不足');
          // 无力支付行动6：仍须拿取骰子，但放弃行动
          this.dice[6]--; p.covered[p.covered[0] ? 1 : 0] = true; T.dieTaken = true;
          this.log(`${p.name} 拿取了【6】骰子，但无力支付1克朗，放弃行动`);
          break;
        }
        p.money -= cost;
        if (boost) T.boostUsed = true;
        let n = (v === 6 ? this.dice[6] : this.dice[v]) + (boost ? 1 : 0) + (v === 6 && this.has(p, 17) ? 1 : 0);
        this.dice[v]--;
        const k = p.covered[0] ? 1 : 0; p.covered[k] = true;
        T.dieTaken = true;
        this.log(`${p.name} 拿取了【${v}】骰子，行动强度 ${n}${boost ? '（额外+1）' : ''}${v === 6 ? (this.has(p, 17) ? '（厨工）' : '（-1克朗）') : ''}`);
        const fx = [];
        // 永久员工触发
        if ((v === 3 || v === 4) && this.has(p, 12)) { this.addPts(p, 2); this.log(`${p.name} 客房部主管 +2分`); }
        if (v === 4 && this.has(p, 16)) { this.addPts(p, 4); this.log(`${p.name} 洗衣工 +4分`); }
        if (v === 3 && this.has(p, 19)) { this.addPts(p, 5); this.log(`${p.name} 内饰建筑师 +5分`); }
        if (v === 5 && this.has(p, 20)) { this.addRoyal(p, 2); this.log(`${p.name} 侦探 皇室+2`); }
        const mainTask = this.actionTask(p, v === 6 ? 6 : v, n, v);
        p.pending.push(mainTask);
        if ((v === 1 || v === 2) && this.has(p, 14)) p.pending.push({ k: 'rooms', n: 1, d: 0, placed: 0, label: '装潢师：可准备1间客房' });
        if (v === 3 && this.has(p, 22)) p.pending.push({ k: 'play', d: 0, label: '人事经理：可打出1张员工（全价）' });
        this.normalize(p);
        break;
      }
      case 'skip': {
        if (T.dieTaken || T.guestTaken || T.bonus) fail('已经行动后不能跳过');
        this.waiting.add(pi);
        this.log(`${p.name} 选择跳过，等待其他玩家`);
        this.nextTurn();
        break;
      }
      case 'serve': {
        const moves = msg.moves || [];
        if (!moves.length || moves.length > 3) fail('每次最多移动3个餐点');
        const free = this.has(p, 24);
        if (!free && p.money < 1) fail('克朗不足');
        const kit = Object.assign({}, p.kitchen);
        const tmp = p.cafe.map(g => g && { id: g.id, filled: g.filled.slice() });
        for (const m of moves) {
          if (!FOOD.includes(m.c) || kit[m.c] < 1) fail('厨房中没有该餐点');
          const g = tmp[m.s]; if (!g) fail('无效宾客');
          if (!this.remaining(g).includes(m.c)) fail('该宾客不需要这个餐点');
          kit[m.c]--; g.filled.push(m.c);
        }
        p.kitchen = kit; p.cafe = p.cafe.map((g, i) => g && Object.assign(g, { filled: tmp[i].filled }));
        if (!free) p.money -= 1;
        this.log(`${p.name} 从厨房上菜 ${moves.map(m => FOOD_NAME[m.c]).join('、')}${free ? '（餐厅领班免费）' : '（-1克朗）'}`);
        break;
      }
      case 'checkin': this.checkIn(p, msg.slot | 0, msg.r | 0, msg.c | 0); break;
      case 'politic': {
        const card = this.politics.find(x => x.id === msg.id);
        if (!card) fail('无效政务卡');
        if (card.marks.includes(pi)) fail('你已经在这张政务卡上放置过圆片');
        if (card.marks.length >= 3) fail('这张政务卡已经没有空位');
        if (!this.politicsOk(p, card.id)) fail('尚未满足这张政务卡的要求');
        const pts = [15, 10, 5][card.marks.length];
        card.marks.push(pi); p.politics.push(card.id);
        this.addPts(p, pts);
        this.log(`${p.name} 完成政务卡 ${card.id}：+${pts}分`);
        break;
      }
      case 'useEmp': {
        const e = p.played.find(x => x.id === msg.id);
        if (!e) fail('你没有这张员工');
        const card = EMP_BY_ID[e.id];
        if (card.type !== 'round') fail('这不是【每轮一次】员工');
        if (e.used) fail('本轮已经使用过');
        e.used = true;
        this.log(`${p.name} 使用了【${card.name}】`);
        this.applyFx(p, card.fx);
        break;
      }
      case 'endTurn': {
        if (!T.dieTaken && !T.bonus) fail('你必须拿取1颗骰子并执行行动（或选择跳过）');
        if (p.pending.length) fail('请先完成待处理的步骤');
        if (T.extraTurn) {
          this.log(`${p.name} 获得一个额外回合（埃及法老）`);
          this.turn = { p: pi, guestTaken: false, dieTaken: false, boostUsed: true, bonus: true, extraTurn: false };
        } else this.nextTurn();
        break;
      }
      default: fail('未知操作');
    }
  }

  actionTask(p, action, n, dieValue) {
    switch (action) {
      case 1: return { k: 'act12', which: 1, n: n + ((dieValue === 1) && this.has(p, 13) ? 1 : 0) };
      case 2: return { k: 'act12', which: 2, n: n + ((dieValue === 2) && this.has(p, 13) ? 1 : 0) };
      case 3: return { k: 'rooms', n, d: 0, placed: 0, label: `行动3：最多准备 ${n} 间客房` };
      case 4: return { k: 'act4', n, both: dieValue === 4 && this.has(p, 15) };
      case 5: return { k: 'play', d: n + (dieValue === 5 && this.has(p, 18) ? 2 : 0), label: `行动5：打出1张员工，减费 ${n + (dieValue === 5 && this.has(p, 18) ? 2 : 0)}` };
      case 6: return { k: 'act6', n };
    }
  }

  resolvePending(pi, msg) {
    const p = this.players[pi];
    const t = p.pending[0];
    if (!t) fail('没有待处理的步骤');
    if (this.phase === 'play' && (!this.turn || this.turn.p !== pi)) fail('还没轮到你');
    let done = false;
    switch (t.k) {
      case 'food': {
        // msg.assign: 与 tokens 对应的宾客栏位（-1=厨房）
        const assign = msg.assign || [];
        const tmp = p.cafe.map(g => g && { id: g.id, filled: g.filled.slice() });
        t.tokens.forEach((c, i) => {
          const s = assign[i];
          if (s != null && s >= 0) {
            const g = tmp[s]; if (!g || !this.remaining(g).includes(c)) fail('分配无效：该宾客不需要此餐点');
            g.filled.push(c);
          }
        });
        t.tokens.forEach((c, i) => { const s = assign[i]; if (s == null || s < 0) p.kitchen[c]++; });
        p.cafe.forEach((g, i) => { if (g) g.filled = tmp[i].filled; });
        this.log(`${p.name} 获得 ${t.tokens.map(c => FOOD_NAME[c]).join('、')}`);
        done = true; break;
      }
      case 'anyFood': {
        const cs = msg.colors || [];
        if (cs.length !== t.n || !cs.every(c => FOOD.includes(c))) fail(`请选择${t.n}个餐点`);
        p.pending.shift(); this.gainFood(p, cs, true); this.normalize(p); return this.afterPending(p);
      }
      case 'act12': {
        const a = msg.a | 0, b = msg.b | 0;
        if (a < 0 || b < 0 || a + b > t.n) fail(`最多拿取${t.n}个`);
        if (b > a) fail(t.which === 1 ? '蛋糕不能多于点心' : '咖啡不能多于葡萄酒');
        const [ca, cb] = t.which === 1 ? ['brown', 'white'] : ['red', 'black'];
        p.pending.shift();
        this.gainFood(p, [...Array(a).fill(ca), ...Array(b).fill(cb)], true);
        this.normalize(p); return this.afterPending(p);
      }
      case 'act4': {
        const r = msg.royal | 0, m = msg.money | 0;
        if (r < 0 || m < 0 || r + m !== t.n) fail(`请分配总共${t.n}格`);
        this.addRoyal(p, r); this.addMoney(p, m);
        this.log(`${p.name} 皇室+${r}，资金+${m}`);
        done = true; break;
      }
      case 'act6': {
        const a = msg.action | 0; if (a < 1 || a > 5) fail('请选择行动1-5');
        p.pending.shift();
        this.log(`${p.name} 通过行动6执行行动${a}（强度${t.n}）`);
        p.pending.unshift(this.actionTask(p, a, t.n, 6));
        this.normalize(p); return this.afterPending(p);
      }
      case 'rooms': {
        if (msg.done) { done = true; break; }
        this.placeRoom(p, msg.r | 0, msg.c | 0, t);
        t.placed++;
        if (t.placed >= t.n || !this.anyPlaceable(p, t)) done = true;
        break;
      }
      case 'flip': {
        if (msg.skip) { done = true; break; }
        this.flipRoom(p, msg.r | 0, msg.c | 0);
        this.log(`${p.name} 将客房 ${(msg.r | 0) + 1}${String((msg.c | 0) + 1).padStart(2, '0')} 翻为已入住`);
        t.done++;
        if (t.done >= t.n || !this.countRooms(p, x => x && x.s === 'ready')) done = true;
        break;
      }
      case 'play': {
        if (msg.skip) { done = true; break; }
        if (!p.hand.includes(msg.id | 0)) fail('手牌中没有这张员工');
        if (this.empCost(p, msg.id | 0, t.d) > p.money) fail('克朗不足');
        p.pending.shift();
        this.playEmployee(p, msg.id | 0, t.d);
        this.normalize(p); return this.afterPending(p);
      }
      case 'd3p': {
        if (msg.skip) { this.empDeck.push(...t.cards); done = true; break; }
        const id = msg.id | 0;
        if (!t.cards.includes(id)) fail('无效卡牌');
        const cost = this.empCost(p, id, t.d);
        if (cost > p.money) fail('克朗不足');
        p.pending.shift();
        this.empDeck.push(...t.cards.filter(x => x !== id));
        p.hand.push(id);
        this.playEmployee(p, id, t.d);
        this.normalize(p); return this.afterPending(p);
      }
      case 'guest': {
        if (msg.skip) { done = true; break; }
        const i = msg.i | 0; const id = this.guestRow[i]; if (!id) fail('无效宾客');
        const slot = p.cafe.indexOf(null); if (slot < 0) fail('咖啡厅已满');
        this.takeFromRow(i); p.cafe[slot] = { id, filled: [] };
        this.log(`${p.name} 免费拿取宾客【${GUEST_BY_ID[id].name}】`);
        done = true; break;
      }
      case 'deliver': {
        if (msg.skip) { done = true; break; }
        const g = p.cafe[msg.slot | 0]; if (!g) fail('无效宾客');
        g.filled = GUEST_BY_ID[g.id].req.slice();
        this.log(`${p.name} 递送员满足了【${GUEST_BY_ID[g.id].name}】的点餐`);
        done = true; break;
      }
      case 'choice': {
        const o = t.opts.find(x => x.code === msg.code); if (!o) fail('无效选项');
        p.pending.shift(); this.applyOpt(p, o.code); this.normalize(p); return this.afterPending(p);
      }
      case 'ret': {
        const ids = msg.ids || [];
        if (ids.length !== t.n || new Set(ids).size !== ids.length || !ids.every(id => p.hand.includes(id))) fail(`请选择${t.n}张手牌`);
        p.hand = p.hand.filter(id => !ids.includes(id)); this.empDeck.push(...ids);
        this.log(`${p.name} 将${t.n}张手牌放回牌堆底`);
        done = true; break;
      }
      case 'discEnd': {
        const i = p.played.findIndex(e => e.id === msg.id && EMP_BY_ID[e.id].type === 'end');
        if (i < 0) fail('请选择一张已打出的【游戏结束】员工');
        this.log(`${p.name} 弃掉了【${EMP_BY_ID[p.played[i].id].name}】`);
        p.played.splice(i, 1); done = true; break;
      }
      default: fail('未知步骤');
    }
    if (done) p.pending.shift();
    this.normalize(p);
    this.afterPending(p);
  }
  afterPending() { this.checkRoyalDone(); this.checkSetupRoomsDone(); }

  advanceSetup() {
    while (this.setupIdx < this.n && this.players[this.setupOrder[this.setupIdx]].left) this.setupIdx++;
    if (this.setupIdx >= this.n) {
      this.phase = 'setupRooms';
      this.turn = null;
      for (const q of this.players) if (!q.left) q.pending.push({ k: 'rooms', n: 3, d: 0, placed: 0, setup: true });
      this.log('请所有玩家准备最多3间客房（从左下角开始），完成后点击“完成”');
      this.checkSetupRoomsDone();
    } else this.turn = { p: this.setupOrder[this.setupIdx] };
  }

  // 玩家中途离开：以离开时的分数作为最终分数
  leave(pi) {
    const p = this.players[pi];
    if (!p || p.left || this.phase === 'ended') return;
    const snap = structuredClone(Object.assign({}, this));
    try {
      p.left = true; p.leftScore = p.score;
      if (p.pending.some(t => t.k === 'd3p' && t.cards)) for (const t of p.pending) if (t.k === 'd3p' && t.cards) this.empDeck.push(...t.cards);
      p.pending = []; p.covered = [true, true];
      this.waiting.delete(pi);
      this.log(`${p.name} 离开了游戏，最终分数按离开时的 ${p.score} 分计算`);
      if (this.players.every(q => q.left)) { this.log('所有玩家都已离开，游戏立即结算'); this.finishGame(); }
      else if (this.phase === 'setupGuests') { if (this.turn && this.turn.p === pi) this.advanceSetup(); }
      else if (this.phase === 'setupRooms') this.checkSetupRoomsDone();
      else if (this.phase === 'royal') this.checkRoyalDone();
      else if (this.phase === 'play' && this.turn && this.turn.p === pi) this.nextTurn();
    } catch (e) { for (const k of Object.keys(this)) delete this[k]; Object.assign(this, snap); throw e; }
    this.version++;
  }

  // ---------- 视图 ----------
  view(pi) {
    const me = pi;
    return {
      phase: this.phase, round: this.round, me, version: this.version,
      settings: this.settings,
      guestRow: this.guestRow, guestDeck: this.guestDeck.length, empDeck: this.empDeck.length,
      dice: this.dice, trash: this.trash, totalDice: this.totalDice,
      politics: this.politics, royalTiles: this.royalTiles,
      turn: this.turn, waiting: [...this.waiting],
      setupPicker: this.phase === 'setupGuests' ? this.turn.p : null,
      ranking: this.ranking || null,
      players: this.players.map((p, i) => ({
        name: p.name, color: p.color, side: p.side, rows: p.rows, zoneOf: p.zoneOf, zones: p.zones, zonesClaimed: p.zonesClaimed,
        money: p.money, royal: p.royal, score: p.score, kitchen: p.kitchen,
        cafe: p.cafe.map(g => g && { id: g.id, filled: g.filled, need: this.remaining(g), ok: this.satisfied(g) }),
        rooms: p.rooms, played: p.played, politics: p.politics, tile: p.tile, covered: p.covered,
        hand: i === me ? p.hand : null, handCount: p.hand.length,
        pending: i === me ? p.pending : p.pending.map(t => ({ k: t.k })),
        politicsOk: i === me ? Object.fromEntries(this.politics.map(c => [c.id, this.politicsOk(p, c.id)])) : null,
        final: p.final, left: p.left,
      })),
      log: this.logs.slice(-80),
    };
  }
}

module.exports = { Game, RuleError, GUEST_BY_ID, EMP_BY_ID };
