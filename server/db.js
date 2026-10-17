import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';

const url = process.env.DATABASE_URL || 'file:./data/gitscoop.db';
if (url.startsWith('file:')) mkdirSync('data', { recursive: true });

export const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });

export async function migrate() {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      github_id INTEGER UNIQUE NOT NULL,
      username TEXT NOT NULL,
      username_lc TEXT UNIQUE NOT NULL,
      name TEXT,
      avatar TEXT,
      bio TEXT,
      token_enc TEXT,
      session_ver INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS portfolios (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      headline TEXT NOT NULL DEFAULT '',
      about TEXT NOT NULL DEFAULT '',
      accent TEXT NOT NULL DEFAULT 'red',
      repos TEXT NOT NULL DEFAULT '[]',
      links TEXT NOT NULL DEFAULT '{}',
      notes TEXT NOT NULL DEFAULT '{}',
      published INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )`,
  ], 'write');

  const userCols = (await db.execute('PRAGMA table_info(users)')).rows.map((r) => r.name);
  if (!userCols.includes('session_ver')) await db.execute('ALTER TABLE users ADD COLUMN session_ver INTEGER NOT NULL DEFAULT 0');

  // Databases created before contact links and project notes existed: add the new columns once.
  const cols = (await db.execute('PRAGMA table_info(portfolios)')).rows.map((r) => r.name);
  if (!cols.includes('links')) await db.execute(`ALTER TABLE portfolios ADD COLUMN links TEXT NOT NULL DEFAULT '{}'`);
  if (!cols.includes('notes')) await db.execute(`ALTER TABLE portfolios ADD COLUMN notes TEXT NOT NULL DEFAULT '{}'`);
  // Opt-in: show this portfolio on the public Explore page and in the sitemap.
  if (!cols.includes('listed')) await db.execute('ALTER TABLE portfolios ADD COLUMN listed INTEGER NOT NULL DEFAULT 0');
}