'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { User, Settings, Booking } from '@/lib/model';
type T = (en: string, zh: string) => string;
export function DataReset({
  users,
  bookings,
  settings,
  t,
  busy,
  error,
  onReset,
}: {
  users: User[];
  bookings: Booking[];
  settings: Settings;
  t: T;
  busy: boolean;
  error: string;
  onReset: (confirmation: string, currentPassword: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState(''),
    [password, setPassword] = useState(''),
    [attempted, setAttempted] = useState(false);
  const admins = users.filter((u) => u.role === 'admin').length;
  return (
    <section className="panel data-reset-panel">
      <h3>{t('Reset app data', '重置应用数据')}</h3>
      <p>
        {t(
          'Clear the system after testing. This permanently removes all non-admin accounts, meetings and schedules, and restores default configuration. All administrator accounts are retained.',
          '测试结束后清空系统。将永久删除全部非管理员账号、预约及时间安排，并恢复默认配置。所有管理员账号均会保留。',
        )}
      </p>
      <button
        type="button"
        className="danger"
        disabled={busy}
        onClick={() => {
          setConfirmation('');
          setPassword('');
          setAttempted(false);
          setOpen(true);
        }}
      >
        {t('Review data reset', '查看重置范围')}
      </button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) {
            setOpen(value);
            if (!value) {
              setPassword('');
              setConfirmation('');
            }
          }
        }}
      >
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>
              {t('Permanently reset app data?', '永久重置应用数据？')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'This applies to all data, including real records if they have been entered. Make a database backup first; this cannot be undone in the app.',
                '此操作适用于全部数据，包括已录入的真实记录。请先备份数据库，应用内无法撤销此操作。',
              )}
            </DialogDescription>
          </DialogHeader>
          <ul className="reset-scope">
            <li>
              {t(
                `Delete ${users.length - admins} student and instructor accounts and their sessions.`,
                `删除 ${users.length - admins} 个学生、教师账号及其登录会话。`,
              )}
            </li>
            <li>
              {t(
                `Delete all ${bookings.length} meeting records, including drafts, attendance, feedback and history.`,
                `删除全部 ${bookings.length} 条预约记录，包括草稿、出勤、评价及历史记录。`,
              )}
            </li>
            <li>
              {t(
                `Delete ${settings.windows.length} teaching windows, ${(settings.slotOverrides || []).length} individual slot changes and all dates off.`,
                `删除 ${settings.windows.length} 个辅导时间范围、${(settings.slotOverrides || []).length} 个单次时段调整及全部停课日期。`,
              )}
            </li>
            <li>
              {t(
                'Clear semester dates and restore default booking rules, class lists, classrooms, evaluations and app preferences.',
                '清除学期日期，恢复默认预约规则、班级与教室选项、评价选项及应用偏好。',
              )}
            </li>
            <li>
              <strong>
                {t(
                  `Keep all ${admins} administrator accounts, passwords and profiles.`,
                  `保留全部 ${admins} 个管理员账号、密码及个人资料。`,
                )}
              </strong>
            </li>
          </ul>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setAttempted(true);
              const result = await onReset(confirmation, password);
              setPassword('');
              if (result) {
                setOpen(false);
                setConfirmation('');
              }
            }}
          >
            <label>
              {t('Type RESET SchedU to confirm', '输入 RESET SchedU 确认')}
              <input
                required
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            <label>
              {t('Your current password', '你的当前密码')}
              <input
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {attempted && error && (
              <p role="alert" className="message error">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setPassword('');
                }}
              >
                {t('Cancel', '取消')}
              </button>
              <button
                className="danger"
                disabled={busy || confirmation !== 'RESET SchedU' || !password}
              >
                {busy
                  ? t('Resetting…', '正在重置…')
                  : t('Permanently reset data', '永久重置数据')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
