import crypto from 'node:crypto';

const secret = process.env.SESSION_SECRET || '';
export const isProd = process.env.NODE_ENV === 'production';

export function assertEnv() {
  const missing = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'SESSION_SECRET'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`\n  Missing env: ${missing.join(', ')}\n  Copy .env.example to .env and fill it in.\n`);
    process.exit(1);
  }
  if (secret.length < 32) {
    console.error('\n  SESSION_SECRET must be at least 32 characters.\n');
    process.exit(1);
  }
}

const key = () => crypto.createHash('sha256').update(secret).digest();

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decrypt(blob) {
  try {
    const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
