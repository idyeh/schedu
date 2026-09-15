'use client';
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  CalendarPlus,
  ClipboardList,
  MessageSquare,
  UserRound,
  Users,
  Settings2,
  Check,
  CheckCircle2,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Plus,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Languages,
  Upload,
  Download,
  Trash2,
  Pencil,
  ShieldCheck,
  BookOpen,
  Info,
  LockKeyhole,
  LoaderCircle,
} from 'lucide-react';
import { AvailabilityCalendar } from '@/components/availability-calendar';
import { Choice } from '@/components/choice';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  UserManager,
  TimetableImport,
  SlotManager,
} from '@/components/admin-tools';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  defaultSettings,
  emptyProfile,
  chinaDate,
  currentYear,
  parseCSV,
  clientId,
  maxRosterBytes,
  availabilityDays,
  profileError,
} from '@/lib/model';
import type {
  User,
  Profile,
  Settings,
  Slot,
  Booking,
  Window as TeachingWindow,
} from '@/lib/model';
type Data = {
  user: User | null;
  needsSetup?: boolean;
  requiresSetupToken?: boolean;
  defaults?: { language: string; theme: string };
  settings: Settings;
  staff: { id: string; name: string; englishName: string; role: string }[];
  bookings: Booking[];
  users: User[];
  slots: Slot[];
  serverTime: number;
  freshmanYear: number;
};
type T = (en: string, zh: string) => string;
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}
function Brand() {
  return (
    <a className="brand" href="/" aria-label="SchedU">
      <span className="brand-mark" aria-hidden="true" />
      Sched<span className="brand-u">U</span>
    </a>
  );
}
function Empty({
  icon: Icon = CalendarDays,
  title,
  body,
  children,
}: {
  icon?: typeof CalendarDays;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={25} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {children}
    </div>
  );
}
const labels: Record<string, [string, string]> = {
  draft: ['Draft', '草稿'],
  submitted: ['Awaiting approval', '待审批'],
  approved: ['Approved', '已批准'],
  in_progress: ['In progress', '进行中'],
  completed: ['Completed', '已完成'],
  cancelled: ['Cancelled', '已取消'],
  archived: ['Archived', '已归档'],
};
function Status({ value, t }: { value: string; t: T }) {
  const l = labels[value] || [value, value];
  return (
    <span className={`status ${value}`}>
      <span />
      {t(l[0], l[1])}
    </span>
  );
}
function download(name: string, contents: string) {
  const url = URL.createObjectURL(
    new Blob(['\uFEFF' + contents], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvCell = (s: unknown) =>
  '"' +
  String(s ?? '')
    .replace(/^[=+\-@]/, "'$&")
    .replaceAll('"', '""') +
  '"';
const errorMessages: Record<string, [string, string]> = {
  booked_slot_locked: [
    'Cancel active bookings before changing or removing their time slots.',
    '修改或移除时段前，请先取消相关的有效预约。',
  ],
  user_has_history: [
    'This account has meeting records and cannot be deleted.',
    '此账号有预约记录，无法删除。',
  ],
  invalid_setup_token: [
    'Enter the setup token configured by the server administrator.',
    '请输入服务器管理员配置的初始化令牌。',
  ],
  invalid_credentials: [
    'Check your institutional ID and password (at least 8 characters).',
    '请检查学号 / 工号及密码（至少 8 位）。',
  ],
  rate_limited: [
    'Too many attempts. Try again in 15 minutes.',
    '尝试次数过多，请在 15 分钟后重试。',
  ],
  profile_incomplete: [
    'Enter both names. If a phone number is provided, check its format.',
    '请填写中文姓名和英文姓名；如填写手机号码，请检查格式。',
  ],
  admin_class_required: [
    'Choose a valid administrative class.',
    '请选择有效的行政班级。',
  ],
  teaching_class_required: [
    'Freshmen must select a teaching class.',
    '新生必须选择教学班级。',
  ],
  invalid_grade: [
    'Enter a valid entry year, no later than this year.',
    '请输入有效的加入年份，不能晚于今年。',
  ],
  booking_conflict: [
    'This slot filled up, overlaps another booking, or you reached your active booking limit. Refresh and choose again.',
    '该时段已满、与已有预约冲突或已达到预约上限。请刷新后重试。',
  ],
  booking_blocked: [
    'Your cancellation restriction is still active. See the expiry date on your dashboard.',
    '您仍在取消预约后的限制期内，请在概览查看解除日期。',
  ],
  slot_unavailable: [
    'This slot is no longer available. Please choose another.',
    '该时段已不可预约，请重新选择。',
  ],
  invalid_settings: [
    'Check all settings, time ranges and evaluation values.',
    '请检查设置、时间范围及评价选项。',
  ],
  window_overlap: [
    'Availability windows conflict at the same location or for an instructor.',
    '时间安排在同一地点或同一教师的时间上有重叠。',
  ],
  invalid_roster: [
    'Check IDs, duplicate accounts and roles in the roster.',
    '请检查名单中的学号 / 工号、重复账号和角色。',
  ],
  invalid_csv: [
    'Use the CSV template and check the columns and quotation marks.',
    '请使用 CSV 模板，并检查列数及引号。',
  ],
  roster_too_large: [
    'The import data exceeds 20 MB. Split this file into smaller files.',
    '导入数据超过 20 MB，请拆分文件后导入。',
  ],
  last_admin: [
    'At least one administrator must remain. Grant another account admin access first.',
    '必须保留至少一位管理员，请先授予其他账号管理员权限。',
  ],
  protected_admin: [
    'Revoke admin access before deleting or resetting this account.',
    '删除账号或重置密码前，请先撤销其管理员权限。',
  ],
  assigned_instructor: [
    'Remove this instructor from availability windows before changing their role.',
    '请先从时间安排中移除此教师，再更改角色。',
  ],
  active_bookings: [
    'Resolve this student’s active bookings before changing their role.',
    '请先处理该学生的有效预约，再更改角色。',
  ],
  invalid_transition: [
    'This action is not available for the meeting’s current status or time.',
    '该会议当前的状态或时间不允许此操作。',
  ],
  too_early_absent: [
    'Record an absence after the meeting has ended.',
    '请在预约时段结束后记录缺席。',
  ],
  password_mismatch: [
    'The two new passwords do not match.',
    '两次输入的新密码不一致。',
  ],
  password_length: [
    'Use a password of 8–128 characters.',
    '请使用 8 至 128 位密码。',
  ],
  forbidden: [
    'Your account does not have permission for this action.',
    '您的账号没有此操作权限。',
  ],
  unauthorised: [
    'Your session expired. Please sign in again.',
    '会话已过期，请重新登录。',
  ],
  draft_limit: ['You can keep up to five drafts.', '最多可保留五份草稿。'],
  setup_complete: [
    'Setup has already been completed. Sign in instead.',
    '初始化已完成，请登录。',
  ],
  service_unavailable: [
    'The service is unavailable. Please try again shortly.',
    '服务暂不可用，请稍后重试。',
  ],
};
export default function Home() {
  const [data, setData] = useState<Data | null>(null),
    [lang, setLang] = useState('zh-CN'),
    [theme, setTheme] = useState('system'),
    [view, setView] = useState('dashboard'),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [slotId, setSlotId] = useState(''),
    [topic, setTopic] = useState(''),
    [draftId, setDraftId] = useState(''),
    [date, setDate] = useState(''),
    [week, setWeek] = useState(0),
    [confirmBook, setConfirmBook] = useState(false),
    [cancel, setCancel] = useState<Booking | null>(null),
    [detail, setDetail] = useState<Booking | null>(null),
    [evaluate, setEvaluate] = useState<Booking | null>(null),
    [score, setScore] = useState('40'),
    [feedback, setFeedback] = useState(''),
    [passwordOpen, setPasswordOpen] = useState(false);
  const [credentials, setCredentials] = useState<
      { id: string; password: string }[] | null
    >(null),
    [userModal, setUserModal] = useState(false),
    [importRows, setImportRows] = useState<Record<string, string>[] | null>(
      null,
    );
  const t: T = (en, zh) => (lang === 'zh-CN' ? zh : en);
  const locale = lang === 'zh-CN' ? 'zh-CN' : 'en-GB';
  const dateText = (
    ms: number,
    options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'short',
      weekday: 'short',
    },
  ) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: 'Asia/Shanghai',
      ...options,
    }).format(ms);
  const reload = useCallback(async () => {
    const res = await fetch('/api/app');
    const d: any = await res.json();
    if (!res.ok) throw Error(d.error || 'service_unavailable');
    setData(d);
    return d;
  }, []);
  useEffect(() => {
    const l = localStorage.getItem('schedu-language'),
      th = localStorage.getItem('schedu-theme');
    if (l) setLang(l);
    if (th) setTheme(th);
    reload()
      .then((d) => {
        if (!l)
          setLang(
            d.settings?.defaultLanguage || d.defaults?.language || 'zh-CN',
          );
        if (!th)
          setTheme(d.settings?.defaultTheme || d.defaults?.theme || 'system');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [reload]);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      document.documentElement.classList.toggle(
        'dark',
        theme === 'dark' || (theme === 'system' && mq.matches),
      );
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    if (!data?.user || !['dashboard', 'meetings', 'feedback'].includes(view))
      return;
    const id = setInterval(() => reload().catch(() => {}), 60000);
    return () => clearInterval(id);
  }, [data?.user?.id, reload, view]);
  async function act(
    body: any,
    message = t('Saved successfully.', '已保存。'),
  ) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result: any = await res.json();
      if (!res.ok) throw Error(result.error || 'request_failed');
      await reload();
      if (message) setNotice(message);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request_failed');
      return null;
    } finally {
      setBusy(false);
    }
  }
  const settings = data?.settings || defaultSettings,
    user = data?.user,
    bookings = data?.bookings || [],
    slots = data?.slots || [];
  const selected = slots.find((s) => s.id === slotId),
    active = bookings.filter((b) =>
      ['submitted', 'approved', 'in_progress'].includes(b.status),
    ),
    finished = bookings.filter((b) => b.score !== null),
    next = [...active].sort((a, b) => a.slot.startsAt - b.slot.startsAt)[0];
  const displayName = (u: User) =>
    lang === 'zh-CN'
      ? u.profile.chineseName || u.id
      : u.profile.englishName || u.profile.chineseName || u.id;
  const staffName = (id: string) => {
    const s = data?.staff?.find((s) => s.id === id);
    return s ? (lang === 'zh-CN' ? s.name : s.englishName) : id;
  };
  const days = t(
    'Sun,Mon,Tue,Wed,Thu,Fri,Sat',
    '周日,周一,周二,周三,周四,周五,周六',
  ).split(',');
  const navigation =
    user?.role === 'admin'
      ? [
          ['dashboard', LayoutDashboard, t('Overview', '概览')],
          ['meetings', ClipboardList, t('All meetings', '全部预约')],
          ['schedule', CalendarDays, t('Availability', '时间安排')],
          ['users', Users, t('People & rosters', '用户与名单')],
          ['settings', Settings2, t('Configuration', '系统配置')],
          ['profile', UserRound, t('My profile', '个人资料')],
        ]
      : user?.role === 'instructor'
        ? [
            ['dashboard', LayoutDashboard, t('Overview', '概览')],
            ['meetings', ClipboardList, t('My sessions', '我的辅导')],
            ['feedback', MessageSquare, t('Feedback', '反馈记录')],
            ['profile', UserRound, t('My profile', '个人资料')],
          ]
        : [
            ['dashboard', LayoutDashboard, t('Overview', '概览')],
            ['book', CalendarPlus, t('Book a tutorial', '预约辅导')],
            ['meetings', ClipboardList, t('My bookings', '我的预约')],
            ['feedback', MessageSquare, t('My feedback', '我的反馈')],
            ['profile', UserRound, t('My profile', '个人资料')],
          ];
  function navigate(v: string) {
    setView(v);
    setNotice('');
    setError('');
  }
  function startBooking(s?: Slot) {
    if (s) {
      setSlotId(s.id);
      setDate(s.date);
    }
    setDraftId('');
    setTopic('');
    navigate('book');
  }
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool || !user) return;
    const lifecycle = new AbortController();
    const tool = {
      name: 'start_tutorial_booking',
      title: 'Choose a tutorial slot',
      description:
        'Open the booking form for an available slot. Does not submit or reserve a seat.',
      inputSchema: {
        type: 'object',
        properties: { slotId: { type: 'string' } },
        required: ['slotId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: any) => {
        if (user.role !== 'student' || typeof input?.slotId !== 'string')
          throw Error('Invalid input');
        const slot = slots.find(
          (s) => s.id === input.slotId && s.remaining > 0,
        );
        if (!slot) throw Error('Slot unavailable');
        setSlotId(slot.id);
        setDate(slot.date);
        setView('book');
        setDraftId('');
        return { staged: true, slotId: slot.id };
      },
    };
    try {
      Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [user?.id, slots]);
  function preferences() {
    return (
      <div className="preferences">
        <button
          className="icon-button language"
          aria-label={t('Switch to Chinese', '切换至英文')}
          onClick={() => {
            const v = lang === 'zh-CN' ? 'en-GB' : 'zh-CN';
            setLang(v);
            localStorage.setItem('schedu-language', v);
          }}
        >
          <Languages size={17} />
          {t('中文', 'EN')}
        </button>
        <Choice
          label={t('Theme', '主题')}
          value={theme}
          onChange={(v) => {
            setTheme(v);
            localStorage.setItem('schedu-theme', v);
          }}
          options={[
            { value: 'system', label: t('System', '跟随系统') },
            { value: 'light', label: t('Light', '浅色') },
            { value: 'dark', label: t('Dark', '深色') },
          ]}
        />
      </div>
    );
  }
  function errorBox() {
    const text = errorMessages[error] || [
      'Something went wrong. Please try again.',
      '操作未成功，请重试。',
    ];
    return error ? (
      <div className="message error" role="alert">
        <Info size={18} />
        <span>{t(...text)}</span>
        <button aria-label={t('Dismiss', '关闭')} onClick={() => setError('')}>
          ×
        </button>
      </div>
    ) : null;
  }
  if (!user)
    return (
      <main className="auth-layout">
        <section className="auth-brand">
          <Brand />
          <div>
            <p className="eyebrow">
              {t('YOUR TIME TO LEARN', '为进步，留一点时间')}
            </p>
            <h1>
              {t('A little time.', '一点时间，')}
              <br />
              {t('A step forward.', '一步向前。')}
            </h1>
            <p>
              {t(
                'Face-to-face tutorials, made simple.',
                '让面对面辅导，更简单。',
              )}
              <br />
              {t(
                'Find your time. Bring your questions.',
                '选好时间，带上你的问题。',
              )}
            </p>
            <div className="auth-points">
              <span>
                <CalendarDays />
                {t('Choose a time', '选择合适的时间')}
              </span>
              <span>
                <GraduationCap />
                {t('Meet your instructor', '与教师面对面交流')}
              </span>
              <span>
                <Clock3 />
                {t('Keep moving forward', '让每一次学习都有收获')}
              </span>
            </div>
          </div>
          <small>
            {t('Made for university. Made for you.', '为大学，也为你。')}
          </small>
        </section>
        <section className="auth-main">
          <div className="auth-tools">{preferences()}</div>
          <div className="auth-form">
            <p className="eyebrow">
              {data?.needsSetup
                ? t('FIRST-TIME SETUP', '首次设置')
                : t('WELCOME TO SCHEDU', '欢迎使用 SCHEDU')}
            </p>
            <h2>
              {data?.needsSetup
                ? t('Your institute starts here.', '从这里开启辅导。')
                : t('Make room for learning.', '为学习留出时间。')}
            </h2>
            <p className="muted">
              {data?.needsSetup
                ? t(
                    'Create the administrator account to set up your institute.',
                    '创建管理员账号，开始配置学院的辅导安排。',
                  )
                : t(
                    'Sign in with your institutional account.',
                    '使用学校发放的账号登录。',
                  )}
            </p>
            {errorBox()}
            {loading ? (
              <p className="loading">
                <LoaderCircle className="spin" />
                {t('Connecting…', '连接中…')}
              </p>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await act(
                    {
                      action: data?.needsSetup ? 'setup' : 'login',
                      id: f.get('id'),
                      password: f.get('password'),
                      setupToken: f.get('setupToken'),
                      profile: {
                        chineseName: f.get('name'),
                        englishName: f.get('name'),
                      },
                    },
                    '',
                  );
                }}
              >
                {data?.requiresSetupToken && (
                  <Field label={t('Server setup token', '服务器初始化令牌')}>
                    <input
                      name="setupToken"
                      type="password"
                      required
                      autoComplete="off"
                      placeholder={t(
                        'Provided by your server administrator',
                        '由服务器管理员提供',
                      )}
                    />
                  </Field>
                )}
                {data?.needsSetup && (
                  <Field label={t('Administrator name', '管理员姓名')}>
                    <input name="name" required maxLength={80} />
                  </Field>
                )}
                <Field label={t('Institutional ID', '学号 / 工号')}>
                  <input
                    name="id"
                    autoComplete="username"
                    required
                    pattern="[A-Za-z0-9][A-Za-z0-9._-]{1,39}"
                    placeholder={t(
                      'Your student or staff ID',
                      '请输入学号或工号',
                    )}
                  />
                </Field>
                <Field label={t('Password', '密码')}>
                  <input
                    name="password"
                    autoComplete={
                      data?.needsSetup ? 'new-password' : 'current-password'
                    }
                    type="password"
                    minLength={8}
                    maxLength={128}
                    required
                    placeholder={t('At least 8 characters', '至少 8 位字符')}
                  />
                </Field>
                <button className="primary" disabled={busy || !data}>
                  {busy ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <>
                      {data?.needsSetup
                        ? t('Create administrator account', '创建管理员账号')
                        : t('Sign in', '登录')}
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            )}
            <p className="footnote">
              {data?.needsSetup
                ? t(
                    'You can issue accounts and import your roster after setup.',
                    '完成设置后，即可创建账号并导入学生名单。',
                  )
                : t(
                    'Your account is issued by your institute. Contact an administrator if you need a password reset.',
                    '账号由学校发放。如需重置密码，请联系管理员。',
                  )}
            </p>
            {!data && !loading && (
              <button className="secondary" onClick={() => location.reload()}>
                {t('Retry', '重试')}
              </button>
            )}
          </div>
        </section>
      </main>
    );
  const role = t(
    user.role === 'student'
      ? 'Student'
      : user.role === 'instructor'
        ? 'Instructor'
        : 'Administrator',
    user.role === 'student'
      ? '学生'
      : user.role === 'instructor'
        ? '教师'
        : '管理员',
  );
  function bookingCards(list: Booking[]) {
    return list.length ? (
      <div className="booking-list">
        {list.map((b) => (
          <div className="booking-row" key={b.id}>
            <div className="date-tile">
              <span>{dateText(b.slot.startsAt, { month: 'short' })}</span>
              <strong>{dateText(b.slot.startsAt, { day: '2-digit' })}</strong>
            </div>
            <div className="booking-info">
              <div className="row">
                <h3>
                  {b.slot.start} – {b.slot.end}
                </h3>
                <Status value={b.status} t={t} />
              </div>
              <p>
                <MapPin size={14} />
                {b.slot.location}
                <span className="dot">·</span>
                {dateText(b.slot.startsAt, { weekday: 'long' })}
                {user!.role !== 'student' && (
                  <span>
                    {' '}
                    · {b.student ? displayName(b.student) : b.studentId}
                  </span>
                )}
              </p>
              {b.topic && <p className="topic-preview">{b.topic}</p>}
            </div>
            <button className="secondary" onClick={() => setDetail(b)}>
              {t('View details', '查看详情')}
              <ArrowUpRight size={14} />
            </button>
          </div>
        ))}
      </div>
    ) : (
      <Empty
        title={t('No meetings here yet', '暂无预约')}
        body={t(
          'Your tutorial bookings will appear here.',
          '辅导预约将在这里显示。',
        )}
      />
    );
  }
  function timeline(b: Booking) {
    return (
      <ol className="timeline">
        {b.history.map((h, i) => (
          <li key={i}>
            <CheckCircle2 size={17} />
            <div>
              <strong>
                {t(...(labels[h.status] || [h.status, h.status]))}
              </strong>
              <p>
                {dateText(h.at, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {h.by === 'system' ? t('Automatically', '自动处理') : h.by}
              </p>
            </div>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <SidebarProvider style={{ '--sidebar-width': '244px' } as any}>
      <Sidebar className="site-sidebar">
        <SidebarHeader className="side-header">
          <Brand />
        </SidebarHeader>
        <SidebarContent>
          <p className="nav-caption">{t('YOUR WORKSPACE', '工作空间')}</p>
          <SidebarMenu className="nav-menu">
            {navigation.map(([id, Icon, label]) => (
              <SidebarMenuItem key={String(id)}>
                <NavButton
                  isActive={view === id}
                  onClick={() => navigate(String(id))}
                  className="nav-button"
                >
                  <Icon size={19} />
                  <span>{String(label)}</span>
                  {view === id && <span className="nav-indicator" />}
                </NavButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="sidebar-note">
            <div className="note-icon">
              <GraduationCap size={22} />
            </div>
            <strong>
              {t(
                'A little preparation goes a long way.',
                '带着问题来，带着收获走。',
              )}
            </strong>
            <p>
              {t(
                'Bring your questions and make the most of your tutorial.',
                '提前整理你的问题，让每一次辅导更有收获。',
              )}
            </p>
          </div>
        </SidebarContent>
        <SidebarFooter className="side-footer">
          <div className="avatar">
            {displayName(user).slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>{displayName(user)}</strong>
            <span>
              {role} · {user.id}
            </span>
          </div>
          <button
            className="icon-button"
            title={t('Sign out', '退出登录')}
            aria-label={t('Sign out', '退出登录')}
            onClick={() => act({ action: 'logout' }, '')}
          >
            <LogOut size={17} />
          </button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="main-inset">
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger className="mobile-menu" />
            <span>{t('Workspace', '工作空间')}</span>
            <span>/</span>
            <strong>
              {String(navigation.find((n) => n[0] === view)?.[2] || 'SchedU')}
            </strong>
          </div>
          {preferences()}
        </header>
        <main className="workspace">
          {errorBox()}
          {notice && (
            <div className="message success" role="status">
              <CheckCircle2 size={18} />
              {notice}
              <button
                onClick={() => setNotice('')}
                aria-label={t('Dismiss', '关闭')}
              >
                ×
              </button>
            </div>
          )}
          {view === 'dashboard' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {dateText(Date.now(), {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                  <h1>
                    {t('Hello,', '你好，')}
                    {lang !== 'zh-CN' ? ' ' : ''}
                    {displayName(user)}
                    <span className="greeting-dot">.</span>
                  </h1>
                  <p>
                    {t(
                      'Here’s what’s next on your learning journey.',
                      '从这里查看安排，准备下一次进步。',
                    )}
                  </p>
                </div>
                {user.role === 'student' ? (
                  <button className="primary" onClick={() => startBooking()}>
                    <Plus size={18} />
                    {t('Book a tutorial', '预约辅导')}
                  </button>
                ) : user.role === 'admin' ? (
                  <button
                    className="primary"
                    onClick={() => navigate('schedule')}
                  >
                    <Plus size={18} />
                    {t('Manage availability', '管理时间安排')}
                  </button>
                ) : null}
              </div>
              <div className="stats-grid">
                <Stat
                  icon={CalendarDays}
                  value={active.length}
                  label={t('Active bookings', '有效预约')}
                  note={t(
                    'Submitted, approved & in progress',
                    '待审批、已批准及进行中',
                  )}
                />
                <Stat
                  icon={CheckCircle2}
                  value={
                    bookings.filter((b) => b.score !== null && b.score !== 0)
                      .length
                  }
                  label={t('Tutorials attended', '已参加辅导')}
                  note={t(
                    'Every session is a step forward',
                    '每次交流，都是进步',
                  )}
                />
                <Stat
                  icon={user.role === 'admin' ? Users : MessageSquare}
                  value={
                    user.role === 'admin' ? data!.users.length : finished.length
                  }
                  label={
                    user.role === 'admin'
                      ? t('Institute accounts', '学院账号')
                      : t('Feedback received', '已收到反馈')
                  }
                  note={
                    user.role === 'admin'
                      ? t(
                          'Students, instructors & admins',
                          '学生、教师与管理员',
                        )
                      : t('Reflect, practise, improve', '回顾、练习、提升')
                  }
                />
              </div>
              {user.blockedUntil > Date.now() && (
                <div className="message warning">
                  <LockKeyhole size={20} />
                  <span>
                    {t(
                      'New bookings are paused until ',
                      '新预约已暂停，解除时间：',
                    )}
                    {dateText(user.blockedUntil, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {t(
                      ' following your cancellation.',
                      '（取消预约后的限制期）。',
                    )}
                  </span>
                </div>
              )}
              <div className="dashboard-grid">
                <section className="next-card">
                  <div className="section-heading">
                    <span className="eyebrow">
                      {t('UP NEXT', '下一场辅导')}
                    </span>
                    <span className="live-indicator">
                      {t('Face-to-face', '面对面')}
                    </span>
                  </div>
                  {next ? (
                    <>
                      <div className="next-date">
                        {dateText(next.slot.startsAt, {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </div>
                      <h2>
                        {next.slot.start}
                        <span> — {next.slot.end}</span>
                      </h2>
                      <p className="next-location">
                        <MapPin size={17} />
                        {next.slot.location}
                      </p>
                      <div className="next-bottom">
                        <Status value={next.status} t={t} />
                        <button
                          className="light-button"
                          onClick={() => setDetail(next)}
                        >
                          {t('View booking', '查看预约')}
                          <ArrowUpRight size={16} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h2>
                        {user.role === 'student'
                          ? t(
                              'Your next step starts here.',
                              '下一步，从这里开始。',
                            )
                          : t(
                              'Make time for your students.',
                              '为学生，留出交流时间。',
                            )}
                      </h2>
                      <p>
                        {user.role === 'student'
                          ? t(
                              'Choose a time that works for you. Your instructors will take it from there.',
                              '选择适合你的时段，与教师面对面解决问题。',
                            )
                          : t(
                              'Set your teaching hours, then welcome students into your next session.',
                              '安排好辅导时间，迎接下一场师生交流。',
                            )}
                      </p>
                      <button
                        className="light-button"
                        onClick={() =>
                          navigate(
                            user.role === 'student'
                              ? 'book'
                              : user.role === 'admin'
                                ? 'schedule'
                                : 'meetings',
                          )
                        }
                      >
                        {t(
                          user.role === 'student'
                            ? 'Explore time slots'
                            : 'View schedule',
                          user.role === 'student'
                            ? '查看可预约时段'
                            : '查看辅导安排',
                        )}
                        <ArrowRight size={17} />
                      </button>
                    </>
                  )}
                </section>
                <section className="panel prepare-panel">
                  <div className="section-heading">
                    <h3>
                      {t(
                        'A good session starts before it.',
                        '辅导前，做一点准备。',
                      )}
                    </h3>
                    <BookOpen size={19} />
                  </div>
                  <div className="checklist">
                    <div>
                      <span>01</span>
                      <p>
                        <strong>{t('Bring a question', '带上你的问题')}</strong>
                        <small>
                          {t(
                            'A specific topic makes a focused tutorial.',
                            '明确主题，让交流更有针对性。',
                          )}
                        </small>
                      </p>
                    </div>
                    <div>
                      <span>02</span>
                      <p>
                        <strong>
                          {t('Arrive a little early', '提前到达')}
                        </strong>
                        <small>
                          {t(
                            'Give yourself time to settle in.',
                            '留出时间，轻松进入学习状态。',
                          )}
                        </small>
                      </p>
                    </div>
                    <div>
                      <span>03</span>
                      <p>
                        <strong>
                          {t('Keep the learning going', '让学习继续')}
                        </strong>
                        <small>
                          {t(
                            'Review your feedback after the session.',
                            '辅导结束后，记得查看教师反馈。',
                          )}
                        </small>
                      </p>
                    </div>
                  </div>
                </section>
              </div>
              <section className="panel week-panel">
                <div className="section-heading">
                  <div>
                    <h3>{t('A look at the week', '本周一览')}</h3>
                    <p>
                      {t(
                        'Available tutorials · China Standard Time (UTC+8)',
                        '可预约辅导 · 中国标准时间（UTC+8）',
                      )}
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() =>
                      navigate(
                        user.role === 'student'
                          ? 'book'
                          : user.role === 'admin'
                            ? 'schedule'
                            : 'meetings',
                      )
                    }
                  >
                    {t('View schedule', '查看安排')}
                    <ArrowRight size={15} />
                  </button>
                </div>
                <div className="week-strip">
                  {Array.from({ length: 7 }, (_, i) => {
                    const d =
                      new Date(chinaDate() + 'T00:00:00+08:00').getTime() +
                      i * 86400000;
                    const ds = chinaDate(d),
                      available = slots.filter(
                        (s) => s.date === ds && s.remaining > 0,
                      );
                    return (
                      <button
                        key={ds}
                        className={`day-column ${i === 0 ? 'today' : ''}`}
                        onClick={() => {
                          if (user.role === 'student') {
                            setDate(ds);
                            setSlotId(available[0]?.id || '');
                            navigate('book');
                          } else
                            navigate(
                              user.role === 'admin' ? 'schedule' : 'meetings',
                            );
                        }}
                      >
                        <span>{dateText(d, { weekday: 'short' })}</span>
                        <strong>{dateText(d, { day: '2-digit' })}</strong>
                        {available.length ? (
                          <small className="available-dot">
                            {available.length} {t('slots', '个时段')}
                          </small>
                        ) : (
                          <small aria-label={t('No slots', '无时段')}>—</small>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h3>{t('Recent activity', '最近动态')}</h3>
                  <button
                    className="text-button"
                    onClick={() => navigate('meetings')}
                  >
                    {t('View all', '查看全部')}
                    <ArrowRight size={15} />
                  </button>
                </div>
                {bookingCards(
                  [...bookings]
                    .sort((a, b) => b.history.at(-1)!.at - a.history.at(-1)!.at)
                    .slice(0, 3),
                )}
              </section>
            </>
          )}
          {view === 'book' && (
            <>
              <PageHeading
                title={t('A time that works for you.', '选个适合你的时间。')}
                description={t(
                  'Choose a slot. Meet any instructor on duty. Move forward.',
                  '选择时段，与当值教师交流，解决你的问题。',
                )}
              />
              <div className="booking-grid">
                <section className="panel book-form">
                  <div className="section-heading">
                    <h3>{t('Choose your tutorial', '选择辅导时段')}</h3>
                    <span className="subtle-chip">
                      {settings.meetingMinutes}{' '}
                      {t('min / session', '分钟 / 次')}
                    </span>
                  </div>
                  <div className="week-controls">
                    <span>{t('Upcoming availability', '未来可预约时段')}</span>
                    <div>
                      <button
                        className="icon-button"
                        aria-label={t('Previous week', '上一周')}
                        disabled={week === 0}
                        onClick={() => setWeek(week - 1)}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={t('Next week', '下一周')}
                        disabled={(week + 1) * 7 >= settings.horizonDays}
                        onClick={() => setWeek(week + 1)}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="date-picker">
                    {Array.from(
                      { length: Math.min(7, settings.horizonDays - week * 7) },
                      (_, i) => {
                        const ms =
                          new Date(chinaDate() + 'T00:00:00+08:00').getTime() +
                          (week * 7 + i) * 86400000;
                        const ds = chinaDate(ms),
                          has = slots.some(
                            (s) => s.date === ds && s.remaining > 0,
                          );
                        return (
                          <button
                            key={ds}
                            className={date === ds ? 'selected' : ''}
                            onClick={() => {
                              setDate(ds);
                              setSlotId('');
                            }}
                          >
                            <span>{dateText(ms, { weekday: 'short' })}</span>
                            <strong>{dateText(ms, { day: '2-digit' })}</strong>
                            <i className={has ? 'has-slots' : ''} />
                          </button>
                        );
                      },
                    )}
                  </div>
                  <p className="footnote date-caption">
                    {date
                      ? dateText(new Date(date + 'T12:00:00+08:00').getTime(), {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : t(
                          'Select a date above, or choose from all available slots below.',
                          '选择上方日期，或从下方全部可预约时段中选择。',
                        )}
                  </p>
                  <Field label={t('Available time slot', '可预约时段')}>
                    <Choice
                      label={t('Select a time slot', '请选择时段')}
                      value={slotId}
                      onChange={setSlotId}
                      options={slots
                        .filter(
                          (s) => (!date || s.date === date) && s.remaining > 0,
                        )
                        .map((s) => ({
                          value: s.id,
                          label: `${dateText(s.startsAt, { month: 'short', day: 'numeric' })} · ${s.start}–${s.end} · ${s.location} (${s.remaining} ${t('left', '余位')})`,
                        }))}
                    />
                  </Field>
                  {!slots.some(
                    (s) => (!date || s.date === date) && s.remaining > 0,
                  ) && (
                    <div className="inline-empty">
                      {t(
                        'No available slots on this date. Try another date or check back after your institute adds teaching hours.',
                        '此日期暂无可预约时段。请选择其他日期，或等待学院发布辅导安排。',
                      )}
                    </div>
                  )}
                  {selected && (
                    <div className="slot-summary">
                      <p>
                        <MapPin size={16} />
                        {selected.location}
                      </p>
                      <p>
                        <Users size={16} />
                        {selected.instructors.length
                          ? selected.instructors.map(staffName).join(' / ')
                          : t('Instructor to be confirmed', '教师待安排')}
                      </p>
                      <small>
                        {t(
                          'You will meet any one of the instructors on duty.',
                          '你将与当值教师中的任意一位进行交流。',
                        )}
                      </small>
                    </div>
                  )}
                  <Field
                    label={t(
                      'What would you like to work on? (optional)',
                      '你想讨论什么？（选填）',
                    )}
                  >
                    <textarea
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      maxLength={1000}
                      placeholder={t(
                        'A question, a tricky topic, or something you’d like to practise…',
                        '写下你的问题、难点，或想进一步练习的内容…',
                      )}
                    />
                  </Field>
                  <div className="form-actions">
                    <button
                      className="secondary"
                      disabled={!selected || busy}
                      onClick={async () => {
                        const r = await act({
                          action: 'draft',
                          slotId,
                          topic,
                          draftId,
                        });
                        if (r) {
                          setDraftId('');
                          navigate('meetings');
                        }
                      }}
                    >
                      {t('Save draft', '保存草稿')}
                    </button>
                    <button
                      className="primary"
                      disabled={
                        !selected ||
                        busy ||
                        user.blockedUntil > Date.now() ||
                        active.length >= settings.maxUpcoming ||
                        !!profileError(user.profile, settings)
                      }
                      onClick={() => setConfirmBook(true)}
                    >
                      {t('Review booking', '确认预约')}
                      <ArrowRight size={17} />
                    </button>
                  </div>
                  {active.length >= settings.maxUpcoming && (
                    <p className="warning-text">
                      {t(
                        `You already have ${settings.maxUpcoming} active booking(s). Complete your current tutorial before booking again.`,
                        `你已达到 ${settings.maxUpcoming} 个有效预约的上限，请先完成当前辅导。`,
                      )}
                    </p>
                  )}
                  {user.blockedUntil > Date.now() && (
                    <p className="warning-text">
                      {t('New bookings are paused until ', '新预约暂停至 ')}
                      {dateText(user.blockedUntil, {
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </section>
                <aside className="booking-aside">
                  <section className="panel">
                    <h3>{t('Your details', '你的资料')}</h3>
                    <div className="profile-compact">
                      <span className="avatar large">
                        {displayName(user).slice(0, 1)}
                      </span>
                      <div>
                        <strong>{displayName(user)}</strong>
                        <p>{user.id}</p>
                      </div>
                    </div>
                    <dl>
                      <dt>{t('Administrative class', '行政班级')}</dt>
                      <dd>{user.profile.adminClass || '—'}</dd>
                      <dt>{t('Teaching class', '教学班级')}</dt>
                      <dd>{user.profile.teachingClass || '—'}</dd>
                    </dl>
                    {profileError(user.profile, settings) && (
                      <p className="warning-text">
                        {t(
                          'Complete your profile before submitting a booking.',
                          '请先完善个人资料，再提交预约。',
                        )}
                      </p>
                    )}
                    <button
                      className="text-button"
                      onClick={() => navigate('profile')}
                    >
                      {t('Edit my profile', '编辑个人资料')}
                      <ArrowUpRight size={15} />
                    </button>
                  </section>
                  <section className="policy-card">
                    <ShieldCheck size={23} />
                    <h3>{t('Book thoughtfully.', '预约前，请确认。')}</h3>
                    <p>
                      {t(
                        `Cancelling a submitted or approved booking pauses new bookings for ${settings.cancellationWeeks} week(s).`,
                        `取消已提交或已批准的预约后，将暂停新预约 ${settings.cancellationWeeks} 周。`,
                      )}
                    </p>
                    <p>
                      {t(
                        'Saving a draft does not reserve a seat.',
                        '保存草稿不会占用名额。',
                      )}
                    </p>
                  </section>
                </aside>
              </div>
            </>
          )}
          {(view === 'meetings' || view === 'feedback') && (
            <>
              <PageHeading
                title={
                  view === 'feedback'
                    ? t(
                        'A little reflection. More progress.',
                        '回顾反馈，继续进步。',
                      )
                    : t(
                        user.role === 'student'
                          ? 'Your bookings.'
                          : 'Your tutorial sessions.',
                        user.role === 'student' ? '你的预约。' : '辅导安排。',
                      )
                }
                description={
                  view === 'feedback'
                    ? t(
                        'Review attendance, marks and advice from each tutorial.',
                        '查看每次辅导的出勤、评分与建议。',
                      )
                    : t(
                        'Everything you need to know about your face-to-face sessions.',
                        '在这里查看和管理面对面辅导。',
                      )
                }
              />
              {view === 'feedback' ? (
                <div className="feedback-grid">
                  {finished.length ? (
                    finished.map((b) => (
                      <section className="panel feedback-card" key={b.id}>
                        <div className="section-heading">
                          <span
                            className={`score ${b.score === 0 ? 'absent' : ''}`}
                          >
                            {b.score}
                            <small>{t('points', '分')}</small>
                          </span>
                          <span className="footnote">
                            {dateText(b.slot.startsAt)}
                          </span>
                        </div>
                        <h3>
                          {settings.evaluations.find(
                            (e) => e.score === b.score,
                          )?.[lang === 'zh-CN' ? 'zh' : 'en'] ||
                            t('Evaluation', '评价')}
                        </h3>
                        {b.student && (
                          <p className="muted">
                            {displayName(b.student)} · {b.studentId}
                          </p>
                        )}
                        <p className="feedback-text">
                          {b.feedback ||
                            t(
                              'No additional written feedback.',
                              '暂无额外文字反馈。',
                            )}
                        </p>
                        <button
                          className="text-button"
                          onClick={() => setDetail(b)}
                        >
                          {t('View tutorial', '查看辅导记录')}
                          <ArrowUpRight size={14} />
                        </button>
                      </section>
                    ))
                  ) : (
                    <section className="panel full-width">
                      <Empty
                        icon={MessageSquare}
                        title={t(
                          'Feedback comes after your tutorial',
                          '辅导结束后，在这里查看反馈',
                        )}
                        body={t(
                          'Attendance and instructor feedback will appear here once recorded.',
                          '教师记录出勤和评价后，反馈将在这里显示。',
                        )}
                      />
                    </section>
                  )}
                </div>
              ) : (
                <section className="panel">
                  <Tabs defaultValue="active">
                    <TabsList className="meeting-tabs">
                      {[
                        ['active', t('Upcoming & active', '待进行 / 进行中')],
                        ['draft', t('Drafts', '草稿')],
                        ['past', t('History', '历史记录')],
                      ].map(([v, l]) => (
                        <TabsTrigger key={v} value={v}>
                          {l}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <TabsContent value="active">
                      {bookingCards(
                        [...active].sort(
                          (a, b) => a.slot.startsAt - b.slot.startsAt,
                        ),
                      )}
                    </TabsContent>
                    <TabsContent value="draft">
                      {bookingCards(
                        bookings.filter((b) => b.status === 'draft'),
                      )}
                    </TabsContent>
                    <TabsContent value="past">
                      {bookingCards(
                        bookings.filter(
                          (b) =>
                            ![
                              'draft',
                              'submitted',
                              'approved',
                              'in_progress',
                            ].includes(b.status),
                        ),
                      )}
                    </TabsContent>
                  </Tabs>
                </section>
              )}
            </>
          )}
          {view === 'profile' && (
            <>
              <PageHeading
                title={t('A little about you.', '认识一下你。')}
                description={t(
                  'Keep your details up to date for a smooth tutorial.',
                  '保持资料准确，让辅导沟通更顺畅。',
                )}
              />
              <section className="panel profile-panel">
                <div className="profile-compact">
                  <span className="avatar large">
                    {displayName(user).slice(0, 1)}
                  </span>
                  <div>
                    <h3>{displayName(user)}</h3>
                    <p>
                      {role} · {user.id}
                    </p>
                  </div>
                  <span className="subtle-chip">
                    {t('Institutional account', '学校账号')}
                  </span>
                </div>
                <ProfileForm
                  user={user}
                  settings={settings}
                  t={t}
                  busy={busy}
                  onSave={(p) => act({ action: 'profile', profile: p })}
                />
                <div className="security-row">
                  <div>
                    <strong>{t('Account password', '账号密码')}</strong>
                    <p>
                      {t(
                        'Change your password whenever you need.',
                        '你可以随时更改登录密码。',
                      )}
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => setPasswordOpen(true)}
                  >
                    <LockKeyhole size={16} />
                    {t('Change password', '更改密码')}
                  </button>
                </div>
              </section>
            </>
          )}
          {view === 'schedule' && user.role === 'admin' && (
            <Schedule
              settings={settings}
              staff={data!.staff}
              slots={data!.slots}
              bookings={data!.bookings}
              now={data!.serverTime}
              t={t}
              busy={busy}
              error={
                error
                  ? t(
                      ...(errorMessages[error] || [
                        'Could not save.',
                        '保存失败。',
                      ]),
                    )
                  : ''
              }
              onSave={(s) => act({ action: 'settings', settings: s })}
            />
          )}
          {view === 'settings' && user.role === 'admin' && (
            <SettingsPage
              settings={settings}
              t={t}
              busy={busy}
              onSave={(s) => act({ action: 'settings', settings: s })}
            />
          )}
          {view === 'users' && user.role === 'admin' && (
            <>
              <PageHeading
                title={t('Your learning community.', '你的师生社区。')}
                description={t(
                  'Issue institutional accounts, assign roles and import student rosters.',
                  '发放学校账号、分配角色并导入学生名单。',
                )}
              >
                <button
                  className="secondary"
                  onClick={() =>
                    download(
                      'schedu-roster-template.csv',
                      'id,role,grade,adminClass,teachingClass,chineseName,englishName,phone\n' +
                        `20260001,student,${currentYear()},26电H一,Class 1,张三,San Zhang,13800000000\n`,
                    )
                  }
                >
                  <Download size={16} />
                  {t('CSV template', 'CSV 模板')}
                </button>
                <label className="secondary upload-label">
                  <Upload size={16} />
                  {t('Import roster', '导入名单')}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        if (file.size > maxRosterBytes)
                          throw Error('roster_too_large');
                        setImportRows(parseCSV(await file.text()));
                        setError('');
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : 'invalid_csv',
                        );
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <button className="primary" onClick={() => setUserModal(true)}>
                  <Plus size={16} />
                  {t('Issue account', '创建账号')}
                </button>
              </PageHeading>
              <UserManager
                users={data!.users}
                now={data!.serverTime}
                t={t}
                busy={busy}
                error={
                  error
                    ? t(
                        ...(errorMessages[error] || [
                          'Could not save.',
                          '保存失败。',
                        ]),
                      )
                    : ''
                }
                act={async (body) => {
                  const result = await act(body);
                  if (result?.credentials) setCredentials(result.credentials);
                  return result;
                }}
                renderProfile={(target, done) => (
                  <ProfileForm
                    user={target}
                    settings={settings}
                    t={t}
                    busy={busy}
                    onSave={async (profile) => {
                      const result = await act({
                        action: 'updateUser',
                        id: target.id,
                        profile,
                      });
                      if (result) done();
                      return result;
                    }}
                  />
                )}
              />
            </>
          )}
          <footer className="workspace-footer">
            <span>
              SchedU <span>·</span>{' '}
              {t('Make time for progress.', '为进步，留一点时间。')}
            </span>
            <span>
              {t(
                'All meeting times are in China Standard Time · UTC+8',
                '辅导时间均为中国标准时间 · UTC+8',
              )}
            </span>
          </footer>
        </main>
      </SidebarInset>
      <Dialog open={confirmBook} onOpenChange={setConfirmBook}>
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>
              {t('Ready for your next step?', '准备好下一次进步了吗？')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'Review your tutorial before submitting.',
                '提交前，请确认辅导信息。',
              )}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <div className="confirmation-time">
                <CalendarDays size={26} />
                <div>
                  <h3>{dateText(selected.startsAt)}</h3>
                  <p>
                    {selected.start} – {selected.end} · {selected.location}
                  </p>
                </div>
              </div>
              <p className="muted">
                {selected.instructors.length
                  ? t(
                      'This booking will be approved automatically. You may meet any instructor on duty.',
                      '此预约将自动批准，你将与任一当值教师交流。',
                    )
                  : t(
                      'This slot has no instructor assigned yet. Your booking will wait for approval.',
                      '此时段尚未安排教师，提交后需等待审批。',
                    )}
              </p>
              <div className="policy-inline">
                {t(
                  `Cancelling this booking will pause new bookings for ${settings.cancellationWeeks} week(s).`,
                  `取消此预约将暂停新预约 ${settings.cancellationWeeks} 周。`,
                )}
              </div>
              {errorBox()}
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  const r = await act(
                    { action: 'book', slotId, topic, draftId },
                    t('Your tutorial has been booked.', '辅导预约已提交。'),
                  );
                  if (r) {
                    setConfirmBook(false);
                    setDraftId('');
                    setSlotId('');
                    navigate('meetings');
                  }
                }}
              >
                {t('Confirm booking', '确认提交')}
                <Check size={17} />
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!cancel} onOpenChange={(o) => !o && setCancel(null)}>
        <AlertDialogContent className="app-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('Cancel this booking?', '确定取消此预约？')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {user.role === 'student'
                ? t(
                    `New bookings will be blocked for ${settings.cancellationWeeks} week(s), starting now. This cannot be undone.`,
                    `从现在起，您将有 ${settings.cancellationWeeks} 周无法提交新预约。此操作不可撤销。`,
                  )
                : t(
                    'The student will not receive a booking restriction when staff cancel a meeting.',
                    '由教师或管理员取消预约时，不会限制学生继续预约。',
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {errorBox()}
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('Keep booking', '保留预约')}
            </AlertDialogCancel>
            <button
              className="danger"
              disabled={busy}
              onClick={async () => {
                const r = await act({
                  action: 'transition',
                  id: cancel!.id,
                  status: 'cancelled',
                });
                if (r) {
                  setCancel(null);
                  setDetail(null);
                }
              }}
            >
              {t('Cancel booking', '取消预约')}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>{t('Tutorial details', '辅导详情')}</DialogTitle>
            <DialogDescription>
              {detail &&
                dateText(detail.slot.startsAt, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <>
              <div className="section-heading">
                <h2>
                  {detail.slot.start} – {detail.slot.end}
                </h2>
                <Status t={t} value={detail.status} />
              </div>
              <p className="row muted">
                <MapPin size={16} />
                {detail.slot.location}
              </p>
              {detail.student && (
                <div className="student-detail">
                  <strong>
                    {displayName(detail.student)} · {detail.studentId}
                  </strong>
                  <p>
                    {detail.student.profile.grade} ·{' '}
                    {detail.student.profile.adminClass} ·{' '}
                    {detail.student.profile.teachingClass ||
                      t('No teaching class', '无教学班')}
                  </p>
                  <p>{detail.student.profile.phone}</p>
                </div>
              )}
              <p className="muted">
                {t('Instructors on duty: ', '当值教师：')}
                {detail.slot.instructors.map(staffName).join(' / ') ||
                  t('To be confirmed', '待安排')}
              </p>
              {detail.topic && (
                <div className="topic-detail">
                  <strong>{t('Topic', '讨论主题')}</strong>
                  <p>{detail.topic}</p>
                </div>
              )}
              {detail.score !== null && (
                <div className="topic-detail">
                  <strong>
                    {detail.score} {t('points', '分')}
                  </strong>
                  <p>
                    {detail.feedback ||
                      t('No written feedback.', '暂无文字反馈。')}
                  </p>
                </div>
              )}
              {timeline(detail)}
              {errorBox()}
              <div className="form-actions wrap">
                {detail.status === 'draft' && user.role === 'student' && (
                  <>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={async () => {
                        if (await act({ action: 'deleteDraft', id: detail.id }))
                          setDetail(null);
                      }}
                    >
                      {t('Delete draft', '删除草稿')}
                    </button>
                    <button
                      className="primary"
                      onClick={() => {
                        setDraftId(detail.id);
                        setSlotId(detail.slot.id);
                        setDate(detail.slot.date);
                        setTopic(detail.topic);
                        setDetail(null);
                        navigate('book');
                      }}
                    >
                      {t('Continue draft', '继续填写')}
                    </button>
                  </>
                )}
                {['submitted', 'approved'].includes(detail.status) &&
                  (user.role !== 'student' ||
                    detail.slot.startsAt > Date.now()) && (
                    <button
                      className="danger"
                      onClick={() => setCancel(detail)}
                    >
                      {t('Cancel booking', '取消预约')}
                    </button>
                  )}
                {user.role !== 'student' && (
                  <>
                    {detail.status === 'submitted' && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await act({
                              action: 'transition',
                              id: detail.id,
                              status: 'approved',
                            })
                          )
                            setDetail(null);
                        }}
                      >
                        {t('Approve', '批准')}
                      </button>
                    )}
                    {detail.status === 'approved' &&
                      detail.slot.startsAt <= Date.now() && (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={async () => {
                            if (
                              await act({
                                action: 'transition',
                                id: detail.id,
                                status: 'in_progress',
                              })
                            )
                              setDetail(null);
                          }}
                        >
                          {t('Start session', '开始辅导')}
                        </button>
                      )}
                    {['approved', 'in_progress'].includes(detail.status) &&
                      detail.slot.startsAt <= Date.now() && (
                        <button
                          className="primary"
                          onClick={() => {
                            setEvaluate(detail);
                            setScore(
                              String(
                                settings.evaluations.find((e) => e.score === 40)
                                  ?.score ?? settings.evaluations[0].score,
                              ),
                            );
                            setFeedback('');
                            setDetail(null);
                          }}
                        >
                          {t('Record feedback', '记录反馈')}
                        </button>
                      )}
                    {['completed', 'cancelled'].includes(detail.status) && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await act({
                              action: 'transition',
                              id: detail.id,
                              status: 'archived',
                            })
                          )
                            setDetail(null);
                        }}
                      >
                        {t('Archive', '归档')}
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!evaluate} onOpenChange={(o) => !o && setEvaluate(null)}>
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>
              {t('How did the tutorial go?', '这次辅导表现如何？')}
            </DialogTitle>
            <DialogDescription>
              {evaluate?.student
                ? displayName(evaluate.student)
                : evaluate?.studentId}
            </DialogDescription>
          </DialogHeader>
          <Field label={t('Attendance & performance', '出勤与表现')}>
            <Choice
              value={score}
              onChange={setScore}
              label={t('Choose an evaluation', '选择评价')}
              options={settings.evaluations.map((e) => ({
                value: String(e.score),
                label: `${e.score} · ${lang === 'zh-CN' ? e.zh : e.en}`,
              }))}
            />
          </Field>
          <Field label={t('Feedback for the student', '给学生的反馈')}>
            <textarea
              value={feedback}
              maxLength={2000}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={t(
                'What went well? What should they work on next?',
                '哪些方面做得好？接下来应该如何改进？',
              )}
            />
          </Field>
          {errorBox()}
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              if (
                await act({
                  action: 'transition',
                  id: evaluate!.id,
                  status: 'completed',
                  score: Number(score),
                  feedback,
                })
              )
                setEvaluate(null);
            }}
          >
            {t('Complete & save feedback', '完成辅导并保存反馈')}
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!user.firstLogin || passwordOpen}
        onOpenChange={(o) => !user.firstLogin && setPasswordOpen(o)}
      >
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>
              {user.firstLogin
                ? t('Make your account yours.', '设置你的专属密码。')
                : t('Change password', '更改密码')}
            </DialogTitle>
            <DialogDescription>
              {user.firstLogin
                ? t(
                    'You can change your issued password now, or keep it.',
                    '你可以更改学校发放的初始密码，也可以选择保留。',
                  )
                : t(
                    'Enter your current password and choose a new one.',
                    '输入当前密码并设置新密码。',
                  )}
            </DialogDescription>
          </DialogHeader>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (f.get('password') !== f.get('confirm')) {
                setError('password_mismatch');
                return;
              }
              if (
                await act({
                  action: 'password',
                  current: f.get('current'),
                  password: f.get('password'),
                })
              )
                setPasswordOpen(false);
            }}
          >
            <Field label={t('Current password', '当前密码')}>
              <input
                name="current"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field
              label={t(
                'New password (8–128 characters)',
                '新密码（8 至 128 位）',
              )}
            >
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
            </Field>
            <Field label={t('Confirm new password', '确认新密码')}>
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
            </Field>
            {errorBox()}
            <button className="primary" disabled={busy}>
              {t('Update password', '更新密码')}
            </button>
            {!!user.firstLogin && (
              <button
                className="text-button center"
                type="button"
                disabled={busy}
                onClick={() => act({ action: 'password', keep: true })}
              >
                {t('Keep my initial password', '保留初始密码')}
              </button>
            )}
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={userModal} onOpenChange={setUserModal}>
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>{t('Issue an account', '创建账号')}</DialogTitle>
            <DialogDescription>
              {t(
                'A random initial password will be generated. Students complete their profile before booking.',
                '系统将生成随机初始密码。学生需在预约前完善个人资料。',
              )}
            </DialogDescription>
          </DialogHeader>
          <IssueAccount
            t={t}
            busy={busy}
            onSave={async (u) => {
              const r = await act({ action: 'issue', user: u });
              if (r) {
                setUserModal(false);
                setCredentials(r.credentials);
              }
            }}
          />
          {errorBox()}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!credentials}
        onOpenChange={(o) => !o && setCredentials(null)}
      >
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>{t('Accounts are ready', '账号已就绪')}</DialogTitle>
            <DialogDescription>
              {t(
                'Download these initial passwords now. They will not be shown again after this panel closes.',
                '请立即下载初始密码。关闭此窗口后，将无法再次查看。',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="credential-list">
            {credentials?.map((c) => (
              <div className="row" key={c.id}>
                <strong>{c.id}</strong>
                <code>{c.password}</code>
              </div>
            ))}
          </div>
          <button
            className="primary"
            onClick={() =>
              download(
                'schedu-issued-accounts.csv',
                'id,initialPassword\n' +
                  credentials!
                    .map((c) => `${csvCell(c.id)},${csvCell(c.password)}`)
                    .join('\n'),
              )
            }
          >
            <Download size={16} />
            {t('Download account details', '下载账号信息')}
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!importRows}
        onOpenChange={(o) => !o && setImportRows(null)}
      >
        <DialogContent className="app-dialog wide">
          <DialogHeader>
            <DialogTitle>
              {t('Review roster import', '预览导入名单')}
            </DialogTitle>
            <DialogDescription>
              {t(
                `${importRows?.length || 0} accounts. All rows will be imported; the first 50 are shown below. Existing IDs will not be overwritten.`,
                `${importRows?.length || 0} 个账号。将导入全部数据，下方预览前 50 行；不会覆盖已有账号。`,
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="import-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>{t('Name', '姓名')}</TableHead>
                  <TableHead>{t('Class', '班级')}</TableHead>
                  <TableHead>{t('Validation', '检查')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importRows?.slice(0, 50).map((r, i) => {
                  const err =
                    (r.role || 'student') === 'student'
                      ? profileError(
                          { ...r, grade: Number(r.grade) } as Profile,
                          settings,
                        )
                      : null;
                  const duplicate =
                    data!.users.some((u) => u.id === r.id) ||
                    importRows.findIndex((x) => x.id === r.id) !== i;
                  return (
                    <TableRow key={i}>
                      <TableCell>{r.id}</TableCell>
                      <TableCell>
                        {r.chineseName}
                        <small className="table-sub">{r.englishName}</small>
                      </TableCell>
                      <TableCell>
                        {r.adminClass}
                        <small className="table-sub">{r.teachingClass}</small>
                      </TableCell>
                      <TableCell>
                        {duplicate ? (
                          t('Duplicate ID', '账号重复')
                        ) : err ? (
                          t(...errorMessages[err])
                        ) : (
                          <CheckCircle2 size={17} className="green" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {errorBox()}
          <button
            className="primary"
            disabled={busy || !importRows?.length}
            onClick={async () => {
              const r = await act({ action: 'import', rows: importRows });
              if (r) {
                setImportRows(null);
                setCredentials(r.credentials);
              }
            }}
          >
            {busy
              ? t('Creating accounts…', '正在创建账号…')
              : t('Import & issue passwords', '导入并生成密码')}
          </button>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
function Stat({
  icon: Icon,
  value,
  label,
  note,
}: {
  icon: typeof CalendarDays;
  value: number;
  label: string;
  note: string;
}) {
  return (
    <section className="stat-card">
      <div>
        <p>{label}</p>
        <strong>{String(value).padStart(2, '0')}</strong>
        <small>{note}</small>
      </div>
      <div className="stat-icon">
        <Icon size={21} />
      </div>
    </section>
  );
}
function ProfileForm({
  user,
  settings,
  t,
  busy,
  onSave,
}: {
  user: User;
  settings: Settings;
  t: T;
  busy: boolean;
  onSave: (p: Profile) => Promise<unknown>;
}) {
  const [p, setP] = useState(user.profile);
  useEffect(() => setP(user.profile), [user.profile]);
  const set = (k: keyof Profile, v: any) => setP({ ...p, [k]: v });
  return (
    <form
      className="profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(p);
      }}
    >
      <div className="form-grid">
        <Field label={t('Institutional ID', '学号 / 工号')}>
          <input value={user.id} disabled />
        </Field>
        <Field label={t('Entry year', '加入年份')}>
          <input
            type="number"
            value={p.grade}
            min={2000}
            max={currentYear()}
            required={user.role === 'student'}
            onChange={(e) => set('grade', Number(e.target.value))}
          />
        </Field>
        <Field label={t('Chinese name', '中文姓名')}>
          <input
            value={p.chineseName}
            required
            maxLength={80}
            onChange={(e) => set('chineseName', e.target.value)}
          />
        </Field>
        <Field label={t('English name', '英文姓名')}>
          <input
            value={p.englishName}
            required={user.role === 'student'}
            maxLength={80}
            onChange={(e) => set('englishName', e.target.value)}
          />
        </Field>
        {user.role === 'student' && (
          <>
            <Field
              label={t('Administrative class · required', '行政班级 · 必填')}
            >
              <Choice
                label={t('Choose administrative class', '选择行政班级')}
                value={p.adminClass}
                onChange={(v) => set('adminClass', v)}
                options={settings.adminClasses.map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
            </Field>
            <Field
              label={
                p.grade === currentYear()
                  ? t(
                      'Teaching class · required for freshmen',
                      '教学班级 · 新生必填',
                    )
                  : t('Teaching class · optional', '教学班级 · 选填')
              }
            >
              <Choice
                label={t('Choose teaching class', '选择教学班级')}
                value={p.teachingClass}
                onChange={(v) => set('teachingClass', v)}
                options={[
                  ...(p.grade !== currentYear()
                    ? [{ value: '', label: t('None', '无') }]
                    : []),
                  ...settings.teachingClasses.map((v) => ({
                    value: v,
                    label: v,
                  })),
                ]}
              />
            </Field>
          </>
        )}
        <Field label={t('Phone number · optional', '手机号码 · 选填')}>
          <input
            type="tel"
            value={p.phone}
            maxLength={24}
            onChange={(e) => set('phone', e.target.value)}
          />
        </Field>
      </div>
      {user.role === 'student' && (
        <p className="footnote">
          {t(
            `The ${currentYear()} entry cohort is automatically treated as freshmen.`,
            `${currentYear()} 级学生自动视为新生。`,
          )}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {t('Save profile', '保存资料')}
        <Check size={16} />
      </button>
    </form>
  );
}
function IssueAccount({
  t,
  busy,
  onSave,
}: {
  t: T;
  busy: boolean;
  onSave: (u: any) => void;
}) {
  const [role, setRole] = useState('student');
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave({
          id: f.get('id'),
          role,
          profile: {
            ...emptyProfile,
            grade: currentYear(),
            chineseName: f.get('name'),
            englishName: f.get('englishName'),
          },
        });
      }}
    >
      <Field label={t('Institutional ID', '学号 / 工号')}>
        <input name="id" required pattern="[A-Za-z0-9][A-Za-z0-9._-]{1,39}" />
      </Field>
      <Field label={t('Chinese name', '中文姓名')}>
        <input name="name" required maxLength={80} />
      </Field>
      <Field label={t('English name', '英文姓名')}>
        <input name="englishName" maxLength={80} />
      </Field>
      <Field label={t('Role', '角色')}>
        <Choice
          label={t('Select role', '选择角色')}
          value={role}
          onChange={setRole}
          options={[
            { value: 'student', label: t('Student', '学生') },
            { value: 'instructor', label: t('Instructor', '教师') },
          ]}
        />
      </Field>
      <button className="primary" disabled={busy}>
        {t('Create account', '创建账号')}
      </button>
    </form>
  );
}
function Schedule({
  settings,
  staff,
  slots,
  bookings,
  now,
  t,
  busy,
  error,
  onSave,
}: {
  settings: Settings;
  staff: Data['staff'];
  slots: Slot[];
  bookings: Booking[];
  now: number;
  t: T;
  busy: boolean;
  error: string;
  onSave: (s: Settings) => Promise<any>;
}) {
  const [editing, setEditing] = useState<TeachingWindow | null>(null),
    [closed, setClosed] = useState(settings.closedDates.join('\n')),
    [selectedDate, setSelectedDate] = useState(chinaDate(now));
  const calendarDays = availabilityDays(settings, bookings, now);
  useEffect(
    () => setClosed(settings.closedDates.join('\n')),
    [settings.closedDates],
  );
  const days = t(
    'Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday',
    '星期日,星期一,星期二,星期三,星期四,星期五,星期六',
  ).split(',');
  return (
    <>
      <PageHeading
        title={t('Make room for tutorials.', '安排好每一次交流。')}
        description={t(
          'See the next four weeks and select a date to manage its time slots.',
          '一览未来四周的辅导安排，选择日期即可管理具体时段。',
        )}
      >
        <button
          className="primary"
          onClick={() =>
            setEditing({
              id: clientId(),
              day: 1,
              start: '18:30',
              end: '20:05',
              location: '',
              instructors: [],
              capacity: 1,
              enabled: true,
            })
          }
        >
          <Plus size={17} />
          {t('Add teaching window', '添加时间范围')}
        </button>
      </PageHeading>
      <div className="schedule-summary">
        <Clock3 size={18} />
        {t(
          `${settings.meetingMinutes}-minute tutorials · ${settings.breakMinutes}-minute breaks · ${settings.horizonDays} days ahead`,
          `${settings.meetingMinutes} 分钟辅导 · ${settings.breakMinutes} 分钟休息 · 开放未来 ${settings.horizonDays} 天`,
        )}
      </div>
      <AvailabilityCalendar
        days={calendarDays}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        staff={staff}
        t={t}
      />
      <SlotManager
        settings={settings}
        slots={[
          ...slots.filter((s) => !calendarDays.some((d) => d.date === s.date)),
          ...calendarDays.flatMap((d) => d.slots),
        ]}
        date={selectedDate}
        onDateChange={setSelectedDate}
        staff={staff}
        t={t}
        busy={busy}
        error={error}
        onSave={onSave}
      />
      <details className="weekly-window-editor">
        <summary>
          {t('Weekly teaching windows', '每周辅导时间范围')}{' '}
          <span className="count">{settings.windows.length}</span>
        </summary>
        <div className="schedule-grid">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <section className="panel schedule-day" key={day}>
              <div className="section-heading">
                <h3>{days[day]}</h3>
                <span className="count">
                  {settings.windows.filter((w) => w.day === day).length}
                </span>
              </div>
              {settings.windows
                .filter((w) => w.day === day)
                .map((w) => (
                  <button
                    className={`window-card ${!w.enabled ? 'disabled-window' : ''}`}
                    key={w.id}
                    onClick={() => setEditing(structuredClone(w))}
                  >
                    <div className="row">
                      <strong>
                        {w.start}–{w.end}
                      </strong>
                      <Pencil size={14} />
                    </div>
                    <p>
                      <MapPin size={14} />
                      {w.location}
                    </p>
                    <p>
                      <Users size={14} />
                      {w.instructors
                        .map((id) => staff.find((u) => u.id === id)?.name || id)
                        .join(' / ') || t('Unassigned', '未安排教师')}
                    </p>
                    <small>
                      {w.capacity} {t('seat(s) per slot', '个名额 / 时段')}
                      {!w.enabled ? ' · ' + t('Paused', '已暂停') : ''}
                    </small>
                  </button>
                ))}
              {!settings.windows.some((w) => w.day === day) && (
                <p className="no-hours">
                  {t('No teaching hours', '暂无辅导安排')}
                </p>
              )}
            </section>
          ))}
        </div>
      </details>
      <TimetableImport
        settings={settings}
        staff={staff}
        t={t}
        busy={busy}
        onSave={onSave}
      />
      <section className="panel exceptions-panel">
        <h3>{t('Dates off', '停课日期')}</h3>
        <p className="muted">
          {t(
            'No new slots will be offered on these dates. Cancel active bookings first. One date per line, YYYY-MM-DD.',
            '这些日期不再提供新时段，请先取消相关的有效预约。每行一个日期，格式为 YYYY-MM-DD。',
          )}
        </p>
        <textarea
          value={closed}
          onChange={(e) => setClosed(e.target.value)}
          placeholder="2026-10-01"
          aria-label={t('Closed dates', '停课日期')}
        />
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            onSave({
              ...settings,
              closedDates: closed
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        >
          {t('Save dates off', '保存停课日期')}
        </button>
      </section>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>{t('Teaching window', '辅导时间范围')}</DialogTitle>
            <DialogDescription>
              {t(
                'Students can meet any instructor assigned here. Cancel active bookings before changing their slots. Historical records are retained.',
                '学生可与此处任一教师交流。修改时段前须先取消相关的有效预约，历史记录会保留。',
              )}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const windows = settings.windows.some(
                  (w) => w.id === editing.id,
                )
                  ? settings.windows.map((w) =>
                      w.id === editing.id ? editing : w,
                    )
                  : [...settings.windows, editing];
                if (await onSave({ ...settings, windows })) setEditing(null);
              }}
            >
              <Field label={t('Weekday', '星期')}>
                <Choice
                  label={t('Weekday', '星期')}
                  value={String(editing.day)}
                  onChange={(v) => setEditing({ ...editing, day: Number(v) })}
                  options={days.map((d, i) => ({ value: String(i), label: d }))}
                />
              </Field>
              <div className="form-grid">
                <Field label={t('Starts at', '开始时间')}>
                  <input
                    type="time"
                    value={editing.start}
                    required
                    onChange={(e) =>
                      setEditing({ ...editing, start: e.target.value })
                    }
                  />
                </Field>
                <Field label={t('Ends at', '结束时间')}>
                  <input
                    type="time"
                    value={editing.end}
                    required
                    onChange={(e) =>
                      setEditing({ ...editing, end: e.target.value })
                    }
                  />
                </Field>
              </div>
              <Field label={t('Location', '地点')}>
                <input
                  value={editing.location}
                  maxLength={120}
                  required
                  placeholder={t(
                    'e.g. Teaching Building A · Room 302',
                    '例如：教学楼 A · 302 室',
                  )}
                  onChange={(e) =>
                    setEditing({ ...editing, location: e.target.value })
                  }
                />
              </Field>
              <Field label={t('Students per slot', '每个时段的学生人数')}>
                <input
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={editing.capacity}
                  onChange={(e) =>
                    setEditing({ ...editing, capacity: Number(e.target.value) })
                  }
                />
              </Field>
              <div className="stack small-gap">
                <strong className="field-title">
                  {t('Instructors on duty', '当值教师')}
                </strong>
                {staff.map((u) => (
                  <label className="checkbox-label" key={u.id}>
                    <Checkbox
                      checked={editing.instructors.includes(u.id)}
                      onCheckedChange={(checked) =>
                        setEditing({
                          ...editing,
                          instructors: checked
                            ? [...editing.instructors, u.id]
                            : editing.instructors.filter((id) => id !== u.id),
                        })
                      }
                    />
                    {u.name} · {u.id}
                  </label>
                ))}
                <p className="footnote">
                  {t(
                    'Assigned instructors enable automatic approval.',
                    '安排教师后，预约将自动批准。',
                  )}
                </p>
              </div>
              <label className="checkbox-label">
                <Checkbox
                  checked={editing.enabled}
                  onCheckedChange={(v) =>
                    setEditing({ ...editing, enabled: !!v })
                  }
                />
                {t('Offer slots in this window', '开放此时间范围的预约')}
              </label>
              {error && (
                <p className="message error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                {settings.windows.some((w) => w.id === editing.id) && (
                  <button
                    type="button"
                    className="danger"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await onSave({
                          ...settings,
                          windows: settings.windows.filter(
                            (w) => w.id !== editing.id,
                          ),
                          slotOverrides: (settings.slotOverrides || []).filter(
                            (s) => s.windowId !== editing.id,
                          ),
                        })
                      )
                        setEditing(null);
                    }}
                  >
                    <Trash2 size={16} />
                    {t('Remove', '移除')}
                  </button>
                )}
                <button className="primary" disabled={busy}>
                  {t('Save teaching window', '保存时间安排')}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function SettingsPage({
  settings,
  t,
  busy,
  onSave,
}: {
  settings: Settings;
  t: T;
  busy: boolean;
  onSave: (s: Settings) => Promise<any>;
}) {
  const [s, setS] = useState(settings),
    [administrative, setAdministrative] = useState(
      settings.adminClasses.join('\n'),
    ),
    [teaching, setTeaching] = useState(settings.teachingClasses.join('\n'));
  useEffect(() => {
    setS(settings);
    setAdministrative(settings.adminClasses.join('\n'));
    setTeaching(settings.teachingClasses.join('\n'));
  }, [settings]);
  return (
    <>
      <PageHeading
        title={t('Simple rules. Smooth sessions.', '规则清晰，辅导顺畅。')}
        description={t(
          'All institute-wide settings, in one place.',
          '在这里管理学院的全部预约规则。',
        )}
      />
      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            ...s,
            adminClasses: administrative
              .split('\n')
              .map((v) => v.trim())
              .filter(Boolean),
            teachingClasses: teaching
              .split('\n')
              .map((v) => v.trim())
              .filter(Boolean),
          });
        }}
      >
        <section className="panel">
          <h3>{t('Booking rules', '预约规则')}</h3>
          <div className="form-grid">
            {[
              [
                'meetingMinutes',
                t('Tutorial duration (minutes)', '辅导时长（分钟）'),
                1,
                120,
              ],
              [
                'breakMinutes',
                t('Break between tutorials (minutes)', '辅导间隔（分钟）'),
                0,
                60,
              ],
              [
                'cancellationWeeks',
                t('Cancellation restriction (weeks)', '取消预约限制期（周）'),
                0,
                52,
              ],
              [
                'maxUpcoming',
                t('Active bookings per student', '每位学生的有效预约上限'),
                1,
                10,
              ],
              [
                'horizonDays',
                t('Booking horizon (days)', '开放预约天数'),
                1,
                90,
              ],
            ].map(([k, l, min, max]) => (
              <Field key={String(k)} label={String(l)}>
                <input
                  type="number"
                  min={Number(min)}
                  max={Number(max)}
                  required
                  value={Number(s[k as keyof Settings])}
                  onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })}
                />
              </Field>
            ))}
          </div>
          <p className="footnote">
            {t(
              'New rules apply to future actions. Existing booking times and cancellation expiry dates are preserved.',
              '新规则适用于后续操作。已有预约时间及限制期结束日期保持不变。',
            )}
          </p>
        </section>
        <section className="panel">
          <h3>{t('Class lists', '班级选项')}</h3>
          <p className="muted">
            {t(
              'One option per line. Freshmen are identified automatically by the current entry year.',
              '每行一个选项。系统按当前年份自动识别新生。',
            )}
          </p>
          <div className="form-grid">
            <Field label={t('Administrative classes', '行政班级')}>
              <textarea
                className="class-list"
                required
                value={administrative}
                onChange={(e) => setAdministrative(e.target.value)}
              />
            </Field>
            <Field label={t('Teaching classes', '教学班级')}>
              <textarea
                className="class-list"
                required
                value={teaching}
                onChange={(e) => setTeaching(e.target.value)}
              />
            </Field>
          </div>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h3>{t('Attendance & evaluation', '出勤与评价')}</h3>
            <button
              className="secondary"
              type="button"
              onClick={() =>
                setS({
                  ...s,
                  evaluations: [
                    ...s.evaluations,
                    { score: 50, en: '', zh: '' },
                  ],
                })
              }
            >
              <Plus size={15} />
              {t('Add option', '添加选项')}
            </button>
          </div>
          <p className="muted">
            {t(
              'Score 0 means absent. Other scores record attendance. Each score must be unique.',
              '0 分表示缺席，其他分值表示已参加。各选项分值必须唯一。',
            )}
          </p>
          <div className="evaluation-rows">
            {s.evaluations.map((ev, i) => (
              <div key={i} className="evaluation-row">
                <Field label={t('Score', '分值')}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={ev.score}
                    onChange={(e) =>
                      setS({
                        ...s,
                        evaluations: s.evaluations.map((v, j) =>
                          i === j ? { ...v, score: Number(e.target.value) } : v,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label="English">
                  <input
                    required
                    maxLength={120}
                    value={ev.en}
                    onChange={(e) =>
                      setS({
                        ...s,
                        evaluations: s.evaluations.map((v, j) =>
                          i === j ? { ...v, en: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label="简体中文">
                  <input
                    required
                    maxLength={120}
                    value={ev.zh}
                    onChange={(e) =>
                      setS({
                        ...s,
                        evaluations: s.evaluations.map((v, j) =>
                          i === j ? { ...v, zh: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </Field>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t('Remove evaluation', '移除评价选项')}
                  onClick={() =>
                    setS({
                      ...s,
                      evaluations: s.evaluations.filter((_, j) => j !== i),
                    })
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h3>{t('Display defaults', '显示默认值')}</h3>
          <div className="form-grid">
            <Field label={t('Default language', '默认语言')}>
              <Choice
                label={t('Default language', '默认语言')}
                value={s.defaultLanguage}
                onChange={(v) => setS({ ...s, defaultLanguage: v })}
                options={[
                  { value: 'zh-CN', label: '简体中文' },
                  { value: 'en-GB', label: 'English (UK)' },
                ]}
              />
            </Field>
            <Field label={t('Default theme', '默认主题')}>
              <Choice
                label={t('Default theme', '默认主题')}
                value={s.defaultTheme}
                onChange={(v) => setS({ ...s, defaultTheme: v })}
                options={[
                  {
                    value: 'system',
                    label: t('Follow browser / system', '跟随浏览器 / 系统'),
                  },
                  { value: 'light', label: t('Light', '浅色') },
                  { value: 'dark', label: t('Dark', '深色') },
                ]}
              />
            </Field>
          </div>
          <p className="footnote">
            {t(
              'Users can override these preferences on their device.',
              '用户可以在自己的设备上更改这些偏好。',
            )}
          </p>
        </section>
        <div className="settings-save">
          <button className="primary" disabled={busy}>
            {t('Save configuration', '保存配置')}
            <Check size={17} />
          </button>
        </div>
      </form>
    </>
  );
}

function NavButton({
  children,
  isActive,
  onClick,
  className,
}: {
  children: ReactNode;
  isActive: boolean;
  onClick: () => void;
  className: string;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuButton
      className={className}
      isActive={isActive}
      onClick={() => {
        setOpenMobile(false);
        onClick();
      }}
    >
      {children}
    </SidebarMenuButton>
  );
}
