'use client';
import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { canManageAccount, isSysadmin } from '@/lib/permissions';
import { Choice } from '@/components/choice';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  clientId,
  accountStatus,
  paginationItems,
  chinaDate,
  timetableWindows,
  validateSettings,
} from '@/lib/model';
import type { User, Settings, Slot, SlotOverride, Window } from '@/lib/model';
type T = (en: string, zh: string) => string;
type Staff = { id: string; name: string }[];
function Download({
  name,
  text,
  children,
}: {
  name: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <button
      className="secondary"
      onClick={() => {
        const url = URL.createObjectURL(
          new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' }),
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      {children}
    </button>
  );
}
export function UserManager({
  actor,
  users,
  now,
  t,
  busy,
  error,
  act,
  renderProfile,
}: {
  actor: User;
  users: User[];
  now: number;
  t: T;
  busy: boolean;
  error: string;
  act: (b: Record<string, unknown>) => Promise<unknown>;
  renderProfile: (u: User, done: () => void) => ReactNode;
}) {
  const [query, setQuery] = useState(''),
    [selected, setSelected] = useState<string[]>([]),
    [operation, setOperation] = useState('resetPassword'),
    [confirm, setConfirm] = useState<{
      ids: string[];
      operation: string;
    } | null>(null),
    [editing, setEditing] = useState<User | null>(null),
    [page, setPage] = useState(0),
    [jumpPage, setJumpPage] = useState(''),
    [statusFilter, setStatusFilter] = useState('all');
  const matching = users.filter((u) =>
    `${u.id} ${u.profile.chineseName} ${u.profile.englishName} ${u.profile.adminClass}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const visible = matching.filter(
    (u) => statusFilter === 'all' || accountStatus(u, now) === statusFilter,
  );
  const pausedSelected = selected.filter((id) =>
    users.some((u) => u.id === id && accountStatus(u, now) === 'paused'),
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  const pageUsers = visible.slice(currentPage * 50, (currentPage + 1) * 50);
  const eligible = pageUsers
    .filter((u) => canManageAccount(actor.role, u.role))
    .map((u) => u.id);
  const names: Record<string, string> = {
    resetPassword: t('Reset passwords', '重置密码'),
    student: t('Set role: student', '设为学生'),
    instructor: t('Set role: instructor', '设为教师'),
    ...(isSysadmin(actor.role)
      ? { admin: t('Grant admin access', '授予管理员权限') }
      : {}),
    delete: t('Delete accounts', '删除账号'),
    liftBookingPause: t('Lift booking pause', '解除预约暂停'),
  };
  return (
    <section className="panel users-panel">
      <div className="section-heading">
        <h3>
          {t('All accounts', '全部账号')}{' '}
          <span className="count">{users.length}</span>
        </h3>
        <input
          className="search"
          aria-label={t('Search accounts', '搜索账号')}
          placeholder={t('Search name, ID or class…', '搜索姓名、账号或班级…')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </div>
      <ToggleGroup
        className="account-status-toggle"
        aria-label={t('Account status filter', '账号状态筛选')}
        value={[statusFilter]}
        onValueChange={(values) => {
          if (values.length) {
            setStatusFilter(String(values[0]));
            setPage(0);
            setJumpPage('');
            setSelected([]);
          }
        }}
      >
        {[
          ['all', t('All accounts', '全部账号')],
          ['paused', t('Booking paused', '预约暂停')],
          ['active', t('Active', '正常')],
          ['pending', t('First login pending', '待首次登录')],
        ].map(([value, label]) => (
          <ToggleGroupItem key={value} value={value}>
            {label}{' '}
            <span className="count">
              {value === 'all'
                ? matching.length
                : matching.filter((u) => accountStatus(u, now) === value)
                    .length}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="admin-toolbar">
        <span>
          {t(
            `${selected.length} selected (maximum 100)`,
            `已选 ${selected.length} 个（最多 100 个）`,
          )}
        </span>
        <Choice
          label={t('Bulk action', '批量操作')}
          value={operation}
          onChange={setOperation}
          disabled={busy}
          options={Object.entries(names).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        <button
          className="secondary"
          disabled={
            busy ||
            !selected.length ||
            selected.length > 100 ||
            (operation === 'liftBookingPause' && !pausedSelected.length)
          }
          onClick={() =>
            setConfirm({
              ids: operation === 'liftBookingPause' ? pausedSelected : selected,
              operation,
            })
          }
        >
          {t('Apply to selected', '应用到所选账号')}
        </button>
        {!!selected.length && (
          <button className="text-button" onClick={() => setSelected([])}>
            {t('Clear selection', '取消选择')}
          </button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Checkbox
                aria-label={t('Select visible accounts', '选择当前筛选的账号')}
                checked={
                  eligible.length > 0 &&
                  eligible.every((id) => selected.includes(id))
                }
                onCheckedChange={(v) =>
                  setSelected(
                    v
                      ? Array.from(new Set([...selected, ...eligible])).slice(
                          0,
                          100,
                        )
                      : selected.filter((id) => !eligible.includes(id)),
                  )
                }
              />
            </TableHead>
            {[
              t('Name / ID', '姓名 / 账号'),
              t('Entry year / class', '加入年份 / 班级'),
              t('Role', '角色'),
              t('Account', '账号状态'),
              t('Actions', '操作'),
            ].map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageUsers.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                {canManageAccount(actor.role, u.role) && (
                  <Checkbox
                    aria-label={t(`Select ${u.id}`, `选择 ${u.id}`)}
                    checked={selected.includes(u.id)}
                    disabled={
                      !selected.includes(u.id) && selected.length >= 100
                    }
                    onCheckedChange={(v) =>
                      setSelected(
                        v
                          ? [...selected, u.id]
                          : selected.filter((id) => id !== u.id),
                      )
                    }
                  />
                )}
              </TableCell>
              <TableCell>
                <strong>
                  {u.profile.chineseName} {u.profile.englishName}
                </strong>
                <small className="table-sub">{u.id}</small>
              </TableCell>
              <TableCell>
                {u.role === 'student' ? (
                  <>
                    {u.profile.grade}
                    <small className="table-sub">
                      {u.profile.adminClass || '—'} ·{' '}
                      {u.profile.teachingClass ||
                        t('Unassigned Teaching Class', '未分配教学班级')}
                    </small>
                  </>
                ) : (
                  u.profile.grade || '—'
                )}
              </TableCell>
              <TableCell>
                <Choice
                  label={t(`Role for ${u.id}`, `${u.id} 的角色`)}
                  value={u.role}
                  disabled={busy || !canManageAccount(actor.role, u.role)}
                  onChange={(role) =>
                    setConfirm({ ids: [u.id], operation: role })
                  }
                  options={[
                    {
                      value: 'student',
                      label: t('Student', '学生'),
                    },
                    {
                      value: 'instructor',
                      label: t('Instructor', '教师'),
                    },
                    ...(isSysadmin(actor.role) || u.role === 'admin'
                      ? [
                          {
                            value: 'admin',
                            label: t('Administrator', '管理员'),
                          },
                        ]
                      : []),
                    ...(u.role === 'sysadmin'
                      ? [
                          {
                            value: 'sysadmin',
                            label: t('System Administrator', '系统管理员'),
                          },
                        ]
                      : []),
                  ]}
                />
                {u.role === 'sysadmin' && (
                  <small className="table-sub">
                    {t('System owner · protected', '唯一系统管理员 · 受保护')}
                  </small>
                )}
              </TableCell>
              <TableCell>
                {accountStatus(u, now) === 'paused'
                  ? t('Booking paused', '预约暂停')
                  : accountStatus(u, now) === 'pending'
                    ? t('First login pending', '待首次登录')
                    : t('Active', '正常')}
              </TableCell>
              <TableCell>
                {canManageAccount(actor.role, u.role) && (
                  <div className="admin-toolbar">
                    <button
                      className="text-button"
                      onClick={() => setEditing(u)}
                    >
                      {t('Edit', '编辑')}
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        setConfirm({ ids: [u.id], operation: 'resetPassword' })
                      }
                    >
                      {t('Reset password', '重置密码')}
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        setConfirm({ ids: [u.id], operation: 'delete' })
                      }
                    >
                      {t('Delete', '删除')}
                    </button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!visible.length && (
            <TableRow>
              <TableCell colSpan={6}>
                {t('No matching accounts.', '没有匹配的账号。')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="people-pagination">
        <p aria-live="polite">
          {t(
            `${visible.length} accounts · Page ${currentPage + 1} of ${pageCount}`,
            `${visible.length} 个账号 · 第 ${currentPage + 1} / ${pageCount} 页`,
          )}
        </p>
        <Pagination aria-label={t('Roster pagination', '名单分页')}>
          <PaginationContent className="roster-pagination-controls">
            <PaginationItem>
              <button
                className="page-button"
                aria-label={t('First page', '第一页')}
                disabled={currentPage === 0}
                onClick={() => setPage(0)}
              >
                {t('First', '首页')}
              </button>
            </PaginationItem>
            <PaginationItem>
              <button
                className="page-button"
                aria-label={t('Previous page', '上一页')}
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                {t('Previous', '上一页')}
              </button>
            </PaginationItem>
            {paginationItems(currentPage + 1, pageCount).map((item, i) => (
              <PaginationItem key={`${item}-${i}`}>
                {item === 'ellipsis' ? (
                  <span className="page-ellipsis" aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    className="page-button"
                    aria-current={item === currentPage + 1 ? 'page' : undefined}
                    aria-label={t(`Page ${item}`, `第 ${item} 页`)}
                    onClick={() => setPage(item - 1)}
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
                disabled={currentPage + 1 >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                {t('Next', '下一页')}
              </button>
            </PaginationItem>
            <PaginationItem>
              <button
                className="page-button"
                aria-label={t('Last page', '最后一页')}
                disabled={currentPage + 1 >= pageCount}
                onClick={() => setPage(pageCount - 1)}
              >
                {t('Last', '末页')}
              </button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
        <form
          className="page-jump"
          onSubmit={(e) => {
            e.preventDefault();
            const target = Number(jumpPage);
            if (
              Number.isInteger(target) &&
              target >= 1 &&
              target <= pageCount
            ) {
              setPage(target - 1);
              setJumpPage('');
            }
          }}
        >
          <label>
            {t('Go to page', '跳转到页')}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={pageCount}
              step={1}
              required
              value={jumpPage}
              placeholder={String(currentPage + 1)}
              onChange={(e) => setJumpPage(e.target.value)}
            />
          </label>
          <button className="secondary" disabled={!jumpPage}>
            {t('Go', '跳转')}
          </button>
        </form>
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>{t('Edit account', '编辑账号')}</DialogTitle>
            <DialogDescription>{editing?.id}</DialogDescription>
          </DialogHeader>
          {editing && renderProfile(editing, () => setEditing(null))}
          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>{confirm && names[confirm.operation]}</DialogTitle>
            <DialogDescription>
              {confirm?.operation === 'liftBookingPause'
                ? t(
                    'Only the selected students whose bookings are paused will have the restriction lifted. Their passwords and meeting records stay the same.',
                    '仅解除所选学生的预约暂停限制，密码和预约记录保持不变。',
                  )
                : confirm?.operation === 'admin'
                  ? t(
                      'This grants full access to accounts, rosters, bookings and all settings. The account will be signed out so its permissions can refresh.',
                      '将授予账号、名单、预约及全部设置的管理权限。该账号会退出登录以刷新权限。',
                    )
                  : confirm?.operation === 'resetPassword'
                    ? t(
                        'Current passwords will stop working and selected users will be signed out. New random passwords will be shown for download.',
                        '当前密码将失效，所选用户会退出登录。新随机密码将显示并可下载。',
                      )
                    : t(
                        'The whole selection is checked before saving. Changing an admin to student or instructor revokes admin access. Role changes sign users out. The last admin must remain; accounts with meeting records or teaching assignments cannot be deleted.',
                        '保存前会检查全部所选账号。将管理员设为学生或教师即撤销管理权限，修改角色后用户会退出登录。必须保留一位管理员，有预约记录或辅导安排的账号不可删除。',
                      )}
            </DialogDescription>
          </DialogHeader>
          <p>{confirm?.ids.join(', ')}</p>
          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              {t('Cancel', '取消')}
            </button>
            <button
              className={confirm?.operation === 'delete' ? 'danger' : 'primary'}
              disabled={busy}
              onClick={async () => {
                if (
                  confirm &&
                  (await act({ action: 'bulkUsers', ...confirm }))
                ) {
                  setSelected([]);
                  setConfirm(null);
                }
              }}
            >
              {t('Confirm', '确认')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
export function TimetableImport({
  settings,
  staff,
  t,
  busy,
  onSave,
}: {
  settings: Settings;
  staff: Staff;
  t: T;
  busy: boolean;
  onSave: (s: Settings) => Promise<unknown>;
}) {
  const [rows, setRows] = useState<Window[] | null>(null),
    [error, setError] = useState('');
  return (
    <section className="panel admin-panel">
      <h3>{t('Import weekly timetable', '导入每周课表')}</h3>
      <p className="muted">
        {t(
          'One row per teaching window. Use instructor account IDs, separated by semicolons. Day accepts Monday–Sunday, 0–6 (Sunday = 0), or 星期一–星期日. The location column must match a configured classroom. Optional startWeek and repeatWeeks columns set recurrence; blank means week 1 through semester end. Configure semester dates first. Import adds windows to the current timetable.',
          '每行一个辅导时间范围。填写教师工号，多位教师以分号分隔。星期可填 Monday–Sunday、0–6（周日为 0）或星期一至星期日。地点列必须与已配置的教室名称一致。可选列 startWeek 与 repeatWeeks 设置起始教学周和重复周数，留空表示第 1 周起至学期结束。请先设置学期日期。导入将追加到现有课表。',
        )}
      </p>
      <div className="admin-toolbar">
        <Download
          name="schedu-timetable-template.csv"
          text={`day,instructors,start,end,location,capacity,startWeek,repeatWeeks\nMonday,${staff[0]?.id || 'teacher1'},18:30,20:05,"${(settings.classrooms[0] || '').replaceAll('"', '""')}",1,1,\n`}
        >
          {t('Download template', '下载模板')}
        </Download>
        <label className="secondary">
          {t('Choose CSV', '选择 CSV')}
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setRows(null);
              setError('');
              try {
                if (!settings.semesterStart) throw Error('semester_required');
                if (file.size > 100000) throw Error();
                const imported = timetableWindows(await file.text());
                if (
                  imported.some((w) =>
                    w.instructors.some((id) => !staff.some((u) => u.id === id)),
                  )
                )
                  throw Error('staff');
                validateSettings({
                  ...settings,
                  windows: [...settings.windows, ...imported],
                });
                setRows(imported);
              } catch (e) {
                setError(
                  e instanceof Error && e.message === 'semester_required'
                    ? t(
                        'Configure semester dates before importing a timetable.',
                        '请先配置学期日期，再导入课表。',
                      )
                    : e instanceof Error && e.message === 'staff'
                      ? t(
                          'An instructor ID was not found. Create the instructor account first.',
                          '找不到教师工号，请先创建教师账号。',
                        )
                      : e instanceof Error && e.message === 'invalid_classroom'
                        ? t(
                            'A classroom name was not found. Use the exact name from Configuration → Classrooms.',
                            '找不到教室名称，请使用系统配置中教室列表的准确名称。',
                          )
                        : t(
                            'Check the CSV columns, teaching weeks, times, capacities and overlapping windows. Nothing was imported.',
                            '请检查 CSV 列、教学周、时间、人数及时间范围是否重叠，尚未导入任何数据。',
                          ),
                );
              }
            }}
          />
        </label>
      </div>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {rows && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  t('Day', '星期'),
                  t('Time', '时间'),
                  t('Instructors', '教师'),
                  t('Location', '地点'),
                  t('Capacity', '人数'),
                  t('Teaching weeks', '教学周'),
                ].map((v) => (
                  <TableHead key={v}>{v}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    {t(
                      [
                        'Sunday',
                        'Monday',
                        'Tuesday',
                        'Wednesday',
                        'Thursday',
                        'Friday',
                        'Saturday',
                      ][w.day],
                      [
                        '星期日',
                        '星期一',
                        '星期二',
                        '星期三',
                        '星期四',
                        '星期五',
                        '星期六',
                      ][w.day],
                    )}
                  </TableCell>
                  <TableCell>
                    {w.start}–{w.end}
                  </TableCell>
                  <TableCell>
                    {w.instructors.join(' / ') || t('Unassigned', '未安排')}
                  </TableCell>
                  <TableCell>{w.location}</TableCell>
                  <TableCell>{w.capacity}</TableCell>
                  <TableCell>
                    {t(
                      `Week ${w.startWeek ?? 1} · ${w.repeatWeeks ? `${w.repeatWeeks} weeks` : 'until semester end'}`,
                      `第 ${w.startWeek ?? 1} 周起 · ${w.repeatWeeks ? `${w.repeatWeeks} 周` : '至学期结束'}`,
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="admin-toolbar">
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                if (
                  await onSave({
                    ...settings,
                    windows: [...settings.windows, ...rows],
                  })
                )
                  setRows(null);
              }}
            >
              {t(
                `Import ${rows.length} windows`,
                `导入 ${rows.length} 个时间范围`,
              )}
            </button>
            <button className="secondary" onClick={() => setRows(null)}>
              {t('Cancel', '取消')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
export function SlotManager({
  settings,
  slots,
  date,
  onDateChange,
  staff,
  t,
  busy,
  error,
  onSave,
}: {
  settings: Settings;
  slots: Slot[];
  date: string;
  onDateChange: (date: string) => void;
  staff: Staff;
  t: T;
  busy: boolean;
  error: string;
  onSave: (s: Settings) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState<SlotOverride | null>(null),
    [removing, setRemoving] = useState<SlotOverride | null>(null);
  const overrides = settings.slotOverrides || [];
  const listed: SlotOverride[] = [
    ...slots
      .filter((s) => s.date === date)
      .map((s) => ({ ...s, enabled: true })),
    ...overrides.filter(
      (s) => s.date === date && !slots.some((slot) => slot.id === s.id),
    ),
  ];
  const save = async (s: SlotOverride) =>
    onSave({
      ...settings,
      slotOverrides: [...overrides.filter((o) => o.id !== s.id), s],
    });
  return (
    <section className="panel admin-panel">
      <div className="section-heading">
        <h3>{t('Individual time slots', '单次预约时段')}</h3>
        <button
          className="secondary"
          onClick={() =>
            setEditing({
              id: clientId(),
              windowId: '',
              date,
              start: '18:30',
              end: '18:40',
              location: '',
              instructors: [],
              capacity: 1,
              enabled: true,
            })
          }
        >
          {t('Add time slot', '添加单次时段')}
        </button>
      </div>
      <p className="muted">
        {t(
          'Changes here affect one date only. Cancel active bookings before changing their slots. Deleted recurring slots stay closed on that date.',
          '这里的修改仅影响单个日期。修改已预约时段前须先取消相关预约。删除自动生成的时段后，该日的此时段将保持关闭。',
        )}
      </p>
      <div className="admin-toolbar">
        <label>
          {t('Date', '日期')}
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </label>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {[
              t('Time', '时间'),
              t('Location / instructors', '地点 / 教师'),
              t('Seats', '名额'),
              t('Actions', '操作'),
            ].map((v) => (
              <TableHead key={v}>{v}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {listed.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                {s.start}–{s.end}
                <small className="table-sub">
                  {!s.enabled
                    ? t('Closed', '已关闭')
                    : s.windowId
                      ? t('From weekly window', '来自每周安排')
                      : t('One-off', '单次安排')}
                </small>
              </TableCell>
              <TableCell>
                {s.location}
                <small className="table-sub">
                  {s.instructors
                    .map((id) => staff.find((u) => u.id === id)?.name || id)
                    .join(' / ') || t('Unassigned', '未安排教师')}
                </small>
              </TableCell>
              <TableCell>
                {s.enabled
                  ? `${slots.find((o) => o.id === s.id)?.remaining ?? s.capacity} / ${s.capacity}`
                  : '—'}
              </TableCell>
              <TableCell>
                <div className="admin-toolbar">
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setEditing({ ...s })}
                  >
                    {s.enabled
                      ? t('Edit', '编辑')
                      : t('Reopen / edit', '重新开放 / 编辑')}
                  </button>
                  {s.enabled && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => setRemoving(s)}
                    >
                      {t('Delete', '删除')}
                    </button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {!listed.length && (
            <TableRow>
              <TableCell colSpan={4}>
                {t('No time slots on this date.', '此日期暂无时段。')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>{t('Time slot', '预约时段')}</DialogTitle>
            <DialogDescription>
              {t(
                'Only this occurrence changes. Times use China Standard Time.',
                '仅修改本次时段，时间采用北京时间。',
              )}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await save({ ...editing, enabled: true })) {
                  onDateChange(editing.date);
                  setEditing(null);
                }
              }}
            >
              <label>
                {t('Date', '日期')}
                <input
                  type="date"
                  min={
                    settings.semesterStart &&
                    settings.semesterStart > chinaDate()
                      ? settings.semesterStart
                      : chinaDate()
                  }
                  max={settings.semesterEnd || undefined}
                  required
                  value={editing.date}
                  onChange={(e) =>
                    setEditing({ ...editing, date: e.target.value })
                  }
                />
              </label>
              <div className="form-grid">
                {(['start', 'end'] as const).map((key) => (
                  <label key={key}>
                    {key === 'start'
                      ? t('Starts at', '开始时间')
                      : t('Ends at', '结束时间')}
                    <input
                      type="time"
                      required
                      value={editing[key]}
                      onChange={(e) =>
                        setEditing({ ...editing, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
              <label>
                {t('Classroom', '教室')}
                <Choice
                  label={t('Choose a classroom', '选择教室')}
                  value={editing.location}
                  disabled={busy || !settings.classrooms.length}
                  onChange={(location) => setEditing({ ...editing, location })}
                  options={settings.classrooms.map((value) => ({
                    value,
                    label: value,
                  }))}
                />
              </label>
              {!settings.classrooms.length && (
                <p className="footnote">
                  {t(
                    'Add classrooms in Configuration before scheduling.',
                    '请先在系统配置中添加教室，再安排辅导。',
                  )}
                </p>
              )}

              <label>
                {t('Capacity', '人数')}
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
              </label>
              <strong>{t('Instructors', '教师')}</strong>
              {staff.map((u) => (
                <label key={u.id} className="checkbox-label">
                  <Checkbox
                    checked={editing.instructors.includes(u.id)}
                    onCheckedChange={(v) =>
                      setEditing({
                        ...editing,
                        instructors: v
                          ? [...editing.instructors, u.id]
                          : editing.instructors.filter((id) => id !== u.id),
                      })
                    }
                  />
                  {u.name} · {u.id}
                </label>
              ))}
              {error && (
                <p className="message error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="primary"
                disabled={
                  busy || !settings.classrooms.includes(editing.location)
                }
              >
                {t('Save time slot', '保存时段')}
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>
              {t('Delete this time slot?', '删除此时段？')}
            </DialogTitle>
            <DialogDescription>
              {removing?.date} · {removing?.start}–{removing?.end}
            </DialogDescription>
          </DialogHeader>
          <p>
            {t(
              'This closes the slot to new bookings. Meeting records are retained.',
              '此时段将不再接受预约，已有预约记录会保留。',
            )}
          </p>
          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="secondary" onClick={() => setRemoving(null)}>
              {t('Cancel', '取消')}
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={async () => {
                if (removing && (await save({ ...removing, enabled: false })))
                  setRemoving(null);
              }}
            >
              {t('Delete', '删除')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
