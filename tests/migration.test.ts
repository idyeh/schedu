import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openSqlite } from '../db/sqlite.ts';
import { defaultSettings } from '../lib/model.ts';
import {
  createMigrationPackage,
  validateMigrationPackage,
  migrationSummary,
  prepareRestoration,
  packageChecksum,
} from '../lib/migration-package.ts';
import type {
  ExportData,
  ExportUser,
  ExportBooking,
} from '../lib/migration-package.ts';
import {
  exportAppData,
  restoreAppData,
  migrationResetStatus,
} from '../lib/migration-store.ts';
const hash = `${'a'.repeat(32)}:${'b'.repeat(64)}`;
const profile = JSON.stringify({
  grade: 2025,
  adminClass: '26电H一',
  teachingClass: '',
  chineseName: '测试学生',
  englishName: 'Test Student',
  phone: '',
});
function dataset(): ExportData {
  const users: ExportUser[] = [
    {
      id: 'sourceadmin',
      role: 'sysadmin',
      password: hash,
      profile,
      first_login: 0,
      admin_granted_at: null,
      blocked_until: 0,
    },
    {
      id: 'teacher',
      role: 'instructor',
      password: hash,
      profile,
      first_login: 1,
      admin_granted_at: null,
      blocked_until: 0,
    },
    // Deliberately collides with the destination's administrator ID.
    {
      id: 'bootstrap',
      role: 'student',
      password: hash,
      profile,
      first_login: 1,
      admin_granted_at: null,
      blocked_until: 1800000000000,
    },
  ];
  const statuses = [
    'draft',
    'submitted',
    'cancelled',
    'approved',
    'in_progress',
    'completed',
    'archived',
  ];
  const bookings: ExportBooking[] = statuses.map((status, i) => {
    const time = `18:${String(30 + i).padStart(2, '0')}`,
      end = `18:${31 + i}`;
    const slot = {
      id: `slot${i}`,
      windowId: 'window',
      date: '2026-10-01',
      start: time,
      end,
      startsAt: Date.parse(`2026-10-01T${time}:00+08:00`),
      endsAt: Date.parse(`2026-10-01T${end}:00+08:00`),
      location: 'Room 101',
      instructors: ['teacher'],
      capacity: 1,
      remaining: 0,
    };
    return {
      id: `booking${i}`,
      student_id: 'bootstrap',
      status,
      slot_id: slot.id,
      seat: 0,
      slot: JSON.stringify(slot),
      starts_at: slot.startsAt,
      ends_at: slot.endsAt,
      topic: 'Review 函数',
      score: ['completed', 'archived'].includes(status) ? 70 : null,
      feedback: status === 'completed' ? '表现优秀 · Excellent' : '',
      history: JSON.stringify([
        { status, at: slot.startsAt, by: 'sourceadmin' },
      ]),
      created_at: slot.startsAt - 86400000,
    };
  });
  return {
    users,
    bookings,
    settings: {
      ...structuredClone(defaultSettings),
      classrooms: ['Room 101'],
      semesterStart: '2026-09-01',
      semesterEnd: '2027-01-08',
      windows: [
        {
          id: 'window',
          day: 4,
          start: '18:30',
          end: '20:05',
          location: 'Room 101',
          instructors: ['teacher'],
          capacity: 1,
          enabled: true,
          startWeek: 2,
          repeatWeeks: 16,
        },
      ],
      closedDates: ['2026-10-08'],
    },
  };
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'schedu-migration-'));
  const db = openSqlite(join(dir, 'app.sqlite'), resolve('drizzle'));
  return {
    db,
    close: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
async function resetDestination(db: ReturnType<typeof openSqlite>) {
  await db
    .prepare(
      "INSERT INTO users(id,role,password,profile,first_login) VALUES('bootstrap','sysadmin',?,?,0)",
    )
    .bind(hash, profile)
    .run();
  await db
    .prepare('INSERT INTO settings(id,value) VALUES(1,?)')
    .bind(JSON.stringify(defaultSettings))
    .run();
  await db
    .prepare(
      "INSERT INTO sessions(token,user_id,expires) VALUES('old-session','bootstrap',9999999999999)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO attempts(key,count,expires) VALUES('attempt',2,9999999999999)",
    )
    .run();
  await db
    .prepare('UPDATE app_state SET restore_ready=1,reset_at=123 WHERE id=1')
    .run();
}
void test('export package round-trips all business records, including hashes and every lifecycle state', async () => {
  const source = dataset();
  const pkg = await createMigrationPackage(source);
  const parsed = await validateMigrationPackage(
    JSON.parse(JSON.stringify(pkg, null, 2)),
  );
  assert.deepEqual(parsed.data, source);
  assert.equal(migrationSummary(parsed).bookings, 7);
  assert.deepEqual(migrationSummary(parsed).admins, ['sourceadmin']);
});
void test('package validation rejects corruption, incompatible versions and broken references', async () => {
  const pkg = await createMigrationPackage(dataset());
  const corrupt = structuredClone(pkg);
  corrupt.data.users[2].blocked_until = 0;
  await assert.rejects(
    validateMigrationPackage(corrupt),
    /export_checksum_mismatch/,
  );
  await assert.rejects(
    validateMigrationPackage({ ...pkg, version: 3 }),
    /unsupported_export_version/,
  );
  for (const modify of [
    (data: ExportData) => {
      data.users.push({ ...data.users[0] });
    },
    (data: ExportData) => {
      data.users = data.users.filter((user) => user.role !== 'sysadmin');
    },
    (data: ExportData) => {
      data.bookings[0].student_id = 'missing';
    },
    (data: ExportData) => {
      data.users[0].password = 'plain-password';
    },
    (data: ExportData) => {
      data.settings.windows[0].instructors = ['missing'];
    },
    (data: ExportData) => {
      data.bookings[3].slot_id = data.bookings[1].slot_id;
      data.bookings[3].slot = data.bookings[1].slot;
      data.bookings[3].starts_at = data.bookings[1].starts_at;
      data.bookings[3].ends_at = data.bookings[1].ends_at;
    },
  ]) {
    const data = dataset();
    modify(data);
    await assert.rejects(
      validateMigrationPackage(await createMigrationPackage(data)),
      /invalid_export_package/,
    );
  }
});
void test('restore replaces bootstrap administrators, preserves all data, revokes sessions and cannot merge again', async () => {
  const { db, close } = fixture();
  try {
    await resetDestination(db);
    assert.equal((await migrationResetStatus(db)).ready, true);
    const pkg = await validateMigrationPackage(
      await createMigrationPackage(dataset()),
    );
    await restoreAppData(db, pkg, 'bootstrap', hash);
    const output = await exportAppData(db, 'sourceadmin', hash);
    assert.deepEqual(output.data.settings, pkg.data.settings);
    assert.deepEqual(
      output.data.users,
      [...pkg.data.users].sort((a, b) => a.id.localeCompare(b.id)),
    );
    assert.deepEqual(output.data.bookings, pkg.data.bookings);
    assert.equal(
      (await db.prepare("SELECT role FROM users WHERE id='bootstrap'").first())
        ?.role,
      'student',
    );
    assert.equal(
      (await db.prepare('SELECT count(*) AS n FROM sessions').first())?.n,
      0,
    );
    assert.equal(
      (await db.prepare('SELECT count(*) AS n FROM attempts').first())?.n,
      0,
    );
    assert.equal((await migrationResetStatus(db)).ready, false);
    await assert.rejects(
      restoreAppData(db, pkg, 'sourceadmin', hash),
      /restore_requires_reset/,
    );
    await assert.rejects(
      db.prepare("DELETE FROM users WHERE id='sourceadmin'").run(),
      /protected_sysadmin/,
    );
    assert.deepEqual(
      (await db.prepare('PRAGMA foreign_key_check').all()).results,
      [],
    );
  } finally {
    close();
  }
});
void test('an empty-looking database is not enough; data changes after reset invalidate eligibility', async () => {
  const { db, close } = fixture();
  try {
    await resetDestination(db);
    await db
      .prepare(
        "INSERT INTO sessions(token,user_id,expires) VALUES('login','bootstrap',9999999999999)",
      )
      .run();
    assert.equal((await migrationResetStatus(db)).ready, true);
    await db.prepare('UPDATE settings SET value=value WHERE id=1').run();
    assert.equal((await migrationResetStatus(db)).ready, false);
    const pkg = await createMigrationPackage(dataset());
    await assert.rejects(
      restoreAppData(db, pkg, 'bootstrap', hash),
      /restore_requires_reset/,
    );
    assert.equal(
      (await db.prepare('SELECT count(*) AS n FROM users').first())?.n,
      1,
    );
    await db.prepare('UPDATE app_state SET restore_ready=1 WHERE id=1').run();
    await db
      .prepare(
        "INSERT INTO users(id,role,password,profile) VALUES('newstudent','student',?,?)",
      )
      .bind(hash, profile)
      .run();
    await db.prepare("DELETE FROM users WHERE id='newstudent'").run();
    assert.equal((await migrationResetStatus(db)).ready, false);
  } finally {
    close();
  }
});
void test('a mid-restore database failure rolls back users, sessions, settings and the reset marker', async () => {
  const { db, close } = fixture();
  try {
    await resetDestination(db);
    const bad = dataset();
    bad.bookings[0].student_id = 'missing';
    // Intentionally bypass the package validator to exercise transaction failure recovery.
    await assert.rejects(
      restoreAppData(db, await createMigrationPackage(bad), 'bootstrap', hash),
      /FOREIGN KEY/,
    );
    assert.deepEqual(
      (await db.prepare('SELECT id,role FROM users').all()).results.map(
        (row) => ({ ...row }),
      ),
      [{ id: 'bootstrap', role: 'sysadmin' }],
    );
    assert.equal(
      (await db.prepare('SELECT count(*) AS n FROM sessions').first())?.n,
      1,
    );
    assert.equal(
      (await db.prepare('SELECT count(*) AS n FROM bookings').first())?.n,
      0,
    );
    assert.equal((await migrationResetStatus(db)).ready, true);
    assert.equal(
      (
        await db
          .prepare('SELECT restore_token FROM app_state WHERE id=1')
          .first()
      )?.restore_token,
      '',
    );
    assert.deepEqual(
      JSON.parse(
        String(
          (await db.prepare('SELECT value FROM settings WHERE id=1').first())
            ?.value,
        ),
      ),
      defaultSettings,
    );
  } finally {
    close();
  }
});
void test('restore rechecks the reset marker and administrator credentials at write time', async () => {
  const { db, close } = fixture();
  try {
    await resetDestination(db);
    const pkg = await createMigrationPackage(dataset());
    await assert.rejects(
      restoreAppData(db, pkg, 'bootstrap', 'wrong-hash'),
      /restore_requires_reset/,
    );
    assert.equal((await migrationResetStatus(db)).ready, true);
    // Simulate a settings edit after package review but before confirmation.
    await db.prepare('UPDATE settings SET value=value WHERE id=1').run();
    await assert.rejects(
      restoreAppData(db, pkg, 'bootstrap', hash),
      /restore_requires_reset/,
    );
    assert.equal(
      (await db.prepare('SELECT count(*) AS n FROM users').first())?.n,
      1,
    );
    await assert.rejects(
      exportAppData(db, 'bootstrap', 'wrong-hash'),
      /forbidden/,
    );
  } finally {
    close();
  }
});

void test('old export packages require an explicit system owner when multiple admins exist', async () => {
  const legacyData = dataset();
  legacyData.users[0].role = 'admin';
  legacyData.users[1].role = 'admin';
  for (const user of legacyData.users) delete user.admin_granted_at;
  delete (legacyData.settings as Partial<typeof legacyData.settings>)
    .instructorCancellationAllowed;
  const legacy = {
    format: 'schedu-export',
    version: 1,
    exportedAt: '2026-09-01T00:00:00Z',
    checksum: await packageChecksum(legacyData),
    data: legacyData,
  };
  const validated = await validateMigrationPackage(legacy);
  assert.equal(migrationSummary(validated).sysadmin, null);
  await assert.rejects(
    prepareRestoration(validated),
    /sysadmin_selection_required/,
  );
  await assert.rejects(
    prepareRestoration(validated, 'bootstrap'),
    /sysadmin_selection_required/,
  );
  const converted = await prepareRestoration(validated, 'teacher');
  assert.equal(converted.version, 2);
  assert.equal(converted.exportedAt, legacy.exportedAt);
  assert.equal(converted.data.settings.instructorCancellationAllowed, false);
  assert.equal(
    converted.data.users.find((u) => u.id === 'teacher')?.role,
    'sysadmin',
  );
  assert.equal(
    converted.data.users.find((u) => u.id === 'sourceadmin')?.role,
    'admin',
  );
  assert.equal(
    converted.data.users.find((u) => u.id === 'teacher')?.admin_granted_at,
    null,
  );
  await validateMigrationPackage(converted);
  const { db, close } = fixture();
  try {
    await resetDestination(db);
    await restoreAppData(db, converted, 'bootstrap', hash);
    assert.deepEqual(
      (await exportAppData(db, 'teacher', hash)).data.users,
      [...converted.data.users].sort((a, b) => a.id.localeCompare(b.id)),
    );
    await assert.rejects(exportAppData(db, 'sourceadmin', hash), /forbidden/);
  } finally {
    close();
  }
  legacyData.users[1].role = 'instructor';
  const single = await validateMigrationPackage({
    ...legacy,
    checksum: await packageChecksum(legacyData),
  });
  assert.equal(
    migrationSummary(await prepareRestoration(single)).sysadmin,
    'sourceadmin',
  );
});
void test('version 2 packages reject multiple sysadmins before any replacement', async () => {
  const data = dataset();
  data.users[1].role = 'sysadmin';
  await assert.rejects(
    validateMigrationPackage(await createMigrationPackage(data)),
    /invalid_export_package/,
  );
});
