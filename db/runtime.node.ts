import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { openSqlite } from './sqlite';
let instance: ReturnType<typeof openSqlite> | undefined;
export function database() {
  return (instance ??= openSqlite(
    process.env.SCHEDU_DB_PATH || resolve('data/schedu.sqlite'),
    process.env.SCHEDU_MIGRATIONS_DIR || resolve('drizzle'),
  ));
}
export const setupTokenRequired = () => true;
export function validSetupToken(value: unknown) {
  const secret = process.env.SCHEDU_SETUP_TOKEN;
  if (!secret || secret.length < 32 || typeof value !== 'string') return false;
  const supplied = Buffer.from(value),
    expected = Buffer.from(secret);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}
export function requestOrigin(_req: Request) {
  const origin = process.env.SCHEDU_ORIGIN;
  if (!origin) throw Error('SCHEDU_ORIGIN is required for self-hosting');
  return new URL(origin).origin;
}
// Account-based throttling cannot be bypassed by forging proxy headers.
export const rateLimitScope = (_req: Request) => 'self-hosted';
