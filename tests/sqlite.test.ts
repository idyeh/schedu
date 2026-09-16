import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openSqlite } from '../db/sqlite.ts';

test('SQLite applies migrations once and preserves records across reopen', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'schedu-sqlite-'));
  const path = join(dir, 'app.sqlite');
  let db = openSqlite(path, resolve('drizzle'));
  try {
    await db
      .prepare(
        "INSERT INTO users(id,role,password,profile) VALUES(?, 'student', 'hash', '{}')",
      )
      .bind('student1')
      .run();
    db.close();
    db = openSqlite(path, resolve('drizzle'));
    assert.equal(
      (await db.prepare('SELECT id FROM users').first())?.id,
      'student1',
    );
    assert.equal(
      (await db.prepare('SELECT count(*) AS n FROM schedu_migrations').first())
        ?.n,
      4,
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SQLite batches roll back every write on failure', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'schedu-sqlite-'));
  const db = openSqlite(join(dir, 'app.sqlite'), resolve('drizzle'));
  try {
    await assert.rejects(
      db.batch([
        db.prepare(
          "INSERT INTO users(id,role,password,profile) VALUES('same','student','hash','{}')",
        ),
        db.prepare(
          "INSERT INTO users(id,role,password,profile) VALUES('same','student','hash','{}')",
        ),
      ]),
    );
    assert.equal(
      (await db.prepare('SELECT count(*) AS n FROM users').first())?.n,
      0,
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('database enforces exactly one protected system administrator', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'schedu-admin-'));
  const db = openSqlite(join(dir, 'app.sqlite'), resolve('drizzle'));
  try {
    await db
      .prepare(
        "INSERT INTO users(id,role,password,profile) VALUES('admin','sysadmin','hash','{}')",
      )
      .run();
    await assert.rejects(
      db.prepare("DELETE FROM users WHERE id='admin'").run(),
      /protected_sysadmin/,
    );
    await assert.rejects(
      db.prepare("UPDATE users SET role='admin' WHERE id='admin'").run(),
      /protected_sysadmin/,
    );
    await assert.rejects(
      db
        .prepare(
          "INSERT INTO users(id,role,password,profile) VALUES('second','sysadmin','hash','{}')",
        )
        .run(),
      /UNIQUE/,
    );
    await db
      .prepare(
        "INSERT INTO users(id,role,password,profile) VALUES('ordinary','admin','hash','{}')",
      )
      .run();
    await db.prepare("DELETE FROM users WHERE id='ordinary'").run();

    assert.equal(
      (
        await db
          .prepare("SELECT count(*) AS n FROM users WHERE role='sysadmin'")
          .first()
      )?.n,
      1,
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
