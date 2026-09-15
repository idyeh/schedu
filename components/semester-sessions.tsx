'use client';
import { useMemo, useState } from 'react';
import { Choice } from '@/components/choice';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  activeStatuses,
  addDays,
  chinaDate,
  paginationItems,
  slotsInRange,
  validDate,
} from '@/lib/model';
import type { Settings, Booking } from '@/lib/model';
type T = (en: string, zh: string) => string;
export function SemesterSessions({
  settings,
  bookings,
  staff,
  now,
  t,
  busy,
  error,
  onDelete,
}: {
  settings: Settings;
  bookings: Booking[];
  staff: { id: string; name: string }[];
  now: number;
  t: T;
  busy: boolean;
  error: string;
  onDelete: (input: {
    from: string;
    to: string;
    ids: string[];
  }) => Promise<{ removed: number; kept: number } | null>;
}) {
  const [from, setFrom] = useState(settings.semesterStart || chinaDate(now));
  const [to, setTo] = useState(
    settings.semesterEnd || addDays(chinaDate(now), 365),
  );
  const [weekday, setWeekday] = useState('all'),
    [room, setRoom] = useState('all');
  const [instructor, setInstructor] = useState('all'),
    [windowId, setWindowId] = useState('all');
  const [page, setPage] = useState(1),
    [jump, setJump] = useState('1');
  const [selected, setSelected] = useState<string[]>([]),
    [review, setReview] = useState(false);
  const [result, setResult] = useState<{
    removed: number;
    kept: number;
  } | null>(null);
  const rangeValid =
    validDate(from) &&
    validDate(to) &&
    to >= from &&
    Date.parse(to) - Date.parse(from) <= 365 * 86400000;
  const slots = useMemo(
    () =>
      rangeValid
        ? slotsInRange(settings, from, to).filter(
            (s) =>
              (weekday === 'all' ||
                String(new Date(s.date + 'T12:00:00Z').getUTCDay()) ===
                  weekday) &&
              (room === 'all' || s.location === room) &&
              (instructor === 'all' || s.instructors.includes(instructor)) &&
              (windowId === 'all' || s.windowId === windowId),
          )
        : [],
    [settings, from, to, rangeValid, weekday, room, instructor, windowId],
  );
  const occupied = new Map<string, number>();
  for (const booking of bookings)
    if (activeStatuses.includes(booking.status))
      occupied.set(booking.slot.id, (occupied.get(booking.slot.id) || 0) + 1);
  const selectedIds = new Set(selected);
  const chosen = slots.filter((s) => selectedIds.has(s.id));
  const kept = chosen.filter((s) => occupied.has(s.id)).length;
  const pages = Math.max(1, Math.ceil(slots.length / 50)),
    current = Math.min(page, pages);
  const listed = slots.slice((current - 1) * 50, current * 50);
  const days = t(
    'Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday',
    '星期日,星期一,星期二,星期三,星期四,星期五,星期六',
  ).split(',');
  function changed() {
    setSelected([]);
    setPage(1);
    setJump('1');
    setResult(null);
  }
  function go(next: number) {
    const value = Math.max(1, Math.min(pages, next));
    setPage(value);
    setJump(String(value));
  }
  return (
    <section className="panel admin-panel semester-sessions">
      <h3>{t('All semester sessions', '学期全部时段')}</h3>
      <p className="muted">
        {t(
          'Review the entire semester, including dates beyond the booking horizon. Filters apply before selection; select all matching sessions across every page.',
          '查看整个学期，包括尚未开放预约的日期。先筛选，再选择；可一次选中所有分页中符合条件的时段。',
        )}
      </p>
      <div className="schedule-filters">
        <label>
          {t('From date', '起始日期')}
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              changed();
            }}
          />
        </label>
        <label>
          {t('To date', '结束日期')}
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              changed();
            }}
          />
        </label>
        <label>
          {t('Weekday', '星期')}
          <Choice
            label={t('Filter weekday', '筛选星期')}
            value={weekday}
            onChange={(v) => {
              setWeekday(v);
              changed();
            }}
            options={[
              { value: 'all', label: t('All weekdays', '全部星期') },
              ...days.map((label, i) => ({ value: String(i), label })),
            ]}
          />
        </label>
        <label>
          {t('Classroom', '教室')}
          <Choice
            label={t('Filter classroom', '筛选教室')}
            value={room}
            onChange={(v) => {
              setRoom(v);
              changed();
            }}
            options={[
              { value: 'all', label: t('All classrooms', '全部教室') },
              ...settings.classrooms.map((value) => ({ value, label: value })),
            ]}
          />
        </label>
        <label>
          {t('Instructor', '教师')}
          <Choice
            label={t('Filter instructor', '筛选教师')}
            value={instructor}
            onChange={(v) => {
              setInstructor(v);
              changed();
            }}
            options={[
              { value: 'all', label: t('All instructors', '全部教师') },
              ...staff.map((s) => ({
                value: s.id,
                label: `${s.name} · ${s.id}`,
              })),
            ]}
          />
        </label>
        <label>
          {t('Teaching window', '辅导时间范围')}
          <Choice
            label={t('Filter teaching window', '筛选时间范围')}
            value={windowId}
            onChange={(v) => {
              setWindowId(v);
              changed();
            }}
            options={[
              {
                value: 'all',
                label: t(
                  'All windows and one-off slots',
                  '全部时间范围与单次时段',
                ),
              },
              ...settings.windows.map((w) => ({
                value: w.id,
                label: `${days[w.day]} ${w.start}–${w.end} · ${w.location}`,
              })),
            ]}
          />
        </label>
      </div>
      <div className="admin-toolbar">
        <button
          className="secondary"
          onClick={() => {
            setFrom(settings.semesterStart || chinaDate(now));
            setTo(settings.semesterEnd || addDays(chinaDate(now), 365));
            changed();
          }}
        >
          {t('Entire semester', '整个学期')}
        </button>
        <button
          className="secondary"
          disabled={!slots.length || busy}
          onClick={() => setSelected(slots.map((s) => s.id))}
        >
          {t(
            `Select all ${slots.length} matching ${slots.length === 1 ? 'session' : 'sessions'}`,
            `选中全部 ${slots.length} 个匹配时段`,
          )}
        </button>
        <button
          className="text-button"
          disabled={!chosen.length || busy}
          onClick={() => setSelected([])}
        >
          {t('Clear selection', '取消选择')}
        </button>
        <button
          className="danger"
          disabled={!chosen.length || busy}
          onClick={() => {
            setResult(null);
            setReview(true);
          }}
        >
          {t('Review removal', '预览批量移除')}
        </button>
      </div>
      <p className="footnote">
        {t(
          `${chosen.length} selected · Booked sessions to keep: ${kept}.`,
          `已选 ${chosen.length} 个时段 · 将保留 ${kept} 个已有预约的时段。`,
        )}
      </p>
      {!rangeValid && (
        <p className="message error" role="alert">
          {t(
            'Choose a valid date range of up to 366 days.',
            '请选择有效的日期范围，最多 366 天。',
          )}
        </p>
      )}
      {result && (
        <output className="message">
          {t(
            `Sessions removed: ${result.removed}. Booked sessions kept: ${result.kept}.`,
            `已移除 ${result.removed} 个时段，保留 ${result.kept} 个已有预约的时段。`,
          )}
        </output>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Checkbox
                aria-label={t('Select this page', '选中本页')}
                checked={
                  listed.length > 0 &&
                  listed.every((s) => selectedIds.has(s.id))
                }
                disabled={!listed.length || busy}
                onCheckedChange={(checked) =>
                  setSelected(
                    checked
                      ? [...new Set([...selected, ...listed.map((s) => s.id)])]
                      : selected.filter(
                          (id) => !listed.some((s) => s.id === id),
                        ),
                  )
                }
              />
            </TableHead>
            {[
              t('Date / weekday', '日期 / 星期'),
              t('Time', '时间'),
              t('Classroom / instructors', '教室 / 教师'),
              t('Bookings', '预约'),
            ].map((label) => (
              <TableHead key={label}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {listed.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <Checkbox
                  aria-label={t(
                    `Select ${s.date} ${s.start} ${s.location}`,
                    `选择 ${s.date} ${s.start} ${s.location}`,
                  )}
                  checked={selectedIds.has(s.id)}
                  disabled={busy}
                  onCheckedChange={(checked) =>
                    setSelected(
                      checked
                        ? [...selected, s.id]
                        : selected.filter((id) => id !== s.id),
                    )
                  }
                />
              </TableCell>
              <TableCell>
                {s.date}
                <small className="table-sub">
                  {days[new Date(s.date + 'T12:00:00Z').getUTCDay()]}
                </small>
              </TableCell>
              <TableCell>
                {s.start}–{s.end}
                <small className="table-sub">
                  {s.windowId
                    ? t('Recurring', '每周重复')
                    : t('One-off', '单次安排')}
                </small>
              </TableCell>
              <TableCell>
                {s.location}
                <small className="table-sub">
                  {s.instructors
                    .map((id) => staff.find((p) => p.id === id)?.name || id)
                    .join(' / ') || t('Unassigned', '未安排教师')}
                </small>
              </TableCell>
              <TableCell>
                {occupied.has(s.id)
                  ? t(
                      `${occupied.get(s.id)} booking(s) · kept`,
                      `${occupied.get(s.id)} 个预约 · 保留`,
                    )
                  : t('No active bookings', '无有效预约')}
              </TableCell>
            </TableRow>
          ))}
          {!listed.length && (
            <TableRow>
              <TableCell colSpan={5}>
                {t(
                  'No sessions match these filters.',
                  '没有符合筛选条件的时段。',
                )}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <nav
        className="roster-pagination"
        aria-label={t('Semester sessions pagination', '学期时段分页')}
      >
        <div className="admin-toolbar">
          <button
            className="secondary"
            disabled={current === 1}
            onClick={() => go(1)}
          >
            {t('First', '首页')}
          </button>
          <button
            className="secondary"
            disabled={current === 1}
            onClick={() => go(current - 1)}
          >
            {t('Previous', '上一页')}
          </button>
          {paginationItems(current, pages).map((p, i) =>
            p === 'ellipsis' ? (
              <span key={`gap${i}`}>…</span>
            ) : (
              <button
                key={p}
                className={p === current ? 'primary' : 'secondary'}
                aria-current={p === current ? 'page' : undefined}
                onClick={() => go(p)}
              >
                {p}
              </button>
            ),
          )}
          <button
            className="secondary"
            disabled={current === pages}
            onClick={() => go(current + 1)}
          >
            {t('Next', '下一页')}
          </button>
          <button
            className="secondary"
            disabled={current === pages}
            onClick={() => go(pages)}
          >
            {t('Last', '末页')}
          </button>
        </div>
        <form
          className="admin-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            if (Number.isInteger(Number(jump))) go(Number(jump));
          }}
        >
          <label>
            {t(
              `Page ${current} of ${pages} · Go to page`,
              `第 ${current} / ${pages} 页 · 跳转至`,
            )}
            <input
              className="page-jump"
              type="number"
              min={1}
              max={pages}
              required
              value={jump}
              onChange={(e) => setJump(e.target.value)}
            />
          </label>
          <button className="secondary">{t('Go', '跳转')}</button>
        </form>
      </nav>
      <Dialog open={review} onOpenChange={(open) => !busy && setReview(open)}>
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>
              {t('Remove selected sessions?', '移除选中的时段？')}
            </DialogTitle>
            <DialogDescription>
              {chosen[0]?.date} – {chosen.at(-1)?.date}
            </DialogDescription>
          </DialogHeader>
          <p>
            {t(
              `Unbooked sessions to remove: ${chosen.length - kept}. Booked sessions to keep: ${kept}.`,
              `将移除 ${chosen.length - kept} 个无预约时段，保留 ${kept} 个已有预约的时段。`,
            )}
          </p>
          <p className="muted">
            {t(
              'Removed recurring dates stay closed. Teaching windows and all meeting records remain. Students receive no cancellation penalty.',
              '移除的重复时段将保持关闭，辅导时间范围和全部预约记录会保留，学生不会受到取消预约限制。',
            )}
          </p>
          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setReview(false)}
            >
              {t('Cancel', '取消')}
            </button>
            <button
              className="danger"
              disabled={busy || chosen.length === kept}
              onClick={async () => {
                const response = await onDelete({
                  from,
                  to,
                  ids: chosen.map((s) => s.id),
                });
                if (response) {
                  setResult(response);
                  setPage(1);
                  setJump('1');
                  setSelected([]);
                  setReview(false);
                }
              }}
            >
              {t(
                `Remove ${chosen.length - kept} ${chosen.length - kept === 1 ? 'session' : 'sessions'}`,
                `移除 ${chosen.length - kept} 个时段`,
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
