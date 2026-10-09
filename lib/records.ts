import { activeStatuses } from './model.ts';
import type { Booking, Settings, Status } from './model.ts';

// Records and statistics are read from the status history already stored on each booking.
export type Step = { by: string; at: number };
function step(b: Booking, status: string): Step | null {
  const found = (b.history || []).findLast((h) => h.status === status);
  return found ? { by: found.by, at: found.at } : null;
}
const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const duration = (list: Booking[]) =>
  Math.round(
    list.reduce((n, b) => n + (b.slot.endsAt - b.slot.startsAt), 0) / 60000,
  );

// A draft never reserved a seat, so it is not an appointment.
export const isAppointment = (b: Booking) => b.status !== 'draft';
export const evaluated = (b: Booking) => b.score !== null;
// A mark of zero is the absence record; any other mark means the student attended.
export const attended = (b: Booking) => b.score !== null && b.score !== 0;
export const wasCancelled = (b: Booking) =>
  b.status === 'cancelled' || (b.status === 'archived' && b.score === null);
export const awaitingFeedback = (b: Booking, now: number) =>
  (b.status === 'approved' || b.status === 'in_progress') &&
  b.slot.startsAt <= now;
export const requestedAt = (b: Booking) =>
  step(b, 'submitted')?.at ?? b.createdAt;
export const completion = (b: Booking) => step(b, 'completed');
export const cancellation = (b: Booking) => step(b, 'cancelled');
// The member of staff who recorded the outcome, or who started a session still in progress.
export const guide = (b: Booking) =>
  (step(b, 'completed') ?? step(b, 'in_progress'))?.by ?? null;

export type Outcome =
  | 'awaiting_approval'
  | 'upcoming'
  | 'awaiting_feedback'
  | 'attended'
  | 'absent'
  | 'cancelled';
export function outcome(b: Booking, now: number): Outcome {
  if (wasCancelled(b)) return 'cancelled';
  if (b.score !== null) return b.score === 0 ? 'absent' : 'attended';
  if (b.status === 'submitted') return 'awaiting_approval';
  return awaitingFeedback(b, now) ? 'awaiting_feedback' : 'upcoming';
}

export type ApprovalKind =
  | 'automatic'
  | 'manual'
  | 'pending'
  | 'expired'
  | 'withdrawn';
export type Approval = {
  kind: ApprovalKind;
  by: string | null;
  at: number | null;
};
export function approval(b: Booking, now: number): Approval {
  const approved = step(b, 'approved');
  if (approved)
    return approved.by === 'system'
      ? { kind: 'automatic', by: null, at: approved.at }
      : { kind: 'manual', ...approved };
  // A request can only be approved before its start time.
  if (b.status === 'submitted')
    return {
      kind: b.slot.startsAt > now ? 'pending' : 'expired',
      by: null,
      at: null,
    };
  return { kind: 'withdrawn', by: null, at: null };
}

// Same assignment rule as managesBooking: the booked slot's pool, or its teaching window's current pool.
export function inPool(b: Booking, staffId: string, settings: Settings) {
  return (
    b.slot.instructors.includes(staffId) ||
    !!settings.windows
      .find((w) => w.id === b.slot.windowId)
      ?.instructors.includes(staffId)
  );
}
// Approving, starting or completing a meeting keeps it in that person's records after reassignment.
export const actedOn = (b: Booking, staffId: string) =>
  (b.history || []).some(
    (h) =>
      h.by === staffId &&
      ['approved', 'in_progress', 'completed'].includes(h.status),
  );

export type Level = { score: number; en: string; zh: string; count: number };
// Marks recorded under an option that was later removed keep their own row.
export function evaluationLevels(
  bookings: Booking[],
  settings: Settings,
): Level[] {
  const counts = new Map<number, number>();
  for (const b of bookings)
    if (b.score !== null) counts.set(b.score, (counts.get(b.score) || 0) + 1);
  const levels: Level[] = settings.evaluations.map((e) => ({
    ...e,
    count: counts.get(e.score) || 0,
  }));
  for (const [score, count] of counts)
    if (!levels.some((l) => l.score === score))
      levels.push({ score, en: '', zh: '', count });
  return levels.sort((a, b) => b.score - a.score);
}

export function studentSummary(
  bookings: Booking[],
  settings: Settings,
  now: number,
) {
  const list = bookings.filter(isAppointment);
  const marks = list
    .filter(evaluated)
    .sort((a, b) => a.slot.startsAt - b.slot.startsAt);
  const present = marks.filter(attended);
  return {
    total: list.length,
    active: list.filter((b) => activeStatuses.includes(b.status)).length,
    attended: present.length,
    absent: marks.length - present.length,
    cancelled: list.filter(wasCancelled).length,
    attendanceRate: marks.length ? present.length / marks.length : null,
    // Absences are counted by the attendance rate, so the average covers attended tutorials only.
    averageScore: mean(present.map((b) => b.score!)),
    latestScore: present.at(-1)?.score ?? null,
    minutes: duration(present),
    first: present[0]?.slot.startsAt ?? null,
    latest: list.length ? Math.max(...list.map((b) => b.slot.startsAt)) : null,
    next:
      list
        .filter((b) => activeStatuses.includes(b.status) && b.slot.endsAt > now)
        .sort((a, b) => a.slot.startsAt - b.slot.startsAt)[0] ?? null,
    marks,
    levels: evaluationLevels(marks, settings),
  };
}
export type StudentSummary = ReturnType<typeof studentSummary>;

export type ApprovalRecord = Approval & { booking: Booking; mine: boolean };
// Every request for the person's assigned sessions, and anything they approved elsewhere.
export function approvalRecords(
  bookings: Booking[],
  staffId: string,
  settings: Settings,
  now: number,
): ApprovalRecord[] {
  return bookings
    .filter(isAppointment)
    .map((booking) => {
      const result = approval(booking, now);
      return { booking, ...result, mine: result.by === staffId };
    })
    .filter((r) => r.mine || inPool(r.booking, staffId, settings))
    .sort((a, b) => requestedAt(b.booking) - requestedAt(a.booking));
}

export type GuidanceKind = 'attended' | 'absent' | 'awaiting';
export type GuidanceRecord = { booking: Booking; kind: GuidanceKind };
// Sessions the person started or recorded, and started sessions in their pool that nobody has recorded yet.
export function guidanceRecords(
  bookings: Booking[],
  staffId: string,
  settings: Settings,
  now: number,
): GuidanceRecord[] {
  const records: GuidanceRecord[] = [];
  for (const booking of bookings.filter(isAppointment)) {
    const by = guide(booking);
    if (by === staffId)
      records.push({
        booking,
        kind: !evaluated(booking)
          ? 'awaiting'
          : attended(booking)
            ? 'attended'
            : 'absent',
      });
    else if (
      by === null &&
      awaitingFeedback(booking, now) &&
      inPool(booking, staffId, settings)
    )
      records.push({ booking, kind: 'awaiting' });
  }
  return records.sort(
    (a, b) => b.booking.slot.startsAt - a.booking.slot.startsAt,
  );
}

export function staffSummary(
  bookings: Booking[],
  staffId: string,
  settings: Settings,
  now: number,
) {
  const approvals = approvalRecords(bookings, staffId, settings, now);
  const guidance = guidanceRecords(bookings, staffId, settings, now);
  const present = guidance
    .filter((r) => r.kind === 'attended')
    .map((r) => r.booking);
  const recorded = guidance.filter((r) => r.kind !== 'awaiting');
  return {
    requests: approvals.length,
    pendingApproval: approvals.filter((r) => r.kind === 'pending').length,
    approvedByMe: approvals.filter((r) => r.mine).length,
    autoApproved: approvals.filter((r) => r.kind === 'automatic').length,
    guided: present.length,
    absences: recorded.length - present.length,
    awaitingFeedback: guidance.length - recorded.length,
    students: new Set(present.map((b) => b.studentId)).size,
    averageScore: mean(present.map((b) => b.score!)),
    minutes: duration(present),
    latest: recorded.length
      ? Math.max(...recorded.map((r) => r.booking.slot.startsAt))
      : null,
  };
}
export type StaffSummary = ReturnType<typeof staffSummary>;

// Accounts that approved, started or completed a meeting, including former staff.
export function staffActors(bookings: Booking[]) {
  const ids = new Set<string>();
  for (const b of bookings)
    for (const h of b.history || [])
      if (
        h.by !== 'system' &&
        ['approved', 'in_progress', 'completed'].includes(h.status)
      )
        ids.add(h.by);
  return ids;
}

export function byStudent(bookings: Booking[]) {
  const groups = new Map<string, Booking[]>();
  for (const b of bookings) {
    const list = groups.get(b.studentId);
    if (list) list.push(b);
    else groups.set(b.studentId, [b]);
  }
  return groups;
}

const statusOrder: Status[] = [
  'submitted',
  'approved',
  'in_progress',
  'completed',
  'cancelled',
  'archived',
];
export function instituteSummary(
  bookings: Booking[],
  settings: Settings,
  now: number,
) {
  const list = bookings.filter(isAppointment);
  const marks = list.filter(evaluated);
  const present = marks.filter(attended);
  const approvals = list.map((b) => approval(b, now).kind);
  const count = (kind: ApprovalKind) =>
    approvals.filter((k) => k === kind).length;
  return {
    total: list.length,
    active: list.filter((b) => activeStatuses.includes(b.status)).length,
    students: new Set(list.map((b) => b.studentId)).size,
    attended: present.length,
    absent: marks.length - present.length,
    cancelled: list.filter(wasCancelled).length,
    attendanceRate: marks.length ? present.length / marks.length : null,
    averageScore: mean(present.map((b) => b.score!)),
    minutes: duration(present),
    awaitingFeedback: list.filter((b) => awaitingFeedback(b, now)).length,
    approvals: {
      automatic: count('automatic'),
      manual: count('manual'),
      pending: count('pending'),
      expired: count('expired'),
      withdrawn: count('withdrawn'),
    },
    statuses: statusOrder.map((status) => ({
      status,
      count: list.filter((b) => b.status === status).length,
    })),
    levels: evaluationLevels(marks, settings),
  };
}
export type InstituteSummary = ReturnType<typeof instituteSummary>;
