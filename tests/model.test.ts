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
} from '../lib/model.ts';
const monday = new Date('2026-09-07T08:00:00+08:00').getTime();
const settings = {
  ...structuredClone(defaultSettings),
  horizonDays: 1,
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
  assert.doesNotThrow(() => validateSettings({ ...defaultSettings, windows }));
  assert.throws(
    () =>
      timetableWindows(
        'day,instructors,start,end,location,capacity\nNoday,teacher1,18:30,20:05,A302,2',
      ),
    /invalid_csv/,
  );
  assert.throws(() => timetableWindows('id,name\n1,A'), /invalid_csv/);
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
