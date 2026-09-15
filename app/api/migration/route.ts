import { requestOrigin } from '@/db/runtime';
import {
  database,
  getUser,
  passwordMatches,
  sessionCookie,
} from '@/lib/server';
import {
  maxMigrationBytes,
  validateMigrationPackage,
  migrationSummary,
} from '@/lib/migration-package';
import {
  exportAppData,
  restoreAppData,
  migrationResetStatus,
} from '@/lib/migration-store';
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
async function readBody(req: Request) {
  if (!req.body) throw Error('invalid_request');
  const reader = req.body.getReader(),
    decoder = new TextDecoder();
  const parts: string[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxMigrationBytes + 16384) {
        await reader.cancel();
        throw Error('export_package_too_large');
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return JSON.parse(parts.join('')) as {
      action?: string;
      currentPassword?: string;
      confirmation?: string;
      package?: unknown;
    };
  } catch (error) {
    if (error instanceof SyntaxError) throw Error('invalid_export_package');
    throw error;
  } finally {
    reader.releaseLock();
  }
}
export async function POST(req: Request) {
  try {
    if (
      (req.headers.get('origin') &&
        req.headers.get('origin') !== requestOrigin(req)) ||
      req.headers.get('sec-fetch-site') === 'cross-site'
    )
      return reply({ error: 'forbidden' }, 403);
    if (!req.headers.get('content-type')?.includes('application/json'))
      return reply({ error: 'invalid_request' }, 400);
    const user = await getUser(req);
    if (!user) return reply({ error: 'unauthorised' }, 401);
    if (user.role !== 'admin') return reply({ error: 'forbidden' }, 403);
    const body = await readBody(req),
      db = database();
    if (!['export', 'inspect', 'restore'].includes(body.action || ''))
      return reply({ error: 'invalid_request' }, 400);
    if (body.action === 'inspect') {
      const pkg = await validateMigrationPackage(body.package);
      return reply({
        summary: migrationSummary(pkg),
        reset: await migrationResetStatus(db),
      });
    }
    const account = await db
      .prepare("SELECT password FROM users WHERE id=? AND role='admin'")
      .bind(user.id)
      .first<{ password: string }>();
    if (
      !account ||
      typeof body.currentPassword !== 'string' ||
      body.currentPassword.length > 128 ||
      !(await passwordMatches(body.currentPassword, account.password))
    )
      return reply({ error: 'incorrect_current_password' }, 400);
    if (body.action === 'export') {
      const pkg = await exportAppData(db, user.id, account.password);
      const output = JSON.stringify(pkg, null, 2);
      if (new TextEncoder().encode(output).byteLength > maxMigrationBytes)
        throw Error('export_package_too_large');
      return new Response(output, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="schedu-export-${pkg.exportedAt.replace(/[:.]/g, '-')}.json"`,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    if (body.confirmation !== 'RESTORE SchedU')
      throw Error('restore_confirmation_required');
    if (!(await migrationResetStatus(db)).ready)
      throw Error('restore_requires_reset');
    const pkg = await validateMigrationPackage(body.package);
    await restoreAppData(db, pkg, user.id, account.password);
    return reply({ ok: true, summary: migrationSummary(pkg) }, 200, {
      'Set-Cookie': sessionCookie(req, '', 0),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const known = [
      'invalid_request',
      'forbidden',
      'incorrect_current_password',
      'invalid_export_package',
      'unsupported_export_version',
      'export_checksum_mismatch',
      'export_package_too_large',
      'restore_confirmation_required',
      'restore_requires_reset',
    ];
    return reply(
      { error: known.includes(message) ? message : 'migration_failed' },
      message === 'forbidden'
        ? 403
        : message === 'export_package_too_large'
          ? 413
          : 400,
    );
  }
}
