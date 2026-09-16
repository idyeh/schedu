export const maxRosterBytes = 20 * 1024 * 1024;
export type Role = 'student' | 'instructor' | 'admin' | 'sysadmin';
export type Status =
  | 'draft'
  | 'submitted'
  | 'cancelled'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'archived';
export type Profile = {
  grade: number;
  adminClass: string;
  teachingClass: string;
  chineseName: string;
  englishName: string;
  phone: string;
};
export type User = {
  id: string;
  role: Role;
  profile: Profile;
  firstLogin: number;
  blockedUntil: number;
};
export type Window = {
  id: string;
  day: number;
  start: string;
  end: string;
  location: string;
  instructors: string[];
  capacity: number;
  enabled: boolean;
  startWeek?: number;
  repeatWeeks?: number;
};
export type Evaluation = { score: number; en: string; zh: string };
export type Settings = {
  meetingMinutes: number;
  breakMinutes: number;
  cancellationWeeks: number;
  instructorCancellationAllowed: boolean;
  maxUpcoming: number;
  horizonDays: number;
  semesterStart?: string;
  semesterEnd?: string;
  defaultLanguage: string;
  defaultTheme: string;
  adminClasses: string[];
  teachingClasses: string[];
  classrooms: string[];
  evaluations: Evaluation[];
  windows: Window[];
  closedDates: string[];
  slotOverrides?: SlotOverride[];
};
export type Slot = {
  id: string;
  windowId: string;
  date: string;
  start: string;
  end: string;
  startsAt: number;
  endsAt: number;
  location: string;
  instructors: string[];
  capacity: number;
  remaining: number;
};
export type SlotOverride = Pick<
  Slot,
  | 'id'
  | 'windowId'
  | 'date'
  | 'start'
  | 'end'
  | 'location'
  | 'instructors'
  | 'capacity'
> & { enabled: boolean };
// getRandomValues is available on plain HTTP; randomUUID requires a secure context.
export function clientId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export type Booking = {
  id: string;
  studentId: string;
  status: Status;
  slot: Slot;
  topic: string;
  score: number | null;
  feedback: string;
  history: { status: string; at: number; by: string }[];
  createdAt: number;
  student?: User;
};
export const activeStatuses: Status[] = [
  'submitted',
  'approved',
  'in_progress',
];
export const emptyProfile: Profile = {
  grade: 2026,
  adminClass: '',
  teachingClass: '',
  chineseName: '',
  englishName: '',
  phone: '',
};
export const defaultSettings: Settings = {
  meetingMinutes: 10,
  breakMinutes: 5,
  cancellationWeeks: 2,
  instructorCancellationAllowed: false,
  maxUpcoming: 1,
  horizonDays: 28,
  semesterStart: '',
  semesterEnd: '',
  defaultLanguage: 'zh-CN',
  defaultTheme: 'system',
  adminClasses: [
    '26电H一',
    '26电H二',
    '26电H三',
    '26电H四',
    '26自H一',
    '26自H三',
    '26自H四',
    '26智H一',
    '26智H二',
    '26人工H一',
    '26人工H二',
  ],
  teachingClasses: Array.from({ length: 16 }, (_, i) => `Class ${i + 1}`),
  classrooms: [],
  evaluations: [
    { score: 0, en: 'Absent', zh: '缺席' },
    { score: 30, en: 'Attended · poor performance', zh: '已参加 · 表现欠佳' },
    { score: 40, en: 'Completed · satisfactory', zh: '已完成 · 表现满意' },
    { score: 70, en: 'Completed · excellent', zh: '已完成 · 表现优秀' },
  ],
  windows: [],
  closedDates: [],
};
// Older installations already have locations on their schedules. Keep these available on upgrade.
export function normaliseSettings(
  settings:
    | Settings
    | Omit<Settings, 'classrooms' | 'instructorCancellationAllowed'>,
): Settings {
  return {
    ...settings,
    instructorCancellationAllowed:
      'instructorCancellationAllowed' in settings
        ? settings.instructorCancellationAllowed
        : false,
    classrooms:
      'classrooms' in settings && Array.isArray(settings.classrooms)
        ? settings.classrooms
        : Array.from(
            new Set(
              [...settings.windows, ...(settings.slotOverrides || [])]
                .map((item) => item.location)
                .filter(
                  (location) => typeof location === 'string' && location.trim(),
                ),
            ),
          ),
  };
}
export function chinaDate(now = Date.now()) {
  return new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}
export function currentYear(now = Date.now()) {
  return Number(chinaDate(now).slice(0, 4));
}
export function minutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
export function clockTime(n: number) {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
export function validDate(date: unknown): date is string {
  return (
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
  );
}
export function addDays(date: string, days: number) {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function semesterWeekOne(settings: Settings) {
  const date = settings.semesterStart!;
  return addDays(date, -(new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7);
}
export function semesterWeeks(settings: Settings) {
  if (!settings.semesterStart || !settings.semesterEnd) return 0;
  return (
    Math.floor(
      (Date.parse(settings.semesterEnd) -
        Date.parse(semesterWeekOne(settings))) /
        (7 * 86400000),
    ) + 1
  );
}
export function inSemester(settings: Settings, date: string) {
  return (
    (!settings.semesterStart || date >= settings.semesterStart) &&
    (!settings.semesterEnd || date <= settings.semesterEnd)
  );
}
export function windowOccursOn(
  settings: Settings,
  window: Window,
  date: string,
) {
  return (
    new Date(date + 'T12:00:00Z').getUTCDay() === window.day &&
    windowIncludesDate(settings, window, date)
  );
}
export function windowIncludesDate(
  settings: Settings,
  window: Window,
  date: string,
) {
  if (!inSemester(settings, date)) return false;
  if (!settings.semesterStart) return true; // Preserve existing schedules until a semester is configured.
  const week =
    Math.floor(
      (Date.parse(date) - Date.parse(semesterWeekOne(settings))) /
        (7 * 86400000),
    ) + 1;
  const first = window.startWeek ?? 1;
  return (
    week >= first &&
    (window.repeatWeeks === undefined || week < first + window.repeatWeeks)
  );
}
export function windowDates(settings: Settings, window: Window) {
  if (!settings.semesterStart || !settings.semesterEnd) return [];
  const dates: string[] = [];
  for (
    let date = settings.semesterStart;
    date <= settings.semesterEnd;
    date = addDays(date, 1)
  )
    if (windowOccursOn(settings, window, date)) dates.push(date);
  return dates;
}
export function generateSlots(settings: Settings, now = Date.now()): Slot[] {
  const from = chinaDate(now);
  return slotsInRange(
    settings,
    from,
    addDays(from, settings.horizonDays - 1),
    now,
  );
}
export function slotsInRange(
  settings: Settings,
  from: string,
  to: string,
  cutoff = -Infinity,
): Slot[] {
  const slots: Slot[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (settings.closedDates.includes(date) || !inSemester(settings, date))
      continue;
    for (const w of settings.windows.filter(
      (w) => w.enabled && windowOccursOn(settings, w, date),
    )) {
      for (
        let m = minutes(w.start);
        m + settings.meetingMinutes <= minutes(w.end);
        m += settings.meetingMinutes + settings.breakMinutes
      ) {
        const startsAt = new Date(`${date}T${clockTime(m)}:00+08:00`).getTime();
        if (startsAt <= cutoff) continue;
        slots.push({
          id: `${w.id}_${date}_${clockTime(m)}`,
          windowId: w.id,
          date,
          start: clockTime(m),
          end: clockTime(m + settings.meetingMinutes),
          startsAt,
          endsAt: startsAt + settings.meetingMinutes * 60000,
          location: w.location,
          instructors: w.instructors,
          capacity: w.capacity,
          remaining: w.capacity,
        });
      }
    }
  }
  const overrides = new Map(
    (settings.slotOverrides || []).map((s) => [s.id, s]),
  );
  const effective = slots.filter((s) => !overrides.has(s.id));
  for (const s of overrides.values()) {
    const startsAt = Date.parse(`${s.date}T${s.start}:00+08:00`);
    if (
      !s.enabled ||
      settings.closedDates.includes(s.date) ||
      startsAt <= cutoff ||
      s.date < from ||
      s.date > to ||
      !inSemester(settings, s.date)
    )
      continue;
    if (
      s.windowId &&
      !settings.windows.some(
        (w) =>
          w.id === s.windowId &&
          w.enabled &&
          windowIncludesDate(settings, w, s.date),
      )
    )
      continue;
    effective.push({
      ...s,
      startsAt,
      endsAt: Date.parse(`${s.date}T${s.end}:00+08:00`),
      remaining: s.capacity,
    });
  }
  return effective.sort(
    (a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id),
  );
}
export function profileError(
  p: Profile,
  s: Settings,
  now = Date.now(),
): string | null {
  if (
    !p ||
    !Number.isInteger(p.grade) ||
    p.grade < 2000 ||
    p.grade > currentYear(now)
  )
    return 'invalid_grade';
  if (!s.adminClasses.includes(p.adminClass)) return 'admin_class_required';
  if (
    p.grade === currentYear(now) &&
    !s.teachingClasses.includes(p.teachingClass)
  )
    return 'teaching_class_required';
  if (p.teachingClass && !s.teachingClasses.includes(p.teachingClass))
    return 'teaching_class_required';
  if (
    !p.chineseName?.trim() ||
    !p.englishName?.trim() ||
    (!!p.phone?.trim() && !/^\+?[\d ()-]{7,24}$/.test(p.phone.trim()))
  )
    return 'profile_incomplete';
  return null;
}
export function validateSettings(s: Settings) {
  if (typeof s.instructorCancellationAllowed !== 'boolean')
    throw Error('invalid_settings');
  if (
    (s.semesterStart || s.semesterEnd) &&
    (!validDate(s.semesterStart) ||
      !validDate(s.semesterEnd) ||
      s.semesterEnd < s.semesterStart ||
      Date.parse(s.semesterEnd) - Date.parse(s.semesterStart) > 365 * 86400000)
  )
    throw Error('invalid_semester');
  for (const [k, min, max] of [
    ['meetingMinutes', 1, 120],
    ['breakMinutes', 0, 60],
    ['cancellationWeeks', 0, 52],
    ['maxUpcoming', 1, 10],
    ['horizonDays', 1, 90],
  ] as const) {
    if (!Number.isInteger(s[k]) || s[k] < min || s[k] > max)
      throw Error('invalid_settings');
  }
  if (
    !Array.isArray(s.classrooms) ||
    s.classrooms.length > 1000 ||
    s.classrooms.some(
      (room) => typeof room !== 'string' || !room.trim() || room.length > 120,
    ) ||
    new Set(s.classrooms).size !== s.classrooms.length
  )
    throw Error('invalid_classrooms');
  for (const key of ['adminClasses', 'teachingClasses'] as const) {
    if (
      !Array.isArray(s[key]) ||
      !s[key].length ||
      s[key].length > 100 ||
      s[key].some((x) => typeof x !== 'string' || !x.trim() || x.length > 80) ||
      new Set(s[key]).size !== s[key].length
    )
      throw Error('invalid_settings');
  }
  if (
    !['zh-CN', 'en-GB'].includes(s.defaultLanguage) ||
    !['light', 'dark', 'system'].includes(s.defaultTheme)
  )
    throw Error('invalid_settings');
  if (
    !Array.isArray(s.evaluations) ||
    !s.evaluations.length ||
    s.evaluations.length > 20 ||
    new Set(s.evaluations.map((e) => e.score)).size !== s.evaluations.length ||
    s.evaluations.some(
      (e) =>
        !Number.isInteger(e.score) ||
        e.score < 0 ||
        e.score > 100 ||
        !e.en?.trim() ||
        !e.zh?.trim() ||
        e.en.length > 120 ||
        e.zh.length > 120,
    )
  )
    throw Error('invalid_settings');
  if (
    !Array.isArray(s.closedDates) ||
    s.closedDates.length > 366 ||
    s.closedDates.some(
      (d) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)),
    )
  )
    throw Error('invalid_settings');
  if (
    !Array.isArray(s.windows) ||
    s.windows.length > 50 ||
    new Set(s.windows.map((w) => w.id)).size !== s.windows.length
  )
    throw Error('invalid_settings');
  for (const w of s.windows) {
    if (
      (w.startWeek !== undefined || w.repeatWeeks !== undefined) &&
      !s.semesterStart
    )
      throw Error('semester_required');
    if (
      (w.startWeek !== undefined &&
        (!Number.isInteger(w.startWeek) ||
          w.startWeek < 1 ||
          w.startWeek > 54)) ||
      (w.repeatWeeks !== undefined &&
        (!Number.isInteger(w.repeatWeeks) ||
          w.repeatWeeks < 1 ||
          w.repeatWeeks > 54))
    )
      throw Error('invalid_recurrence');
    if (!s.classrooms.includes(w.location)) throw Error('invalid_classroom');
    if (
      !/^[\w-]{1,50}$/.test(w.id) ||
      !Number.isInteger(w.day) ||
      w.day < 0 ||
      w.day > 6 ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.start) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.end) ||
      minutes(w.start) + s.meetingMinutes > minutes(w.end) ||
      !w.location?.trim() ||
      w.location.length > 120 ||
      !Number.isInteger(w.capacity) ||
      w.capacity < 1 ||
      w.capacity > 10 ||
      !Array.isArray(w.instructors) ||
      new Set(w.instructors).size !== w.instructors.length ||
      w.instructors.length > 10 ||
      typeof w.enabled !== 'boolean'
    )
      throw Error('invalid_settings');
  }
  const overrides = s.slotOverrides || [];
  if (
    !Array.isArray(overrides) ||
    overrides.length > 50000 ||
    new Set(overrides.map((o) => o.id)).size !== overrides.length
  )
    throw Error('invalid_settings');
  for (const o of overrides) {
    if (!s.classrooms.includes(o.location)) throw Error('invalid_classroom');
    if (
      !/^[\w:.-]{1,100}$/.test(o.id) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(o.date) ||
      !Number.isFinite(Date.parse(o.date)) ||
      new Date(o.date).toISOString().slice(0, 10) !== o.date ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(o.start) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(o.end) ||
      minutes(o.end) <= minutes(o.start) ||
      !o.location?.trim() ||
      o.location.length > 120 ||
      !Number.isInteger(o.capacity) ||
      o.capacity < 1 ||
      o.capacity > 10 ||
      !Array.isArray(o.instructors) ||
      o.instructors.length > 10 ||
      new Set(o.instructors).size !== o.instructors.length ||
      typeof o.enabled !== 'boolean' ||
      typeof o.windowId !== 'string' ||
      (o.windowId && !s.windows.some((w) => w.id === o.windowId))
    )
      throw Error('invalid_settings');
  }
  // Check dated exceptions against recurring slots, including dates beyond the booking horizon.
  for (const date of new Set(
    overrides.filter((o) => o.enabled).map((o) => o.date),
  )) {
    const effective = generateSlots(
      { ...s, horizonDays: 1 },
      Date.parse(`${date}T00:00:00+08:00`),
    );
    for (let i = 0; i < effective.length; i++)
      for (
        let j = i + 1;
        j < effective.length && effective[j].startsAt < effective[i].endsAt;
        j++
      ) {
        const a = effective[i],
          b = effective[j];
        if (
          a.location === b.location ||
          a.instructors.some((id) => b.instructors.includes(id))
        )
          throw Error('window_overlap');
      }
  }
  for (let i = 0; i < s.windows.length; i++)
    for (let j = i + 1; j < s.windows.length; j++) {
      const a = s.windows[i],
        b = s.windows[j];
      if (
        a.enabled &&
        b.enabled &&
        a.day === b.day &&
        (!s.semesterStart ||
          windowDates(s, a).some((date) => windowOccursOn(s, b, date))) &&
        minutes(a.start) < minutes(b.end) &&
        minutes(b.start) < minutes(a.end) &&
        (a.location === b.location ||
          a.instructors.some((id) => b.instructors.includes(id)))
      )
        throw Error('window_overlap');
    }
}
export function parseCSV(
  text: string,
  requiredHeaders = ['id'],
): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw Error('invalid_csv');
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  if (rows.length < 2) throw Error('invalid_csv');
  const headers = rows.shift()!.map((x) => x.trim());
  if (
    new Set(headers).size !== headers.length ||
    requiredHeaders.some((h) => !headers.includes(h))
  )
    throw Error('invalid_csv');
  return rows.map((r) => {
    if (r.length !== headers.length) throw Error('invalid_csv');
    return Object.fromEntries(headers.map((h, i) => [h, r[i].trim()]));
  });
}

export function timetableWindows(text: string): Window[] {
  const rows = parseCSV(text, [
    'day',
    'instructors',
    'start',
    'end',
    'location',
    'capacity',
  ]);
  if (!rows.length || rows.length > 50) throw Error('invalid_csv');
  const days = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  const chinese = ['日', '一', '二', '三', '四', '五', '六'];
  return rows.map((r) => {
    const label = r.day.toLowerCase();
    let day = days.findIndex((d) => d === label || d.slice(0, 3) === label);
    if (/^[0-6]$/.test(label)) day = Number(label);
    if (/^(星期|周)[日天一二三四五六]$/.test(label))
      day = label.endsWith('天') ? 0 : chinese.indexOf(label.at(-1)!);
    if (day < 0) throw Error('invalid_csv');
    return {
      id: clientId(),
      day,
      start: r.start,
      end: r.end,
      location: r.location,
      capacity: Number(r.capacity),
      instructors: r.instructors
        .split(';')
        .map((v) => v.trim())
        .filter(Boolean),
      enabled: true,
      ...(r.startWeek ? { startWeek: Number(r.startWeek) } : {}),
      ...(r.repeatWeeks ? { repeatWeeks: Number(r.repeatWeeks) } : {}),
    };
  });
}

export function availabilityDays(
  settings: Settings,
  bookings: Booking[],
  now: number,
  from = chinaDate(now),
  count = 28,
) {
  const counts = new Map<string, number>();
  for (const b of bookings)
    if (activeStatuses.includes(b.status))
      counts.set(b.slot.id, (counts.get(b.slot.id) || 0) + 1);
  const slots = slotsInRange(settings, from, addDays(from, count - 1))
    .filter((s) => s.date < chinaDate(now) || s.startsAt > now)
    .map((s) => ({
      ...s,
      remaining: Math.max(0, s.capacity - (counts.get(s.id) || 0)),
    }));
  const start = Date.parse(from + 'T00:00:00+08:00');
  return Array.from({ length: count }, (_, i) => {
    const date = chinaDate(start + i * 86400000);
    return {
      date,
      slots: slots.filter((s) => s.date === date),
      closed: settings.closedDates.includes(date),
      bookable:
        date >= chinaDate(now) &&
        date < addDays(chinaDate(now), settings.horizonDays) &&
        inSemester(settings, date),
      today: date === chinaDate(now),
      past: date < chinaDate(now),
    };
  });
}

export function accountStatus(
  user: User,
  now: number,
): 'paused' | 'pending' | 'active' {
  if (user.role === 'student' && user.blockedUntil > now) return 'paused';
  return user.firstLogin ? 'pending' : 'active';
}
export function paginationItems(
  current: number,
  total: number,
): (number | 'ellipsis')[] {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  const pages = Array.from(
    new Set([
      1,
      ...Array.from({ length: end - start + 1 }, (_, i) => start + i),
      total,
    ]),
  ).sort((a, b) => a - b);
  const items: (number | 'ellipsis')[] = [];
  for (const page of pages) {
    const previous = items.at(-1);
    if (typeof previous === 'number' && page - previous === 2)
      items.push(previous + 1);
    else if (typeof previous === 'number' && page - previous > 2)
      items.push('ellipsis');
    items.push(page);
  }
  return items;
}
