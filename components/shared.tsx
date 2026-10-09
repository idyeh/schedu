'use client';
import type { ReactNode } from 'react';
import { CalendarDays } from 'lucide-react';
export type T = (en: string, zh: string) => string;
export function Empty({
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
export const labels: Record<string, [string, string]> = {
  draft: ['Draft', '草稿'],
  submitted: ['Awaiting approval', '待审批'],
  approved: ['Approved', '已批准'],
  in_progress: ['In progress', '进行中'],
  completed: ['Completed', '已完成'],
  cancelled: ['Cancelled', '已取消'],
  archived: ['Archived', '已归档'],
};
export function Status({ value, t }: { value: string; t: T }) {
  const l = labels[value] || [value, value];
  return (
    <span className={`status ${value}`}>
      <span />
      {t(l[0], l[1])}
    </span>
  );
}
export function PageHeading({
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
export function Stat({
  icon: Icon,
  value,
  label,
  note,
}: {
  icon: typeof CalendarDays;
  value: number | string;
  label: string;
  note: string;
}) {
  return (
    <section className="stat-card">
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
      <div className="stat-icon">
        <Icon size={21} />
      </div>
    </section>
  );
}
