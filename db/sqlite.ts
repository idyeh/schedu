import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Database, Statement, Result } from './types';

// Use the existing schema and SQL queries in both deployments. Batches remain atomic.
export function openSqlite(
  path: string,
  migrationsDirectory: string,
): Database & { close(): void } {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const connection = new DatabaseSync(path);
  connection.exec(
    'PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;',
  );
  try {
    connection.exec('BEGIN IMMEDIATE');
    connection.exec(
      'CREATE TABLE IF NOT EXISTS schedu_migrations (tag TEXT PRIMARY KEY, checksum TEXT NOT NULL)',
    );
    const journal = JSON.parse(
      readFileSync(join(migrationsDirectory, 'meta/_journal.json'), 'utf8'),
    );
    for (const entry of journal.entries) {
      if (!/^[\w-]+$/.test(entry.tag)) throw Error('Invalid migration name');
      const sql = readFileSync(
        join(migrationsDirectory, `${entry.tag}.sql`),
        'utf8',
      );
      const checksum = createHash('sha256').update(sql).digest('hex');
      const applied = connection
        .prepare('SELECT checksum FROM schedu_migrations WHERE tag=?')
        .get(entry.tag);
      if (applied) {
        if (applied.checksum !== checksum)
          throw Error(`Applied migration changed: ${entry.tag}`);
      } else {
        connection.exec(sql);
        connection
          .prepare('INSERT INTO schedu_migrations(tag,checksum) VALUES(?,?)')
          .run(entry.tag, checksum);
      }
    }
    connection.exec('COMMIT');
  } catch (error) {
    connection.exec('ROLLBACK');
    connection.close();
    throw error;
  }
  class Prepared implements Statement {
    readonly sql: string;
    readonly values: SQLInputValue[];
    constructor(sql: string, values: SQLInputValue[] = []) {
      this.sql = sql;
      this.values = values;
    }
    bind(...values: SQLInputValue[]) {
      return new Prepared(this.sql, values);
    }
    async first<T = Record<string, unknown>>() {
      return (
        (connection.prepare(this.sql).get(...this.values) as T | undefined) ??
        null
      );
    }
    async all<T = Record<string, unknown>>(): Promise<Result<T>> {
      return {
        results: connection.prepare(this.sql).all(...this.values) as T[],
        meta: { changes: 0 },
      };
    }
    execute(): Result {
      const result = connection.prepare(this.sql).run(...this.values);
      return { results: [], meta: { changes: Number(result.changes) } };
    }
    async run() {
      return this.execute();
    }
  }
  return {
    prepare: (sql) => new Prepared(sql),
    async batch(statements) {
      connection.exec('BEGIN IMMEDIATE');
      try {
        const result = statements.map((s) => {
          if (!(s instanceof Prepared))
            throw Error('Statement belongs to another database');
          return s.execute();
        });
        connection.exec('COMMIT');
        return result;
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => connection.close(),
  };
}
