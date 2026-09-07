import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
process.umask(0o077);
const path = process.env.SCHEDU_DB_PATH || '/app/data/schedu.sqlite';
const directory = '/app/data/backups';
mkdirSync(directory, { recursive: true, mode: 0o700 });
const destination = join(directory, 'schedu-backup.sqlite');
const db = new DatabaseSync(path, { readOnly: true });
try {
  await backup(db, destination);
  chmodSync(destination, 0o600);
  console.log(destination);
} finally { db.close(); }
