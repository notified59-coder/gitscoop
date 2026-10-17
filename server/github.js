// Thin GitHub REST client with in-memory TTL cache + conditional safety limits.
const API = 'https://api.github.com';
const cache = new Map();

export function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const p = fn().catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { exp: Date.now() + ttlMs, val: p });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return p;
}

// Forget a cached entry right away (used so privacy changes show up instantly).
export const uncache = (key) => cache.delete(key);
export class GhError extends Error {
}

async function rawFetch(path, t, accept) {
  return fetch(path.startsWith('http') ? path : API + path, {
    headers: {
      Accept: accept,
      'User-Agent': 'gitscoop',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
  });
}

export async function gh(path, token, accept = 'application/vnd.github+json') {
  const t = token || process.env.GITHUB_TOKEN;
  let res = await rawFetch(path, t, accept);
  // If the owner revoked GitScoop on GitHub, their saved token stops working.
  // Public repos still load without it, so portfolios keep working for visitors.
  if (res.status === 401 && token) res = await rawFetch(path, process.env.GITHUB_TOKEN, accept);
  if (res.status === 404) throw new GhError(404, 'Not found on GitHub');
  if (res.status === 403 || res.status === 429) throw new GhError(429, 'GitHub rate limit reached. Try again in a minute.');
  if (res.status === 401) throw new GhError(401, 'GitHub token expired. Sign in again.');
  if (!res.ok) throw new GhError(502, `GitHub error ${res.status}`);
  return res;
}

export const slimRepo = (r) => ({
  name: r.name,
  full_name: r.full_name,
  description: r.description,
  language: r.language,
  stars: r.stargazers_count,
  forks: r.forks_count,
  topics: r.topics || [],
  homepage: r.homepage || null,
  url: r.html_url,
  default_branch: r.default_branch,
  pushed_at: r.pushed_at,
  fork: r.fork,
});

export const TEXT_LIMIT = 400_000;
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|bmp|pdf|zip|gz|tar|7z|rar|woff2?|ttf|otf|eot|mp[34]|mov|avi|wasm|exe|dll|so|dylib|bin|class|jar|psd|ai)$/i;
export const isBinaryName = (n) => BINARY_EXT.test(n);