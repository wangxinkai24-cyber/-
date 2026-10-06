// 奥地利大饭店 — 联机服务器（HTTP 静态文件 + WebSocket 房间）
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Game, RuleError } = require('./game');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/health') { res.writeHead(200); return res.end('ok'); }
  if (url === '/data.js') { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return fs.createReadStream(path.join(__dirname, 'data.js')).pipe(res); }
  if (url === '/') url = '/index.html';
  const file = path.normalize(path.join(PUB, url));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // code -> room

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c; do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}
function send(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function lobbyMsg(room, seat) {
  return { t: 'lobby', code: room.code, host: 0, you: seat, settings: room.settings, started: !!room.game,
    seats: room.seats.map(s => ({ name: s.name, connected: !!(s.ws && s.ws.readyState === 1) })) };
}
function broadcast(room) {
  room.touched = Date.now();
  room.seats.forEach((s, i) => {
    send(s.ws, lobbyMsg(room, i));
    if (room.game) {
      const st = room.game.view(i);
      st.connected = room.seats.map(x => !!(x.ws && x.ws.readyState === 1));
      send(s.ws, { t: 'state', state: st });
    }
  });
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    try { onMessage(ws, m); }
    catch (e) {
      if (e instanceof RuleError) send(ws, { t: 'err', msg: e.message });
      else { console.error(e); send(ws, { t: 'err', msg: '服务器错误：' + e.message }); }
    }
  });
  ws.on('close', () => { if (ws.room) broadcast(ws.room); });
});

function onMessage(ws, m) {
  const name = String(m.name || '').trim().slice(0, 12) || '玩家';
  if (m.t === 'create') {
    const room = { code: newCode(), seats: [], settings: { side: 'moon', empVariant: 'starter' }, game: null, touched: Date.now() };
    rooms.set(room.code, room);
    return seat(ws, room, name);
  }
  if (m.t === 'join') {
    const room = rooms.get(String(m.code || '').toUpperCase().trim());
    if (!room) return send(ws, { t: 'err', msg: '找不到这个房间号' });
    if (room.game) return send(ws, { t: 'err', msg: '游戏已经开始，无法加入（掉线玩家会自动重连）' });
    if (room.seats.length >= 4) return send(ws, { t: 'err', msg: '房间已满（最多4人）' });
    return seat(ws, room, name);
  }
  if (m.t === 'rejoin') {
    const room = rooms.get(String(m.code || '').toUpperCase());
    if (!room) return send(ws, { t: 'gone' });
    const i = room.seats.findIndex(s => s.token === m.token);
    if (i < 0) return send(ws, { t: 'gone' });
    room.seats[i].ws = ws; ws.room = room; ws.seat = i;
    send(ws, { t: 'joined', code: room.code, token: m.token, seat: i });
    return broadcast(room);
  }
  const room = ws.room; if (!room) return send(ws, { t: 'err', msg: '你不在房间中' });
  const si = ws.seat;
  if (m.t === 'settings') {
    if (si !== 0 || room.game) return;
    if (['moon', 'sun'].includes(m.side)) room.settings.side = m.side;
    if (['starter', 'random'].includes(m.empVariant)) room.settings.empVariant = m.empVariant;
    return broadcast(room);
  }
  if (m.t === 'leave') {
    if (room.game) return;
    room.seats.splice(si, 1);
    room.seats.forEach((s, i) => { if (s.ws) s.ws.seat = i; });
    ws.room = null;
    send(ws, { t: 'left' });
    if (!room.seats.length) rooms.delete(room.code); else broadcast(room);
    return;
  }
  if (m.t === 'start') {
    if (si !== 0) return send(ws, { t: 'err', msg: '只有房主可以开始游戏' });
    if (room.game) return;
    if (room.seats.length < 2) return send(ws, { t: 'err', msg: '至少需要2名玩家' });
    room.game = new Game(room.seats.map(s => ({ name: s.name })), room.settings);
    return broadcast(room);
  }
  if (m.t === 'restart') {
    if (si !== 0) return;
    room.game = null; return broadcast(room);
  }
  if (m.t === 'act') {
    if (!room.game) return;
    room.game.handle(si, m.msg || {});
    return broadcast(room);
  }
}

function seat(ws, room, name) {
  const token = crypto.randomBytes(12).toString('hex');
  room.seats.push({ name, token, ws });
  ws.room = room; ws.seat = room.seats.length - 1;
  send(ws, { t: 'joined', code: room.code, token, seat: ws.seat });
  broadcast(room);
}

// 心跳与清理闲置房间（12小时）
setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); });
  const now = Date.now();
  for (const [code, r] of rooms) if (now - r.touched > 12 * 3600e3) rooms.delete(code);
}, 30000);

server.listen(PORT, () => console.log(`奥地利大饭店服务器已启动：http://localhost:${PORT}`));
