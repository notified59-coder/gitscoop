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
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS portfolios (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      headline TEXT NOT NULL DEFAULT '',
      about TEXT NOT NULL DEFAULT '',
      accent TEXT NOT NULL DEFAULT 'red',
      repos TEXT NOT NULL DEFAULT '[]',
      published INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )`,
  ], 'write');
}
