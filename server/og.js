import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT = path.join(__dirname, '..', 'node_modules', '@expo-google-fonts', 'inter', '700Bold', 'Inter_700Bold.ttf');

// Same accent colours as the site (red is the default).
const ACCENTS = { red: '#e5383b', amber: '#f59e0b', green: '#22c55e', blue: '#3b82f6', violet: '#8b5cf6' };

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

// Break text into at most `maxLines` lines of about `width` characters each.
function wrap(text, width, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width && line) { lines.push(line); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = clip(lines[maxLines - 1] + '…', width);
  }
  return lines;
}

// Download the avatar and embed it in the image. If it fails we draw initials instead.
async function avatarData(url) {
  if (!url) return null;
  try {
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + 's=300', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!/image\/(png|jpe?g)/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 2_000_000) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch { return null; }
}

export async function renderOg({ name, username, avatar, headline, accent, repos = [], open = false }) {
  const color = ACCENTS[accent] || ACCENTS.red;
  const img = await avatarData(avatar);
  const title = clip(name || username, 26);
  const lines = wrap(headline || 'Selected projects, READMEs and code — in one link.', 38, 2);
  const chips = repos.slice(0, 4).map((r) => clip(r, 18));

  // Lay the repo chips out left to right.
  let x = 80;
  const chipSvg = chips.map((c) => {
    const w = c.length * 15 + 36;
    const out = `<rect x="${x}" y="470" width="${w}" height="46" rx="23" fill="#1e1515" stroke="${color}" stroke-opacity=".6"/>
      <text x="${x + w / 2}" y="501" font-size="22" fill="#efe7e2" text-anchor="middle">${esc(c)}</text>`;
    x += w + 14;
    return out;
  }).join('');

  const avatarSvg = img
    ? `<clipPath id="av"><circle cx="1000" cy="170" r="90"/></clipPath>
       <image href="${img}" x="910" y="80" width="180" height="180" clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/>
       <circle cx="1000" cy="170" r="92" fill="none" stroke="${color}" stroke-width="4"/>`
    : `<circle cx="1000" cy="170" r="90" fill="${color}"/>
       <text x="1000" y="195" font-size="72" fill="#fff" text-anchor="middle">${esc((name || username || '?')[0].toUpperCase())}</text>`;

  const badge = open
    ? `<rect x="80" y="392" width="250" height="44" rx="22" fill="none" stroke="${color}"/>
       <circle cx="106" cy="414" r="6" fill="#22c55e"/>
       <text x="124" y="422" font-size="20" fill="#efe7e2">Open to work</text>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Inter">
    <rect width="1200" height="630" fill="#0d0909"/>
    <rect width="1200" height="12" fill="${color}"/>
    <circle cx="1100" cy="560" r="260" fill="${color}" fill-opacity=".08"/>
    ${avatarSvg}
    <text x="80" y="150" font-size="64" fill="#efe7e2">${esc(title)}</text>
    <text x="80" y="200" font-size="28" fill="${color}">@${esc(clip(username, 30))}</text>
    ${lines.map((l, i) => `<text x="80" y="${275 + i * 46}" font-size="34" fill="#a0928d">${esc(l)}</text>`).join('')}
    ${badge}
    ${chipSvg}
    <text x="80" y="586" font-size="22" fill="#6f635f">gitscoop · developer portfolio</text>
  </svg>`;

  return new Resvg(svg, {
    font: { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: 'Inter' },
  }).render().asPng();
}