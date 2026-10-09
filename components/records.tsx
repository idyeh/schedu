'use client';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  History,
  MessageSquare,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  Empty,
  PageHeading,
  Stat,
  Status,
  labels,
  type T,
} from '@/components/shared';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { paginationItems } from '@/lib/model';
import type { Booking, Role, Settings, User } from '@/lib/model';
import {
  approval,
  approvalRecords,
  byStudent,
  cancellation,
  completion,
  guidanceRecords,
  instituteSummary,
  isAppointment,
  outcome,
  requestedAt,
  staffActors,
  staffSummary,
  studentSummary,
} from '@/lib/records';
import type {
  ApprovalRecord,
  GuidanceRecord,
  Level,
  StaffSummary,
  StudentSummary,
} from '@/lib/records';

export type RecordsContext = {
  settings: Settings;
  now: number;
  lang: string;
  t: T;
  dateText: (ms: number, options?: Intl.DateTimeFormatOptions) => string;
  displayName: (u: User) => string;
  personName: (id: string) => string;
  onOpen: (b: Booking) => void;
};
const day: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};
const moment: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};
const percent = (value: number | null) =>
  value === null ? '—' : `${Math.round(value * 100)}%`;
const mark = (value: number | null) =>
  value === null
    ? '—'
    : Number.isInteger(value)
      ? String(value)
      : value.toFixed(1);
const levelName = (c: RecordsContext, score: number | null) =>
  c.settings.evaluations.find((e) => e.score === score)?.[
    c.lang === 'zh-CN' ? 'zh' : 'en'
  ] || c.t('Evaluation', '评价');
const studentName = (c: RecordsContext, b: Booking) =>
  b.student ? c.displayName(b.student) : c.personName(b.studentId);

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: string;
}) {
  return (
    <div className="record-figure">
      <p>{label}</p>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
// One series in one colour. Every row states its own count and share, so nothing depends on hovering.
function Bars({
  rows,
}: {
  rows: { key: string; label: string; count: number }[];
}) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  const longest = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="record-bars">
      {rows.map((r) => (
        <li key={r.key}>
          <span>{r.label}</span>
          <span className="record-bar-value">
            {r.count} <small>{percent(total ? r.count / total : null)}</small>
          </span>
          <span className="record-bar-track">
            <i style={{ width: `${(r.count / longest) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
function levelRows(c: RecordsContext, levels: Level[]) {
  return levels.map((l) => ({
    key: String(l.score),
    label: `${l.score} · ${(c.lang === 'zh-CN' ? l.zh : l.en) || c.t('Earlier evaluation option', '已停用的评价选项')}`,
    count: l.count,
  }));
}
function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [value: string, label: string, count: number][];
}) {
  return (
    <ToggleGroup
      className="account-status-toggle"
      aria-label={label}
      value={[value]}
      onValueChange={(values) => {
        if (values.length) onChange(String(values[0]));
      }}
    >
      {options.map(([key, text, count]) => (
        <ToggleGroupItem key={key} value={key}>
          {text} <span className="count">{count}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
function Pager({
  page,
  pages,
  total,
  label,
  onPage,
  t,
}: {
  page: number;
  pages: number;
  total: number;
  label: string;
  onPage: (page: number) => void;
  t: T;
}) {
  if (pages < 2) return null;
  return (
    <div className="people-pagination">
      <p aria-live="polite">
        {t(
          `${total} records · Page ${page} of ${pages}`,
          `${total} 条记录 · 第 ${page} / ${pages} 页`,
        )}
      </p>
      <Pagination aria-label={label}>
        <PaginationContent className="roster-pagination-controls">
          <PaginationItem>
            <button
              className="page-button"
              aria-label={t('Previous page', '上一页')}
              disabled={page === 1}
              onClick={() => onPage(page - 1)}
            >
              {t('Previous', '上一页')}
            </button>
          </PaginationItem>
          {paginationItems(page, pages).map((item, i) => (
            <PaginationItem key={`${item}-${i}`}>
              {item === 'ellipsis' ? (
                <span className="page-ellipsis" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  className="page-button"
                  aria-current={item === page ? 'page' : undefined}
                  aria-label={t(`Page ${item}`, `第 ${item} 页`)}
                  onClick={() => onPage(item)}
                >
                  {item}
                </button>
              )}
            </PaginationItem>
          ))}
          <PaginationItem>
            <button
              className="page-button"
              aria-label={t('Next page', '下一页')}
              disabled={page === pages}
              onClick={() => onPage(page + 1)}
            >
              {t('Next', '下一页')}
            </button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
function paged<R>(rows: R[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  return {
    pages,
    current,
    listed: rows.slice((current - 1) * size, current * size),
  };
}
function SessionCell({ b, c }: { b: Booking; c: RecordsContext }) {
  const date = c.dateText(b.slot.startsAt, day);
  return (
    <>
      <button
        className="text-button"
        aria-label={c.t(
          `View the tutorial on ${date} at ${b.slot.start}`,
          `查看 ${date} ${b.slot.start} 的辅导`,
        )}
        onClick={() => c.onOpen(b)}
      >
        {date} · {b.slot.start}–{b.slot.end}
      </button>
      <small className="table-sub">{b.slot.location}</small>
    </>
  );
}
function StudentCell({ b, c }: { b: Booking; c: RecordsContext }) {
  return (
    <>
      <strong>{studentName(c, b)}</strong>
      <small className="table-sub">{b.studentId}</small>
    </>
  );
}
function approvalText(
  c: RecordsContext,
  r: { kind: string; by: string | null },
  self = '',
) {
  if (r.kind === 'automatic') return c.t('Approved automatically', '自动批准');
  if (r.kind === 'manual')
    return r.by === self
      ? c.t('Approved by you', '由你批准')
      : c.t(
          `Approved by ${c.personName(r.by!)}`,
          `审批人：${c.personName(r.by!)}`,
        );
  if (r.kind === 'pending') return c.t('Awaiting approval', '待审批');
  if (r.kind === 'expired')
    return c.t('Not approved before the start', '开始前未获批准');
  return c.t('Cancelled before approval', '审批前已取消');
}
// The result of an appointment in one line, with who recorded or approved it underneath.
function ResultCell({ b, c }: { b: Booking; c: RecordsContext }) {
  const kind = outcome(b, c.now);
  const { t } = c;
  if (kind === 'attended' || kind === 'absent') {
    const by = completion(b)?.by;
    return (
      <>
        {b.score} · {levelName(c, b.score)}
        {by && (
          <small className="table-sub">
            {t(
              `Recorded by ${c.personName(by)}`,
              `记录人：${c.personName(by)}`,
            )}
          </small>
        )}
      </>
    );
  }
  if (kind === 'cancelled')
    return cancellation(b)?.by === b.studentId
      ? t('Cancelled by the student', '学生取消')
      : t('Cancelled by staff', '教师或管理员取消');
  if (kind === 'awaiting_feedback') return t('Awaiting feedback', '待记录反馈');
  const approved = approval(b, c.now);
  if (kind === 'awaiting_approval') return approvalText(c, approved);
  return (
    <>
      {t('Upcoming', '待进行')}
      <small className="table-sub">{approvalText(c, approved)}</small>
    </>
  );
}

// Each column is one evaluated tutorial, oldest first; the appointment table below lists the same marks.
function MarkTrend({ marks, c }: { marks: Booking[]; c: RecordsContext }) {
  const shown = marks.slice(-24);
  const top = Math.max(
    1,
    ...c.settings.evaluations.map((e) => e.score),
    ...shown.map((b) => b.score!),
  );
  return (
    <figure className="mark-trend">
      <div className="mark-trend-plot">
        {shown.map((b, i) => {
          const text = `${c.dateText(b.slot.startsAt, day)} · ${b.score} · ${levelName(c, b.score)}`;
          return (
            <Tooltip key={b.id}>
              <TooltipTrigger
                delay={100}
                render={
                  <button
                    type="button"
                    aria-label={text}
                    onClick={() => c.onOpen(b)}
                  />
                }
              >
                {i === shown.length - 1 && (
                  <span className="mark-cap">{b.score}</span>
                )}
                <i
                  className={b.score === 0 ? 'is-absent' : ''}
                  style={{
                    height: `calc((100% - 22px) * ${b.score! / top})`,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent>{text}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <figcaption>
        {c.dateText(shown[0].slot.startsAt, day)}
        {shown.length > 1 &&
          ` – ${c.dateText(shown.at(-1)!.slot.startsAt, day)}`}
      </figcaption>
    </figure>
  );
}

function LearningProfile({
  summary,
  c,
}: {
  summary: StudentSummary;
  c: RecordsContext;
}) {
  const { t } = c;
  const evaluatedCount = summary.attended + summary.absent;
  const notes = summary.marks
    .filter((b) => b.feedback)
    .slice(-3)
    .reverse();
  return (
    <section className="panel records-panel">
      <div className="section-heading">
        <div>
          <h3>{t('Learning profile', '学习档案')}</h3>
          <p>
            {t(
              'Attendance, marks and advice from evaluated tutorials.',
              '根据已评价的辅导汇总出勤、评分与建议。',
            )}
          </p>
        </div>
        <GraduationCap size={19} />
      </div>
      {summary.total ? (
        <>
          <div className="record-figures">
            <Figure
              label={t('Tutorials attended', '已参加辅导')}
              value={summary.attended}
              note={t(
                `${summary.absent} absence(s) · ${summary.cancelled} cancelled`,
                `缺席 ${summary.absent} 次 · 取消 ${summary.cancelled} 次`,
              )}
            />
            <Figure
              label={t('Attendance rate', '出勤率')}
              value={percent(summary.attendanceRate)}
              note={t(
                `${summary.attended} of ${evaluatedCount} evaluated tutorials`,
                `已评价 ${evaluatedCount} 次，出勤 ${summary.attended} 次`,
              )}
            />
            <Figure
              label={t('Average mark', '平均评分')}
              value={mark(summary.averageScore)}
              note={
                summary.latestScore === null
                  ? t('Across attended tutorials', '按已参加的辅导计算')
                  : t(
                      `Latest mark ${summary.latestScore} · attended tutorials`,
                      `最近评分 ${summary.latestScore} · 按已参加的辅导计算`,
                    )
              }
            />
            <Figure
              label={t('Time in tutorials', '辅导时长')}
              value={
                <>
                  {summary.minutes}
                  <span>{t('min', '分钟')}</span>
                </>
              }
              note={
                summary.first === null
                  ? t('No attended tutorial yet', '尚未参加辅导')
                  : t(
                      `Since ${c.dateText(summary.first, day)}`,
                      `自 ${c.dateText(summary.first, day)} 起`,
                    )
              }
            />
          </div>
          {summary.marks.length ? (
            <div className="record-columns">
              <div>
                <h4>{t('Marks over time', '评分变化')}</h4>
                <MarkTrend marks={summary.marks} c={c} />
              </div>
              <div>
                <h4>{t('Evaluations received', '评价分布')}</h4>
                <Bars rows={levelRows(c, summary.levels)} />
              </div>
            </div>
          ) : (
            <p className="inline-empty">
              {t(
                'Marks and feedback appear here after the first evaluated tutorial.',
                '完成首次辅导评价后，这里将显示评分与反馈。',
              )}
            </p>
          )}
          {!!notes.length && (
            <>
              <h4>{t('Latest feedback', '最近反馈')}</h4>
              <ul className="record-notes">
                {notes.map((b) => (
                  <li key={b.id}>
                    <div>
                      <strong>
                        {b.score} · {levelName(c, b.score)}
                      </strong>
                      <span>
                        {c.dateText(b.slot.startsAt, day)}
                        {completion(b) &&
                          ` · ${c.personName(completion(b)!.by)}`}
                      </span>
                    </div>
                    <p>{b.feedback}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <Empty
          icon={GraduationCap}
          title={t('No appointments yet', '暂无预约记录')}
          body={t(
            'Attendance, marks and feedback build up here after each tutorial.',
            '每次辅导结束后，出勤、评分与反馈会汇总在这里。',
          )}
        />
      )}
    </section>
  );
}

function AppointmentHistory({
  bookings,
  c,
}: {
  bookings: Booking[];
  c: RecordsContext;
}) {
  const { t } = c;
  const [filter, setFilter] = useState('all'),
    [page, setPage] = useState(1);
  const rows = bookings
    .filter(isAppointment)
    .sort((a, b) => b.slot.startsAt - a.slot.startsAt)
    .map((b) => {
      const kind = outcome(b, c.now);
      return {
        b,
        group: ['attended', 'absent', 'cancelled'].includes(kind)
          ? kind
          : 'active',
      };
    });
  const matching = rows.filter((r) => filter === 'all' || r.group === filter);
  const { pages, current, listed } = paged(matching, page, 10);
  const count = (group: string) => rows.filter((r) => r.group === group).length;
  return (
    <section className="panel records-panel">
      <div className="section-heading">
        <div>
          <h3>
            {t('Appointment history', '预约记录')}{' '}
            <span className="count">{rows.length}</span>
          </h3>
          <p>
            {t(
              'Every submitted booking and its result. Drafts are not included.',
              '全部已提交的预约及其结果，不含草稿。',
            )}
          </p>
        </div>
        <History size={19} />
      </div>
      {rows.length ? (
        <>
          <Filter
            label={t('Appointment filter', '预约筛选')}
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
            options={[
              ['all', t('All', '全部'), rows.length],
              [
                'active',
                t('Upcoming & active', '待进行 / 进行中'),
                count('active'),
              ],
              ['attended', t('Attended', '已参加'), count('attended')],
              ['absent', t('Absent', '缺席'), count('absent')],
              ['cancelled', t('Cancelled', '已取消'), count('cancelled')],
            ]}
          />
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  t('Tutorial', '辅导时间'),
                  t('Topic', '讨论主题'),
                  t('Status', '状态'),
                  t('Result', '结果'),
                ].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {listed.map(({ b }) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <SessionCell b={b} c={c} />
                  </TableCell>
                  <TableCell className="clamp-cell">
                    <span title={b.topic}>{b.topic || '—'}</span>
                  </TableCell>
                  <TableCell>
                    <Status value={b.status} t={t} />
                  </TableCell>
                  <TableCell>
                    <ResultCell b={b} c={c} />
                  </TableCell>
                </TableRow>
              ))}
              {!matching.length && (
                <TableRow>
                  <TableCell colSpan={4}>
                    {t('No matching appointments.', '没有符合条件的预约。')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Pager
            page={current}
            pages={pages}
            total={matching.length}
            label={t('Appointment history pagination', '预约记录分页')}
            onPage={setPage}
            t={t}
          />
        </>
      ) : (
        <Empty
          icon={History}
          title={t('No appointments yet', '暂无预约记录')}
          body={t(
            'Submitted bookings are listed here with their status and result.',
            '提交预约后，将在这里显示状态与结果。',
          )}
        />
      )}
    </section>
  );
}

export function StudentRecords({
  bookings,
  c,
}: {
  bookings: Booking[];
  c: RecordsContext;
}) {
  const summary = useMemo(
    () => studentSummary(bookings, c.settings, c.now),
    [bookings, c.settings, c.now],
  );
  return (
    <>
      <LearningProfile summary={summary} c={c} />
      <AppointmentHistory bookings={bookings} c={c} />
    </>
  );
}

function ApprovalHistory({
  records,
  summary,
  staffId,
  self,
  c,
}: {
  records: ApprovalRecord[];
  summary: StaffSummary;
  staffId: string;
  self: boolean;
  c: RecordsContext;
}) {
  const { t } = c;
  const [filter, setFilter] = useState('all'),
    [page, setPage] = useState(1);
  const group = (r: ApprovalRecord) =>
    r.mine
      ? 'mine'
      : r.kind === 'pending' || r.kind === 'automatic'
        ? r.kind
        : 'other';
  const matching = records.filter(
    (r) => filter === 'all' || group(r) === filter,
  );
  const { pages, current, listed } = paged(matching, page, 10);
  const count = (key: string) => records.filter((r) => group(r) === key).length;
  const personal = self
    ? t('Approved by you', '由你批准')
    : t('Approved personally', '本人批准');
  return (
    <section className="panel records-panel">
      <div className="section-heading">
        <div>
          <h3>
            {t('Approval history', '审批记录')}{' '}
            <span className="count">{records.length}</span>
          </h3>
          <p>
            {self
              ? t(
                  'Requests for your assigned sessions, how each was approved and its current status.',
                  '你所负责时段的预约申请、审批方式及当前状态。',
                )
              : t(
                  'Requests for this person’s assigned sessions, how each was approved and its current status.',
                  '此人所负责时段的预约申请、审批方式及当前状态。',
                )}
          </p>
        </div>
        <ClipboardCheck size={19} />
      </div>
      {records.length ? (
        <>
          <div className="record-figures">
            <Figure
              label={t('Awaiting approval', '待审批')}
              value={summary.pendingApproval}
              note={t('Approve before the start time', '须在开始前批准')}
            />
            <Figure
              label={personal}
              value={summary.approvedByMe}
              note={t('Requests on unstaffed slots', '未安排教师时段的申请')}
            />
            <Figure
              label={t('Approved automatically', '自动批准')}
              value={summary.autoApproved}
              note={t(
                'Staffed slots need no action',
                '已安排教师的时段无需操作',
              )}
            />
            <Figure
              label={t('Requests in total', '申请总数')}
              value={summary.requests}
              note={t('Drafts are not counted', '不含草稿')}
            />
          </div>
          <Filter
            label={t('Approval filter', '审批筛选')}
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
            options={[
              ['all', t('All', '全部'), records.length],
              ['pending', t('Awaiting approval', '待审批'), count('pending')],
              ['mine', personal, count('mine')],
              ['automatic', t('Automatic', '自动批准'), count('automatic')],
              ['other', t('Other', '其他'), count('other')],
            ]}
          />
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  t('Requested', '申请时间'),
                  t('Tutorial', '辅导时间'),
                  t('Student', '学生'),
                  t('Approval', '审批'),
                  t('Status', '状态'),
                ].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {listed.map((r) => (
                <TableRow key={r.booking.id}>
                  <TableCell>
                    {c.dateText(requestedAt(r.booking), moment)}
                  </TableCell>
                  <TableCell>
                    <SessionCell b={r.booking} c={c} />
                  </TableCell>
                  <TableCell>
                    <StudentCell b={r.booking} c={c} />
                  </TableCell>
                  <TableCell>
                    {approvalText(c, r, self ? staffId : '')}
                    {r.at !== null && (
                      <small className="table-sub">
                        {c.dateText(r.at, moment)}
                      </small>
                    )}
                  </TableCell>
                  <TableCell>
                    <Status value={r.booking.status} t={t} />
                  </TableCell>
                </TableRow>
              ))}
              {!matching.length && (
                <TableRow>
                  <TableCell colSpan={5}>
                    {t('No matching requests.', '没有符合条件的申请。')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Pager
            page={current}
            pages={pages}
            total={matching.length}
            label={t('Approval history pagination', '审批记录分页')}
            onPage={setPage}
            t={t}
          />
        </>
      ) : (
        <Empty
          icon={ClipboardCheck}
          title={t('No booking requests yet', '暂无预约申请')}
          body={t(
            'Requests for assigned sessions appear here with their approval and status.',
            '所负责时段收到预约申请后，将在这里显示审批情况与状态。',
          )}
        />
      )}
    </section>
  );
}

function GuidanceHistory({
  records,
  summary,
  self,
  c,
}: {
  records: GuidanceRecord[];
  summary: StaffSummary;
  self: boolean;
  c: RecordsContext;
}) {
  const { t } = c;
  const [filter, setFilter] = useState('all'),
    [page, setPage] = useState(1);
  const matching = records.filter((r) => filter === 'all' || r.kind === filter);
  const { pages, current, listed } = paged(matching, page, 10);
  const count = (kind: string) => records.filter((r) => r.kind === kind).length;
  return (
    <section className="panel records-panel">
      <div className="section-heading">
        <div>
          <h3>
            {t('Guidance history', '辅导记录')}{' '}
            <span className="count">{records.length}</span>
          </h3>
          <p>
            {self
              ? t(
                  'Tutorials you started or recorded, and started sessions in your pool that still need feedback.',
                  '由你开始或记录的辅导，以及你负责的时段中已开始但尚未记录反馈的辅导。',
                )
              : t(
                  'Tutorials this person started or recorded, and started sessions in their pool that still need feedback.',
                  '此人开始或记录的辅导，以及其负责的时段中已开始但尚未记录反馈的辅导。',
                )}
          </p>
        </div>
        <MessageSquare size={19} />
      </div>
      {records.length ? (
        <>
          <div className="record-figures">
            <Figure
              label={t('Tutorials guided', '已辅导次数')}
              value={summary.guided}
              note={t(
                `${summary.absences} absence(s) recorded`,
                `另记录缺席 ${summary.absences} 次`,
              )}
            />
            <Figure
              label={t('Students guided', '辅导学生数')}
              value={summary.students}
              note={t(
                `${summary.minutes} min in tutorials`,
                `辅导时长 ${summary.minutes} 分钟`,
              )}
            />
            <Figure
              label={t('Average mark given', '平均评分')}
              value={mark(summary.averageScore)}
              note={t('Across attended tutorials', '按已参加的辅导计算')}
            />
            <Figure
              label={t('Awaiting feedback', '待记录反馈')}
              value={summary.awaitingFeedback}
              note={t('Started, no outcome recorded', '已开始但尚未记录结果')}
            />
          </div>
          <Filter
            label={t('Guidance filter', '辅导筛选')}
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
            options={[
              ['all', t('All', '全部'), records.length],
              ['attended', t('Attended', '已参加'), count('attended')],
              ['absent', t('Absent', '缺席'), count('absent')],
              [
                'awaiting',
                t('Awaiting feedback', '待记录反馈'),
                count('awaiting'),
              ],
            ]}
          />
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  t('Tutorial', '辅导时间'),
                  t('Student', '学生'),
                  t('Topic', '讨论主题'),
                  t('Outcome', '结果'),
                  t('Feedback', '反馈'),
                ].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {listed.map(({ booking: b, kind }) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <SessionCell b={b} c={c} />
                  </TableCell>
                  <TableCell>
                    <StudentCell b={b} c={c} />
                  </TableCell>
                  <TableCell className="clamp-cell">
                    <span title={b.topic}>{b.topic || '—'}</span>
                  </TableCell>
                  <TableCell>
                    {kind === 'awaiting' ? (
                      <>
                        {t('Awaiting feedback', '待记录反馈')}
                        <small className="table-sub">
                          <Status value={b.status} t={t} />
                        </small>
                      </>
                    ) : (
                      <>
                        {b.score} · {levelName(c, b.score)}
                        <small className="table-sub">
                          {c.dateText(completion(b)!.at, moment)}
                        </small>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="clamp-cell">
                    <span title={b.feedback}>{b.feedback || '—'}</span>
                  </TableCell>
                </TableRow>
              ))}
              {!matching.length && (
                <TableRow>
                  <TableCell colSpan={5}>
                    {t('No matching tutorials.', '没有符合条件的辅导。')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Pager
            page={current}
            pages={pages}
            total={matching.length}
            label={t('Guidance history pagination', '辅导记录分页')}
            onPage={setPage}
            t={t}
          />
        </>
      ) : (
        <Empty
          icon={MessageSquare}
          title={t('No tutorials guided yet', '暂无辅导记录')}
          body={t(
            'A tutorial is added once it has been started or its feedback has been recorded.',
            '开始辅导或记录反馈后，辅导将显示在这里。',
          )}
        />
      )}
    </section>
  );
}

export function StaffRecords({
  staffId,
  bookings,
  self,
  c,
}: {
  staffId: string;
  bookings: Booking[];
  self: boolean;
  c: RecordsContext;
}) {
  const { approvals, guidance, summary } = useMemo(
    () => ({
      approvals: approvalRecords(bookings, staffId, c.settings, c.now),
      guidance: guidanceRecords(bookings, staffId, c.settings, c.now),
      summary: staffSummary(bookings, staffId, c.settings, c.now),
    }),
    [bookings, staffId, c.settings, c.now],
  );
  return (
    <>
      <ApprovalHistory
        records={approvals}
        summary={summary}
        staffId={staffId}
        self={self}
        c={c}
      />
      <GuidanceHistory records={guidance} summary={summary} self={self} c={c} />
    </>
  );
}

const roleNames: Record<Role, [string, string]> = {
  student: ['Student', '学生'],
  instructor: ['Instructor', '教师'],
  admin: ['Administrator', '管理员'],
  sysadmin: ['System Administrator', '系统管理员'],
};
type Person = { kind: 'student' | 'staff'; id: string };
export function Statistics({
  users,
  bookings,
  c,
}: {
  users: User[];
  bookings: Booking[];
  c: RecordsContext;
}) {
  const { t } = c;
  const [person, setPerson] = useState<Person | null>(null),
    [tab, setTab] = useState('students'),
    [scope, setScope] = useState('booked'),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1);
  const summary = useMemo(
    () => instituteSummary(bookings, c.settings, c.now),
    [bookings, c.settings, c.now],
  );
  const groups = useMemo(() => byStudent(bookings), [bookings]);
  const students = useMemo(
    () =>
      users
        .filter((u) => u.role === 'student' || groups.has(u.id))
        .map((user) => ({
          user,
          summary: studentSummary(groups.get(user.id) || [], c.settings, c.now),
        }))
        .sort(
          (a, b) =>
            b.summary.total - a.summary.total ||
            a.user.id.localeCompare(b.user.id),
        ),
    [users, groups, c.settings, c.now],
  );
  const staff = useMemo(() => {
    const actors = staffActors(bookings);
    // Former staff whose accounts were removed still own the records they made.
    const removed = [...actors].filter((id) => !users.some((u) => u.id === id));
    return [
      ...users
        .filter((u) => u.role !== 'student' || actors.has(u.id))
        .map((u) => ({ id: u.id, user: u as User | undefined })),
      ...removed.map((id) => ({ id, user: undefined })),
    ]
      .map((row) => ({
        ...row,
        summary: staffSummary(bookings, row.id, c.settings, c.now),
      }))
      .filter(
        (row) =>
          row.user?.role === 'instructor' ||
          row.summary.requests +
            row.summary.guided +
            row.summary.absences +
            row.summary.awaitingFeedback >
            0,
      )
      .sort(
        (a, b) =>
          b.summary.guided +
            b.summary.absences -
            (a.summary.guided + a.summary.absences) || a.id.localeCompare(b.id),
      );
  }, [users, bookings, c.settings, c.now]);
  const name = (id: string, user?: User) =>
    user ? c.displayName(user) : c.personName(id);
  if (person) {
    const user = users.find((u) => u.id === person.id);
    return (
      <>
        <PageHeading
          title={
            person.kind === 'student'
              ? t('Student records.', '学生档案。')
              : t('Teacher records.', '教师档案。')
          }
          description={
            person.kind === 'student'
              ? t(
                  'Appointment history and learning profile for one student.',
                  '查看一名学生的预约记录与学习档案。',
                )
              : t(
                  'Approval history and guidance history for one member of staff.',
                  '查看一名教师的审批记录与辅导记录。',
                )
          }
        >
          <button className="secondary" onClick={() => setPerson(null)}>
            <ArrowLeft size={16} />
            {t('Back to statistics', '返回数据统计')}
          </button>
        </PageHeading>
        <section className="panel record-person">
          <div className="profile-compact">
            <span className="avatar large">
              {name(person.id, user).slice(0, 1).toUpperCase()}
            </span>
            <div>
              <h3>{name(person.id, user)}</h3>
              <p>
                {user
                  ? t(...roleNames[user.role])
                  : t('Account removed', '账号已删除')}{' '}
                · {person.id}
              </p>
            </div>
            {user?.role === 'student' && (
              <span className="subtle-chip">
                {user.profile.grade} · {user.profile.adminClass || '—'} ·{' '}
                {user.profile.teachingClass ||
                  t('Unassigned Teaching Class', '未分配教学班级')}
              </span>
            )}
          </div>
        </section>
        {person.kind === 'student' ? (
          <StudentRecords bookings={groups.get(person.id) || []} c={c} />
        ) : (
          <StaffRecords
            staffId={person.id}
            bookings={bookings}
            self={false}
            c={c}
          />
        )}
      </>
    );
  }
  const matching = students.filter(
    (row) =>
      (scope === 'all' || row.summary.total > 0) &&
      `${row.user.id} ${row.user.profile.chineseName} ${row.user.profile.englishName} ${row.user.profile.adminClass} ${row.user.profile.teachingClass}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const { pages, current, listed } = paged(matching, page, 50);
  const evaluatedCount = summary.attended + summary.absent;
  return (
    <>
      <PageHeading
        title={t('Every tutorial, in numbers.', '每一次辅导，都有记录。')}
        description={t(
          'Appointments, approvals, attendance and feedback for every student and teacher.',
          '查看全体学生与教师的预约、审批、出勤与反馈。',
        )}
      />
      <div className="stats-grid statistics-grid">
        <Stat
          icon={CalendarDays}
          value={summary.total}
          label={t('Appointments', '预约总数')}
          note={t(
            `${summary.students} students · ${summary.active} active`,
            `${summary.students} 名学生 · ${summary.active} 个有效预约`,
          )}
        />
        <Stat
          icon={CheckCircle2}
          value={summary.attended}
          label={t('Tutorials attended', '已参加辅导')}
          note={t(
            `${summary.absent} absence(s) · ${summary.cancelled} cancelled`,
            `缺席 ${summary.absent} 次 · 取消 ${summary.cancelled} 次`,
          )}
        />
        <Stat
          icon={UserCheck}
          value={percent(summary.attendanceRate)}
          label={t('Attendance rate', '出勤率')}
          note={t(
            `${summary.attended} of ${evaluatedCount} evaluated tutorials`,
            `已评价 ${evaluatedCount} 次，出勤 ${summary.attended} 次`,
          )}
        />
        <Stat
          icon={GraduationCap}
          value={mark(summary.averageScore)}
          label={t('Average mark', '平均评分')}
          note={t('Across attended tutorials', '按已参加的辅导计算')}
        />
        <Stat
          icon={ClipboardCheck}
          value={summary.approvals.pending}
          label={t('Awaiting approval', '待审批')}
          note={t(
            `${summary.approvals.expired} passed their start unapproved`,
            `${summary.approvals.expired} 个已过开始时间仍未批准`,
          )}
        />
        <Stat
          icon={Clock3}
          value={summary.awaitingFeedback}
          label={t('Awaiting feedback', '待记录反馈')}
          note={t('Started, no outcome recorded', '已开始但尚未记录结果')}
        />
      </div>
      <div className="statistics-breakdown">
        <section className="panel records-panel">
          <h4>{t('Appointments by status', '预约状态分布')}</h4>
          <Bars
            rows={summary.statuses.map((s) => ({
              key: s.status,
              label: t(...labels[s.status]),
              count: s.count,
            }))}
          />
        </section>
        <section className="panel records-panel">
          <h4>{t('How requests were approved', '审批方式分布')}</h4>
          <Bars
            rows={[
              {
                key: 'automatic',
                label: t('Approved automatically', '自动批准'),
                count: summary.approvals.automatic,
              },
              {
                key: 'manual',
                label: t('Approved by staff', '教师或管理员批准'),
                count: summary.approvals.manual,
              },
              {
                key: 'pending',
                label: t('Awaiting approval', '待审批'),
                count: summary.approvals.pending,
              },
              {
                key: 'expired',
                label: t('Not approved before the start', '开始前未获批准'),
                count: summary.approvals.expired,
              },
              {
                key: 'withdrawn',
                label: t('Cancelled before approval', '审批前已取消'),
                count: summary.approvals.withdrawn,
              },
            ]}
          />
        </section>
        <section className="panel records-panel">
          <h4>{t('Evaluations recorded', '评价分布')}</h4>
          <Bars rows={levelRows(c, summary.levels)} />
        </section>
      </div>
      <section className="panel records-panel">
        <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
          <TabsList className="meeting-tabs">
            <TabsTrigger value="students">
              {t('Students', '学生')}{' '}
              <span className="count">{students.length}</span>
            </TabsTrigger>
            <TabsTrigger value="staff">
              {t('Teachers', '教师')}{' '}
              <span className="count">{staff.length}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="students">
            <div className="section-heading">
              <div>
                <h3>{t('Student records', '学生记录')}</h3>
                <p>
                  {t(
                    'Open a student to see their appointment history and learning profile.',
                    '打开一名学生，查看其预约记录与学习档案。',
                  )}
                </p>
              </div>
              <input
                className="search"
                aria-label={t('Search students', '搜索学生')}
                placeholder={t(
                  'Search name, ID or class…',
                  '搜索姓名、账号或班级…',
                )}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Filter
              label={t('Student filter', '学生筛选')}
              value={scope}
              onChange={(value) => {
                setScope(value);
                setPage(1);
              }}
              options={[
                [
                  'booked',
                  t('With appointments', '有预约记录'),
                  students.filter((row) => row.summary.total > 0).length,
                ],
                ['all', t('All students', '全部学生'), students.length],
              ]}
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Student', '学生')}</TableHead>
                  <TableHead>{t('Class', '班级')}</TableHead>
                  {[
                    t('Appointments', '预约'),
                    t('Attended', '已参加'),
                    t('Absent', '缺席'),
                    t('Cancelled', '已取消'),
                    t('Attendance', '出勤率'),
                    t('Average mark', '平均评分'),
                  ].map((h) => (
                    <TableHead key={h} className="numeric">
                      {h}
                    </TableHead>
                  ))}
                  <TableHead>{t('Latest appointment', '最近预约')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listed.map(({ user, summary: s }) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <button
                        className="text-button"
                        aria-label={t(
                          `Open records for ${user.id}`,
                          `打开 ${user.id} 的档案`,
                        )}
                        onClick={() =>
                          setPerson({ kind: 'student', id: user.id })
                        }
                      >
                        {c.displayName(user)}
                      </button>
                      <small className="table-sub">{user.id}</small>
                    </TableCell>
                    <TableCell>
                      {user.profile.adminClass || '—'}
                      <small className="table-sub">
                        {user.role === 'student'
                          ? user.profile.teachingClass ||
                            t('Unassigned Teaching Class', '未分配教学班级')
                          : t(...roleNames[user.role])}
                      </small>
                    </TableCell>
                    <TableCell className="numeric">{s.total}</TableCell>
                    <TableCell className="numeric">{s.attended}</TableCell>
                    <TableCell className="numeric">{s.absent}</TableCell>
                    <TableCell className="numeric">{s.cancelled}</TableCell>
                    <TableCell className="numeric">
                      {percent(s.attendanceRate)}
                    </TableCell>
                    <TableCell className="numeric">
                      {mark(s.averageScore)}
                    </TableCell>
                    <TableCell>
                      {s.latest === null ? '—' : c.dateText(s.latest, day)}
                    </TableCell>
                  </TableRow>
                ))}
                {!matching.length && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      {t('No matching students.', '没有匹配的学生。')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <Pager
              page={current}
              pages={pages}
              total={matching.length}
              label={t('Student records pagination', '学生记录分页')}
              onPage={setPage}
              t={t}
            />
          </TabsContent>
          <TabsContent value="staff">
            <div className="section-heading">
              <div>
                <h3>{t('Teacher records', '教师记录')}</h3>
                <p>
                  {t(
                    'Open a teacher to see their approval history and guidance history. Other accounts appear once they approve or record a tutorial.',
                    '打开一名教师，查看其审批记录与辅导记录。其他账号在审批或记录辅导后也会显示在此。',
                  )}
                </p>
              </div>
              <Users size={19} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Teacher', '教师')}</TableHead>
                  {[
                    t('Requests', '申请'),
                    t('Awaiting approval', '待审批'),
                    t('Approved personally', '本人批准'),
                    t('Tutorials guided', '已辅导'),
                    t('Absences recorded', '记录缺席'),
                    t('Students', '学生数'),
                    t('Average mark', '平均评分'),
                    t('Awaiting feedback', '待记录反馈'),
                  ].map((h) => (
                    <TableHead key={h} className="numeric">
                      {h}
                    </TableHead>
                  ))}
                  <TableHead>{t('Latest tutorial', '最近辅导')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map(({ id, user, summary: s }) => (
                  <TableRow key={id}>
                    <TableCell>
                      <button
                        className="text-button"
                        aria-label={t(
                          `Open records for ${id}`,
                          `打开 ${id} 的档案`,
                        )}
                        onClick={() => setPerson({ kind: 'staff', id })}
                      >
                        {name(id, user)}
                      </button>
                      <small className="table-sub">
                        {id} ·{' '}
                        {user
                          ? t(...roleNames[user.role])
                          : t('Account removed', '账号已删除')}
                      </small>
                    </TableCell>
                    <TableCell className="numeric">{s.requests}</TableCell>
                    <TableCell className="numeric">
                      {s.pendingApproval}
                    </TableCell>
                    <TableCell className="numeric">{s.approvedByMe}</TableCell>
                    <TableCell className="numeric">{s.guided}</TableCell>
                    <TableCell className="numeric">{s.absences}</TableCell>
                    <TableCell className="numeric">{s.students}</TableCell>
                    <TableCell className="numeric">
                      {mark(s.averageScore)}
                    </TableCell>
                    <TableCell className="numeric">
                      {s.awaitingFeedback}
                    </TableCell>
                    <TableCell>
                      {s.latest === null ? '—' : c.dateText(s.latest, day)}
                    </TableCell>
                  </TableRow>
                ))}
                {!staff.length && (
                  <TableRow>
                    <TableCell colSpan={10}>
                      {t('No teacher records yet.', '暂无教师记录。')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </section>
    </>
  );
}
