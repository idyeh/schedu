import {
  setupTokenRequired,
  validSetupToken,
  requestOrigin,
  rateLimitScope,
} from '@/db/runtime';
import {
  database,
  getSettings,
  getSettingsSnapshot,
  getUser,
  safeUser,
  safeBooking,
  passwordHash,
  passwordMatches,
  newSession,
  sessionCookie,
  hashToken,
  randomPassword,
  uuid,
} from '@/lib/server';
import {
  generateSlots,
  profileError,
  validateSettings,
  currentYear,
  defaultSettings,
  maxRosterBytes,
  slotsInRange,
  chinaDate,
  addDays,
  validDate,
} from '@/lib/model';
import type { User, Profile, Settings, Booking, Slot } from '@/lib/model';
export const dynamic = 'force-dynamic';
const reply = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
function fail(code: string): never {
  throw Error(code);
}
const validId = (id: unknown) =>
  typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/.test(id);
const requireAdmin = (u: User) => {
  if (u.role !== 'admin') fail('forbidden');
};
function cleanProfile(p: any): Profile {
  return {
    grade: Number(p?.grade),
    adminClass: String(p?.adminClass || '')
      .trim()
      .slice(0, 80),
    teachingClass: String(p?.teachingClass || '')
      .trim()
      .slice(0, 80),
    chineseName: String(p?.chineseName || '')
      .trim()
      .slice(0, 80),
    englishName: String(p?.englishName || '')
      .trim()
      .slice(0, 80),
    phone: String(p?.phone || '')
      .trim()
      .slice(0, 30),
  };
}
async function state(req: Request) {
  const db = database(),
    settings = await getSettings(),
    user = await getUser(req);
  if (!user) {
    const count = await db
      .prepare('SELECT count(*) AS n FROM users')
      .first<{ n: number }>();
    return {
      user: null,
      needsSetup: count!.n === 0,
      requiresSetupToken: count!.n === 0 && setupTokenRequired(),
      defaults: {
        language: settings.defaultLanguage,
        theme: settings.defaultTheme,
      },
    };
  }
  const staffRows = await db
    .prepare(
      "SELECT id,profile,role FROM users WHERE role IN ('instructor','admin')",
    )
    .all();
  const staff = staffRows.results.map((r: any) => ({
    id: r.id,
    role: r.role,
    name: JSON.parse(r.profile).chineseName || r.id,
    englishName: JSON.parse(r.profile).englishName || r.id,
  }));
  const allRows =
    user.role === 'student'
      ? await db
          .prepare(
            'SELECT * FROM bookings WHERE student_id=? ORDER BY starts_at DESC',
          )
          .bind(user.id)
          .all()
      : await db
          .prepare('SELECT * FROM bookings ORDER BY starts_at DESC')
          .all();
  let bookings = allRows.results.map(safeBooking);
  if (user.role === 'instructor')
    bookings = bookings.filter(
      (b) =>
        b.slot.instructors.includes(user.id) ||
        settings.windows
          .find((w) => w.id === b.slot.windowId)
          ?.instructors.includes(user.id),
    );
  let users: User[] = [];
  if (user.role !== 'student') {
    const rows = await db.prepare('SELECT * FROM users ORDER BY id').all();
    const all = rows.results.map(safeUser);
    if (user.role === 'admin') users = all;
    bookings = bookings.map((b) => ({
      ...b,
      student: all.find((u) => u.id === b.studentId),
    }));
  }
  const counts = await db
    .prepare(
      "SELECT slot_id,count(*) AS n FROM bookings WHERE status IN ('submitted','approved','in_progress') GROUP BY slot_id",
    )
    .all();
  const occupied = new Map(
    counts.results.map((r: any) => [r.slot_id, Number(r.n)]),
  );
  const slots = generateSlots(settings).map((s) => ({
    ...s,
    remaining: Math.max(0, s.capacity - (occupied.get(s.id) || 0)),
  }));
  return {
    user,
    settings,
    staff,
    bookings,
    users,
    slots,
    serverTime: Date.now(),
    freshmanYear: currentYear(),
  };
}
export async function GET(req: Request) {
  try {
    return reply(await state(req));
  } catch {
    return reply({ error: 'service_unavailable' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin');
    if (origin && origin !== requestOrigin(req)) fail('forbidden');
    if (req.headers.get('sec-fetch-site') === 'cross-site') fail('forbidden');
    if (!req.headers.get('content-type')?.includes('application/json'))
      fail('invalid_request');
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > maxRosterBytes)
      fail('roster_too_large');
    const b = JSON.parse(raw),
      db = database(),
      now = Date.now();
    if (b.action === 'login' || b.action === 'setup') {
      if (
        !validId(b.id) ||
        typeof b.password !== 'string' ||
        b.password.length < 8 ||
        b.password.length > 128
      )
        fail('invalid_credentials');
      const key = await hashToken(`${rateLimitScope(req)}:${b.id}`);
      const rate = await db
        .prepare('SELECT * FROM attempts WHERE key=?')
        .bind(key)
        .first<any>();
      if (rate && rate.expires > now && rate.count >= 10) fail('rate_limited');
      await db
        .prepare(
          'INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires>? THEN count+1 ELSE 1 END, expires=CASE WHEN expires>? THEN expires ELSE excluded.expires END',
        )
        .bind(key, now + 900000, now, now)
        .run();
      if (b.action === 'setup') {
        if (!validSetupToken(b.setupToken)) fail('invalid_setup_token');
        const p = cleanProfile({ ...b.profile, grade: currentYear() });
        if (!p.chineseName) fail('profile_incomplete');
        const result = await db.batch([
          db
            .prepare(
              "INSERT INTO users(id,role,password,profile,first_login,blocked_until) SELECT ?,'admin',?,?,0,0 WHERE NOT EXISTS(SELECT 1 FROM users)",
            )
            .bind(b.id, await passwordHash(b.password), JSON.stringify(p)),
          db
            .prepare(
              'INSERT INTO settings(id,value) VALUES(1,?) ON CONFLICT(id) DO NOTHING',
            )
            .bind(JSON.stringify(defaultSettings)),
        ]);
        if (result[0].meta.changes !== 1) fail('setup_complete');
      } else {
        const row = await db
          .prepare('SELECT password FROM users WHERE id=?')
          .bind(b.id)
          .first<{ password: string }>();
        const hash = row?.password || (await passwordHash('invalid-password'));
        if (!(await passwordMatches(b.password, hash)) || !row)
          fail('invalid_credentials');
      }
      await db
        .prepare('DELETE FROM attempts WHERE key=? OR expires<?')
        .bind(key, now)
        .run();
      return reply({ ok: true }, 200, {
        'Set-Cookie': await newSession(req, b.id),
      });
    }
    const user = await getUser(req);
    if (!user) fail('unauthorised');
    const settingsSnapshot = await getSettingsSnapshot();
    const settings = settingsSnapshot.settings;
    if (b.action === 'logout') {
      const token = req.headers
        .get('cookie')
        ?.match(/(?:^|;\s*)schedu_session=([^;]+)/)?.[1];
      if (token)
        await db
          .prepare('DELETE FROM sessions WHERE token=?')
          .bind(await hashToken(token))
          .run();
      return reply({ ok: true }, 200, {
        'Set-Cookie': sessionCookie(req, '', 0),
      });
    }
    if (b.action === 'password') {
      if (b.keep === true && user.firstLogin) {
        await db
          .prepare('UPDATE users SET first_login=0 WHERE id=?')
          .bind(user.id)
          .run();
        return reply({ ok: true });
      }
      const row = await db
        .prepare('SELECT password FROM users WHERE id=?')
        .bind(user.id)
        .first<{ password: string }>();
      if (
        typeof b.current !== 'string' ||
        b.current.length > 128 ||
        !(await passwordMatches(b.current, row!.password))
      )
        fail('invalid_credentials');
      if (
        typeof b.password !== 'string' ||
        b.password.length < 8 ||
        b.password.length > 128
      )
        fail('password_length');
      await db.batch([
        db
          .prepare('UPDATE users SET password=?,first_login=0 WHERE id=?')
          .bind(await passwordHash(b.password), user.id),
        db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id),
      ]);
      return reply({ ok: true }, 200, {
        'Set-Cookie': await newSession(req, user.id),
      });
    }
    if (b.action === 'profile') {
      const p = cleanProfile(b.profile);
      if (user.role === 'student') {
        const error = profileError(p, settings);
        if (error) fail(error);
      } else if (!p.chineseName) fail('profile_incomplete');
      await db
        .prepare('UPDATE users SET profile=? WHERE id=?')
        .bind(JSON.stringify(p), user.id)
        .run();
      return reply({ ok: true });
    }
    if (b.action === 'settings') {
      requireAdmin(user);
      const s = b.settings as Settings;
      validateSettings(s);
      const staff = await db
        .prepare("SELECT id FROM users WHERE role IN ('instructor','admin')")
        .all();
      if (
        [...s.windows, ...(s.slotOverrides || [])].some((w) =>
          w.instructors.some((id) => !staff.results.some((u) => u.id === id)),
        )
      )
        fail('invalid_instructor');
      const occupiedRows = await db
        .prepare(
          "SELECT slot_id,slot FROM bookings WHERE status IN ('submitted','approved','in_progress') AND ends_at>?",
        )
        .bind(now)
        .all();
      const from = addDays(chinaDate(now), -1);
      const to = addDays(from, 366);
      const previous = new Map(
        slotsInRange(settings, from, to).map((slot) => [slot.id, slot]),
      );
      const next = new Map(
        slotsInRange(s, from, to).map((slot) => [slot.id, slot]),
      );
      const details = (slot: Slot | undefined) =>
        slot &&
        JSON.stringify([
          slot.date,
          slot.start,
          slot.end,
          slot.location,
          [...slot.instructors].sort((a, b) => a.localeCompare(b)),
          slot.capacity,
        ]);
      for (const row of occupiedRows.results) {
        const before = previous.get(String(row.slot_id));
        // Old snapshots outside the current timetable remain historical records.
        if (
          before &&
          details(before) !== details(next.get(String(row.slot_id)))
        )
          fail('booked_slot_locked');
      }
      const changed = [...previous.values()]
        .filter((slot) => details(slot) !== details(next.get(slot.id)))
        .map((slot) => slot.id);
      const result = await db
        .prepare(`UPDATE settings SET value=? WHERE id=1 AND value=?
        AND EXISTS (SELECT 1 FROM users WHERE id=? AND role='admin')
        AND NOT EXISTS (SELECT 1 FROM bookings WHERE status IN ('submitted','approved','in_progress')
          AND ends_at>? AND slot_id IN (SELECT value FROM json_each(?)))`)
        .bind(
          JSON.stringify(s),
          settingsSnapshot.raw,
          user.id,
          now,
          JSON.stringify(changed),
        )
        .run();
      if (!result.meta.changes) fail('schedule_changed');
      return reply({ ok: true });
    }
    if (b.action === 'deleteSlots') {
      requireAdmin(user);
      if (
        !validDate(b.from) ||
        !validDate(b.to) ||
        b.to < b.from ||
        Date.parse(b.to) - Date.parse(b.from) > 365 * 86400000 ||
        !Array.isArray(b.ids) ||
        !b.ids.length ||
        b.ids.length > 50000 ||
        new Set(b.ids).size !== b.ids.length ||
        b.ids.some((id: unknown) => typeof id !== 'string')
      )
        fail('invalid_request');
      const available = new Map(
        slotsInRange(settings, b.from, b.to).map((slot) => [slot.id, slot]),
      );
      if (b.ids.some((id: string) => !available.has(id)))
        fail('schedule_changed');
      const occupied = await db
        .prepare(
          "SELECT DISTINCT slot_id FROM bookings WHERE status IN ('submitted','approved','in_progress')",
        )
        .all<{ slot_id: string }>();
      const protectedIds = new Set(occupied.results.map((row) => row.slot_id));
      const removable: Slot[] = b.ids
        .filter((id: string) => !protectedIds.has(id))
        .map((id: string) => available.get(id)!);
      if (!removable.length)
        return reply({ ok: true, removed: 0, kept: b.ids.length });
      const ids = new Set(removable.map((slot) => slot.id));
      const updated: Settings = {
        ...settings,
        slotOverrides: [
          ...(settings.slotOverrides || []).filter((slot) => !ids.has(slot.id)),
          ...removable
            .filter((slot) => slot.windowId)
            .map((slot) => ({
              id: slot.id,
              windowId: slot.windowId,
              date: slot.date,
              start: slot.start,
              end: slot.end,
              location: slot.location,
              instructors: slot.instructors,
              capacity: slot.capacity,
              enabled: false,
            })),
        ],
      };
      validateSettings(updated);
      // A simultaneous booking or timetable edit makes the entire operation retryable.
      const result = await db
        .prepare(`UPDATE settings SET value=? WHERE id=1 AND value=?
        AND EXISTS (SELECT 1 FROM users WHERE id=? AND role='admin')
        AND NOT EXISTS (SELECT 1 FROM bookings WHERE status IN ('submitted','approved','in_progress')
          AND slot_id IN (SELECT value FROM json_each(?)))`)
        .bind(
          JSON.stringify(updated),
          settingsSnapshot.raw,
          user.id,
          JSON.stringify([...ids]),
        )
        .run();
      if (!result.meta.changes) fail('schedule_changed');
      return reply({
        ok: true,
        removed: removable.length,
        kept: b.ids.length - removable.length,
      });
    }
    if (b.action === 'issue' || b.action === 'import') {
      requireAdmin(user);
      const rows = b.action === 'issue' ? [b.user] : b.rows;
      if (!Array.isArray(rows) || !rows.length) fail('invalid_roster');
      const existing = await db.prepare('SELECT id FROM users').all();
      const ids = new Set(existing.results.map((u) => u.id));
      const checked = rows.map((r: any) => {
        if (
          !validId(r.id) ||
          ids.has(r.id) ||
          !['student', 'instructor'].includes(r.role || 'student')
        )
          fail('invalid_roster');
        ids.add(r.id);
        const profile = cleanProfile(r.profile || r);
        if (!Number.isInteger(profile.grade)) profile.grade = currentYear();
        if (b.action === 'import' && (r.role || 'student') === 'student') {
          const error = profileError(profile, settings);
          if (error) fail(error);
        }
        if (!profile.chineseName) fail('profile_incomplete');
        return {
          id: r.id,
          role: r.role || 'student',
          profile,
          password: randomPassword(),
        };
      });
      // Hash in small groups to keep large rosters responsive without weakening passwords.
      const records = [];
      for (let i = 0; i < checked.length; i += 8) {
        records.push(
          ...(await Promise.all(
            checked.slice(i, i + 8).map(async (r) => ({
              id: r.id,
              role: r.role,
              profile: r.profile,
              password: await passwordHash(r.password),
            })),
          )),
        );
      }
      // One statement keeps the whole import atomic and avoids per-row query limits.
      await db
        .prepare(`INSERT INTO users(id,role,password,profile,first_login,blocked_until)
        SELECT json_extract(value,'$.id'), json_extract(value,'$.role'), json_extract(value,'$.password'), json_extract(value,'$.profile'), 1, 0 FROM json_each(?)`)
        .bind(JSON.stringify(records))
        .run();
      return reply({
        ok: true,
        credentials: checked.map((r) => ({ id: r.id, password: r.password })),
      });
    }
    if (b.action === 'resetData') {
      requireAdmin(user);
      if (b.confirmation !== 'RESET SchedU')
        fail('reset_confirmation_required');
      const row = await db
        .prepare("SELECT password FROM users WHERE id=? AND role='admin'")
        .bind(user.id)
        .first<{ password: string }>();
      if (
        !row ||
        typeof b.currentPassword !== 'string' ||
        b.currentPassword.length > 128 ||
        !(await passwordMatches(b.currentPassword, row.password))
      )
        fail('incorrect_current_password');
      // Recheck the administrator inside the transaction in case access changed during password verification.
      const allowed =
        "EXISTS (SELECT 1 FROM users actor WHERE actor.id=? AND actor.role='admin' AND actor.password=?)";
      const result = await db.batch([
        db
          .prepare(
            "UPDATE users SET blocked_until=0 WHERE id=? AND role='admin' AND password=?",
          )
          .bind(user.id, row.password),
        db
          .prepare(`DELETE FROM bookings WHERE ${allowed}`)
          .bind(user.id, row.password),
        db
          .prepare(
            `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role!='admin') AND ${allowed}`,
          )
          .bind(user.id, row.password),
        db
          .prepare(`DELETE FROM users WHERE role!='admin' AND ${allowed}`)
          .bind(user.id, row.password),
        db
          .prepare(
            `INSERT INTO settings(id,value) SELECT 1,? WHERE ${allowed} ON CONFLICT(id) DO UPDATE SET value=excluded.value`,
          )
          .bind(JSON.stringify(defaultSettings), user.id, row.password),
        db
          .prepare(`DELETE FROM attempts WHERE ${allowed}`)
          .bind(user.id, row.password),
        db
          .prepare(`UPDATE users SET blocked_until=0 WHERE ${allowed}`)
          .bind(user.id, row.password),
      ]);
      if (!result[0].meta.changes) fail('forbidden');
      return reply({ ok: true });
    }
    if (b.action === 'updateUser') {
      requireAdmin(user);
      const target = await db
        .prepare("SELECT * FROM users WHERE id=? AND role!='admin'")
        .bind(b.id)
        .first();
      if (!target) fail('forbidden');
      const profile = cleanProfile(b.profile);
      if (!profile.chineseName) fail('profile_incomplete');
      if (target.role === 'student') {
        const error = profileError(profile, settings);
        if (error) fail(error);
      }
      await db
        .prepare('UPDATE users SET profile=? WHERE id=?')
        .bind(JSON.stringify(profile), b.id)
        .run();
      return reply({ ok: true });
    }
    if (b.action === 'role') {
      if (!['student', 'instructor', 'admin'].includes(b.role))
        fail('invalid_request');
      b.action = 'bulkUsers';
      b.ids = [b.id];
      b.operation = b.role;
    }
    if (b.action === 'bulkUsers') {
      requireAdmin(user);
      if (
        !Array.isArray(b.ids) ||
        !b.ids.length ||
        b.ids.length > 100 ||
        new Set(b.ids).size !== b.ids.length ||
        b.ids.some((id: unknown) => !validId(id)) ||
        ![
          'delete',
          'resetPassword',
          'student',
          'instructor',
          'admin',
          'liftBookingPause',
        ].includes(b.operation)
      )
        fail('invalid_request');
      if (b.operation === 'liftBookingPause') {
        const result = await db
          .prepare(
            "UPDATE users SET blocked_until=0 WHERE role='student' AND blocked_until>? AND id IN (SELECT value FROM json_each(?))",
          )
          .bind(now, JSON.stringify(b.ids))
          .run();
        return reply({ ok: true, updated: result.meta.changes });
      }
      const statements = [],
        credentials = [];
      for (const id of b.ids) {
        const target = await db
          .prepare('SELECT * FROM users WHERE id=?')
          .bind(id)
          .first();
        if (!target) fail('forbidden');
        if (
          target.role === 'admin' &&
          ['delete', 'resetPassword'].includes(b.operation)
        )
          fail('protected_admin');
        if (target.role === b.operation) continue;
        if (b.operation === 'delete' || b.operation === 'student') {
          if (
            [...settings.windows, ...(settings.slotOverrides || [])].some((w) =>
              w.instructors.includes(id),
            )
          )
            fail('assigned_instructor');
          const assigned = await db
            .prepare(
              "SELECT slot FROM bookings WHERE status IN ('submitted','approved','in_progress')",
            )
            .all();
          if (
            assigned.results.some((r) =>
              JSON.parse(String(r.slot)).instructors.includes(id),
            )
          )
            fail('assigned_instructor');
        }
        if (b.operation !== 'resetPassword') {
          const rows = await db
            .prepare('SELECT status FROM bookings WHERE student_id=?')
            .bind(id)
            .all();
          if (b.operation === 'delete' && rows.results.length)
            fail('user_has_history');
          if (
            b.operation !== 'delete' &&
            target.role !== b.operation &&
            rows.results.some((r) =>
              ['submitted', 'approved', 'in_progress'].includes(
                String(r.status),
              ),
            )
          )
            fail('active_bookings');
        }
        statements.push(
          db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id),
        );
        if (b.operation === 'delete')
          statements.push(db.prepare('DELETE FROM users WHERE id=?').bind(id));
        else if (b.operation === 'resetPassword') {
          const password = randomPassword();
          credentials.push({ id, password });
          statements.push(
            db
              .prepare('UPDATE users SET password=?,first_login=1 WHERE id=?')
              .bind(await passwordHash(password), id),
          );
        } else
          statements.push(
            db
              .prepare('UPDATE users SET role=? WHERE id=?')
              .bind(b.operation, id),
          );
      }
      if (statements.length) await db.batch(statements);
      return reply({
        ok: true,
        ...(credentials.length ? { credentials } : {}),
      });
    }
    if (b.action === 'resetPassword') {
      requireAdmin(user);
      const target = await db
        .prepare("SELECT id FROM users WHERE id=? AND role!='admin'")
        .bind(b.id)
        .first();
      if (!target) fail('forbidden');
      const password = randomPassword();
      await db.batch([
        db
          .prepare('UPDATE users SET password=?,first_login=1 WHERE id=?')
          .bind(await passwordHash(password), b.id),
        db.prepare('DELETE FROM sessions WHERE user_id=?').bind(b.id),
      ]);
      return reply({ ok: true, credentials: [{ id: b.id, password }] });
    }
    if (b.action === 'draft' || b.action === 'book') {
      if (user.role !== 'student') fail('forbidden');
      const slot = generateSlots(settings, now).find((s) => s.id === b.slotId);
      if (!slot) fail('slot_unavailable');
      const topic = String(b.topic || '')
        .trim()
        .slice(0, 1000);
      const id = uuid();
      if (b.action === 'draft') {
        if (b.draftId) {
          const result = await db
            .prepare(
              "UPDATE bookings SET slot_id=?,slot=?,starts_at=?,ends_at=?,topic=? WHERE id=? AND student_id=? AND status='draft'",
            )
            .bind(
              slot.id,
              JSON.stringify(slot),
              slot.startsAt,
              slot.endsAt,
              topic,
              b.draftId,
              user.id,
            )
            .run();
          if (!result.meta.changes) fail('invalid_transition');
        } else {
          const count = await db
            .prepare(
              "SELECT count(*) AS n FROM bookings WHERE student_id=? AND status='draft'",
            )
            .bind(user.id)
            .first<{ n: number }>();
          if (count!.n >= 5) fail('draft_limit');
          await db
            .prepare(
              "INSERT INTO bookings(id,student_id,status,slot_id,seat,slot,starts_at,ends_at,topic,history,created_at) VALUES(?,?,'draft',?,0,?,?,?,?,?,?)",
            )
            .bind(
              id,
              user.id,
              slot.id,
              JSON.stringify(slot),
              slot.startsAt,
              slot.endsAt,
              topic,
              JSON.stringify([{ status: 'draft', at: now, by: user.id }]),
              now,
            )
            .run();
        }
        return reply({ ok: true, id: b.draftId || id, status: 'draft' });
      }
      const error = profileError(user.profile, settings);
      if (error) fail(error);
      if (user.blockedUntil > now) fail('booking_blocked');
      let previous: Booking | null = null;
      if (b.draftId) {
        const row = await db
          .prepare(
            "SELECT * FROM bookings WHERE id=? AND student_id=? AND status='draft'",
          )
          .bind(b.draftId, user.id)
          .first();
        if (!row) fail('invalid_transition');
        previous = safeBooking(row);
      }
      const status = slot.instructors.length ? 'approved' : 'submitted';
      const history = [
        ...(previous?.history || [{ status: 'draft', at: now, by: user.id }]),
        { status: 'submitted', at: now, by: user.id },
        ...(status === 'approved'
          ? [{ status: 'approved', at: now, by: 'system' }]
          : []),
      ];
      const result = await db
        .prepare(`INSERT INTO bookings(id,student_id,status,slot_id,seat,slot,starts_at,ends_at,topic,history,created_at)
    SELECT ?,?,?,?,candidate.value,?,?,?,?,?,? FROM json_each('[0,1,2,3,4,5,6,7,8,9]') candidate
    WHERE candidate.value < ? AND NOT EXISTS(SELECT 1 FROM bookings WHERE slot_id=? AND seat=candidate.value AND status IN ('submitted','approved','in_progress'))
    AND (SELECT count(*) FROM bookings WHERE student_id=? AND status IN ('submitted','approved','in_progress')) < ?
    AND NOT EXISTS(SELECT 1 FROM bookings WHERE student_id=? AND status IN ('submitted','approved','in_progress') AND starts_at<? AND ends_at>?)
    AND (SELECT blocked_until FROM users WHERE id=?)<=?
    AND (SELECT value FROM settings WHERE id=1)=? ORDER BY candidate.value LIMIT 1`)
        .bind(
          id,
          user.id,
          status,
          slot.id,
          JSON.stringify(slot),
          slot.startsAt,
          slot.endsAt,
          topic,
          JSON.stringify(history),
          previous?.createdAt || now,
          slot.capacity,
          slot.id,
          user.id,
          settings.maxUpcoming,
          user.id,
          slot.endsAt,
          slot.startsAt,
          user.id,
          now,
          settingsSnapshot.raw,
        )
        .run();
      if (result.meta.changes !== 1) fail('booking_conflict');
      if (previous)
        await db
          .prepare(
            "DELETE FROM bookings WHERE id=? AND student_id=? AND status='draft'",
          )
          .bind(previous.id, user.id)
          .run();
      return reply({ ok: true, id, status });
    }
    if (b.action === 'deleteDraft') {
      const result = await db
        .prepare(
          "DELETE FROM bookings WHERE id=? AND student_id=? AND status='draft'",
        )
        .bind(b.id, user.id)
        .run();
      if (!result.meta.changes) fail('forbidden');
      return reply({ ok: true });
    }
    if (b.action === 'transition') {
      const row = await db
        .prepare('SELECT * FROM bookings WHERE id=?')
        .bind(b.id)
        .first();
      if (!row) fail('not_found');
      const booking = safeBooking(row);
      const own = user.role === 'student' && booking.studentId === user.id;
      const staff =
        user.role === 'admin' ||
        (user.role === 'instructor' &&
          (booking.slot.instructors.includes(user.id) ||
            settings.windows
              .find((w) => w.id === booking.slot.windowId)
              ?.instructors.includes(user.id)));
      if (!own && !staff) fail('forbidden');
      const target = b.status;
      if (target === 'cancelled') {
        if (
          !['submitted', 'approved'].includes(booking.status) ||
          (own && booking.slot.startsAt <= now)
        )
          fail('invalid_transition');
      } else if (target === 'approved') {
        if (
          !staff ||
          booking.status !== 'submitted' ||
          booking.slot.startsAt <= now
        )
          fail('invalid_transition');
      } else if (target === 'in_progress') {
        if (
          !staff ||
          booking.status !== 'approved' ||
          booking.slot.startsAt > now
        )
          fail('invalid_transition');
      } else if (target === 'completed') {
        if (
          !staff ||
          !['approved', 'in_progress'].includes(booking.status) ||
          booking.slot.startsAt > now ||
          !settings.evaluations.some((e) => e.score === b.score)
        )
          fail('invalid_transition');
        if (b.score === 0 && booking.slot.endsAt > now)
          fail('too_early_absent');
      } else if (target === 'archived') {
        if (!staff || !['completed', 'cancelled'].includes(booking.status))
          fail('invalid_transition');
      } else fail('invalid_transition');
      const history = JSON.stringify([
        ...booking.history,
        { status: target, at: now, by: user.id },
      ]);
      const statements = [
        db
          .prepare(
            'UPDATE bookings SET status=?,score=?,feedback=?,history=? WHERE id=? AND status=?',
          )
          .bind(
            target,
            target === 'completed' ? b.score : booking.score,
            target === 'completed'
              ? String(b.feedback || '')
                  .trim()
                  .slice(0, 2000)
              : booking.feedback,
            history,
            booking.id,
            booking.status,
          ),
      ];
      if (own && target === 'cancelled')
        statements.push(
          db
            .prepare(
              "UPDATE users SET blocked_until=MAX(blocked_until,?) WHERE id=? AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='cancelled' AND history=?)",
            )
            .bind(
              now + settings.cancellationWeeks * 7 * 86400000,
              user.id,
              booking.id,
              history,
            ),
        );
      const result = await db.batch(statements);
      if (!result[0].meta.changes) fail('invalid_transition');
      return reply({ ok: true });
    }
    fail('invalid_request');
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'invalid_request';
    const message = detail.includes('last_admin')
      ? 'last_admin'
      : detail.includes('UNIQUE constraint failed: users.id')
        ? 'invalid_roster'
        : detail;
    const known = [
      'invalid_settings',
      'invalid_semester',
      'semester_required',
      'invalid_recurrence',
      'schedule_changed',
      'invalid_classrooms',
      'invalid_classroom',
      'booked_slot_locked',
      'user_has_history',
      'window_overlap',
      'invalid_csv',
      'invalid_grade',
      'admin_class_required',
      'teaching_class_required',
      'profile_incomplete',
      'forbidden',
      'invalid_credentials',
      'invalid_setup_token',
      'rate_limited',
      'setup_complete',
      'unauthorised',
      'password_length',
      'invalid_instructor',
      'last_admin',
      'reset_confirmation_required',
      'incorrect_current_password',
      'protected_admin',
      'roster_too_large',
      'invalid_roster',
      'assigned_instructor',
      'active_bookings',
      'slot_unavailable',
      'draft_limit',
      'booking_blocked',
      'booking_conflict',
      'invalid_transition',
      'not_found',
      'too_early_absent',
      'invalid_request',
    ];
    return reply(
      { error: known.includes(message) ? message : 'request_failed' },
      message === 'unauthorised' ? 401 : message === 'forbidden' ? 403 : 400,
    );
  }
}
