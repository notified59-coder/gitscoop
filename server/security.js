import crypto from 'node:crypto';

const sessionSecret = process.env.SESSION_SECRET || '';
const tokenSecret = process.env.TOKEN_KEY || '';
export const isProd = process.env.NODE_ENV === 'production';

export function assertEnv() {
  const missing = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'SESSION_SECRET', 'TOKEN_KEY'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`\n  Missing env: ${missing.join(', ')}\n  Copy .env.example to .env and fill it in.\n`);
    process.exit(1);
  }
  if (sessionSecret.length < 32 || tokenSecret.length < 32) {
    console.error('\n  SESSION_SECRET and TOKEN_KEY must each be at least 32 characters.\n');
    process.exit(1);
  }
  if (sessionSecret === tokenSecret) {
    console.error('\n  SESSION_SECRET and TOKEN_KEY must be two different values.\n');
    process.exit(1);
  }
}

const keyOf = (s) => crypto.createHash('sha256').update(s).digest();

// Stored GitHub tokens are encrypted with TOKEN_KEY, which is separate from the cookie-signing secret.
export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyOf(tokenSecret), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

function open(blob, key) {
  try {
    const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// legacy = encrypted by the old version with SESSION_SECRET. Callers should re-save it with encrypt().
export function decryptInfo(blob) {
  if (!blob) return { text: null, legacy: false };
  const now = open(blob, keyOf(tokenSecret));
  if (now !== null) return { text: now, legacy: false };
  const old = open(blob, keyOf(sessionSecret));
  return old !== null ? { text: old, legacy: true } : { text: null, legacy: false };
}

export const decrypt = (blob) => decryptInfo(blob).text;