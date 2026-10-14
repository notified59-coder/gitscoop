import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { db, migrate } from './db.js';
import { assertEnv, encrypt, decrypt, isProd } from './security.js';
import { gh, cached, GhError, slimRepo, TEXT_LIMIT, isBinaryName } from './github.js';

assertEnv();
await migrate();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'client', 'dist');
const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
const SECRET = process.env.SESSION_SECRET;
const secureCookie = APP_URL.startsWith('https://');
const MAX_REPOS = 12;

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'script-src': ["'self'", "'wasm-unsafe-eval'"],
      'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'connect-src': ["'self'", 'blob:', 'data:'],
      'worker-src': ["'self'", 'blob:'],
      'upgrade-insecure-requests': isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '32kb' }));

const api = express.Router();
const tooMany = { error: 'Too many requests. Please wait a minute and try again.' };
// Visitors reading portfolios: per IP.
const publicLimit = rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false, message: tooMany });
// The signed-in owner editing their own portfolio: per session, so visitors can never starve it.
const meLimit = rateLimit({
  windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false, message: tooMany,
  keyGenerator: (req) => (req.cookies?.gs_session ? `s:${req.cookies.gs_session.slice(-32)}` : req.ip),
});
api.use('/p', publicLimit);
api.use('/me', meLimit);

// CSRF defence in depth: state-changing requests must come from our own origin.
api.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== APP_URL) return res.status(403).json({ error: 'Bad origin' });
  next();
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- session ----------
const setSession = (res, uid) =>
  res.cookie('gs_session', jwt.sign({ uid }, SECRET, { expiresIn: '30d' }), {
    httpOnly: true, sameSite: 'lax', secure: secureCookie, maxAge: 30 * 864e5, path: '/',
  });

async function currentUser(req) {
  const tok = req.cookies?.gs_session;
  if (!tok) return null;
  try {
    const { uid } = jwt.verify(tok, SECRET);
    const r = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [uid] });
    return r.rows[0] || null;
  } catch { return null; }
}
const requireUser = wrap(async (req, res, next) => {
  const u = await currentUser(req);
  if (!u) return res.status(401).json({ error: 'Sign in to continue' });
  req.user = u; next();
});
const publicUser = (u) => ({ id: Number(u.id), username: u.username, name: u.name, avatar: u.avatar, bio: u.bio });

// ---------- auth ----------
const authLimit = rateLimit({ windowMs: 15 * 60_000, limit: 40, message: tooMany });
api.get('/auth/github', authLimit, (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('gs_state', state, { httpOnly: true, sameSite: 'lax', secure: secureCookie, maxAge: 10 * 60_000 });
  const q = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: `${APP_URL}/api/auth/github/callback`,
    scope: 'read:user',
    state,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${q}`);
});

api.get('/auth/github/callback', authLimit, wrap(async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || state !== req.cookies?.gs_state) return res.redirect('/?auth=failed');
  res.clearCookie('gs_state');
  const tr = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${APP_URL}/api/auth/github/callback`,
    }),
  });
  const { access_token } = await tr.json();
  if (!access_token) return res.redirect('/?auth=failed');
  const me = await (await gh('/user', access_token)).json();
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO users (github_id, username, username_lc, name, avatar, bio, token_enc, created_at)
          VALUES (?,?,?,?,?,?,?,?)
          ON CONFLICT(github_id) DO UPDATE SET username=excluded.username, username_lc=excluded.username_lc,
            name=excluded.name, avatar=excluded.avatar, bio=excluded.bio, token_enc=excluded.token_enc`,
    args: [me.id, me.login, me.login.toLowerCase(), me.name, me.avatar_url, me.bio, encrypt(access_token), now],
  });
  const row = (await db.execute({ sql: 'SELECT id FROM users WHERE github_id = ?', args: [me.id] })).rows[0];
  await db.execute({
    sql: 'INSERT OR IGNORE INTO portfolios (user_id, headline, updated_at) VALUES (?,?,?)',
    args: [row.id, me.bio || '', now],
  });
  setSession(res, Number(row.id));
  res.redirect('/dashboard');
}));

api.post('/auth/logout', (req, res) => { res.clearCookie('gs_session', { path: '/' }); res.json({ ok: true }); });
api.get('/me', wrap(async (req, res) => {
  const u = await currentUser(req);
  res.json({ user: u ? publicUser(u) : null });
}));

// ---------- dashboard ----------
const userToken = (u) => (u.token_enc ? decrypt(u.token_enc) : null);

api.get('/me/repos', requireUser, wrap(async (req, res) => {
  const token = userToken(req.user);
  const repos = await cached(`repos:${req.user.id}`, 60_000, async () => {
    const out = [];
    for (let page = 1; page <= 5; page++) {
      const r = await (await gh(`/user/repos?visibility=public&affiliation=owner&sort=pushed&per_page=100&page=${page}`, token)).json();
      out.push(...r.map(slimRepo));
      if (r.length < 100) break;
    }
    return out;
  });
  res.json({ repos });
}));

const portfolioRow = async (uid) =>
  (await db.execute({ sql: 'SELECT * FROM portfolios WHERE user_id = ?', args: [uid] })).rows[0];
const shapePortfolio = (p) => ({
  headline: p.headline, about: p.about, accent: p.accent,
  repos: JSON.parse(p.repos), published: !!p.published, views: Number(p.views), updated_at: Number(p.updated_at),
});

api.get('/me/portfolio', requireUser, wrap(async (req, res) => {
  res.json({ portfolio: shapePortfolio(await portfolioRow(req.user.id)) });
}));

const ACCENTS = ['red', 'amber', 'green', 'blue', 'violet'];
const saveSchema = z.object({
  headline: z.string().trim().max(90),
  about: z.string().trim().max(600),
  accent: z.enum(ACCENTS),
  repos: z.array(z.string().regex(/^[\w.-]+$/).max(100)).max(MAX_REPOS),
  published: z.boolean(),
});

api.put('/me/portfolio', requireUser, wrap(async (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Check your inputs and try again.' });
  const d = parsed.data;
  const uniq = [...new Set(d.repos)];
  // Only newly added repos need a GitHub check; ones already saved are trusted.
  const already = new Set(JSON.parse((await portfolioRow(req.user.id)).repos));
  const token = userToken(req.user);
  const verified = new Set();
  await Promise.all(uniq.filter((n) => !already.has(n)).map(async (n) => {
    try {
      const r = await (await gh(`/repos/${req.user.username}/${n}`, token)).json();
      if (!r.private) verified.add(n);
    } catch (e) {
      if (e instanceof GhError && e.status === 404) return; // really doesn't exist: skip it
      throw e; // GitHub down, rate-limited or token expired: fail loudly, never wipe the selection
    }
  }));
  const repos = uniq.filter((n) => already.has(n) || verified.has(n));
  await db.execute({
    sql: 'UPDATE portfolios SET headline=?, about=?, accent=?, repos=?, published=?, updated_at=? WHERE user_id=?',
    args: [d.headline, d.about, d.accent, JSON.stringify(repos), d.published ? 1 : 0, Date.now(), req.user.id],
  });
  res.json({ portfolio: shapePortfolio(await portfolioRow(req.user.id)) });
}));

api.delete('/me', requireUser, wrap(async (req, res) => {
  await db.execute({ sql: 'DELETE FROM portfolios WHERE user_id = ?', args: [req.user.id] });
  await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [req.user.id] });
  res.clearCookie('gs_session', { path: '/' });
  res.json({ ok: true });
}));

// ---------- public portfolio ----------
async function loadPublic(req, username) {
  const u = (await db.execute({ sql: 'SELECT * FROM users WHERE username_lc = ?', args: [String(username).toLowerCase()] })).rows[0];
  if (!u) throw new GhError(404, 'No portfolio here');
  const p = await portfolioRow(u.id);
  const viewer = await currentUser(req);
  const isOwner = viewer && Number(viewer.id) === Number(u.id);
  if (!p.published && !isOwner) throw new GhError(404, 'No portfolio here');
  return { u, p, isOwner, token: userToken(u) };
}

async function repoDetails(u, token, name) {
  return cached(`repo:${u.username_lc}/${name}`, 5 * 60_000, async () => {
    const [r, langs] = await Promise.all([
      gh(`/repos/${u.username}/${name}`, token).then((x) => x.json()),
      gh(`/repos/${u.username}/${name}/languages`, token).then((x) => x.json()).catch(() => ({})),
    ]);
    return { ...slimRepo(r), languages: langs };
  });
}

api.get('/p/:username', wrap(async (req, res) => {
  const { u, p, isOwner, token } = await loadPublic(req, req.params.username);
  const names = JSON.parse(p.repos);
  const settled = await Promise.allSettled(names.map((n) => repoDetails(u, token, n)));
  const repos = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  const totals = {};
  repos.forEach((r) => Object.entries(r.languages).forEach(([k, v]) => (totals[k] = (totals[k] || 0) + v)));
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  const languages = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([name, v]) => ({ name, pct: Math.round((v / sum) * 100) }));
  res.json({
    user: { ...publicUser(u), github: `https://github.com/${u.username}` },
    portfolio: { headline: p.headline, about: p.about, accent: p.accent, published: !!p.published, views: Number(p.views) },
    repos, languages, isOwner,
  });
}));

const viewLimit = rateLimit({ windowMs: 60 * 60_000, limit: 30, message: tooMany });
api.post('/p/:username/view', viewLimit, wrap(async (req, res) => {
  const { u, p, isOwner } = await loadPublic(req, req.params.username);
  if (!isOwner && p.published) {
    await db.execute({ sql: 'UPDATE portfolios SET views = views + 1 WHERE user_id = ?', args: [u.id] });
  }
  res.json({ ok: true });
}));

const repoParam = z.string().regex(/^[\w.-]{1,100}$/);
const safePath = (v = '') => {
  const s = String(v).replace(/^\/+/, '');
  if (s.length > 300 || s.split('/').some((seg) => seg === '..')) throw new GhError(400, 'Bad path');
  return s;
};
async function authorizedRepo(req) {
  const name = repoParam.safeParse(req.params.repo);
  if (!name.success) throw new GhError(400, 'Bad repo');
  const ctx = await loadPublic(req, req.params.username);
  if (!JSON.parse(ctx.p.repos).includes(name.data)) throw new GhError(404, 'Repo is not part of this portfolio');
  return { ...ctx, name: name.data };
}

api.get('/p/:username/:repo/readme', wrap(async (req, res) => {
  const { u, token, name } = await authorizedRepo(req);
  const r = await cached(`readme:${u.username_lc}/${name}`, 5 * 60_000, async () => {
    try {
      const j = await (await gh(`/repos/${u.username}/${name}/readme`, token)).json();
      return { markdown: Buffer.from(j.content, 'base64').toString('utf8').slice(0, TEXT_LIMIT), path: j.path };
    } catch (e) { if (e.status === 404) return { markdown: null }; throw e; }
  });
  res.json(r);
}));

api.get('/p/:username/:repo/tree', wrap(async (req, res) => {
  const { u, token, name } = await authorizedRepo(req);
  const dir = safePath(req.query.path);
  const items = await cached(`tree:${u.username_lc}/${name}/${dir}`, 5 * 60_000, async () => {
    const j = await (await gh(`/repos/${u.username}/${name}/contents/${encodeURI(dir)}`, token)).json();
    if (!Array.isArray(j)) throw new GhError(400, 'Not a folder');
    return j.map((i) => ({ name: i.name, path: i.path, type: i.type, size: i.size }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  });
  res.json({ items });
}));

api.get('/p/:username/:repo/file', wrap(async (req, res) => {
  const { u, token, name } = await authorizedRepo(req);
  const file = safePath(req.query.path);
  if (!file) throw new GhError(400, 'Missing path');
  const out = await cached(`file:${u.username_lc}/${name}/${file}`, 5 * 60_000, async () => {
    const j = await (await gh(`/repos/${u.username}/${name}/contents/${encodeURI(file)}`, token)).json();
    if (Array.isArray(j) || j.type !== 'file') throw new GhError(400, 'Not a file');
    if (isBinaryName(j.name)) return { binary: true, size: j.size, name: j.name };
    if (j.size > TEXT_LIMIT) return { tooLarge: true, size: j.size, name: j.name };
    const text = Buffer.from(j.content || '', 'base64').toString('utf8');
    if (text.includes('\u0000')) return { binary: true, size: j.size, name: j.name };
    return { name: j.name, path: j.path, size: j.size, text };
  });
  res.json(out);
}));

api.get('/healthz', (req, res) => res.json({ ok: true }));
api.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use('/api', api);

// ---------- static client + share-card meta ----------
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
if (existsSync(DIST)) {
  const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');
  app.use(express.static(DIST, { index: false, maxAge: '1y', setHeaders: (r, f) => f.endsWith('.html') && r.setHeader('Cache-Control', 'no-cache') }));
  app.get(/^\/u\/([^/]+)(\/.*)?$/, wrap(async (req, res) => {
    let out = html;
    try {
      const { u, p } = await loadPublic({ cookies: {} }, req.params[0]);
      if (p.published) {
        const title = `${u.name || u.username} — developer portfolio`;
        const desc = p.headline || `Selected projects by ${u.username}, with READMEs and code.`;
        out = html
          .replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`)
          .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${esc(title)}"`)
          .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${esc(desc)}"`)
          .replace(/(<meta name="description" content=")[^"]*"/, `$1${esc(desc)}"`)
          .replace(/(<meta property="og:image" content=")[^"]*"/, `$1${esc(u.avatar || '')}"`);
      }
    } catch { /* fall through to default shell */ }
    res.set('Cache-Control', 'no-cache').type('html').send(out);
  }));
  app.get('*', (req, res) => res.set('Cache-Control', 'no-cache').type('html').send(html));
}

app.use((err, req, res, next) => {
  if (err instanceof GhError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side.' });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`GitScoop API on :${port}`));