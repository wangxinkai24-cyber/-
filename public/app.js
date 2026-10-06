/* 奥地利大饭店 — 客户端 */
(() => {
const G = window.GH;
const GUEST = Object.fromEntries(G.GUESTS.map(g => [g.id, g]));
const EMP = Object.fromEntries(G.EMPLOYEES.map(e => [e.id, e]));
const POL = Object.fromEntries(G.POLITICS.map(p => [p.id, p]));
const RT = Object.fromEntries(G.ROYAL_TILES.map(p => [p.id, p]));
const FN = G.FOOD_NAME;
const SHORT = { brown: '点', white: '糕', red: '酒', black: '啡' };
const CCN = { blue: '蓝', yellow: '黄', red: '红', green: '绿' };
const GUEST_KIND = { green: '游客', yellow: '艺术家', blue: '贵族', red: '市民' };
const TYPE_CN = { once: '一次性', round: '每轮一次', perm: '永久', end: '游戏结束' };
const ACTION_LBL = ['', '点心/蛋糕<br>(蛋糕≤点心)', '葡萄酒/咖啡<br>(咖啡≤酒)', '准备客房', '皇室 / 资金', '打出员工<br>每骰减1', '付1克朗<br>选行动1-5'];
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

let ws, session = load(), lobby = null, S = null, connected = false;
const ui = { view: null, selGuest: null, kSel: null, serve: [], boost: false, modal: null, modalKey: null, retSel: [], showRules: false };

function load() { try { return JSON.parse(localStorage.getItem('gh_session') || 'null'); } catch { return null; } }
function save(v) { try { if (v) localStorage.setItem('gh_session', JSON.stringify(v)); else localStorage.removeItem('gh_session'); } catch {} }
function savedName() { try { return localStorage.getItem('gh_name') || ''; } catch { return ''; } }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------------- 网络 ----------------
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { connected = true; if (session) ws.send(JSON.stringify({ t: 'rejoin', code: session.code, token: session.token })); render(); };
  ws.onclose = () => { connected = false; render(); setTimeout(connect, 1500); };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.t === 'joined') { session = { code: m.code, token: m.token }; save(session); }
    else if (m.t === 'gone') { session = null; save(null); lobby = null; S = null; }
    else if (m.t === 'left') { session = null; save(null); lobby = null; S = null; }
    else if (m.t === 'lobby') { lobby = m; if (!m.started) S = null; }
    else if (m.t === 'state') { onState(m.state); }
    else if (m.t === 'err') toast(m.msg);
    render();
  };
}
function sendRaw(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); else toast('连接中断，正在重连…'); }
function act(msg) { sendRaw({ t: 'act', msg }); }
function pend(o) { act(Object.assign({ type: 'pend' }, o)); }
function onState(st) {
  const prevTurn = S && S.turn && S.turn.p;
  S = st;
  if (ui.view == null || ui.view >= S.players.length) ui.view = S.me;
  const T = S.turn;
  if (!T || T.p !== S.me || prevTurn !== T.p) { ui.selGuest = null; ui.kSel = null; ui.serve = []; }
  if (T && T.p === S.me && prevTurn !== S.me) { ui.view = S.me; ui.boost = false; }
  const me = S.players[S.me];
  const top = me.pending[0];
  const key = top ? top.k + ':' + JSON.stringify(top) : null;
  if (key !== ui.modalKey) { ui.modalKey = key; ui.modal = null; ui.retSel = []; }
}
let toastTimer;
function toast(s) { const t = document.getElementById('toast'); t.textContent = s; t.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.style.display = 'none', 3200); }

// ---------------- 规则镜像（仅用于高亮） ----------------
const has = (p, id) => p.played.some(x => x.id === id);
const cellColor = (p, r, c) => G.CELL_COLOR[p.rows[r][c]];
function canPlace(p, r, c, t) {
  if (p.rooms[r][c]) return false;
  if (t.maxFloor != null && r > t.maxFloor) return false;
  const any = p.rooms.some(row => row.some(x => x));
  if (!any) return r === 0 && c === 0;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dy, dx]) => { const y = r + dy, x = c + dx; return y >= 0 && y <= 3 && x >= 0 && x <= 4 && p.rooms[y][x]; });
}
function roomCost(p, r, c, d) {
  const col = cellColor(p, r, c);
  if (d >= G.FREE) return 0;
  if ((col === 'blue' && has(p, 9)) || (col === 'red' && has(p, 10)) || (col === 'yellow' && has(p, 11))) return 0;
  return Math.max(0, G.FLOOR_COST[r] - (d || 0));
}
function empCost(id, d) { return d >= G.FREE ? 0 : Math.max(0, EMP[id].cost - (d || 0)); }

// ---------------- 小组件 ----------------
const food = (c, cls = '') => `<span class="food ${c} ${c === 'red' || c === 'black' ? 'hex' : ''} ${cls}" title="${FN[c]}">${SHORT[c]}</span>`;
const dot = color => `<span class="dot pc-${color}"></span>`;
function fxText(e) {
  const d = v => v >= G.FREE ? '免费' : v ? `减${v}克朗` : '付全价';
  switch (e.t) {
    case 'royal': return `👑 皇室+${e.n}`;
    case 'money': return `💶 +${e.n}克朗`;
    case 'food': return `+${e.n} ${FN[e.c]}`;
    case 'anyFood': return `+${e.n} 任意餐点`;
    case 'draw': return `🂠 抽${e.n}张员工`;
    case 'play': return `打出员工（${d(e.d)}）`;
    case 'd3p': return `抓3打1员工（${d(e.d)}）`;
    case 'room': return `准备${e.n > 1 ? e.n + '间' : ''}客房（${d(e.d)}）`;
    case 'roomLow': return '免费准备1-2层客房';
    case 'flip': return `翻转${e.n}间空闲客房为入住`;
    case 'guest': return '免费拿取1位宾客';
    case 'extraTurn': return '⟳ 额外回合（不拿骰子）';
    case 'deliver': return '满足1位宾客全部点餐';
  }
  return '';
}
function guestCard(id, o = {}) {
  if (!id) return `<div class="emptyslot">${o.emptyText || '空位'}</div>`;
  const g = GUEST[id];
  let req;
  if (o.g) {
    const need = o.g.need.slice();
    const filled = g.req.slice();
    for (const c of need) { const k = filled.indexOf(c); if (k >= 0) filled.splice(k, 1); }
    req = filled.map(c => food(c)).join('') + need.map(c => food(c, 'missing' + (o.needClick ? ' ' : ''))).join('');
  } else req = g.req.map(c => food(c)).join('');
  const fx = g.fx.length ? g.fx.map(fxText).join('<br>') : '<i>无奖励</i>';
  return `<div class="gcard ${g.color} ${o.click ? 'click' : ''} ${o.sel ? 'sel' : ''} ${o.g && o.g.ok ? 'okay' : ''}" ${o.attrs || ''}>
    <div class="band">${esc(g.name)}<br><span style="font-weight:400;font-size:10px;opacity:.9">${GUEST_KIND[g.color]}·${CCN[g.color]}</span></div>
    <div class="pts">${g.pts}</div>
    <div class="req">${req}</div>
    <div class="fx">${fx}</div>
    ${o.cost != null ? `<div class="cost">费用 ${o.cost} 克朗</div>` : ''}
    ${o.g && o.g.ok ? '<div class="tag">✓ 可入住</div>' : ''}
  </div>`;
}
function empCard(id, o = {}) {
  const e = EMP[id];
  return `<div class="ecard ${o.click ? 'click' : ''} ${o.used ? 'used' : ''} ${o.sel ? 'sel' : ''}" ${o.attrs || ''} title="${esc(e.text)}">
    <div class="cst">${o.cost != null ? o.cost : e.cost}</div>
    <div class="nm">${esc(e.name)}</div>
    <span class="ty ${e.type}">${TYPE_CN[e.type]}</span>
    <div class="tx">${esc(e.text)}</div>
    <div class="num">#${e.id}${e.set ? ' · ' + e.set : ''}</div>
  </div>`;
}
function dieFace(v) { return `<div class="die">${Array.from({ length: 9 }, (_, i) => PIPS[v].includes(i) ? '<i></i>' : '<span></span>').join('')}</div>`; }

// ---------------- 渲染 ----------------
function render() {
  const app = document.getElementById('app');
  if (!lobby) app.innerHTML = renderHome();
  else if (!S) app.innerHTML = renderLobby();
  else app.innerHTML = renderGame();
}

function renderHome() {
  return `<div class="lobby"><div class="panel">
    <h1>奥地利大饭店</h1><div class="sub">2–4 人联机 · 维也纳 1900</div>
    <div class="row"><input id="nm" placeholder="你的名字" maxlength="12" value="${esc(savedName())}"></div>
    <div class="row"><button class="gold" data-a="create">创建房间</button></div>
    <div class="row"><input id="code" placeholder="房间号（4位）" maxlength="4" style="text-transform:uppercase"><button data-a="join">加入房间</button></div>
    <p class="hint">${connected ? '✅ 已连接服务器' : '⏳ 正在连接服务器…'}<br>创建房间后，把房间号发给朋友，在各自的设备上打开同一个网址并加入即可。游戏中途掉线，重新打开网页会自动回到原来的座位。</p>
  </div></div>`;
}
function renderLobby() {
  const L = lobby, host = L.you === 0;
  return `<div class="lobby"><div class="panel">
    <h1>等待玩家</h1>
    <div class="sub">把房间号告诉朋友</div>
    <div class="code">${L.code}</div>
    <ul class="seatlist">${L.seats.map((s, i) => `<li>${dot(G.PLAYER_COLORS[i])}<b>${esc(s.name)}</b>${i === 0 ? '<span class="small">房主</span>' : ''}${i === L.you ? '<span class="small">（你）</span>' : ''}<span style="margin-left:auto" class="small">${s.connected ? '在线' : '离线'}</span></li>`).join('')}
    ${Array.from({ length: 4 - L.seats.length }, () => '<li class="small">空座位</li>').join('')}</ul>
    <div class="row"><label style="flex:0 0 90px;align-self:center">酒店版图</label>
      <select data-set="side" ${host ? '' : 'disabled'}><option value="moon" ${L.settings.side === 'moon' ? 'selected' : ''}>月亮面（所有人相同，推荐首局）</option><option value="sun" ${L.settings.side === 'sun' ? 'selected' : ''}>太阳面（A/B/C/D 各不相同）</option></select></div>
    <div class="row"><label style="flex:0 0 90px;align-self:center">员工卡</label>
      <select data-set="empVariant" ${host ? '' : 'disabled'}><option value="starter" ${L.settings.empVariant === 'starter' ? 'selected' : ''}>入门变体：推荐组合 A/B/C/D</option><option value="random" ${L.settings.empVariant === 'random' ? 'selected' : ''}>标准：随机发6张</option></select></div>
    <div class="row">${host ? `<button class="gold" data-a="start" ${L.seats.length < 2 ? 'disabled' : ''}>开始游戏（${L.seats.length}人）</button>` : '<p class="hint" style="text-align:center">等待房主开始游戏…</p>'}</div>
    <div class="row"><button class="ghost" data-a="leave">离开房间</button></div>
  </div></div>`;
}

function statusText() {
  const T = S.turn, me = S.players[S.me];
  if (S.phase === 'ended') return '游戏结束';
  if (S.phase === 'setupGuests') return S.setupPicker === S.me ? '请选择你的起始宾客（免费）' : `等待 ${S.players[S.setupPicker].name} 选择起始宾客`;
  if (S.phase === 'setupRooms') return me.pending.length ? '请准备最多3间客房' : '等待其他玩家准备客房…';
  if (S.phase === 'royal') return me.pending.length ? '皇室计分：请处理你的奖励/惩罚' : '等待其他玩家处理皇室计分…';
  if (T) return T.p === S.me ? (T.bonus ? '你的额外回合（埃及法老）' : '轮到你了！') : `轮到 ${S.players[T.p].name}`;
  return '';
}

function renderGame() {
  const me = S.players[S.me];
  const myTurn = S.phase === 'play' && S.turn && S.turn.p === S.me;
  return `
  <div class="top">
    <span class="title">奥地利大饭店</span>
    <span class="pill">房间 ${lobby.code}</span>
    <span class="pill">第 ${S.round} / 7 轮</span>
    <span class="status ${myTurn || me.pending.length ? 'me' : ''}">${statusText()}</span>
    <span class="pill">💶 ${me.money}</span><span class="pill">👑 ${me.royal}</span><span class="pill">⭐ ${me.score}</span>
    ${connected ? '' : '<span class="pill" style="background:#7d1f2c">重连中…</span>'}
    <button class="ghost" style="color:#f2e6c9;border-color:#c39a3c;padding:3px 10px" data-a="rules">规则速查</button>
  </div>
  <div class="wrap">
    <div class="col">
      ${renderPrompt()}
      ${renderBoardGuests()}
      ${renderActions()}
      ${renderPlayers()}
      ${renderPolRoyal()}
      <div class="panel"><h3>游戏记录</h3><div class="log">${S.log.slice().reverse().map(l => `<div class="${l.s.startsWith('——') ? 'sep' : ''}">${esc(l.s)}</div>`).join('')}</div></div>
    </div>
    <div class="col">
      ${renderMyArea()}
    </div>
  </div>
  ${renderModal()}
  ${ui.showRules ? renderRules() : ''}`;
}

function renderPrompt() {
  const me = S.players[S.me], t = me.pending[0], T = S.turn;
  const myTurn = S.phase === 'play' && T && T.p === S.me;
  let msg = '', btns = '';
  if (S.phase === 'ended') { msg = '游戏结束！'; btns = `<button class="gold" data-a="final">查看最终计分</button>${lobby.you === 0 ? '<button class="ghost" data-a="restart">返回房间再来一局</button>' : ''}`; }
  else if (t) {
    switch (t.k) {
      case 'rooms': msg = (t.label || (t.setup ? '准备阶段' : '准备客房')) + `：点击酒店中闪烁的格子放置客房（已放 ${t.placed}/${t.n}${t.occupy ? '，放置后立即入住' : ''}${t.maxFloor != null ? `，仅限1-${t.maxFloor + 1}层` : ''}）`; btns = `<button data-p="done">${t.placed ? '完成' : '不放置 / 完成'}</button>`; break;
      case 'flip': msg = `点击一间“空闲”客房，将其翻为已入住（${t.done}/${t.n}）`; btns = '<button class="ghost" data-p="skip">跳过</button>'; break;
      case 'play': msg = (t.label || `打出1张员工（${t.d >= G.FREE ? '免费' : t.d ? '减' + t.d + '克朗' : '付全价'}）`) + '：点击下方手牌'; btns = '<button class="ghost" data-p="skip">不打出</button>'; break;
      case 'guest': msg = '免费拿取1位宾客：点击上方宾客牌'; btns = '<button class="ghost" data-p="skip">放弃</button>'; break;
      case 'deliver': msg = '递送员：点击你咖啡厅中的一位宾客，满足其全部点餐'; btns = '<button class="ghost" data-p="skip">放弃</button>'; break;
      case 'ret': msg = `请选择 ${t.n} 张手牌放回牌堆底（已选 ${ui.retSel.length}）`; btns = `<button data-a="retOk" ${ui.retSel.length === t.n ? '' : 'disabled'}>确认</button>`; break;
      case 'discEnd': msg = '请点击一张已打出的【游戏结束】员工将其弃掉'; break;
      default: msg = '请在弹出的窗口中完成选择'; btns = '<button data-a="reopen">打开窗口</button>';
    }
  } else if (S.phase === 'setupGuests') {
    msg = S.setupPicker === S.me ? '准备阶段：点击上方一位宾客，免费放入你的咖啡厅' : `等待 ${S.players[S.setupPicker].name} 选择起始宾客…`;
  } else if (S.phase === 'setupRooms' || S.phase === 'royal') {
    msg = '等待其他玩家…';
  } else if (myTurn) {
    const steps = [];
    if (!T.dieTaken && !T.bonus) steps.push(T.guestTaken ? '已拿宾客 ✓' : '① 可选：点击宾客牌拿取宾客', '② 必须：点击一个行动格拿取骰子');
    else steps.push(T.bonus ? '额外回合：可拿宾客及执行额外行动' : '已拿骰子 ✓');
    steps.push('额外行动：点击厨房餐点→宾客上菜；点击“可入住”宾客→空闲客房入住');
    msg = steps.join('　');
    if (!T.dieTaken && !T.bonus) btns += `<label><input type="checkbox" data-a="boost" ${ui.boost ? 'checked' : ''} ${T.boostUsed || me.money < 1 ? 'disabled' : ''}> 付1克朗，骰子数量+1</label>`;
    if (ui.serve.length) btns += `<button class="gold" data-a="serveOk">确认上菜 ${ui.serve.length} 个（${has(me, 24) ? '免费' : '-1克朗'}）</button><button class="ghost" data-a="serveCancel">取消上菜</button>`;
    else if (ui.kSel) btns += `<span class="small">已选 ${FN[ui.kSel]}，点击需要它的宾客</span><button class="ghost" data-a="serveCancel">取消</button>`;
    if (ui.selGuest != null) btns += `<span class="small">已选宾客，点击一间空闲客房入住</span><button class="ghost" data-a="unselGuest">取消</button>`;
    if (!T.dieTaken && !T.guestTaken && !T.bonus) btns += '<button class="ghost" data-a="skip">跳过回合（等待重投）</button>';
    if (T.dieTaken || T.bonus) btns += '<button class="wine" data-a="endTurn">结束回合</button>';
  } else if (S.phase === 'play') {
    msg = `等待 ${S.players[T.p].name} 行动…`;
  }
  return `<div class="prompt"><div class="msg">${msg}</div>${btns ? `<div class="btns">${btns}</div>` : ''}</div>`;
}

function renderBoardGuests() {
  const me = S.players[S.me], T = S.turn, t = me.pending[0];
  const myTurn = S.phase === 'play' && T && T.p === S.me && !t;
  const canTake = i => {
    if (!S.guestRow[i]) return false;
    if (S.phase === 'setupGuests') return S.setupPicker === S.me;
    if (t && t.k === 'guest') return true;
    return myTurn && !T.guestTaken && !T.dieTaken && me.cafe.includes(null);
  };
  return `<div class="panel"><h3>宾客区 <span class="r">牌堆 ${S.guestDeck} 张${has(me, 25) ? ' · 行李员：免费拿取' : ''}</span></h3>
    <div class="cards">${S.guestRow.map((id, i) => guestCard(id, { cost: S.phase === 'play' ? G.GUEST_SLOT_COST[i] : null, click: canTake(i), attrs: canTake(i) ? `data-a="takeGuest" data-i="${i}"` : '' })).join('')}</div></div>`;
}

function renderActions() {
  const me = S.players[S.me], T = S.turn;
  const can = S.phase === 'play' && T && T.p === S.me && !T.dieTaken && !T.bonus && !me.pending.length;
  return `<div class="panel"><h3>行动版图 <span class="r">剩余骰子 ${S.dice.reduce((a, b) => a + b, 0)} · 垃圾桶 ${S.trash}</span></h3>
    <div class="actions">${[1, 2, 3, 4, 5, 6].map(v => {
      const n = S.dice[v]; const ok = can && n > 0;
      return `<div class="aspace ${ok ? 'click' : ''} ${n ? '' : 'empty'}" ${ok ? `data-a="die" data-v="${v}"` : ''}>
        ${dieFace(v)}<div class="lbl">${ACTION_LBL[v]}</div><div class="cnt">×${n}</div></div>`;
    }).join('')}</div></div>`;
}

function renderPlayers() {
  const order = S.players.map((p, i) => i);
  const T = S.turn;
  const trackCells = Array.from({ length: 14 }, (_, k) => {
    const mk = S.players.filter(p => p.royal === k).map(p => dot(p.color)).join('');
    return `<div class="${k >= 3 ? 'y' : ''}"><b>${k}</b><span class="pp">${G.ROYAL_PTS[k]}分</span><span class="mk">${mk}</span></div>`;
  }).join('');
  return `<div class="panel"><h3>玩家 <span class="r">点击玩家查看其酒店</span></h3><div class="plist">
    ${order.map(i => { const p = S.players[i]; const on = S.connected ? S.connected[i] : true;
      return `<div class="prow ${T && T.p === i ? 'active' : ''} ${ui.view === i ? 'viewing' : ''} ${on ? '' : 'off'}" data-a="view" data-i="${i}">
        ${dot(p.color)}<span class="nm">${esc(p.name)}${i === S.me ? '（你）' : ''}${S.waiting.includes(i) ? ' ⏸' : ''}</span>
        <span class="tiles">${p.tile.map((n, k) => `<span class="${p.covered[k] ? 'cv' : ''}">${n}</span>`).join('')}</span>
        <span class="st">⭐<b>${p.score}</b></span><span class="st">💶<b>${p.money}</b></span><span class="st">👑<b>${p.royal}</b> 🂠${p.handCount}</span></div>`; }).join('')}
  </div>
  <div class="small" style="margin-top:8px">皇室记录条（第3/5/7轮末计分，之后倒退3/5/7格；黄色格≥3得奖励，0格受惩罚；超过13格每格+1分）</div>
  <div class="track">${trackCells}</div></div>`;
}

function renderPolRoyal() {
  const me = S.players[S.me], T = S.turn;
  const myTurn = S.phase === 'play' && T && T.p === S.me;
  const pol = S.politics.map(c => {
    const P = POL[c.id];
    const ok = myTurn && me.politicsOk && me.politicsOk[c.id] && !c.marks.includes(S.me) && c.marks.length < 3;
    return `<div class="pol ${ok ? 'click' : ''}" ${ok ? `data-a="pol" data-id="${c.id}"` : ''} title="${esc(P.text)}">
      <b>${c.id[0]} · ${P.icon}</b><div>${esc(P.text)}</div>
      <div class="slots">${[15, 10, 5].map((v, k) => `<span class="slot">${v}${c.marks[k] != null ? dot(S.players[c.marks[k]].color) : ''}</span>`).join('')}</div>
      ${ok ? '<div class="small" style="color:#2f6b50;font-weight:700">✓ 已满足，点击领取</div>' : ''}</div>`;
  }).join('');
  const cur = S.round <= 3 ? 0 : S.round <= 5 ? 1 : 2;
  const roy = S.royalTiles.map((id, k) => {
    const R = RT[id];
    return `<div class="royal ${k === cur ? 'now' : ''}"><b>第${[3, 5, 7][k]}轮 · ${id}</b><div class="good">奖励：${esc(R.reward)}</div><div class="bad">惩罚：${esc(R.penalty)}</div></div>`;
  }).join('');
  return `<div class="panel"><h3>政务卡 <span class="r">满足条件后在自己回合点击领取</span></h3><div class="chips">${pol}</div>
    <h3 style="margin-top:10px">皇室板块</h3><div class="chips">${roy}</div></div>`;
}

function renderMyArea() {
  const vi = ui.view, p = S.players[vi], me = S.players[S.me], isMe = vi === S.me;
  const T = S.turn, t = me.pending[0];
  const myTurn = S.phase === 'play' && T && T.p === S.me;
  const freeTurn = myTurn && !t;
  // 酒店格子
  let cells = '';
  const zdone = new Set(p.zonesClaimed);
  for (let r = 3; r >= 0; r--) {
    cells += `<div class="fl"><b>${r + 1}F</b><span>💶${G.FLOOR_COST[r]}</span><span>⭐${G.FLOOR_PTS[r]}</span></div>`;
    for (let c = 0; c < 5; c++) {
      const col = cellColor(p, r, c), room = p.rooms[r][c], z = p.zoneOf[r][c];
      const zc = [];
      if (r === 3 || p.zoneOf[r + 1][c] !== z) zc.push('zt');
      if (r === 0 || p.zoneOf[r - 1][c] !== z) zc.push('zb');
      if (c === 0 || p.zoneOf[r][c - 1] !== z) zc.push('zl');
      if (c === 4 || p.zoneOf[r][c + 1] !== z) zc.push('zr');
      let can = false, costTag = '';
      if (isMe && t && t.k === 'rooms' && canPlace(p, r, c, t)) { const k = roomCost(p, r, c, t.d); if (k <= p.money) { can = true; costTag = `<span class="cost">${k ? '-' + k : '免费'}</span>`; } }
      if (isMe && t && t.k === 'flip' && room && room.s === 'ready') can = true;
      if (isMe && freeTurn && ui.selGuest != null && room && room.s === 'ready') {
        const g = GUEST[p.cafe[ui.selGuest].id]; if (g.color === 'green' || g.color === col) can = true;
      }
      const pt = G.ROOM_PTS[`${r}-${c}`];
      cells += `<div class="cell ${col} ${room ? room.s : ''} ${zc.join(' ')} ${zdone.has(z) ? 'zdone' : ''} ${can ? 'can' : ''}" ${can ? `data-a="cell" data-r="${r}" data-c="${c}"` : ''} title="${r + 1}${String(c + 1).padStart(2, '0')}">
        <div class="door"></div>${pt ? `<span class="pt">${pt}</span>` : ''}${costTag}</div>`;
    }
  }
  // 咖啡厅
  const cafe = p.cafe.map((g, s) => {
    if (!g) return guestCard(null, { emptyText: '空桌' });
    let click = false, attrs = '';
    if (isMe) {
      if (t && t.k === 'deliver' && !g.ok) { click = true; attrs = `data-a="deliver" data-s="${s}"`; }
      else if (freeTurn && ui.kSel && g.need.includes(ui.kSel)) { click = true; attrs = `data-a="serveTo" data-s="${s}"`; }
      else if (freeTurn && g.ok) { click = true; attrs = `data-a="selGuest" data-s="${s}"`; }
    }
    // 显示待上菜的预览
    let gv = g;
    if (isMe && ui.serve.length) { const need = g.need.slice(); for (const m of ui.serve) if (m.s === s) { const k = need.indexOf(m.c); if (k >= 0) need.splice(k, 1); } gv = Object.assign({}, g, { need }); }
    return guestCard(g.id, { g: gv, click, sel: ui.selGuest === s, attrs });
  }).join('');
  // 厨房
  const kit = Object.assign({}, p.kitchen); if (isMe) for (const m of ui.serve) kit[m.c]--;
  const canServe = isMe && freeTurn && (has(me, 24) || me.money >= 1) && ui.serve.length < 3;
  const kitchen = G.FOOD.map(c => `<span class="k ${ui.kSel === c && isMe ? 'sel' : ''}">${food(c, 'big ' + (canServe && kit[c] > 0 ? 'click' : ''))}${canServe && kit[c] > 0 ? '' : ''}<b>×${kit[c]}</b></span>`).join('');
  // 手牌
  let hand = '';
  if (isMe) {
    hand = (me.hand || []).map(id => {
      let click = false, cost = null, sel = false;
      if (t && t.k === 'play') { cost = empCost(id, t.d); click = cost <= me.money; }
      if (t && t.k === 'ret') { click = true; sel = ui.retSel.includes(id); }
      return empCard(id, { click, cost, sel, attrs: click ? `data-a="hand" data-id="${id}"` : '' });
    }).join('') || '<span class="small">没有手牌</span>';
  }
  const played = p.played.map(e => {
    const E = EMP[e.id];
    let click = false;
    if (isMe && freeTurn && E.type === 'round' && !e.used) click = true;
    if (isMe && t && t.k === 'discEnd' && E.type === 'end') click = true;
    return empCard(e.id, { click, used: e.used, attrs: click ? `data-a="played" data-id="${e.id}"` : '' });
  }).join('') || '<span class="small">尚未雇用员工</span>';
  const kitchenAttrs = canServe ? 'data-kitchen="1"' : '';
  return `
  <div class="panel">
    <h3>${dot(p.color)} ${esc(p.name)} 的酒店 <span class="r">版图：${p.side === 'moon' ? '月亮面' : '太阳面 ' + p.side}</span></h3>
    ${S.players.length > 1 ? `<div class="tabs" style="margin-bottom:8px">${S.players.map((q, i) => `<button class="${i === vi ? '' : 'ghost'}" data-a="view" data-i="${i}">${esc(q.name)}${i === S.me ? '（我）' : ''}</button>`).join('')}</div>` : ''}
    <div class="res">
      <span class="stat">💶 <span class="big">${p.money}</span> 克朗</span>
      <span class="stat">👑 <span class="big">${p.royal}</span></span>
      <span class="stat">⭐ <span class="big">${p.score}</span> 分</span>
      <span class="stat">🂠 手牌 ${p.handCount}</span>
    </div>
    <div class="hotel">${cells}</div>
    <div class="zleg"><span>区域全入住奖励（按区域大小1/2/3/4间）：</span><span style="color:#2f5ea8"><b>蓝</b> 2/5/9/15分</span><span style="color:#c2412f"><b>红</b> 1/3/6/10克朗</span><span style="color:#a77c12"><b>黄</b> 皇室1/3/6/10</span><span>粗线 = 区域边界；斜纹 = 已完成</span></div>
  </div>
  <div class="panel"><h3>咖啡厅 <span class="r">游戏结束时每位剩余宾客 -5分</span></h3><div class="cards">${cafe}</div>
    <h3 style="margin-top:10px">厨房 <span class="r">${isMe && freeTurn ? (has(me, 24) ? '餐厅领班：免费上菜' : '付1克朗可把最多3个餐点从厨房移到宾客') : ''}</span></h3>
    <div class="kitchen" ${kitchenAttrs}>${isMe ? kitchen.replace(/<span class="food ([a-z]+)/g, (m, c) => `<span data-a="kit" data-c="${c}" class="food ${c}`) : kitchen}</div>
  </div>
  ${isMe ? `<div class="panel"><h3>手牌员工 <span class="r">牌堆 ${S.empDeck} 张</span></h3><div class="cards">${hand}</div></div>` : ''}
  <div class="panel"><h3>已雇用员工 <span class="r">${p.played.length} 张${isMe && freeTurn ? '；蓝色“每轮一次”可点击使用' : ''}</span></h3><div class="cards">${played}</div></div>`;
}

// ---------------- 弹窗 ----------------
function renderModal() {
  if (S.phase === 'ended' && ui.modal !== 'closedFinal') return renderFinal();
  const me = S.players[S.me], t = me.pending[0];
  if (!t || ui.modal === 'hidden') return '';
  const M = ui.modal || (ui.modal = initModal(t, me));
  if (!M) return '';
  const box = (title, body, foot) => `<div class="modal"><div class="box"><h2>${title}</h2>${body}<div class="row" style="justify-content:flex-end">${foot}</div></div></div>`;
  const hide = '<button class="ghost" data-a="hideModal">先看看棋盘</button>';
  switch (t.k) {
    case 'food': {
      const rows = t.tokens.map((c, i) => {
        const opts = [`<option value="-1">放入厨房</option>`].concat(me.cafe.map((g, s) => g && g.need.includes(c) ? `<option value="${s}" ${M.assign[i] === s ? 'selected' : ''}>给 ${esc(GUEST[g.id].name)}</option>` : '').filter(Boolean));
        return `<div class="row">${food(c, 'big')} <select data-fa="${i}">${opts.join('')}</select></div>`;
      }).join('');
      return box('分配获得的餐点/饮料', `<p class="small">可直接免费放到宾客的点餐需求上，其余放入厨房。</p>${rows}`, `${hide}<button class="gold" data-a="foodOk">确认</button>`);
    }
    case 'anyFood': return box(`选择 ${t.n} 个任意餐点`, `<div class="row">${G.FOOD.map(c => `<div class="stepper">${food(c, 'big')}<button data-a="af" data-c="${c}" data-d="-1">−</button><span class="v">${M.cnt[c]}</span><button data-a="af" data-c="${c}" data-d="1">+</button></div>`).join('')}</div>`,
      `${hide}<button class="gold" data-a="afOk" ${Object.values(M.cnt).reduce((a, b) => a + b, 0) === t.n ? '' : 'disabled'}>确认</button>`);
    case 'act12': {
      const [ca, cb] = t.which === 1 ? ['brown', 'white'] : ['red', 'black'];
      return box(`行动${t.which}：最多拿取 ${t.n} 个`, `<p class="small">${t.which === 1 ? '蛋糕数量不能多于点心' : '咖啡数量不能多于葡萄酒'}</p>
        <div class="row"><div class="stepper">${food(ca, 'big')}<button data-a="a12" data-k="a" data-d="-1">−</button><span class="v">${M.a}</span><button data-a="a12" data-k="a" data-d="1">+</button></div>
        <div class="stepper">${food(cb, 'big')}<button data-a="a12" data-k="b" data-d="-1">−</button><span class="v">${M.b}</span><button data-a="a12" data-k="b" data-d="1">+</button></div></div>`,
        `${hide}<button class="gold" data-a="a12Ok" ${M.b <= M.a && M.a + M.b <= t.n ? '' : 'disabled'}>确认拿取 ${M.a + M.b} 个</button>`);
    }
    case 'act4': return box(`行动4：共推进 ${t.n} 格`, `<p class="small">在皇室记录条和资金记录条之间任意分配（资金上限20）</p>
      <div class="row"><div class="stepper">👑 皇室<button data-a="a4" data-d="-1">−</button><span class="v">${M.r}</span><button data-a="a4" data-d="1">+</button></div><div>💶 资金 <b style="font-size:20px">${t.n - M.r}</b></div></div>`,
      `${hide}<button class="gold" data-a="a4Ok">确认</button>`);
    case 'act6': return box(`行动6：选择执行的行动（强度 ${t.n}）`, `<div class="row">${[1, 2, 3, 4, 5].map(a => `<button data-a="a6" data-v="${a}">${a}：${ACTION_LBL[a].replace(/<br>.*/, '')}</button>`).join('')}</div>`, hide);
    case 'd3p': return box(`抓3张员工，打出其中1张（${t.d >= G.FREE ? '免费' : '减' + t.d + '克朗'}）`, `<p class="small">其余卡牌放回牌堆底</p><div class="cards">${(t.cards || []).map(id => { const c = empCost(id, t.d); return empCard(id, { cost: c, click: c <= me.money, attrs: c <= me.money ? `data-a="d3p" data-id="${id}"` : '' }); }).join('')}</div>`, `${hide}<button class="ghost" data-p="skip">都不打出</button>`);
    case 'choice': return box(esc(t.title || '请选择'), `<div class="row">${t.opts.map(o => `<button data-a="choice" data-code="${esc(o.code)}">${esc(o.label)}</button>`).join('')}</div>`, '');
  }
  return '';
}
function initModal(t, me) {
  switch (t.k) {
    case 'food': {
      const need = me.cafe.map(g => g ? g.need.slice() : []);
      const assign = t.tokens.map(c => { for (let s = 0; s < 3; s++) { const k = need[s].indexOf(c); if (k >= 0) { need[s].splice(k, 1); return s; } } return -1; });
      return { assign };
    }
    case 'anyFood': return { cnt: { brown: 0, white: 0, red: 0, black: 0 } };
    case 'act12': { const a = Math.ceil(t.n / 2); return { a, b: t.n - a }; }
    case 'act4': return { r: t.n };
    case 'act6': case 'd3p': case 'choice': return {};
  }
  return null;
}
function renderFinal() {
  const rows = S.ranking.map((i, k) => { const p = S.players[i], f = p.final;
    return `<tr class="${k === 0 ? 'win' : ''}"><td>${k + 1}</td><td>${dot(p.color)} ${esc(p.name)}</td><td>${f.start}</td><td title="${esc(f.empDetail.join('，'))}">${f.emp}</td><td>${f.rooms}</td><td>${f.money}</td><td>${f.food}</td><td>${f.cafe}</td><td><b>${f.total}</b></td></tr>`; }).join('');
  return `<div class="modal"><div class="box final" style="max-width:720px"><h2>🏆 最终计分 · ${esc(S.players[S.ranking[0]].name)} 获胜！</h2>
    <table><tr><th>名次</th><th>玩家</th><th>游戏中</th><th>员工</th><th>入住客房</th><th>克朗</th><th>厨房餐点</th><th>咖啡厅</th><th>总分</th></tr>${rows}</table>
    <p class="small">平分时，剩余餐点与克朗总数多者获胜。鼠标悬停“员工”可查看明细。</p>
    <div class="row" style="justify-content:flex-end"><button class="ghost" data-a="closeFinal">关闭</button>${lobby.you === 0 ? '<button class="gold" data-a="restart">返回房间再来一局</button>' : ''}</div></div></div>`;
}
function renderRules() {
  return `<div class="modal"><div class="box" style="max-width:680px"><h2>规则速查</h2>
  <div style="line-height:1.7;font-size:13px">
  <b>回合</b>：① 可选：拿取1位宾客（付宾客格下方费用：最左3克朗，向右依次2/1/0/0）。② 必须：从有骰子的行动格拿1颗骰子，按该格骰子<b>数量</b>执行行动。<br>
  <b>行动</b>：1 点心/蛋糕（蛋糕≤点心）；2 葡萄酒/咖啡（咖啡≤酒）；3 准备客房（每颗骰子1间，付楼层费用0/1/2/3）；4 皇室/资金任意分配；5 打出1张员工，每颗骰子减1克朗；6 付1克朗执行1-5中任一行动，强度=【6】的骰子数。<br>
  <b>额外行动（任意次数）</b>：每回合一次付1克朗使骰子数+1；付1克朗把最多3个餐点从厨房移到宾客；满足条件时领取政务卡；使用【每轮一次】员工；把已满足的宾客移入同色空闲客房（绿色游客可住任意颜色），获得分数与奖励。<br>
  <b>客房</b>：第一间必须在左下角，之后必须与已有客房相邻；同色相邻客房组成区域，区域全部入住时获得奖励。<br>
  <b>回合顺序</b>：每人有两个顺位数字，数字最小者先行动；跳过回合需等待其他人行动完，只剩跳过的玩家时移除1颗骰子并重投。<br>
  <b>皇室计分</b>：第3/5/7轮结束时按皇室位置得分，然后倒退3/5/7格；仍≥3格获得板块奖励，在0格受惩罚。<br>
  <b>终局</b>：员工分 + 已入住客房（1-4层：1/2/3/4分）+ 每克朗1分 + 厨房每个餐点1分 − 咖啡厅每位宾客5分。
  </div><div class="row" style="justify-content:flex-end"><button data-a="rulesClose">关闭</button></div></div></div>`;
}

// ---------------- 交互 ----------------
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.set) sendRaw({ t: 'settings', [el.dataset.set]: el.value });
  if (el.dataset.fa != null && ui.modal) ui.modal.assign[+el.dataset.fa] = +el.value;
  if (el.dataset.a === 'boost') { ui.boost = el.checked; }
});
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a],[data-p]');
  if (!el) return;
  if (el.tagName === 'INPUT') return;
  const a = el.dataset.a, d = el.dataset;
  if (d.p) { pend({ [d.p]: true }); return; }
  const me = S && S.players[S.me];
  switch (a) {
    case 'create': case 'join': {
      const name = (document.getElementById('nm').value || '').trim();
      if (!name) return toast('请输入你的名字');
      try { localStorage.setItem('gh_name', name); } catch {}
      if (a === 'create') sendRaw({ t: 'create', name });
      else { const code = (document.getElementById('code').value || '').trim().toUpperCase(); if (code.length !== 4) return toast('请输入4位房间号'); sendRaw({ t: 'join', name, code }); }
      return;
    }
    case 'start': return sendRaw({ t: 'start' });
    case 'leave': return sendRaw({ t: 'leave' });
    case 'restart': ui.modal = null; return sendRaw({ t: 'restart' });
    case 'rules': ui.showRules = true; break;
    case 'rulesClose': ui.showRules = false; break;
    case 'final': ui.modal = null; break;
    case 'closeFinal': ui.modal = 'closedFinal'; break;
    case 'hideModal': ui.modal = 'hidden'; break;
    case 'reopen': ui.modal = null; break;
    case 'view': ui.view = +d.i; break;
    case 'takeGuest': {
      const t = me.pending[0];
      if (t && t.k === 'guest') pend({ i: +d.i }); else act({ type: 'takeGuest', i: +d.i });
      return;
    }
    case 'die': act({ type: 'takeDie', v: +d.v, boost: ui.boost }); ui.boost = false; return;
    case 'skip': if (confirm('确定跳过这个回合吗？你需要等其他玩家都行动完。')) act({ type: 'skip' }); return;
    case 'endTurn': {
      const anyOk = me.cafe.some(g => g && g.ok) && me.rooms.some(r => r.some(x => x && x.s === 'ready'));
      if (ui.serve.length && !confirm('还有未确认的上菜，确定结束回合？')) return;
      if (anyOk && !confirm('你有可以入住的宾客和空闲客房，确定结束回合吗？')) return;
      ui.serve = []; ui.kSel = null; ui.selGuest = null;
      act({ type: 'endTurn' }); return;
    }
    case 'cell': {
      const r = +d.r, c = +d.c, t = me.pending[0];
      if (t && (t.k === 'rooms' || t.k === 'flip')) pend({ r, c });
      else if (ui.selGuest != null) { act({ type: 'checkin', slot: ui.selGuest, r, c }); ui.selGuest = null; }
      return;
    }
    case 'selGuest': ui.selGuest = ui.selGuest === +d.s ? null : +d.s; ui.kSel = null; break;
    case 'unselGuest': ui.selGuest = null; break;
    case 'kit': {
      if (ui.view !== S.me) return;
      const T = S.turn; if (!(S.phase === 'play' && T && T.p === S.me && !me.pending.length)) return;
      const used = ui.serve.filter(m => m.c === d.c).length;
      if (me.kitchen[d.c] - used <= 0) return toast('厨房里没有这个餐点了');
      if (ui.serve.length >= 3) return toast('每次最多移动3个');
      if (!has(me, 24) && me.money < 1) return toast('克朗不足');
      ui.kSel = ui.kSel === d.c ? null : d.c; ui.selGuest = null; break;
    }
    case 'serveTo': {
      const s = +d.s, g = me.cafe[s];
      const already = ui.serve.filter(m => m.s === s && m.c === ui.kSel).length;
      const needN = g.need.filter(c => c === ui.kSel).length;
      if (already >= needN) return toast('该宾客已不需要更多这种餐点');
      ui.serve.push({ c: ui.kSel, s });
      const left = me.kitchen[ui.kSel] - ui.serve.filter(m => m.c === ui.kSel).length;
      if (left <= 0 || ui.serve.length >= 3) ui.kSel = null;
      break;
    }
    case 'serveOk': act({ type: 'serve', moves: ui.serve }); ui.serve = []; ui.kSel = null; return;
    case 'serveCancel': ui.serve = []; ui.kSel = null; break;
    case 'deliver': pend({ slot: +d.s }); return;
    case 'hand': {
      const t = me.pending[0], id = +d.id;
      if (t && t.k === 'play') pend({ id });
      else if (t && t.k === 'ret') { const i = ui.retSel.indexOf(id); if (i >= 0) ui.retSel.splice(i, 1); else if (ui.retSel.length < t.n) ui.retSel.push(id); }
      break;
    }
    case 'retOk': pend({ ids: ui.retSel }); return;
    case 'played': {
      const t = me.pending[0], id = +d.id;
      if (t && t.k === 'discEnd') pend({ id }); else act({ type: 'useEmp', id });
      return;
    }
    case 'pol': act({ type: 'politic', id: d.id }); return;
    case 'foodOk': pend({ assign: ui.modal.assign }); return;
    case 'af': { const M = ui.modal, t = me.pending[0]; const tot = Object.values(M.cnt).reduce((x, y) => x + y, 0); const dv = +d.d; if (dv > 0 && tot >= t.n) break; M.cnt[d.c] = Math.max(0, M.cnt[d.c] + dv); break; }
    case 'afOk': { const cs = []; for (const c of G.FOOD) for (let i = 0; i < ui.modal.cnt[c]; i++) cs.push(c); pend({ colors: cs }); return; }
    case 'a12': { const M = ui.modal, t = me.pending[0]; const dv = +d.d; const nv = M[d.k] + dv; if (nv < 0) break; if (dv > 0 && M.a + M.b >= t.n) break; M[d.k] = nv; break; }
    case 'a12Ok': pend({ a: ui.modal.a, b: ui.modal.b }); return;
    case 'a4': { const t = me.pending[0]; ui.modal.r = Math.max(0, Math.min(t.n, ui.modal.r + +d.d)); break; }
    case 'a4Ok': { const t = me.pending[0]; pend({ royal: ui.modal.r, money: t.n - ui.modal.r }); return; }
    case 'a6': pend({ action: +d.v }); return;
    case 'd3p': pend({ id: +d.id }); return;
    case 'choice': pend({ code: d.code }); return;
    default: return;
  }
  render();
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && !lobby && document.activeElement && document.activeElement.id === 'code') document.querySelector('[data-a="join"]').click(); });

// ---------------- 启动 ----------------
render();
connect();
})();
