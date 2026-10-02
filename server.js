// Chore Mission: tiny self-hosted backend. Node 22+, zero npm dependencies.
// Serves public/index.html and a small JSON document API backed by SQLite.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = parseInt(process.env.PORT || '8080', 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const TOKEN_TTL_MS = 30 * 60 * 1000;
const COLLECTIONS = new Set(['setup', 'days', 'spins']);
const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,100}$/;
const FAMILY_PASSWORD = process.env.FAMILY_PASSWORD || '';
const COOKIE = 'cm_auth';
const OPEN_PATHS = new Set(['/login', '/healthz', '/manifest.webmanifest', '/icon-180.png', '/icon-192.png', '/icon-512.png']);

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'chores.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (col, id));
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
const q = {
  get: db.prepare('SELECT data FROM docs WHERE col = ? AND id = ?'),
  list: db.prepare('SELECT id, data FROM docs WHERE col = ? ORDER BY id'),
  put: db.prepare(`INSERT INTO docs (col, id, data) VALUES (?, ?, ?)
    ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`),
  del: db.prepare('DELETE FROM docs WHERE col = ? AND id = ?'),
  count: db.prepare('SELECT COUNT(*) AS n FROM docs'),
  getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
  setMeta: db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
  delMeta: db.prepare('DELETE FROM meta WHERE key = ?'),
};

// ---- CLI: node server.js --reset-pin ----
if (process.argv.includes('--reset-pin')) {
  q.delMeta.run('pin');
  console.log('Parent PIN cleared. Open Setup to create a new one.');
  process.exit(0);
}

// ---- first-run seed ----
const seedFile = path.join(__dirname, 'seed.json');
if (q.count.get().n === 0 && fs.existsSync(seedFile)) {
  const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
  for (const [col, docs] of Object.entries(seed)) {
    if (!COLLECTIONS.has(col)) continue;
    for (const [id, data] of Object.entries(docs)) q.put.run(col, id, JSON.stringify(data));
  }
  console.log('Seeded database from seed.json');
}

// ---- parent PIN (scrypt) + short-lived tokens ----
const tokens = new Map();
setInterval(() => { const now = Date.now(); for (const [t, exp] of tokens) if (exp < now) tokens.delete(t); }, 10 * 60 * 1000).unref();
function hasPin() { return !!q.getMeta.get('pin'); }
function setPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, 32).toString('hex');
  q.setMeta.run('pin', salt + ':' + hash);
}
function checkPin(pin) {
  const row = q.getMeta.get('pin'); if (!row) return false;
  const [salt, hash] = row.value.split(':');
  const got = crypto.scryptSync(pin, salt, 32);
  return crypto.timingSafeEqual(got, Buffer.from(hash, 'hex'));
}
function newToken() { const t = crypto.randomBytes(24).toString('hex'); tokens.set(t, Date.now() + TOKEN_TTL_MS); return t; }
function validToken(req) {
  const m = /^Bearer (\w+)$/.exec(req.headers.authorization || ''); if (!m) return false;
  const exp = tokens.get(m[1]); if (!exp || exp < Date.now()) { tokens.delete(m[1]); return false; }
  return true;
}
let pinFails = 0, pinLockUntil = 0;

// ---- family password (optional, set FAMILY_PASSWORD) ----
function authSecret() {
  let row = q.getMeta.get('secret');
  if (!row) { q.setMeta.run('secret', crypto.randomBytes(32).toString('hex')); row = q.getMeta.get('secret'); }
  return row.value;
}
function authValue() { return crypto.createHmac('sha256', authSecret()).update('family:' + FAMILY_PASSWORD).digest('hex'); }
function isAuthed(req) {
  if (!FAMILY_PASSWORD) return true;
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]+)').exec(req.headers.cookie || '');
  if (!m) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(authValue());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const LOGIN_HTML = (err) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chore Mission</title><meta name="theme-color" content="#141a3a"><link rel="apple-touch-icon" href="icon-180.png">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#141a3a;color:#f4f6ff;font:16px system-ui,sans-serif;padding:16px;box-sizing:border-box}
form{background:#252f66;border-radius:20px;padding:24px;display:flex;flex-direction:column;gap:12px;width:min(320px,100%);text-align:center}
h1{margin:0;font-size:1.6rem}p{margin:0;color:#a9b2e0}input{font:inherit;font-size:1.1rem;padding:12px;border-radius:10px;border:1px solid #3a4588;background:#141a3a;color:#f4f6ff;text-align:center}
button{font:inherit;font-weight:800;font-size:1.1rem;padding:12px;border:0;border-radius:12px;background:#ffd23f;color:#2a1f00}.e{color:#ff5fa2;font-weight:700}</style></head>
<body><form method="post" action="/login"><div style="font-size:3rem">🚀</div><h1>Chore Mission</h1><p>Enter the family password</p>
${err ? '<p class="e">Wrong password.</p>' : ''}<input type="password" name="password" autocomplete="current-password" required autofocus aria-label="Family password"><button type="submit">Let me in</button></form></body></html>`;
let loginFails = 0, loginLockUntil = 0;
function readForm(req) {
  return new Promise((resolve) => { let d = ''; req.on('data', c => { d += c; if (d.length > 4096) req.destroy(); }); req.on('end', () => resolve(new URLSearchParams(d))); });
}

// ---- live updates (SSE) ----
const clients = new Set();
function broadcast(col, id, data) {
  const msg = `data: ${JSON.stringify({ col, id, data: publicView(col, data) })}\n\n`;
  for (const res of clients) res.write(msg);
}
function publicView(col, data) {
  if (col === 'setup' && data) return { ...data, pinHash: hasPin() ? 'set' : '' };
  return data;
}

// ---- helpers ----
function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object';
  res.writeHead(status, { 'Content-Type': isObj ? 'application/json' : 'text/plain', 'Cache-Control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 256 * 1024) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? deepMerge(a[k], v) : v;
  }
  return out;
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

// ---- server ----
const server = http.createServer(async (req, res) => {
  const started = process.hrtime.bigint();
  const url = new URL(req.url, 'http://x');
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(`${req.socket.remoteAddress || '-'} ${req.method} ${url.pathname} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  const p = url.pathname;
  try {
    if (p === '/healthz') return send(res, 200, 'ok');

    if (p === '/login') {
      if (!FAMILY_PASSWORD) { res.writeHead(302, { Location: '/' }); return res.end(); }
      if (req.method === 'POST') {
        if (Date.now() < loginLockUntil) { res.writeHead(429, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(LOGIN_HTML(true)); }
        const pw = (await readForm(req)).get('password') || '';
        const a = crypto.createHash('sha256').update(pw).digest(), b = crypto.createHash('sha256').update(FAMILY_PASSWORD).digest();
        if (crypto.timingSafeEqual(a, b)) {
          loginFails = 0;
          const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
          res.writeHead(303, { Location: '/', 'Set-Cookie': `${COOKIE}=${authValue()}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax${secure}` });
          return res.end();
        }
        if (++loginFails >= 10) { loginFails = 0; loginLockUntil = Date.now() + 5 * 60000; }
        res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(LOGIN_HTML(true));
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(LOGIN_HTML(false));
    }

    if (!OPEN_PATHS.has(p) && !isAuthed(req)) {
      if (p.startsWith('/api/')) return send(res, 401, { error: 'login required' });
      res.writeHead(302, { Location: '/login' }); return res.end();
    }

    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(': hi\n\n'); clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }

    if (p === '/api/pin' && req.method === 'POST') {
      if (Date.now() < pinLockUntil) return send(res, 429, { error: 'Too many tries. Wait a minute.' });
      const { pin } = await readBody(req);
      if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) return send(res, 400, { error: 'Use 4 to 8 digits.' });
      if (!hasPin()) { setPin(pin); broadcast('setup', 'main', JSON.parse(q.get.get('setup', 'main')?.data || '{}')); return send(res, 200, { token: newToken(), created: true }); }
      if (checkPin(pin)) { pinFails = 0; return send(res, 200, { token: newToken() }); }
      if (++pinFails >= 5) { pinFails = 0; pinLockUntil = Date.now() + 60000; }
      return send(res, 403, { error: 'Wrong PIN.' });
    }

    let m = /^\/api\/col\/([a-z]+)$/.exec(p);
    if (m && req.method === 'GET') {
      if (!COLLECTIONS.has(m[1])) return send(res, 404, { error: 'not found' });
      const docs = q.list.all(m[1]).map(r => ({ id: r.id, data: publicView(m[1], JSON.parse(r.data)) }));
      return send(res, 200, { docs });
    }

    m = /^\/api\/doc\/([a-z]+)\/([^/]+)$/.exec(p);
    if (m) {
      const col = m[1], id = decodeURIComponent(m[2]);
      if (!COLLECTIONS.has(col) || !ID_RE.test(id)) return send(res, 404, { error: 'not found' });
      if (req.method === 'GET') { const r = q.get.get(col, id); return send(res, 200, r ? { exists: true, data: publicView(col, JSON.parse(r.data)) } : { exists: false }); }
      if (col === 'setup' && !validToken(req)) return send(res, 401, { error: 'Setup is locked.' });
      if (req.method === 'PUT' || req.method === 'PATCH') {
        let body = await readBody(req);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: 'body must be an object' });
        delete body.pinHash;
        if (req.method === 'PATCH') { const r = q.get.get(col, id); if (!r) return send(res, 404, { error: 'not found' }); body = deepMerge(JSON.parse(r.data), body); }
        q.put.run(col, id, JSON.stringify(body)); broadcast(col, id, body);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') { q.del.run(col, id); broadcast(col, id, null); return send(res, 200, { ok: true }); }
      return send(res, 405, { error: 'method not allowed' });
    }

    if (req.method === 'GET') {
      const file = p === '/' ? 'index.html' : p.slice(1);
      const full = path.join(PUBLIC_DIR, path.normalize(file));
      if (!full.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) return send(res, 404, 'not found');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': (file === 'index.html' || file === 'sw.js') ? 'no-cache' : 'max-age=86400' });
      return fs.createReadStream(full).pipe(res);
    }
    send(res, 404, 'not found');
  } catch (e) {
    console.error(e); if (!res.headersSent) send(res, 500, { error: 'server error' });
  }
});
server.listen(PORT, () => console.log(`Chore Mission listening on :${PORT} (data in ${DATA_DIR})`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); db.close(); process.exit(0); });
