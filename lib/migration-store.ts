import type { Database } from '../db/types.ts';
import { defaultSettings } from './model.ts';
import { createMigrationPackage } from './migration-package.ts';
import type { ExportData, MigrationPackage } from './migration-package.ts';

export async function migrationResetStatus(db: Database) {
  const row = await db
    .prepare(`SELECT reset_at, CASE WHEN restore_ready=1
    AND NOT EXISTS (SELECT 1 FROM users WHERE role!='sysadmin')
    AND (SELECT count(*) FROM users WHERE role='sysadmin')=1
    AND NOT EXISTS (SELECT 1 FROM bookings)
    AND (SELECT value FROM settings WHERE id=1)=?
    THEN 1 ELSE 0 END AS ready FROM app_state WHERE id=1`)
    .bind(JSON.stringify(defaultSettings))
    .first<{ reset_at: number | null; ready: number }>();
  return { ready: row?.ready === 1, resetAt: row?.reset_at ?? null };
}
export async function exportAppData(
  db: Database,
  adminId: string,
  verifiedHash: string,
) {
  // One statement gives every table the same committed SQLite snapshot.
  const row = await db
    .prepare(`SELECT json_object(
    'settings', json((SELECT value FROM settings WHERE id=1)),
    'users', json((SELECT json_group_array(json_object('id',id,'role',role,'password',password,
      'profile',profile,'first_login',first_login,'blocked_until',blocked_until,'admin_granted_at',admin_granted_at)) FROM (SELECT * FROM users ORDER BY id))),
    'bookings', json((SELECT json_group_array(json_object('id',id,'student_id',student_id,'status',status,
      'slot_id',slot_id,'seat',seat,'slot',slot,'starts_at',starts_at,'ends_at',ends_at,'topic',topic,
      'score',score,'feedback',feedback,'history',history,'created_at',created_at)) FROM (SELECT * FROM bookings ORDER BY id)))
    ) AS payload FROM users WHERE id=? AND role='sysadmin' AND password=?`)
    .bind(adminId, verifiedHash)
    .first<{ payload: string }>();
  if (!row) throw Error('forbidden');
  return createMigrationPackage(JSON.parse(row.payload) as ExportData);
}
export async function restoreAppData(
  db: Database,
  pkg: MigrationPackage,
  adminId: string,
  verifiedHash: string,
) {
  const token = crypto.randomUUID();
  const guard =
    'EXISTS (SELECT 1 FROM app_state WHERE id=1 AND restore_token=?)';
  const users = JSON.stringify(pkg.data.users),
    bookings = JSON.stringify(pkg.data.bookings);
  if (
    pkg.version !== 2 ||
    pkg.data.users.filter((u) => u.role === 'sysadmin').length !== 1
  )
    throw Error('invalid_export_package');
  const result = await db.batch([
    db
      .prepare(`UPDATE app_state SET restore_token=?,restore_ready=0 WHERE id=1 AND restore_ready=1
      AND (SELECT value FROM settings WHERE id=1)=?
      AND NOT EXISTS (SELECT 1 FROM bookings)
      AND NOT EXISTS (SELECT 1 FROM users WHERE role!='sysadmin')
      AND EXISTS (SELECT 1 FROM users WHERE id=? AND role='sysadmin' AND password=?)`)
      .bind(token, JSON.stringify(defaultSettings), adminId, verifiedHash),
    db.prepare(`DELETE FROM sessions WHERE ${guard}`).bind(token),
    // The restore token permits owner replacement only inside this guarded transaction.
    db.prepare(`DELETE FROM users WHERE ${guard}`).bind(token),
    db
      .prepare(`INSERT INTO users(id,role,password,profile,first_login,blocked_until,admin_granted_at)
      SELECT json_extract(value,'$.id'),json_extract(value,'$.role'),json_extract(value,'$.password'),
        json_extract(value,'$.profile'),json_extract(value,'$.first_login'),json_extract(value,'$.blocked_until'),
        json_extract(value,'$.admin_granted_at') FROM json_each(?) WHERE ${guard}`)
      .bind(users, token),
    db
      .prepare(`INSERT INTO bookings(id,student_id,status,slot_id,seat,slot,starts_at,ends_at,topic,score,feedback,history,created_at)
      SELECT json_extract(value,'$.id'),json_extract(value,'$.student_id'),json_extract(value,'$.status'),
        json_extract(value,'$.slot_id'),json_extract(value,'$.seat'),json_extract(value,'$.slot'),
        json_extract(value,'$.starts_at'),json_extract(value,'$.ends_at'),json_extract(value,'$.topic'),
        json_extract(value,'$.score'),json_extract(value,'$.feedback'),json_extract(value,'$.history'),json_extract(value,'$.created_at')
      FROM json_each(?) WHERE ${guard}`)
      .bind(bookings, token),
    db
      .prepare(`UPDATE settings SET value=? WHERE id=1 AND ${guard}`)
      .bind(JSON.stringify(pkg.data.settings), token),
    db.prepare(`DELETE FROM attempts WHERE ${guard}`).bind(token),
    db
      .prepare(
        `UPDATE app_state SET restore_token='',restore_ready=0 WHERE id=1 AND ${guard}`,
      )
      .bind(token),
  ]);
  if (!result[0].meta.changes) throw Error('restore_requires_reset');
}
