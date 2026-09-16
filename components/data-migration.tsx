'use client';
import { useState } from 'react';
import { Choice } from '@/components/choice';
import { Download, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { maxMigrationBytes } from '@/lib/migration-package';
import type { migrationSummary } from '@/lib/migration-package';
type T = (en: string, zh: string) => string;
type Summary = ReturnType<typeof migrationSummary>;
const messages: Record<string, [string, string]> = {
  sysadmin_selection_required: [
    'Choose which administrator in this older package will become the system administrator.',
    '请选择旧版导出包中将升级为系统管理员的账号。',
  ],
  invalid_export_package: [
    'This is not a valid SchedU export package. No data was changed.',
    '此文件不是有效的 SchedU 导出包，未更改任何数据。',
  ],
  unsupported_export_version: [
    'This package uses an unsupported version. Update SchedU on this server before restoring.',
    '不支持此导出包版本，请先升级当前服务器的 SchedU。',
  ],
  export_checksum_mismatch: [
    'The package integrity check failed. Use the original exported file.',
    '导出包完整性检查失败，请使用原始导出文件。',
  ],
  export_package_too_large: [
    'The migration package limit is 100 MB. Use the database backup procedure for larger datasets.',
    '迁移包上限为 100 MB，更大的数据集请使用数据库备份迁移流程。',
  ],
  restore_requires_reset: [
    'Reset app data before restoring. Any subsequent data change requires another reset.',
    '请先重置应用数据再恢复，重置后若更改数据，需要重新重置。',
  ],
  restore_confirmation_required: [
    'Type RESTORE SchedU exactly to confirm.',
    '请准确输入 RESTORE SchedU 确认。',
  ],
  incorrect_current_password: [
    'Your current password is incorrect.',
    '你的当前密码不正确。',
  ],
  forbidden: [
    'System administrator access is required.',
    '此操作需要系统管理员权限。',
  ],
  unauthorised: [
    'Your session has expired. Sign in again.',
    '登录已过期，请重新登录。',
  ],
};
async function migrationRequest(body: unknown) {
  const response = await fetch('/api/migration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const result = (await response
      .json()
      .catch(() => ({ error: 'migration_failed' }))) as { error?: string };
    throw Error(result.error || 'migration_failed');
  }
  return response;
}
export function DataMigration({
  reset,
  t,
  busy,
  onWorkingChange,
  onRestored,
  onRefresh,
}: {
  reset: { ready: boolean; resetAt: number | null };
  t: T;
  busy: boolean;
  onWorkingChange: (busy: boolean) => void;
  onRestored: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'export' | 'restore' | null>(null);
  const [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(''),
    [fileName, setFileName] = useState('');
  const [pkg, setPackage] = useState<unknown>(null),
    [summary, setSummary] = useState<Summary | null>(null);
  const [sysadminId, setSysadminId] = useState('');
  const [completed, setCompleted] = useState(false),
    [exported, setExported] = useState(false);
  const fail = (e: unknown) =>
    setError(
      t(
        ...(messages[e instanceof Error ? e.message : ''] || [
          'Migration could not complete. No partial restoration was applied.',
          '迁移未能完成，未进行部分恢复。',
        ]),
      ),
    );
  const close = async () => {
    setMode(null);
    setPassword('');
    setConfirmation('');
    setPackage(null);
    setSummary(null);
    setError('');
    if (completed) {
      setCompleted(false);
      await onRestored();
    }
  };
  return (
    <section className="panel data-migration-panel">
      <h3>{t('Export & restore', '数据导出与恢复')}</h3>
      <p className="muted">
        {t(
          'Move SchedU to another server with one complete export package. Includes all accounts and existing passwords, profiles, bookings, feedback, history and configuration.',
          '通过完整导出包将 SchedU 迁移到另一台服务器，包含全部账号及现有密码、个人资料、预约、反馈、历史记录和系统配置。',
        )}
      </p>
      <p className="footnote">
        {t(
          'The file contains personal data and password hashes. Keep it private. Login sessions and temporary login-attempt records are not transferred; everyone signs in again.',
          '文件包含个人信息和密码哈希，请妥善保管。登录会话和临时登录尝试记录不迁移，恢复后所有用户需重新登录。',
        )}
      </p>
      <p className={reset.ready ? 'migration-ready' : 'muted'}>
        {reset.ready
          ? t('Reset state · Ready to restore', '已重置 · 可以恢复')
          : t(
              'Restore unavailable · Reset app data first',
              '暂不可恢复 · 请先重置应用数据',
            )}
      </p>
      <div className="admin-toolbar">
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setMode('export');
            setError('');
            setPassword('');
            setExported(false);
          }}
        >
          <Download size={16} />
          {t('Export full dataset', '导出完整数据')}
        </button>
        <label className={`secondary ${busy ? 'is-disabled' : ''}`}>
          <Upload size={16} />
          {t('Choose export package', '选择导出包')}
          <input
            className="sr-only"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setError('');
              setSummary(null);
              setSysadminId('');
              setPackage(null);
              setCompleted(false);
              setPassword('');
              setConfirmation('');
              setFileName(file.name);
              setMode('restore');
              onWorkingChange(true);
              try {
                if (file.size > maxMigrationBytes)
                  throw Error('export_package_too_large');
                let data: unknown;
                try {
                  data = JSON.parse(await file.text());
                } catch {
                  throw Error('invalid_export_package');
                }
                const response = await migrationRequest({
                  action: 'inspect',
                  package: data,
                });
                const result = (await response.json()) as { summary: Summary };
                setPackage(data);
                setSummary(result.summary);
                setSysadminId(
                  result.summary.sysadmin ||
                    (result.summary.admins.length === 1
                      ? result.summary.admins[0]
                      : ''),
                );
                await onRefresh();
              } catch (e) {
                fail(e);
              } finally {
                onWorkingChange(false);
              }
            }}
          />
        </label>
      </div>
      {exported && (
        <output className="message">
          {t(
            'Export prepared. Your browser download has started.',
            '导出已生成，浏览器已开始下载。',
          )}
        </output>
      )}
      <p className="footnote">
        {t(
          'Restore is a complete replacement, never a merge. It requires the Reset app data action below, with no data changes afterwards. Package size: up to 100 MB.',
          '恢复是完整替换，不合并已有数据。必须先执行下方的“重置应用数据”，且之后未更改数据。导出包最大 100 MB。',
        )}
      </p>
      <Dialog
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open && !busy) void close();
        }}
      >
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>
              {completed
                ? t('Restoration complete', '恢复完成')
                : mode === 'export'
                  ? t('Export full dataset', '导出完整数据')
                  : t('Restore from export package', '从导出包恢复')}
            </DialogTitle>
            <DialogDescription>
              {completed
                ? t(
                    'Sign in with the system administrator account from the exported system.',
                    '请使用导出系统中的系统管理员账号登录。',
                  )
                : mode === 'export'
                  ? t(
                      'Confirm with your current system administrator password.',
                      '请输入当前系统管理员密码确认。',
                    )
                  : fileName}
            </DialogDescription>
          </DialogHeader>
          {mode === 'export' ? (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                setError('');
                onWorkingChange(true);
                try {
                  const response = await migrationRequest({
                    action: 'export',
                    currentPassword: password,
                  });
                  const blob = await response.blob();
                  const url = URL.createObjectURL(blob),
                    link = document.createElement('a');
                  link.href = url;
                  link.download =
                    response.headers
                      .get('Content-Disposition')
                      ?.match(/filename="([^"]+)"/)?.[1] ||
                    'schedu-export.json';
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 60000);
                  setPassword('');
                  setExported(true);
                  setMode(null);
                } catch (e) {
                  fail(e);
                  setPassword('');
                } finally {
                  onWorkingChange(false);
                }
              }}
            >
              <label>
                {t('Your current password', '你的当前密码')}
                <input
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && (
                <p className="message error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void close()}
                >
                  {t('Cancel', '取消')}
                </button>
                <button className="primary" disabled={busy || !password}>
                  {busy
                    ? t('Preparing export…', '正在生成导出包…')
                    : t('Download export package', '下载导出包')}
                </button>
              </div>
            </form>
          ) : (
            <>
              {summary && (
                <>
                  <dl className="migration-summary">
                    <div>
                      <dt>{t('Exported at', '导出时间')}</dt>
                      <dd>
                        {new Date(summary.exportedAt).toLocaleString(
                          t('en-GB', 'zh-CN'),
                          { timeZone: 'Asia/Shanghai' },
                        )}{' '}
                        · UTC+8
                      </dd>
                    </div>
                    <div>
                      <dt>{t('Accounts', '账号')}</dt>
                      <dd>{summary.users}</dd>
                    </div>
                    <div>
                      <dt>{t('Meeting records', '预约记录')}</dt>
                      <dd>{summary.bookings}</dd>
                    </div>
                    <div>
                      <dt>
                        {t(
                          'Teaching windows / slot changes',
                          '时间范围 / 时段调整',
                        )}
                      </dt>
                      <dd>
                        {summary.windows} / {summary.slotChanges}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        {t(
                          'Administrator IDs after restoration',
                          '恢复后的管理员账号',
                        )}
                      </dt>
                      <dd>{summary.admins.join(', ')}</dd>
                    </div>
                    <div>
                      <dt>{t('System administrator', '系统管理员')}</dt>
                      <dd>{sysadminId || t('Select below', '请在下方选择')}</dd>
                    </div>
                  </dl>
                  {summary.version === 1 && !completed && (
                    <div className="stack">
                      <p className="footnote">
                        {t(
                          'This older package has no promotion history. Choose the account that will hold the sole system administrator role.',
                          '旧版导出包没有管理员授权时间记录，请选择唯一的系统管理员账号。',
                        )}
                      </p>
                      <Choice
                        label={t(
                          'System administrator from package',
                          '导出包中的系统管理员',
                        )}
                        value={sysadminId}
                        onChange={setSysadminId}
                        disabled={busy}
                        options={summary.admins.map((id) => ({
                          value: id,
                          label: id,
                        }))}
                      />
                    </div>
                  )}
                  {!completed && (
                    <p>
                      {t(
                        'The destination system administrator will be replaced by the system administrator in the package. All accounts and their existing passwords are restored. All current sessions will end.',
                        '目标服务器的系统管理员将被导出包中的系统管理员替换。恢复全部账号及导出时的密码，所有当前登录会话将结束。',
                      )}
                    </p>
                  )}
                </>
              )}
              {completed ? (
                <button className="primary" onClick={() => void close()}>
                  {t('Go to sign in', '前往登录')}
                </button>
              ) : (
                <>
                  {!reset.ready && (
                    <p className="message">
                      {t(
                        'Reset app data first, then choose this package again. Incremental restoration is not supported.',
                        '请先重置应用数据，再重新选择此导出包。不支持增量恢复。',
                      )}
                    </p>
                  )}
                  <form
                    className="stack"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setError('');
                      onWorkingChange(true);
                      try {
                        await migrationRequest({
                          action: 'restore',
                          package: pkg,
                          currentPassword: password,
                          confirmation,
                          sysadminId,
                        });
                        setPackage(null);
                        setCompleted(true);
                        setConfirmation('');
                      } catch (e) {
                        fail(e);
                        await onRefresh();
                      } finally {
                        setPassword('');
                        onWorkingChange(false);
                      }
                    }}
                  >
                    <label>
                      {t(
                        'Type RESTORE SchedU to confirm',
                        '输入 RESTORE SchedU 确认',
                      )}
                      <input
                        autoComplete="off"
                        required
                        value={confirmation}
                        disabled={!summary || !reset.ready || busy}
                        onChange={(e) => setConfirmation(e.target.value)}
                      />
                    </label>
                    <label>
                      {t(
                        'Your current destination password',
                        '你在目标服务器上的当前密码',
                      )}
                      <input
                        type="password"
                        autoComplete="current-password"
                        maxLength={128}
                        required
                        value={password}
                        disabled={!summary || !reset.ready || busy}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                    {error && (
                      <p className="message error" role="alert">
                        {error}
                      </p>
                    )}
                    <div className="form-actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => void close()}
                      >
                        {t('Close', '关闭')}
                      </button>
                      <button
                        className="danger"
                        disabled={
                          busy ||
                          !summary ||
                          !sysadminId ||
                          !reset.ready ||
                          confirmation !== 'RESTORE SchedU' ||
                          !password
                        }
                      >
                        {busy
                          ? t('Processing…', '正在处理…')
                          : t('Replace data and restore', '替换数据并恢复')}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
