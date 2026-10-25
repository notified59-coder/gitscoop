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
import { assertEnv, encrypt, decrypt, decryptInfo, isProd } from './security.js';
import { gh, ghGraphql, cached, uncache, GhError, slimRepo, TEXT_LIMIT, isBinaryName } from './github.js';
import { renderOg } from './og.js';
import { renderBadge } from './badge.js';

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
  let origin = req.get('origin');
  if (!origin && req.get('referer')) { try { origin = new URL(req.get('referer')).origin; } catch { /* ignore */ } }
  if (origin !== APP_URL) return res.status(403).json({ error: 'Bad origin' });
  next();
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- session ----------
const setSession = (res, uid, ver = 0) =>
  res.cookie('gs_session', jwt.sign({ uid, ver }, SECRET, { expiresIn: '30d', algorithm: 'HS256' }), {
    httpOnly: true, sameSite: 'lax', secure: secureCookie, maxAge: 30 * 864e5, path: '/',
  });

async function currentUser(req) {
  const tok = req.cookies?.gs_session;
  if (!tok) return null;
  try {
    const { uid, ver = 0 } = jwt.verify(tok, SECRET, { algorithms: ['HS256'] });
    const u = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [uid] })).rows[0];
    // A different version means the user logged out since this cookie was issued.
    if (!u || Number(u.session_ver) !== Number(ver)) return null;
    if (u.token_enc) {
      const { text, legacy } = decryptInfo(u.token_enc);
      if (legacy) { // move tokens saved by the old version onto the dedicated TOKEN_KEY
        const token_enc = encrypt(text);
        await db.execute({ sql: 'UPDATE users SET token_enc = ? WHERE id = ?', args: [token_enc, u.id] });
        return { ...u, token_enc };
      }
    }
    return u;
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
  const row = (await db.execute({ sql: 'SELECT id, session_ver FROM users WHERE github_id = ?', args: [me.id] })).rows[0];
  await db.execute({
    sql: 'INSERT OR IGNORE INTO portfolios (user_id, headline, updated_at) VALUES (?,?,?)',
    args: [row.id, me.bio || '', now],
  });
  setSession(res, Number(row.id), Number(row.session_ver));
  res.redirect('/dashboard');
}));

api.post('/auth/logout', wrap(async (req, res) => {
  const u = await currentUser(req);
  // Bumping the version kills every session cookie issued before, on all devices.
  if (u) await db.execute({ sql: 'UPDATE users SET session_ver = session_ver + 1 WHERE id = ?', args: [u.id] });
  res.clearCookie('gs_session', { path: '/' });
  res.json({ ok: true });
}));

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
const safeJson = (s, fallback) => { try { return JSON.parse(s) ?? fallback; } catch { return fallback; } };
const EMPTY_LINKS = { email: '', website: '', linkedin: '', resume: '' };
const EMPTY_EXTRA = {
  open: false, openText: '', experience: [], education: [],
  featured: { repo: '', image: '', story: '', demo: '' },
};
const shapeExtra = (e = {}) => ({
  ...EMPTY_EXTRA, ...e,
  experience: Array.isArray(e.experience) ? e.experience : [],
  education: Array.isArray(e.education) ? e.education : [],
  featured: { ...EMPTY_EXTRA.featured, ...(e.featured || {}) },
});
const shapePortfolio = (p) => ({
  headline: p.headline, about: p.about, accent: p.accent,
  repos: JSON.parse(p.repos),
  links: { ...EMPTY_LINKS, ...safeJson(p.links, {}) },
  notes: safeJson(p.notes, {}),
  extra: shapeExtra(safeJson(p.extra, {})),
  published: !!p.published, listed: !!p.listed, views: Number(p.views), updated_at: Number(p.updated_at),
});

api.get('/me/portfolio', requireUser, wrap(async (req, res) => {
  res.json({ portfolio: shapePortfolio(await portfolioRow(req.user.id)) });
}));

const ACCENTS = ['red', 'amber', 'green', 'blue', 'violet'];
const LINK_LABELS = { email: 'Email', website: 'Website', linkedin: 'LinkedIn', resume: 'Résumé link' };
// Links: add https:// when missing, and only ever allow http(s) so nothing like javascript: gets through.
const urlField = z.string().trim().max(200).transform((v, ctx) => {
  if (!v) return '';
  const bad = () => { ctx.addIssue({ code: 'custom', message: 'Enter a valid link, like example.com' }); return z.NEVER; };
  if (/^(javascript|data|vbscript|file|mailto|tel):/i.test(v)) return bad();
  const full = /^https?:\/\//i.test(v) ? v : v.includes('://') ? '' : `https://${v}`;
  try {
    const u = new URL(full);
    if (!u.hostname.includes('.')) return bad();
    return u.href;
  } catch { return bad(); }
});
const emailField = z.string().trim().max(120)
  .refine((v) => v === '' || /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v), 'Enter a valid email address');
const noteSchema = z.object({
  blurb: z.string().trim().max(240).default(''),
  file: z.string().trim().max(300).refine((v) => !/[?#\\]/.test(v), 'Use a plain path like src/index.js').default(''),
  image: urlField.default(''),
  highlights: z.array(z.string().trim().max(100)).max(3).default([]),
});
const extraSchema = z.object({
  open: z.boolean().default(false),
  openText: z.string().trim().max(60).default(''),
  experience: z.array(z.object({
    role: z.string().trim().max(80).default(''),
    org: z.string().trim().max(80).default(''),
    period: z.string().trim().max(40).default(''),
    desc: z.string().trim().max(300).default(''),
  })).max(6).default([]),
  education: z.array(z.object({
    school: z.string().trim().max(100).default(''),
    degree: z.string().trim().max(100).default(''),
    period: z.string().trim().max(40).default(''),
  })).max(4).default([]),
  featured: z.object({
    repo: z.string().regex(/^[\w.-]*$/).max(100).default(''),
    image: urlField.default(''),
    story: z.string().trim().max(500).default(''),
    demo: urlField.default(''),
  }).default({}),
}).default({});
const saveSchema = z.object({
  headline: z.string().trim().max(90),
  about: z.string().trim().max(600),
  accent: z.enum(ACCENTS),
  repos: z.array(z.string().regex(/^[\w.-]+$/).max(100)).max(MAX_REPOS),
  links: z.object({
    email: emailField.default(''),
    website: urlField.default(''),
    linkedin: urlField.default(''),
    resume: urlField.default(''),
  }).default({}),
  notes: z.record(z.string().regex(/^[\w.-]{1,100}$/), noteSchema).default({})
    .refine((o) => Object.keys(o).length <= 50, 'Too many project notes'),
  extra: extraSchema,
  published: z.boolean(),
  listed: z.boolean().default(false),
});
const issueText = (i) => {
  const [a, b] = i.path;
  const label = a === 'links' ? LINK_LABELS[b] : a === 'notes' ? b : a === 'extra' ? i.path.slice(1).filter((x) => typeof x === 'string').join(' ') : '';
  return label ? `${label}: ${i.message}` : i.message;
};

api.put('/me/portfolio', requireUser, wrap(async (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    const custom = parsed.error.issues.find((i) => i.code === 'custom');
    return res.status(400).json({ error: custom ? issueText(custom) : 'Check your inputs and try again.' });
  }
  const d = parsed.data;
  const uniq = [...new Set(d.repos)];
  // Only newly added repos need a GitHub check; ones already saved are trusted.
  const current = await portfolioRow(req.user.id);
  const already = new Set(JSON.parse(current.repos));
  const oldNotes = safeJson(current.notes, {});
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
  const facets = (await computeFacets(req.user.username, token, repos)) || safeJson(current.facets, {});

  // Project notes: keep only chosen repos, drop empty ones, validate the "open first" path.
  const notes = {};
  for (const n of repos) {
    const raw = d.notes[n];
    if (!raw) continue;
    const file = safePath(raw.file);
    const highlights = (raw.highlights || []).filter(Boolean);
    if (raw.blurb || file || raw.image || highlights.length) notes[n] = { blurb: raw.blurb, file, image: raw.image, highlights };
  }

  // Extra sections: drop empty entries, and the featured project must be one of the chosen repos.
  const extra = {
    ...d.extra,
    experience: d.extra.experience.filter((e) => e.role || e.org),
    education: d.extra.education.filter((e) => e.school || e.degree),
    featured: { ...d.extra.featured, repo: repos.includes(d.extra.featured.repo) ? d.extra.featured.repo : '' },
  };
  // A newly entered "open first" file must really exist, otherwise the link would land on an error.
  await Promise.all(Object.entries(notes)
    .filter(([n, v]) => v.file && v.file !== oldNotes[n]?.file)
    .map(async ([n, v]) => {
      try {
        const j = await (await gh(`/repos/${req.user.username}/${n}/contents/${encodeURI(v.file)}`, token)).json();
        if (Array.isArray(j) || j.type !== 'file') throw new GhError(400, `${n}: “${v.file}” is a folder. Pick a file.`);
      } catch (e) {
        if (e instanceof GhError && e.status === 404) throw new GhError(400, `${n}: “${v.file}” wasn’t found. Check the path.`);
        throw e;
      }
    }));

  await db.execute({
    sql: 'UPDATE portfolios SET headline=?, about=?, accent=?, repos=?, links=?, notes=?, extra=?, published=?, listed=?, facets=?, updated_at=? WHERE user_id=?',
    args: [d.headline, d.about, d.accent, JSON.stringify(repos), JSON.stringify(d.links), JSON.stringify(notes), JSON.stringify(extra), d.published ? 1 : 0, d.listed ? 1 : 0, JSON.stringify(facets), Date.now(), req.user.id],
  });
  uncache('explore'); uncache('sitemap'); uncache(`og:${req.user.username.toLowerCase()}`);
  res.json({ portfolio: shapePortfolio(await portfolioRow(req.user.id)) });
}));

api.delete('/me', requireUser, wrap(async (req, res) => {
  await db.execute({ sql: 'DELETE FROM portfolios WHERE user_id = ?', args: [req.user.id] });
  await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [req.user.id] });
    uncache('explore'); uncache('sitemap'); uncache(`og:${req.user.username.toLowerCase()}`);
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

// Extra profile facts straight from GitHub (location, company, followers, since when...).
async function ghProfile(u, token) {
  return cached(`ghuser:${u.username_lc}`, 10 * 60_000, async () => {
    try {
      const j = await (await gh(`/users/${u.username}`, token)).json();
      return {
        location: j.location || '', company: j.company || '', followers: j.followers ?? 0, following: j.following ?? 0,
        public_repos: j.public_repos ?? 0, created_at: j.created_at || null, blog: j.blog || '',
        twitter: /^\w{1,15}$/.test(j.twitter_username || '') ? j.twitter_username : '',
      };
    } catch { return null; }
  });
}

// The green-squares calendar. Needs the owner's token; if anything fails we just hide the section.
const CAL_QUERY = `query($login:String!){ user(login:$login){ contributionsCollection{ contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } } } } }`;
const shapeCalendar = (c) => ({
  total: c.totalContributions,
  weeks: c.weeks.map((w) => w.contributionDays.map((d) => [d.date, d.contributionCount])),
});
async function ghCalendar(u, token) {
  return cached(`cal:${u.username_lc}`, 60 * 60_000, async () => {
    try {
      const d = await ghGraphql(CAL_QUERY, { login: u.username }, token);
      return shapeCalendar(d.user.contributionsCollection.contributionCalendar);
    } catch { return null; }
  });
}

api.get('/p/:username', wrap(async (req, res) => {
  const { u, p, isOwner, token } = await loadPublic(req, req.params.username);
  const names = JSON.parse(p.repos);
  const [settled, profile, calendar] = await Promise.all([
    Promise.allSettled(names.map((n) => repoDetails(u, token, n))),
    ghProfile(u, token),
    ghCalendar(u, token),
  ]);
  const notes = safeJson(p.notes, {});
  const repos = settled.filter((s) => s.status === 'fulfilled')
    .map((s) => ({
      ...s.value,
      blurb: notes[s.value.name]?.blurb || '', file: notes[s.value.name]?.file || '',
      image: notes[s.value.name]?.image || '', highlights: notes[s.value.name]?.highlights || [],
    }));
  const topicCount = {};
  repos.forEach((r) => r.topics.forEach((t) => { topicCount[t] = (topicCount[t] || 0) + 1; }));
  const topics = Object.entries(topicCount).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => t);
  const extra = shapeExtra(safeJson(p.extra, {}));
  if (!repos.some((r) => r.name === extra.featured.repo)) extra.featured = { ...extra.featured, repo: '' };
  const totals = {};
  repos.forEach((r) => Object.entries(r.languages).forEach(([k, v]) => (totals[k] = (totals[k] || 0) + v)));
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  const languages = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([name, v]) => ({ name, pct: Math.round((v / sum) * 100) }));
  res.json({
    user: { ...publicUser(u), github: `https://github.com/${u.username}` },
    portfolio: {
      headline: p.headline, about: p.about, accent: p.accent, published: !!p.published, views: Number(p.views),
      links: { ...EMPTY_LINKS, ...safeJson(p.links, {}) },
      extra,
    },
    repos, languages, topics, profile, calendar, isOwner,
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

// Public gallery: only portfolios that are published AND whose owner opted in to be listed.
// Languages + topics of a user's chosen repos (powers the Explore filters).
// Returns null when GitHub could not be reached, so we never overwrite good data with nothing.
async function computeFacets(username, token, repos) {
  const langs = new Map();
  const topics = new Set();
  let ok = 0;
  await Promise.all(repos.map(async (n) => {
    try {
      const r = await (await gh(`/repos/${username}/${n}`, token)).json();
      ok++;
      if (r.language) langs.set(r.language, (langs.get(r.language) || 0) + 1);
      (r.topics || []).forEach((t) => topics.add(t));
    } catch { /* skip this repo */ }
  }));
  if (repos.length && !ok) return null;
  return {
    langs: [...langs.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l).slice(0, 8),
    topics: [...topics].slice(0, 10),
  };
}

// Portfolios saved before filters existed get their languages filled in once, in the background.
(async () => {
  try {
    const rows = (await db.execute(
      `SELECT u.username, u.token_enc, p.user_id, p.repos FROM portfolios p JOIN users u ON u.id = p.user_id
       WHERE p.published = 1 AND p.listed = 1 AND p.facets = '{}' AND p.repos != '[]'`
    )).rows;
    for (const r of rows) {
      const f = await computeFacets(r.username, r.token_enc ? decrypt(r.token_enc) : null, safeJson(r.repos, []));
      if (f) await db.execute({ sql: 'UPDATE portfolios SET facets = ? WHERE user_id = ?', args: [JSON.stringify(f), r.user_id] });
    }
    if (rows.length) uncache('explore');
  } catch (e) { console.error('facet backfill failed:', e.message); }
})();

api.get('/explore', publicLimit, wrap(async (req, res) => {
  const people = await cached('explore', 60_000, async () => {
    const rows = (await db.execute(
      `SELECT u.username, u.name, u.avatar, p.headline, p.accent, p.repos, p.views, p.extra, p.facets, p.updated_at
       FROM portfolios p JOIN users u ON u.id = p.user_id
       WHERE p.published = 1 AND p.listed = 1 AND p.repos != '[]'
       ORDER BY p.views DESC, p.updated_at DESC LIMIT 200`
    )).rows;
    return rows.map((r) => {
      const f = safeJson(r.facets, {});
      return {
        username: r.username, name: r.name, avatar: r.avatar, headline: r.headline, accent: r.accent,
        projects: safeJson(r.repos, []).length, views: Number(r.views), updated_at: Number(r.updated_at),
        open: !!safeJson(r.extra, {}).open,
        langs: Array.isArray(f.langs) ? f.langs : [], topics: Array.isArray(f.topics) ? f.topics : [],
      };
    });
  });
  res.json({ people });
}));

api.get('/healthz', (req, res) => res.json({ ok: true }));
api.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use('/api', api);

// ---------- share-card image: /og/username.png ----------
const ogLimit = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: tooMany });
app.get('/og/:file', ogLimit, wrap(async (req, res) => {
  const m = /^([A-Za-z0-9-]{1,39})\.png$/.exec(req.params.file);
  if (!m) return res.status(404).end();
  const key = `og:${m[1].toLowerCase()}`;
  try {
    const png = await cached(key, 10 * 60_000, async () => {
      const { u, p } = await loadPublic({ cookies: {} }, m[1]);
      if (!p.published) throw new GhError(404, 'No portfolio here');
      const extra = shapeExtra(safeJson(p.extra, {}));
      return renderOg({
        name: u.name, username: u.username, avatar: u.avatar,
        headline: p.headline, accent: p.accent,
        repos: safeJson(p.repos, []), open: !!extra.open,
      });
    });
    res.set('Cache-Control', 'public, max-age=600').type('png').send(png);
  } catch {
    res.status(404).end();
  }
}));

// ---------- README badge: /badge/username.svg?style=flat|big ----------
const badgeLimit = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false, message: tooMany });
app.get('/badge/:file', badgeLimit, wrap(async (req, res) => {
  const m = /^([A-Za-z0-9-]{1,39})\.svg$/.exec(req.params.file);
  if (!m) return res.status(404).end();
  const style = req.query.style === 'big' ? 'big' : 'flat';
  try {
    const svg = await cached(`badge:${m[1].toLowerCase()}:${style}`, 5 * 60_000, async () => {
      const { p } = await loadPublic({ cookies: {} }, m[1]);
      if (!p.published) throw new GhError(404, 'No portfolio here');
      const n = safeJson(p.repos, []).length;
      return renderBadge({ label: 'portfolio', value: `${n} project${n === 1 ? '' : 's'}`, accent: p.accent, style });
    });
    res.set('Cache-Control', 'public, max-age=300').type('image/svg+xml').send(svg);
  } catch {
    res.status(404).end();
  }
}));

// ---------- robots + sitemap ----------
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /dashboard\nSitemap: ${APP_URL}/sitemap.xml\n`);
});
app.get('/sitemap.xml', wrap(async (req, res) => {
  const xml = await cached('sitemap', 10 * 60_000, async () => {
    const rows = (await db.execute(
      `SELECT u.username FROM portfolios p JOIN users u ON u.id = p.user_id
       WHERE p.published = 1 AND p.listed = 1 AND p.repos != '[]' LIMIT 5000`
    )).rows;
    const urls = ['/', '/explore', ...rows.map((r) => `/u/${encodeURIComponent(r.username)}`)];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
      + urls.map((u) => `  <url><loc>${esc(APP_URL + u)}</loc></url>`).join('\n') + '\n</urlset>\n';
  });
  res.type('application/xml').send(xml);
}));

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
          .replace(/(<meta property="og:image" content=")[^"]*"/, `$1${esc(`${APP_URL}/og/${u.username}.png`)}"`)
          .replace('<meta name="twitter:card" content="summary" />', `<meta name="twitter:card" content="summary_large_image" />\n  <meta property="og:image:width" content="1200" />\n  <meta property="og:image:height" content="630" />\n  <meta name="twitter:image" content="${esc(`${APP_URL}/og/${u.username}.png`)}" />`);
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