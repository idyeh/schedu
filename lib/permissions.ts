import type { Booking, Role, Settings, User } from './model.ts';

export const isManager = (role: Role | undefined) =>
  role === 'admin' || role === 'sysadmin';
export const isSysadmin = (role: Role | undefined) => role === 'sysadmin';
export function canManageAccount(actor: Role, target: Role) {
  return (
    target !== 'sysadmin' &&
    (isSysadmin(actor) || (actor === 'admin' && !isManager(target)))
  );
}
export function canSetRole(actor: Role, target: Role, next: Role) {
  return (
    canManageAccount(actor, target) &&
    next !== 'sysadmin' &&
    (next !== 'admin' || isSysadmin(actor))
  );
}
export function canEditSettings(
  actor: Role,
  before: Settings,
  after: Settings,
) {
  if (isSysadmin(actor)) return true;
  if (actor !== 'admin') return false;
  const scheduleKeys = ['windows', 'slotOverrides', 'closedDates'];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => !scheduleKeys.includes(key))
    .every(
      (key) =>
        JSON.stringify(before[key as keyof Settings]) ===
        JSON.stringify(after[key as keyof Settings]),
    );
}
export function managesBooking(
  user: User,
  booking: Booking,
  settings: Settings,
) {
  return (
    isManager(user.role) ||
    (user.role === 'instructor' &&
      (booking.slot.instructors.includes(user.id) ||
        !!settings.windows
          .find((window) => window.id === booking.slot.windowId)
          ?.instructors.includes(user.id)))
  );
}
export function canCancelBooking(
  user: User,
  booking: Booking,
  settings: Settings,
  now: number,
) {
  if (!['submitted', 'approved'].includes(booking.status)) return false;
  if (user.role === 'student')
    return booking.studentId === user.id && booking.slot.startsAt > now;
  return (
    managesBooking(user, booking, settings) &&
    (user.role !== 'instructor' ||
      settings.instructorCancellationAllowed === true)
  );
}
