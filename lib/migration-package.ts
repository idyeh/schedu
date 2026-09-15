import {
  activeStatuses,
  normaliseSettings,
  validateSettings,
  validDate,
} from './model.ts';
import type { Settings } from './model.ts';
export const maxMigrationBytes = 100 * 1024 * 1024;
export type ExportUser = {
  id: string;
  role: string;
  password: string;
  profile: string;
  first_login: number;
  blocked_until: number;
};
export type ExportBooking = {
  id: string;
  student_id: string;
  status: string;
  slot_id: string;
  seat: number;
  slot: string;
  starts_at: number;
  ends_at: number;
  topic: string;
  score: number | null;
  feedback: string;
  history: string;
  created_at: number;
};
export type ExportData = {
  settings: Settings;
  users: ExportUser[];
  bookings: ExportBooking[];
};
export type MigrationPackage = {
  format: 'schedu-export';
  version: 1;
  exportedAt: string;
  checksum: string;
  data: ExportData;
};
const statuses = [
  'draft',
  'submitted',
  'cancelled',
  'approved',
  'in_progress',
  'completed',
  'archived',
];
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 1000): value is string =>
  typeof value === 'string' && value.length <= max;
const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/.test(value);
const integer = (
  value: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= min &&
  value <= max;
function requireValid(condition: unknown): asserts condition {
  if (!condition) throw Error('invalid_export_package');
}
function parseRecord(value: unknown): Record<string, unknown> {
  requireValid(typeof value === 'string');
  const parsed: unknown = JSON.parse(value);
  requireValid(object(parsed));
  return parsed;
}
export async function packageChecksum(data: ExportData) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function createMigrationPackage(
  data: ExportData,
): Promise<MigrationPackage> {
  return {
    format: 'schedu-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    checksum: await packageChecksum(data),
    data,
  };
}
export async function validateMigrationPackage(
  value: unknown,
): Promise<MigrationPackage> {
  if (object(value) && value.format === 'schedu-export' && value.version !== 1)
    throw Error('unsupported_export_version');
  try {
    requireValid(
      object(value) &&
        value.format === 'schedu-export' &&
        value.version === 1 &&
        typeof value.exportedAt === 'string' &&
        Number.isFinite(Date.parse(value.exportedAt)) &&
        typeof value.checksum === 'string' &&
        /^[a-f0-9]{64}$/.test(value.checksum) &&
        object(value.data),
    );
    const data = value.data;
    requireValid(
      object(data.settings) &&
        Array.isArray(data.users) &&
        data.users.length &&
        Array.isArray(data.bookings),
    );
    const userIds = new Set<string>(),
      staffIds = new Set<string>();
    for (const user of data.users) {
      requireValid(
        object(user) &&
          id(user.id) &&
          !userIds.has(user.id) &&
          typeof user.role === 'string' &&
          ['student', 'instructor', 'admin'].includes(user.role) &&
          typeof user.password === 'string' &&
          /^[a-f0-9]{32}:[a-f0-9]{64}$/.test(user.password) &&
          integer(user.first_login, 0, 1) &&
          integer(user.blocked_until),
      );
      const profile = parseRecord(user.profile);
      requireValid(
        integer(profile.grade, 2000, 9999) &&
          ['adminClass', 'teachingClass', 'chineseName', 'englishName'].every(
            (key) => text(profile[key], 80),
          ) &&
          text(profile.phone, 30),
      );
      userIds.add(user.id);
      if (user.role === 'admin' || user.role === 'instructor')
        staffIds.add(user.id);
    }
    requireValid(data.users.some((user) => user.role === 'admin'));
    const settings = normaliseSettings(data.settings as Settings);
    validateSettings(settings);
    requireValid(
      [...settings.windows, ...(settings.slotOverrides || [])].every((w) =>
        w.instructors.every((instructor) => staffIds.has(instructor)),
      ),
    );
    const bookingIds = new Set<string>(),
      seats = new Set<string>();
    for (const booking of data.bookings) {
      requireValid(
        object(booking) &&
          text(booking.id, 100) &&
          booking.id.length &&
          !bookingIds.has(booking.id) &&
          typeof booking.student_id === 'string' &&
          userIds.has(booking.student_id) &&
          typeof booking.status === 'string' &&
          statuses.includes(booking.status) &&
          text(booking.slot_id, 100) &&
          booking.slot_id.length &&
          integer(booking.seat, 0, 9) &&
          integer(booking.starts_at) &&
          integer(booking.ends_at) &&
          booking.ends_at > booking.starts_at &&
          integer(booking.created_at) &&
          text(booking.topic, 1000) &&
          text(booking.feedback, 2000) &&
          (booking.score === null || integer(booking.score, 0, 100)),
      );
      const slot = parseRecord(booking.slot);
      requireValid(
        slot.id === booking.slot_id &&
          text(slot.windowId, 50) &&
          validDate(slot.date) &&
          typeof slot.start === 'string' &&
          /^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start) &&
          typeof slot.end === 'string' &&
          /^([01]\d|2[0-3]):[0-5]\d$/.test(slot.end) &&
          slot.end > slot.start &&
          slot.startsAt === booking.starts_at &&
          slot.endsAt === booking.ends_at &&
          text(slot.location, 120) &&
          Array.isArray(slot.instructors) &&
          slot.instructors.length <= 10 &&
          slot.instructors.every(id) &&
          integer(slot.capacity, 1, 10) &&
          integer(slot.remaining, 0, 10),
      );
      requireValid(typeof booking.history === 'string');
      const history: unknown = JSON.parse(booking.history);
      requireValid(
        Array.isArray(history) &&
          history.every(
            (entry) =>
              object(entry) &&
              typeof entry.status === 'string' &&
              statuses.includes(entry.status) &&
              integer(entry.at) &&
              text(entry.by, 100),
          ),
      );
      bookingIds.add(booking.id);
      if (
        activeStatuses.includes(
          booking.status as (typeof activeStatuses)[number],
        )
      ) {
        const seat = `${booking.slot_id}:${booking.seat}`;
        requireValid(!seats.has(seat));
        seats.add(seat);
      }
    }
    const pkg = value as unknown as MigrationPackage;
    if ((await packageChecksum(pkg.data)) !== pkg.checksum)
      throw Error('export_checksum_mismatch');
    return pkg;
  } catch (error) {
    if (error instanceof Error && error.message === 'export_checksum_mismatch')
      throw error;
    throw Error('invalid_export_package');
  }
}
export function migrationSummary(pkg: MigrationPackage) {
  return {
    exportedAt: pkg.exportedAt,
    version: pkg.version,
    users: pkg.data.users.length,
    admins: pkg.data.users.filter((u) => u.role === 'admin').map((u) => u.id),
    bookings: pkg.data.bookings.length,
    windows: pkg.data.settings.windows.length,
    slotChanges: (pkg.data.settings.slotOverrides || []).length,
  };
}
