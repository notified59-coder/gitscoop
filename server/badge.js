// Small SVG badge people can paste into their GitHub README, like the ones from shields.io.
const ACCENTS = { red: '#e5383b', amber: '#d97706', green: '#16a34a', blue: '#2563eb', violet: '#7c3aed' };
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FONT = 'Verdana,Geneva,DejaVu Sans,sans-serif';

export function renderBadge({ label, value, accent, style = 'flat' }) {
  const color = ACCENTS[accent] || ACCENTS.red;

  if (style === 'big') {
    const l = label.toUpperCase();
    const v = value.toUpperCase();
    const lw = Math.round(l.length * 8.4 + 30);
    const rw = Math.round(v.length * 8.4 + 30);
    const w = lw + rw;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="28" role="img" aria-label="${esc(label)}: ${esc(value)}">
  <title>${esc(label)}: ${esc(value)}</title>
  <rect width="${lw}" height="28" fill="#1c1413"/>
  <rect x="${lw}" width="${rw}" height="28" fill="${color}"/>
  <g fill="#fff" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="bold" letter-spacing="1">
    <text x="${lw / 2}" y="18">${esc(l)}</text>
    <text x="${lw + rw / 2}" y="18">${esc(v)}</text>
  </g>
</svg>`;
  }

  const lw = Math.round(label.length * 6.6 + 14);
  const rw = Math.round(value.length * 6.6 + 14);
  const w = lw + rw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
  <title>${esc(label)}: ${esc(value)}</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="20" fill="#1c1413"/>
    <rect x="${lw}" width="${rw}" height="20" fill="${color}"/>
    <rect width="${w}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="${FONT}" font-size="11">
    <text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(label)}</text>
    <text x="${lw / 2}" y="14">${esc(label)}</text>
    <text x="${lw + rw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(value)}</text>
    <text x="${lw + rw / 2}" y="14">${esc(value)}</text>
  </g>
</svg>`;
}