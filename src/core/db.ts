import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.env.PITDOG_DATA_DIR ?? '.data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'pitdog.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDb(): void {
  const schemaPath = path.resolve('schema.sql');
  if (!fs.existsSync(schemaPath)) throw new Error(`Schema não encontrado: ${schemaPath}`);
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
}

export { dbPath };
