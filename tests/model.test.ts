import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSettings,
  generateSlots,
  profileError,
  currentYear,
  validateSettings,
  parseCSV,
  timetableWindows,
  clientId,
  availabilityDays,
  accountStatus,
  paginationItems,
  normaliseSettings,
  semesterWeeks,
  windowDates,
  slotsInRange,
} from '../lib/model.ts';
const monday = new Date('2026-09-07T08:00:00+08:00').getTime();
const settings = {
  ...structuredClone(defaultSettings),
  horizonDays: 1,
  classrooms: ['A302', 'B201'],
  windows: [
    {
      id: 'monday',
      day: 1,
      start: '18:30',
      end: '20:05',
      location: 'A302',
      instructors: ['teacher1', 'teacher2'],
      capacity: 2,
      enabled: true,
    },
  ],
};
test('recurring window uses full meetings and includes the break only between meetings', () => {
  const slots = generateSlots(settings, monday);
  assert.deepEqual(
    slots.map((s) => s.start),
    ['18:30', '18:45', '19:00', '19:15', '19:30', '19:45'],
  );
  assert.equal(slots.at(-1)?.end, '19:55');
  assert.equal(slots[0].capacity, 2);
  assert.equal(slots[0].instructors.length, 2);
});
test('past slots, closed dates and disabled windows are excluded', () => {
  assert.equal(
    generateSlots(settings, new Date('2026-09-07T19:45:00+08:00').getTime())
      .length,
    0,
  );
  assert.equal(
    generateSlots({ ...settings, closedDates: ['2026-09-07'] }, monday).length,
    0,
  );
  assert.equal(
    generateSlots(
      { ...settings, windows: [{ ...settings.windows[0], enabled: false }] },
      monday,
    ).length,
    0,
  );
});
test('freshmen are based on China calendar year and must have a teaching class', () => {
  const p = {
    grade: 2026,
    adminClass: '26电H一',
    teachingClass: '',
    chineseName: '张三',
    englishName: 'San Zhang',
    phone: '13800000000',
  };
  assert.equal(profileError(p, settings, monday), 'teaching_class_required');
  assert.equal(profileError({ ...p, grade: 2025 }, settings, monday), null);
  assert.equal(
    profileError({ ...p, grade: 2025, adminClass: '' }, settings, monday),
    'admin_class_required',
  );
  assert.equal(currentYear(new Date('2026-12-31T16:00:00Z').getTime()), 2027);
});
test('settings reject zero duration, duplicate marks and instructor overlap', () => {
  assert.doesNotThrow(() => validateSettings(settings));
  assert.throws(() => validateSettings({ ...settings, meetingMinutes: 0 }));
  assert.throws(() =>
    validateSettings({
      ...settings,
      evaluations: [settings.evaluations[0], settings.evaluations[0]],
    }),
  );
  assert.throws(
    () =>
      validateSettings({
        ...settings,
        windows: [
          ...settings.windows,
          { ...settings.windows[0], id: 'other', location: 'B201' },
        ],
      }),
    /window_overlap/,
  );
});
test('CSV parsing handles BOM, commas, multiline cells and escaped quotation marks', () => {
  const rows = parseCSV(
    '\uFEFFid,chineseName,englishName\r\n123,张三,"San, Zhang"\r\n124,李四,"Li ""Four""\nStudent"',
  );
  assert.equal(rows[0].englishName, 'San, Zhang');
  assert.equal(rows[1].englishName, 'Li "Four"\nStudent');
  assert.throws(() => parseCSV('id,name\n123,"broken'));
  assert.throws(() => parseCSV('id,name\n123,A,B'));
});

test('dated overrides edit one occurrence, close slots and add one-off slots', () => {
  const original = generateSlots(settings, monday)[0];
  const edited = { ...original, start: '18:31', end: '18:41', enabled: true };
  const updated = { ...settings, slotOverrides: [edited] };
  assert.doesNotThrow(() => validateSettings(updated));
  assert.equal(
    generateSlots(updated, monday).find((s) => s.id === original.id)?.start,
    '18:31',
  );
  assert.equal(
    generateSlots(
      { ...settings, slotOverrides: [{ ...edited, enabled: false }] },
      monday,
    ).length,
    5,
  );
  const added = {
    ...edited,
    id: 'extra',
    windowId: '',
    start: '21:00',
    end: '21:10',
  };
  assert.equal(
    generateSlots({ ...settings, slotOverrides: [added] }, monday).length,
    7,
  );
  assert.throws(
    () =>
      validateSettings({
        ...settings,
        slotOverrides: [{ ...added, start: '18:35', end: '18:50' }],
      }),
    /window_overlap/,
  );
  assert.equal(
    generateSlots(
      { ...settings, closedDates: [original.date], slotOverrides: [added] },
      monday,
    ).length,
    0,
  );
  assert.throws(
    () =>
      validateSettings({
        ...settings,
        slotOverrides: [{ ...added, date: '2026-02-30' }],
      }),
    /invalid_settings/,
  );
});

test('HTTP-compatible identifiers and bilingual timetable import', () => {
  assert.match(clientId(), /^[a-f0-9]{32}$/);
  const windows = timetableWindows(
    'day,instructors,start,end,location,capacity\n星期一,teacher1;teacher2,18:30,20:05,A302,2\nTue,teacher1,18:30,20:05,A302,1',
  );
  assert.deepEqual(
    windows.map((w) => w.day),
    [1, 2],
  );
  assert.deepEqual(windows[0].instructors, ['teacher1', 'teacher2']);
  assert.doesNotThrow(() =>
    validateSettings({ ...defaultSettings, classrooms: ['A302'], windows }),
  );
  assert.throws(
    () =>
      timetableWindows(
        'day,instructors,start,end,location,capacity\nNoday,teacher1,18:30,20:05,A302,2',
      ),
    /invalid_csv/,
  );
  assert.throws(() => timetableWindows('id,name\n1,A'), /invalid_csv/);
});

test('legacy settings derive a unique classroom list from windows and dated slots', () => {
  const { classrooms, ...legacy } = structuredClone(settings);
  legacy.slotOverrides = [
    { ...generateSlots(settings, monday)[0], enabled: true, location: 'B201' },
  ];
  legacy.windows.push({ ...legacy.windows[0], id: 'same-room', day: 2 });
  assert.deepEqual(normaliseSettings(legacy).classrooms, classrooms);
  assert.equal('classrooms' in legacy, false);
  assert.deepEqual(
    normaliseSettings({ ...legacy, classrooms: [] }).classrooms,
    [],
  );
  assert.deepEqual(
    normaliseSettings({ ...legacy, windows: [], slotOverrides: [] }).classrooms,
    [],
  );
});
test('schedules and timetable imports require classrooms from the configured list', () => {
  assert.doesNotThrow(() => validateSettings(defaultSettings));
  for (const classrooms of [[], ['B201']]) {
    assert.throws(
      () => validateSettings({ ...settings, classrooms }),
      /invalid_classroom/,
    );
  }
  for (const classrooms of [
    ['A302', 'A302'],
    ['A302', ' '],
    ['A302', 'x'.repeat(121)],
  ]) {
    assert.throws(
      () => validateSettings({ ...settings, classrooms }),
      /invalid_classrooms/,
    );
  }
  const extra = {
    ...generateSlots(settings, monday)[0],
    id: 'extra-room',
    windowId: '',
    start: '21:00',
    end: '21:10',
    location: 'Unknown room',
    enabled: true,
  };
  assert.throws(
    () => validateSettings({ ...settings, slotOverrides: [extra] }),
    /invalid_classroom/,
  );
  assert.doesNotThrow(() =>
    validateSettings({
      ...settings,
      slotOverrides: [{ ...extra, location: 'B201' }],
    }),
  );
  const windows = timetableWindows(
    'day,instructors,start,end,location,capacity\nMonday,teacher1,18:30,20:05,Unknown room,1',
  );
  assert.throws(
    () => validateSettings({ ...settings, windows }),
    /invalid_classroom/,
  );
});

test('phone may be omitted while class rules remain enforced', () => {
  const p = {
    grade: 2026,
    adminClass: '26电H一',
    teachingClass: 'Class 1',
    chineseName: '张三',
    englishName: 'San Zhang',
    phone: '',
  };
  assert.equal(profileError(p, settings, monday), null);
  assert.equal(
    profileError({ ...p, phone: 'bad' }, settings, monday),
    'profile_incomplete',
  );
  assert.equal(
    profileError({ ...p, teachingClass: '' }, settings, monday),
    'teaching_class_required',
  );
  assert.equal(
    profileError({ ...p, grade: 2025, teachingClass: '' }, settings, monday),
    null,
  );
});
test('availability covers 28 dated days, closures, one-off edits and occupied seats', () => {
  const slot = generateSlots(settings, monday)[0];
  const preview = availabilityDays(
    {
      ...settings,
      closedDates: ['2026-09-14'],
      slotOverrides: [
        {
          ...slot,
          id: 'extra-preview',
          windowId: '',
          date: '2026-09-08',
          enabled: true,
        },
      ],
    },
    [{ slot, status: 'approved' }] as any,
    monday,
  );
  assert.equal(preview.length, 28);
  assert.equal(preview[0].date, '2026-09-07');
  assert.equal(preview.at(-1)?.date, '2026-10-04');
  assert.equal(preview[0].slots[0].remaining, 1);
  assert.equal(preview[1].slots[0].id, 'extra-preview');
  assert.equal(preview[1].bookable, false);
  assert.equal(preview[7].closed, true);
  assert.equal(preview[7].slots.length, 0);
});

test('account status distinguishes current student pauses from expired or staff restrictions', () => {
  const user = {
    id: 'student',
    role: 'student' as const,
    profile: {
      grade: 2026,
      adminClass: '26电H一',
      teachingClass: '',
      chineseName: '张三',
      englishName: 'San Zhang',
      phone: '',
    },
    firstLogin: 1,
    blockedUntil: monday + 1,
  };
  assert.equal(accountStatus(user, monday), 'paused');
  assert.equal(
    accountStatus({ ...user, blockedUntil: monday }, monday),
    'pending',
  );
  assert.equal(
    accountStatus({ ...user, role: 'instructor', firstLogin: 0 }, monday),
    'active',
  );
});
test('pagination shows neighbours, first and last pages without duplicate numbers', () => {
  assert.deepEqual(paginationItems(1, 1), [1]);
  assert.deepEqual(paginationItems(1, 25), [1, 2, 3, 4, 5, 'ellipsis', 25]);
  assert.deepEqual(paginationItems(12, 25), [
    1,
    'ellipsis',
    10,
    11,
    12,
    13,
    14,
    'ellipsis',
    25,
  ]);
  assert.deepEqual(paginationItems(25, 25), [
    1,
    'ellipsis',
    21,
    22,
    23,
    24,
    25,
  ]);
});

void test('semester boundaries include partial weeks and stop dates after the final day', () => {
  const term = {
    ...settings,
    semesterStart: '2026-09-09',
    semesterEnd: '2027-01-12',
    horizonDays: 90,
  };
  const tuesday = { ...term.windows[0], day: 2 };
  assert.equal(semesterWeeks(term), 19);
  const dates = windowDates(term, tuesday);
  assert.equal(dates[0], '2026-09-15');
  assert.equal(dates.at(-1), '2027-01-12');
  const slots = slotsInRange(
    { ...term, windows: [tuesday] },
    '2026-09-01',
    '2027-02-01',
  );
  assert.equal(slots[0].date, '2026-09-15');
  assert.equal(slots.at(-1)?.date, '2027-01-12');
  assert.equal(
    generateSlots(
      { ...term, windows: [tuesday] },
      Date.parse('2027-01-13T00:00:00+08:00'),
    ).length,
    0,
  );
});
void test('starting week and repeat count count calendar weeks without extending for dates off', () => {
  const term = {
    ...settings,
    semesterStart: '2026-09-07',
    semesterEnd: '2026-10-20',
    windows: [{ ...settings.windows[0], day: 2, startWeek: 2, repeatWeeks: 3 }],
    closedDates: ['2026-09-22'],
  };
  assert.deepEqual(windowDates(term, term.windows[0]), [
    '2026-09-15',
    '2026-09-22',
    '2026-09-29',
  ]);
  assert.deepEqual(
    [
      ...new Set(
        slotsInRange(term, '2026-09-01', '2026-11-01').map((s) => s.date),
      ),
    ],
    ['2026-09-15', '2026-09-29'],
  );
  const long = { ...term.windows[0], startWeek: 6, repeatWeeks: 20 };
  assert.deepEqual(windowDates(term, long), ['2026-10-13', '2026-10-20']);
});
void test('dated changes respect recurrence bounds and may move within the same teaching week', () => {
  const term = {
    ...settings,
    semesterStart: '2026-09-07',
    semesterEnd: '2026-09-20',
    windows: [{ ...settings.windows[0], repeatWeeks: 1 }],
  };
  const slot = slotsInRange(term, '2026-09-07', '2026-09-07')[0];
  const moved = { ...slot, date: '2026-09-08', enabled: true };
  assert.doesNotThrow(() =>
    validateSettings({ ...term, slotOverrides: [moved] }),
  );
  assert.equal(
    slotsInRange(
      { ...term, slotOverrides: [moved] },
      '2026-09-07',
      '2026-10-01',
    ).filter((s) => s.id === slot.id)[0].date,
    '2026-09-08',
  );
  assert.equal(
    slotsInRange(
      { ...term, slotOverrides: [{ ...moved, date: '2026-09-21' }] },
      '2026-09-07',
      '2026-10-01',
    ).some((s) => s.id === slot.id),
    false,
  );
  assert.equal(
    slotsInRange(
      { ...term, slotOverrides: [{ ...moved, date: '2026-09-14' }] },
      '2026-09-07',
      '2026-10-01',
    ).some((s) => s.id === slot.id),
    false,
  );
});
void test('matching times may be reused in disjoint teaching weeks', () => {
  const first = { ...settings.windows[0], startWeek: 1, repeatWeeks: 2 };
  const next = { ...first, id: 'later', startWeek: 3 };
  const term = {
    ...settings,
    semesterStart: '2026-09-07',
    semesterEnd: '2026-12-31',
    windows: [first, next],
  };
  assert.doesNotThrow(() => validateSettings(term));
  assert.throws(
    () =>
      validateSettings({
        ...term,
        windows: [first, { ...next, startWeek: 2 }],
      }),
    /window_overlap/,
  );
});
void test('semester validation rejects impossible dates, reversed ranges and invalid recurrence', () => {
  for (const patch of [
    { semesterStart: '2026-02-30', semesterEnd: '2026-05-01' },
    { semesterStart: '2026-09-07', semesterEnd: '' },
    { semesterStart: '2026-09-07', semesterEnd: '2026-09-01' },
    { semesterStart: '2026-09-07', semesterEnd: '2028-01-01' },
  ])
    assert.throws(
      () => validateSettings({ ...settings, ...patch }),
      /invalid_semester/,
    );
  const term = {
    ...settings,
    semesterStart: '2026-09-07',
    semesterEnd: '2027-01-12',
  };
  for (const patch of [
    { startWeek: 0 },
    { repeatWeeks: 0 },
    { repeatWeeks: 1.5 },
    { startWeek: 55 },
  ])
    assert.throws(
      () =>
        validateSettings({
          ...term,
          windows: [{ ...term.windows[0], ...patch }],
        }),
      /invalid_recurrence/,
    );
  assert.throws(
    () =>
      validateSettings({
        ...settings,
        windows: [{ ...settings.windows[0], repeatWeeks: 3 }],
      }),
    /semester_required/,
  );
});
void test('calendar navigation shows distant semester sessions without opening student bookings early', () => {
  const term = {
    ...settings,
    horizonDays: 28,
    semesterStart: '2026-09-07',
    semesterEnd: '2027-01-12',
  };
  const days = availabilityDays(term, [], monday, '2026-11-02');
  assert.equal(
    availabilityDays(term, [], Date.parse('2026-09-07T20:00:00+08:00'))[0].slots
      .length,
    0,
  );
  const past = availabilityDays(
    term,
    [],
    Date.parse('2026-09-08T08:00:00+08:00'),
    '2026-09-07',
  );
  assert.equal(past[0].past, true);
  assert.equal(past[0].slots.length, 6);
  assert.equal(days[0].date, '2026-11-02');
  assert.equal(days[0].slots.length, 6);
  assert.equal(days[0].bookable, false);
  assert.equal(
    days.some((d) => d.today),
    false,
  );
  assert.equal(
    generateSlots(term, monday).some((s) => s.date === '2026-11-02'),
    false,
  );
  const imported = timetableWindows(
    'day,instructors,start,end,location,capacity,startWeek,repeatWeeks\nTuesday,teacher1,18:30,20:05,A302,1,2,8',
  )[0];
  assert.equal(imported.startWeek, 2);
  assert.equal(imported.repeatWeeks, 8);
});
