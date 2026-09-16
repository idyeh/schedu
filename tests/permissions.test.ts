import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  defaultSettings,
  normaliseSettings,
  emptyProfile,
} from '../lib/model.ts';
import type { User, Booking, Role } from '../lib/model.ts';
import {
  canManageAccount,
  canSetRole,
  canEditSettings,
  canCancelBooking,
} from '../lib/permissions.ts';

void test('legacy upgrade selects the earliest-created current administrator and records future grants', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const name of [
      '0000_odd_karnak',
      '0001_keep_last_admin',
      '0002_migration_packages',
    ])
      db.exec(readFileSync(`drizzle/${name}.sql`, 'utf8'));
    const insert = db.prepare(
      "INSERT INTO users(id,role,password,profile) VALUES(?,?,'hash','{}')",
    );
    insert.run('oldstudent', 'student');
    insert.run('z-first-admin', 'admin');
    insert.run('a-second-admin', 'admin');
    db.exec(readFileSync('drizzle/0003_sysadmin_permissions.sql', 'utf8'));
    assert.equal(
      db.prepare("SELECT role FROM users WHERE id='z-first-admin'").get()?.role,
      'sysadmin',
    );
    assert.equal(
      db.prepare("SELECT role FROM users WHERE id='a-second-admin'").get()
        ?.role,
      'admin',
    );
    assert.equal(
      db
        .prepare("SELECT admin_granted_at FROM users WHERE id='a-second-admin'")
        .get()?.admin_granted_at,
      null,
    );
    db.prepare("UPDATE users SET role='admin' WHERE id='oldstudent'").run();
    const granted = db
      .prepare("SELECT admin_granted_at FROM users WHERE id='oldstudent'")
      .get()?.admin_granted_at;
    assert.equal(typeof granted, 'number');
    assert.ok(Number(granted) > 0);
    db.prepare(
      "UPDATE users SET role='instructor' WHERE id='oldstudent'",
    ).run();
    db.prepare("UPDATE users SET role='admin' WHERE id='oldstudent'").run();
    assert.equal(
      db
        .prepare("SELECT admin_granted_at FROM users WHERE id='oldstudent'")
        .get()?.admin_granted_at,
      granted,
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE users SET role='sysadmin' WHERE id='oldstudent'")
          .run(),
      /UNIQUE/,
    );
    assert.throws(
      () => db.prepare("DELETE FROM users WHERE role='sysadmin'").run(),
      /protected_sysadmin/,
    );
  } finally {
    db.close();
  }
});
void test('account permission matrix prevents escalation and protects the system owner', () => {
  const roles: Role[] = ['student', 'instructor', 'admin', 'sysadmin'];
  for (const actor of roles)
    for (const target of roles) {
      const allowed =
        target !== 'sysadmin' &&
        (actor === 'sysadmin' ||
          (actor === 'admin' && ['student', 'instructor'].includes(target)));
      assert.equal(
        canManageAccount(actor, target),
        allowed,
        `${actor} -> ${target}`,
      );
      assert.equal(
        canSetRole(actor, target, 'admin'),
        allowed && actor === 'sysadmin',
      );
      assert.equal(canSetRole(actor, target, 'sysadmin'), false);
    }
});
void test('ordinary administrators can change schedules but cannot smuggle system settings through a timetable save', () => {
  const before = structuredClone(defaultSettings);
  const scheduled = { ...before, closedDates: ['2026-10-01'] };
  assert.equal(canEditSettings('admin', before, scheduled), true);
  for (const change of [
    { instructorCancellationAllowed: true },
    { cancellationWeeks: 0 },
    { semesterStart: '2026-10-01' },
    { classrooms: ['New room'] },
    { defaultLanguage: 'en-GB' },
    { futureSetting: 'injected' },
  ]) {
    const after = { ...scheduled, ...change };
    assert.equal(canEditSettings('admin', before, after), false);
    assert.equal(canEditSettings('sysadmin', before, after), true);
  }
  assert.equal(canEditSettings('instructor', before, scheduled), false);
  assert.equal(canEditSettings('student', before, scheduled), false);
});
void test('teacher cancellation defaults off and remains limited to assigned active bookings when enabled', () => {
  const user = (id: string, role: Role): User => ({
    id,
    role,
    profile: emptyProfile,
    firstLogin: 0,
    blockedUntil: 0,
  });
  const booking: Booking = {
    id: 'b',
    studentId: 'student',
    status: 'approved',
    slot: {
      id: 'slot',
      windowId: 'window',
      date: '2026-10-01',
      start: '18:30',
      end: '18:40',
      startsAt: 200,
      endsAt: 300,
      location: 'Room',
      instructors: ['teacher'],
      capacity: 1,
      remaining: 0,
    },
    topic: '',
    score: null,
    feedback: '',
    history: [],
    createdAt: 0,
  };
  const legacy = { ...defaultSettings };
  delete (legacy as Partial<typeof legacy>).instructorCancellationAllowed;
  assert.equal(normaliseSettings(legacy).instructorCancellationAllowed, false);
  assert.equal(
    canCancelBooking(
      user('teacher', 'instructor'),
      booking,
      defaultSettings,
      100,
    ),
    false,
  );
  const enabled = { ...defaultSettings, instructorCancellationAllowed: true };
  assert.equal(
    canCancelBooking(user('teacher', 'instructor'), booking, enabled, 100),
    true,
  );
  assert.equal(
    canCancelBooking(user('outsider', 'instructor'), booking, enabled, 100),
    false,
  );
  assert.equal(
    canCancelBooking(user('student', 'student'), booking, defaultSettings, 100),
    true,
  );
  assert.equal(
    canCancelBooking(user('student', 'student'), booking, defaultSettings, 200),
    false,
  );
  assert.equal(
    canCancelBooking(user('other', 'student'), booking, defaultSettings, 100),
    false,
  );
  assert.equal(
    canCancelBooking(user('admin', 'admin'), booking, defaultSettings, 100),
    true,
  );
  assert.equal(
    canCancelBooking(user('owner', 'sysadmin'), booking, defaultSettings, 100),
    true,
  );
  assert.equal(
    canCancelBooking(
      user('teacher', 'instructor'),
      { ...booking, status: 'in_progress' },
      enabled,
      100,
    ),
    false,
  );
});
