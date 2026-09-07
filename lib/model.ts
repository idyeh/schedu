export type Role = 'student' | 'instructor' | 'admin';
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
};
export type Evaluation = { score: number; en: string; zh: string };
export type Settings = {
  meetingMinutes: number;
  breakMinutes: number;
  cancellationWeeks: number;
  maxUpcoming: number;
  horizonDays: number;
  defaultLanguage: string;
  defaultTheme: string;
  adminClasses: string[];
  teachingClasses: string[];
  evaluations: Evaluation[];
  windows: Window[];
  closedDates: string[];
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
  maxUpcoming: 1,
  horizonDays: 28,
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
  evaluations: [
    { score: 0, en: 'Absent', zh: '缺席' },
    { score: 30, en: 'Attended · poor performance', zh: '已参加 · 表现欠佳' },
    { score: 40, en: 'Completed · satisfactory', zh: '已完成 · 表现满意' },
    { score: 70, en: 'Completed · excellent', zh: '已完成 · 表现优秀' },
  ],
  windows: [],
  closedDates: [],
};
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
export function generateSlots(settings: Settings, now = Date.now()): Slot[] {
  const slots: Slot[] = [];
  const base = new Date(chinaDate(now) + 'T00:00:00+08:00').getTime();
  for (let d = 0; d < settings.horizonDays; d++) {
    const date = chinaDate(base + d * 86400000);
    if (settings.closedDates.includes(date)) continue;
    const day = new Date(date + 'T12:00:00+08:00').getUTCDay();
    for (const w of settings.windows.filter(
      (w) => w.enabled && w.day === day,
    )) {
      for (
        let m = minutes(w.start);
        m + settings.meetingMinutes <= minutes(w.end);
        m += settings.meetingMinutes + settings.breakMinutes
      ) {
        const startsAt = new Date(`${date}T${clockTime(m)}:00+08:00`).getTime();
        if (startsAt <= now) continue;
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
  return slots.sort(
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
    !/^\+?[\d ()-]{7,24}$/.test(p.phone || '')
  )
    return 'profile_incomplete';
  return null;
}
export function validateSettings(s: Settings) {
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
  for (let i = 0; i < s.windows.length; i++)
    for (let j = i + 1; j < s.windows.length; j++) {
      const a = s.windows[i],
        b = s.windows[j];
      if (
        a.enabled &&
        b.enabled &&
        a.day === b.day &&
        minutes(a.start) < minutes(b.end) &&
        minutes(b.start) < minutes(a.end) &&
        (a.location === b.location ||
          a.instructors.some((id) => b.instructors.includes(id)))
      )
        throw Error('window_overlap');
    }
}
export function parseCSV(text: string): Record<string, string>[] {
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
  if (new Set(headers).size !== headers.length || !headers.includes('id'))
    throw Error('invalid_csv');
  return rows.map((r) => {
    if (r.length !== headers.length) throw Error('invalid_csv');
    return Object.fromEntries(headers.map((h, i) => [h, r[i].trim()]));
  });
}
