import {
  setupTokenRequired,
  validSetupToken,
  requestOrigin,
  rateLimitScope,
} from '@/db/runtime';
import {
  database,
  getSettings,
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
} from '@/lib/model';
import type { User, Profile, Settings, Booking } from '@/lib/model';
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
    if (raw.length > 200000) fail('invalid_request');
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
    const settings = await getSettings();
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
        s.windows.some((w) =>
          w.instructors.some((id) => !staff.results.some((u) => u.id === id)),
        )
      )
        fail('invalid_instructor');
      await db
        .prepare(
          'INSERT INTO settings(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
        )
        .bind(JSON.stringify(s))
        .run();
      return reply({ ok: true });
    }
    if (b.action === 'issue' || b.action === 'import') {
      requireAdmin(user);
      const rows = b.action === 'issue' ? [b.user] : b.rows;
      if (!Array.isArray(rows) || !rows.length || rows.length > 100)
        fail('import_limit');
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
      const statements = [];
      for (const r of checked)
        statements.push(
          db
            .prepare(
              'INSERT INTO users(id,role,password,profile,first_login,blocked_until) VALUES(?,?,?,?,1,0)',
            )
            .bind(
              r.id,
              r.role,
              await passwordHash(r.password),
              JSON.stringify(r.profile),
            ),
        );
      await db.batch(statements);
      return reply({
        ok: true,
        credentials: checked.map((r) => ({ id: r.id, password: r.password })),
      });
    }
    if (b.action === 'role') {
      requireAdmin(user);
      if (!['student', 'instructor'].includes(b.role)) fail('forbidden');
      if (
        settings.windows.some((w) => w.instructors.includes(b.id)) &&
        b.role === 'student'
      )
        fail('assigned_instructor');
      const active = await db
        .prepare(
          "SELECT count(*) as n FROM bookings WHERE student_id=? AND status IN ('submitted','approved','in_progress')",
        )
        .bind(b.id)
        .first<{ n: number }>();
      if (active!.n > 0) fail('active_bookings');
      const result = await db
        .prepare("UPDATE users SET role=? WHERE id=? AND role!='admin'")
        .bind(b.role, b.id)
        .run();
      if (result.meta.changes !== 1) fail('forbidden');
      await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(b.id).run();
      return reply({ ok: true });
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
    AND (SELECT blocked_until FROM users WHERE id=?)<=? ORDER BY candidate.value LIMIT 1`)
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
    const message = e instanceof Error ? e.message : 'invalid_request';
    const known = [
      'invalid_settings',
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
      'import_limit',
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
