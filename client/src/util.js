export const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572a5', Go: '#00add8', Rust: '#dea584', Java: '#b07219',
  'C++': '#f34b7d', C: '#8a8a8a', 'C#': '#178600', Ruby: '#701516', PHP: '#4f5d95', Swift: '#f05138', Kotlin: '#a97bff',
  Dart: '#00b4ab', HTML: '#e34c26', CSS: '#7a5ac8', SCSS: '#c6538c', Shell: '#89e051', Vue: '#41b883', Svelte: '#ff3e00',
  Jupyter: '#da5b0b', 'Jupyter Notebook': '#da5b0b', Lua: '#6a6ae0', Elixir: '#6e4a7e', Haskell: '#5e5086', Dockerfile: '#384d54',
};
export const langColor = (l) => LANG_COLORS[l] || '#b1a7a6';

export const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export const ago = (iso) => {
  const d = (Date.now() - new Date(iso)) / 864e5;
  if (d < 1) return 'today';
  if (d < 30) return `${Math.floor(d)}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
};

export const ACCENTS = {
  red: '#e5383b', amber: '#f59e0b', green: '#22b573', blue: '#3b82f6', violet: '#8b5cf6',
};

export const siteHost = () => window.location.host;

export async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
