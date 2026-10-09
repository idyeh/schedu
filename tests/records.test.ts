import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, emptyProfile } from '../lib/model.ts';
import type { Booking, Settings, Status, User } from '../lib/model.ts';
import { managesBooking } from '../lib/permissions.ts';
import {
  approval,
  approvalRecords,
  actedOn,
  byStudent,
  evaluationLevels,
  guidanceRecords,
  guide,
  inPool,
  instituteSummary,
  outcome,
  staffActors,
  staffSummary,
  studentSummary,
  wasCancelled,
} from '../lib/records.ts';

const hour = 3600000;
const now = Date.parse('2026-10-04T18:35:00+08:00');
const settings: Settings = {
  ...structuredClone(defaultSettings),
  classrooms: ['A302'],
  windows: [
    {
      id: 'tuesday',
      day: 2,
      start: '18:30',
      end: '20:05',
      location: 'A302',
      instructors: ['lin', 'zhou'],
      capacity: 2,
      enabled: true,
    },
  ],
};
let serial = 0;
// Builds a booking whose history follows the server's own transition order.
function booking(
  studentId: string,
  status: Status,
  startsAt: number,
  options: {
    score?: number | null;
    instructors?: string[];
    windowId?: string;
    approvedBy?: string | null;
    startedBy?: string;
    completedBy?: string;
    cancelledBy?: string;
    archivedBy?: string;
  } = {},
): Booking {
  const created = startsAt - 48 * hour;
  const history = [{ status: 'draft', at: created, by: studentId }];
  if (status !== 'draft')
    history.push({ status: 'submitted', at: created + 1000, by: studentId });
  const approver =
    options.approvedBy === undefined
      ? ['draft', 'submitted'].includes(status) || options.cancelledBy
        ? null
        : 'system'
      : options.approvedBy;
  if (approver)
    history.push({ status: 'approved', at: created + 2000, by: approver });
  if (options.startedBy)
    history.push({
      status: 'in_progress',
      at: startsAt,
      by: options.startedBy,
    });
  if (options.completedBy)
    history.push({
      status: 'completed',
      at: startsAt + 15 * 60000,
      by: options.completedBy,
    });
  if (options.cancelledBy)
    history.push({
      status: 'cancelled',
      at: created + hour,
      by: options.cancelledBy,
    });
  if (options.archivedBy)
    history.push({
      status: 'archived',
      at: startsAt + 2 * hour,
      by: options.archivedBy,
    });
  const id = `booking-${++serial}`;
  return {
    id,
    studentId,
    status,
    slot: {
      id: `slot-${id}`,
      windowId: options.windowId ?? 'tuesday',
      date: '2026-10-06',
      start: '18:30',
      end: '18:40',
      startsAt,
      endsAt: startsAt + 10 * 60000,
      location: 'A302',
      instructors: options.instructors ?? ['lin', 'zhou'],
      capacity: 2,
      remaining: 2,
    },
    topic: '',
    score: options.score ?? null,
    feedback: '',
    history,
    createdAt: created,
  };
}
const past = (days: number) => now - days * 24 * hour;
const future = (days: number) => now + days * 24 * hour;

void test('outcome separates attendance, absence, cancellation and sessions that still need feedback', () => {
  const cases: [Booking, string][] = [
    [booking('s', 'submitted', future(1)), 'awaiting_approval'],
    [booking('s', 'approved', future(1)), 'upcoming'],
    [booking('s', 'approved', now - 1), 'awaiting_feedback'],
    [
      booking('s', 'in_progress', now - 1, { startedBy: 'lin' }),
      'awaiting_feedback',
    ],
    [
      booking('s', 'completed', past(1), { score: 70, completedBy: 'lin' }),
      'attended',
    ],
    [
      booking('s', 'completed', past(1), { score: 0, completedBy: 'lin' }),
      'absent',
    ],
    [booking('s', 'cancelled', future(1), { cancelledBy: 's' }), 'cancelled'],
    [
      booking('s', 'archived', past(1), {
        score: 40,
        completedBy: 'lin',
        archivedBy: 'lin',
      }),
      'attended',
    ],
    [
      booking('s', 'archived', past(1), {
        cancelledBy: 'admin',
        archivedBy: 'admin',
      }),
      'cancelled',
    ],
  ];
  for (const [b, expected] of cases)
    assert.equal(outcome(b, now), expected, `${b.status} ${b.score}`);
  // Archiving keeps the distinction between a completed and a cancelled meeting.
  assert.equal(wasCancelled(cases[7][0]), false);
  assert.equal(wasCancelled(cases[8][0]), true);
});

void test('approval distinguishes automatic, personal, pending, expired and withdrawn requests', () => {
  assert.deepEqual(approval(booking('s', 'approved', future(1)), now), {
    kind: 'automatic',
    by: null,
    at: future(1) - 48 * hour + 2000,
  });
  const manual = approval(
    booking('s', 'approved', future(1), { approvedBy: 'lin' }),
    now,
  );
  assert.equal(manual.kind, 'manual');
  assert.equal(manual.by, 'lin');
  assert.equal(
    approval(booking('s', 'submitted', future(1)), now).kind,
    'pending',
  );
  // The server refuses approval once the start time has passed.
  assert.equal(approval(booking('s', 'submitted', now), now).kind, 'expired');
  assert.equal(
    approval(booking('s', 'cancelled', future(1), { cancelledBy: 's' }), now)
      .kind,
    'withdrawn',
  );
  // A booking cancelled after approval keeps its approval record.
  assert.equal(
    approval(
      booking('s', 'cancelled', future(1), {
        approvedBy: 'lin',
        cancelledBy: 's',
      }),
      now,
    ).kind,
    'manual',
  );
});

void test('pool membership matches the permission rule used for staff actions', () => {
  const user = (id: string): User => ({
    id,
    role: 'instructor',
    profile: emptyProfile,
    firstLogin: 0,
    blockedUntil: 0,
  });
  const cases = [
    booking('s', 'approved', future(1)),
    booking('s', 'approved', future(1), { instructors: [] }),
    booking('s', 'approved', future(1), { instructors: ['other'] }),
    booking('s', 'approved', future(1), { instructors: [], windowId: '' }),
    booking('s', 'approved', future(1), {
      instructors: ['wu'],
      windowId: 'removed',
    }),
  ];
  for (const b of cases)
    for (const id of ['lin', 'zhou', 'wu', 'other', 'nobody'])
      assert.equal(
        inPool(b, id, settings),
        managesBooking(user(id), b, settings),
        `${id} ${b.slot.windowId} ${b.slot.instructors.join(',')}`,
      );
  // The window's current pool covers an occurrence that was booked while unstaffed.
  assert.equal(inPool(cases[1], 'lin', settings), true);
  assert.equal(inPool(cases[3], 'lin', settings), false);
});

void test('student summary counts appointments, attendance and marks without drafts', () => {
  const list = [
    booking('s', 'draft', future(2)),
    booking('s', 'approved', future(1)),
    booking('s', 'completed', past(5), { score: 70, completedBy: 'lin' }),
    booking('s', 'archived', past(12), {
      score: 40,
      completedBy: 'zhou',
      archivedBy: 'zhou',
    }),
    booking('s', 'completed', past(3), { score: 0, completedBy: 'lin' }),
    booking('s', 'cancelled', past(1), { cancelledBy: 's' }),
  ];
  const summary = studentSummary(list, settings, now);
  assert.equal(summary.total, 5);
  assert.equal(summary.active, 1);
  assert.equal(summary.attended, 2);
  assert.equal(summary.absent, 1);
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.attendanceRate, 2 / 3);
  // The absence lowers the attendance rate, not the average mark.
  assert.equal(summary.averageScore, 55);
  assert.equal(summary.latestScore, 70);
  assert.equal(summary.minutes, 20);
  assert.equal(summary.first, past(12));
  assert.equal(summary.latest, future(1));
  assert.equal(summary.next?.id, list[1].id);
  assert.deepEqual(
    summary.marks.map((b) => b.score),
    [40, 70, 0],
  );
  assert.deepEqual(
    summary.levels.map((l) => [l.score, l.count]),
    [
      [70, 1],
      [40, 1],
      [30, 0],
      [0, 1],
    ],
  );
});

void test('an account without appointments produces empty figures rather than invalid numbers', () => {
  const summary = studentSummary(
    [booking('s', 'draft', future(1))],
    settings,
    now,
  );
  assert.equal(summary.total, 0);
  assert.equal(summary.attendanceRate, null);
  assert.equal(summary.averageScore, null);
  assert.equal(summary.latestScore, null);
  assert.equal(summary.first, null);
  assert.equal(summary.latest, null);
  assert.equal(summary.next, null);
  assert.equal(summary.minutes, 0);
  const staff = staffSummary([], 'lin', settings, now);
  assert.equal(staff.averageScore, null);
  assert.equal(staff.latest, null);
  assert.equal(staff.requests, 0);
  const institute = instituteSummary([], settings, now);
  assert.equal(institute.attendanceRate, null);
  assert.equal(institute.averageScore, null);
  assert.equal(institute.total, 0);
});

void test('marks recorded under a removed evaluation option keep their own level', () => {
  const levels = evaluationLevels(
    [booking('s', 'completed', past(1), { score: 85, completedBy: 'lin' })],
    settings,
  );
  assert.deepEqual(
    levels.map((l) => [l.score, l.count, l.en]),
    [
      [85, 1, ''],
      [70, 0, 'Completed · excellent'],
      [40, 0, 'Completed · satisfactory'],
      [30, 0, 'Attended · poor performance'],
      [0, 0, 'Absent'],
    ],
  );
});

void test('approval history covers the assigned pool and anything approved elsewhere', () => {
  const pending = booking('a', 'submitted', future(2), { instructors: [] });
  const automatic = booking('b', 'approved', future(1));
  const mine = booking('c', 'approved', future(3), {
    instructors: [],
    approvedBy: 'lin',
  });
  const elsewhere = booking('d', 'approved', future(4), {
    instructors: ['other'],
    windowId: '',
    approvedBy: 'lin',
  });
  const unrelated = booking('e', 'approved', future(5), {
    instructors: ['other'],
    windowId: '',
  });
  const colleague = booking('f', 'approved', future(6), {
    instructors: [],
    approvedBy: 'zhou',
  });
  const draft = booking('g', 'draft', future(7));
  const list = [
    pending,
    automatic,
    mine,
    elsewhere,
    unrelated,
    colleague,
    draft,
  ];
  const records = approvalRecords(list, 'lin', settings, now);
  assert.deepEqual(
    records.map((r) => [r.booking.id, r.kind, r.mine]),
    [
      [colleague.id, 'manual', false],
      [elsewhere.id, 'manual', true],
      [mine.id, 'manual', true],
      [pending.id, 'pending', false],
      [automatic.id, 'automatic', false],
    ],
  );
  const summary = staffSummary(list, 'lin', settings, now);
  assert.equal(summary.requests, 5);
  assert.equal(summary.pendingApproval, 1);
  assert.equal(summary.approvedByMe, 2);
  assert.equal(summary.autoApproved, 1);
  // Someone outside every pool sees only what they approved personally.
  assert.deepEqual(
    approvalRecords(list, 'admin', settings, now).map((r) => r.booking.id),
    [],
  );
});

void test('guidance history credits whoever recorded the outcome and lists unrecorded pool sessions once', () => {
  const recorded = booking('a', 'completed', past(2), {
    score: 70,
    startedBy: 'lin',
    completedBy: 'lin',
  });
  const absent = booking('b', 'completed', past(3), {
    score: 0,
    completedBy: 'lin',
  });
  const handedOver = booking('c', 'completed', past(4), {
    score: 40,
    startedBy: 'lin',
    completedBy: 'zhou',
  });
  const onBehalf = booking('d', 'archived', past(5), {
    score: 30,
    completedBy: 'admin',
    archivedBy: 'admin',
  });
  const running = booking('e', 'in_progress', now - 60000, {
    startedBy: 'zhou',
  });
  const due = booking('f', 'approved', now - 60000);
  const upcoming = booking('g', 'approved', future(1));
  const expired = booking('h', 'submitted', now - 60000);
  const sameStudent = booking('a', 'completed', past(9), {
    score: 40,
    completedBy: 'lin',
  });
  const list = [
    recorded,
    absent,
    handedOver,
    onBehalf,
    running,
    due,
    upcoming,
    expired,
    sameStudent,
  ];
  assert.equal(guide(handedOver), 'zhou');
  assert.equal(guide(running), 'zhou');
  assert.equal(guide(due), null);
  assert.deepEqual(
    guidanceRecords(list, 'lin', settings, now).map((r) => [
      r.booking.id,
      r.kind,
    ]),
    [
      [due.id, 'awaiting'],
      [recorded.id, 'attended'],
      [absent.id, 'absent'],
      [sameStudent.id, 'attended'],
    ],
  );
  // The colleague who started the running session owns it; the shared unrecorded one appears for both.
  assert.deepEqual(
    guidanceRecords(list, 'zhou', settings, now).map((r) => [
      r.booking.id,
      r.kind,
    ]),
    [
      [running.id, 'awaiting'],
      [due.id, 'awaiting'],
      [handedOver.id, 'attended'],
    ],
  );
  assert.deepEqual(
    guidanceRecords(list, 'admin', settings, now).map((r) => [
      r.booking.id,
      r.kind,
    ]),
    [[onBehalf.id, 'attended']],
  );
  const summary = staffSummary(list, 'lin', settings, now);
  assert.equal(summary.guided, 2);
  assert.equal(summary.absences, 1);
  assert.equal(summary.awaitingFeedback, 1);
  assert.equal(summary.students, 1);
  assert.equal(summary.averageScore, 55);
  assert.equal(summary.minutes, 20);
  assert.equal(summary.latest, past(2));
  assert.deepEqual([...staffActors(list)].sort(), ['admin', 'lin', 'zhou']);
  assert.equal(actedOn(onBehalf, 'admin'), true);
  // Booking, cancelling or archiving is not a guidance or approval record.
  assert.equal(actedOn(recorded, 'a'), false);
  assert.equal(
    actedOn(
      booking('s', 'cancelled', future(1), { cancelledBy: 'admin' }),
      'admin',
    ),
    false,
  );
});

void test('institute summary totals every appointment and groups bookings by student', () => {
  const list = [
    booking('a', 'draft', future(1)),
    booking('a', 'submitted', future(1), { instructors: [] }),
    booking('a', 'submitted', now - 1, { instructors: [] }),
    booking('b', 'approved', future(2)),
    booking('b', 'approved', now - 1, { approvedBy: 'lin' }),
    booking('c', 'in_progress', now - 1, { startedBy: 'lin' }),
    booking('c', 'completed', past(1), { score: 70, completedBy: 'lin' }),
    booking('d', 'completed', past(2), { score: 30, completedBy: 'zhou' }),
    booking('d', 'completed', past(3), { score: 0, completedBy: 'zhou' }),
    booking('e', 'cancelled', future(3), { cancelledBy: 'e' }),
    booking('e', 'archived', past(4), {
      score: 40,
      completedBy: 'lin',
      archivedBy: 'lin',
    }),
    booking('e', 'archived', past(5), {
      cancelledBy: 'admin',
      archivedBy: 'admin',
    }),
  ];
  const summary = instituteSummary(list, settings, now);
  assert.equal(summary.total, 11);
  assert.equal(summary.active, 5);
  assert.equal(summary.students, 5);
  assert.equal(summary.attended, 3);
  assert.equal(summary.absent, 1);
  assert.equal(summary.cancelled, 2);
  assert.equal(summary.attendanceRate, 0.75);
  assert.equal(Math.round(summary.averageScore! * 100), 4667);
  assert.equal(summary.minutes, 30);
  assert.equal(summary.awaitingFeedback, 2);
  assert.deepEqual(summary.approvals, {
    automatic: 6,
    manual: 1,
    pending: 1,
    expired: 1,
    withdrawn: 2,
  });
  assert.deepEqual(
    summary.statuses.map((s) => [s.status, s.count]),
    [
      ['submitted', 2],
      ['approved', 2],
      ['in_progress', 1],
      ['completed', 3],
      ['cancelled', 1],
      ['archived', 2],
    ],
  );
  // Each appointment is counted in exactly one status and one approval outcome.
  assert.equal(
    summary.statuses.reduce((n, s) => n + s.count, 0),
    summary.total,
  );
  assert.equal(
    Object.values(summary.approvals).reduce((n, v) => n + v, 0),
    summary.total,
  );
  const groups = byStudent(list);
  assert.deepEqual(
    [...groups].map(([id, items]) => [id, items.length]),
    [
      ['a', 3],
      ['b', 2],
      ['c', 2],
      ['d', 2],
      ['e', 3],
    ],
  );
  // Per-student totals add back up to the institute totals.
  const perStudent = [...groups.values()].map((items) =>
    studentSummary(items, settings, now),
  );
  assert.equal(
    perStudent.reduce((n, s) => n + s.total, 0),
    summary.total,
  );
  assert.equal(
    perStudent.reduce((n, s) => n + s.attended, 0),
    summary.attended,
  );
});
