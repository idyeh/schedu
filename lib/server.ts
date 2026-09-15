import { database, requestOrigin } from '@/db/runtime';
export { database } from '@/db/runtime';
import { defaultSettings, normaliseSettings } from './model';
import type { Settings, User, Booking } from './model';
export const uuid = () => crypto.randomUUID();
const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b), (v) => v.toString(16).padStart(2, '0')).join(
    '',
  );
export const randomPassword = () =>
  hex(crypto.getRandomValues(new Uint8Array(9)).buffer);
export async function hashToken(token: string) {
  return hex(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
  );
}
export async function passwordHash(
  password: string,
  salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer),
) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    key,
    256,
  );
  return `${salt}:${hex(bits)}`;
}
export async function passwordMatches(p: string, hash: string) {
  const actual = await passwordHash(p, hash.split(':')[0]);
  let diff = actual.length ^ hash.length;
  for (let i = 0; i < actual.length; i++)
    diff |= actual.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}
export function safeUser(row: any): User {
  return {
    id: row.id,
    role: row.role,
    profile: JSON.parse(row.profile),
    firstLogin: row.first_login,
    blockedUntil: row.blocked_until,
  };
}
export function safeBooking(row: any): Booking {
  return {
    id: row.id,
    studentId: row.student_id,
    status: row.status,
    slot: JSON.parse(row.slot),
    topic: row.topic,
    score: row.score,
    feedback: row.feedback,
    history: JSON.parse(row.history),
    createdAt: row.created_at,
  };
}
export async function getSettings(): Promise<Settings> {
  const row = await database()
    .prepare('SELECT value FROM settings WHERE id=1')
    .first<{ value: string }>();
  return row
    ? normaliseSettings(JSON.parse(row.value))
    : structuredClone(defaultSettings);
}
export async function getUser(req: Request): Promise<User | null> {
  const token = req.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)schedu_session=([^;]+)/)?.[1];
  if (!token) return null;
  const row = await database()
    .prepare(
      'SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?',
    )
    .bind(await hashToken(token), Date.now())
    .first();
  return row ? safeUser(row) : null;
}
export function sessionCookie(req: Request, token: string, maxAge = 604800) {
  return `schedu_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(requestOrigin(req)).protocol === 'https:' ? '; Secure' : ''}`;
}
export async function newSession(req: Request, userId: string) {
  const token = uuid() + uuid();
  await database().batch([
    database()
      .prepare('DELETE FROM sessions WHERE expires < ?')
      .bind(Date.now()),
    database()
      .prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)')
      .bind(await hashToken(token), userId, Date.now() + 604800000),
  ]);
  return sessionCookie(req, token);
}
