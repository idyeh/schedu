'use client';
import { CalendarDays } from 'lucide-react';
import type { availabilityDays } from '@/lib/model';
type T = (en: string, zh: string) => string;
export function AvailabilityCalendar({
  days,
  selectedDate,
  onSelect,
  staff,
  t,
}: {
  days: ReturnType<typeof availabilityDays>;
  selectedDate: string;
  onSelect: (date: string) => void;
  staff: { id: string; name: string; englishName: string }[];
  t: T;
}) {
  const locale = t('en-GB', 'zh-CN');
  const display = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Date(`${date}T12:00:00+08:00`).toLocaleDateString(locale, {
      ...options,
      timeZone: 'Asia/Shanghai',
    });
  const offset =
    (new Date(days[0].date + 'T12:00:00+08:00').getUTCDay() + 6) % 7;
  const total = days.reduce((n, d) => n + d.slots.length, 0);
  return (
    <section
      className="panel availability-calendar"
      aria-label={t('Availability calendar', '辅导日历')}
    >
      <div className="section-heading">
        <div>
          <h3>
            <CalendarDays size={19} />
            {t('Four-week calendar', '四周日历')}
          </h3>
          <p>
            {display(days[0].date, { day: 'numeric', month: 'short' })} –{' '}
            {display(days.at(-1)!.date, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}{' '}
            · {t('China Standard Time', '北京时间')}
          </p>
        </div>
        <span className="subtle-chip">
          {t(`${total} time slots`, `${total} 个时段`)}
        </span>
      </div>
      <div className="availability-weekdays" aria-hidden="true">
        {t('Mon,Tue,Wed,Thu,Fri,Sat,Sun', '一,二,三,四,五,六,日')
          .split(',')
          .map((d) => (
            <span key={d}>{d}</span>
          ))}
      </div>
      <div className="availability-grid">
        {Array.from({ length: offset }, (_, i) => (
          <div
            className="availability-padding"
            key={`padding-${i}`}
            aria-hidden="true"
          />
        ))}
        {days.map((day) => {
          const groups = new Map<
            string,
            {
              start: string;
              end: string;
              location: string;
              instructors: Set<string>;
            }
          >();
          for (const slot of day.slots) {
            const key = `${slot.windowId || slot.id}_${slot.location}`;
            const group = groups.get(key);
            if (group) {
              group.start = group.start < slot.start ? group.start : slot.start;
              group.end = group.end > slot.end ? group.end : slot.end;
              slot.instructors.forEach((id) => group.instructors.add(id));
            } else
              groups.set(key, {
                start: slot.start,
                end: slot.end,
                location: slot.location,
                instructors: new Set(slot.instructors),
              });
          }
          const remaining = day.past
            ? 0
            : day.slots.reduce((n, s) => n + s.remaining, 0);
          return (
            <button
              type="button"
              key={day.date}
              className={`availability-day ${selectedDate === day.date ? 'is-selected' : ''} ${day.closed ? 'is-closed' : ''}`}
              aria-pressed={selectedDate === day.date}
              aria-label={`${display(day.date, { dateStyle: 'full' })} · ${t(`${day.slots.length} time slots, ${remaining} seats available`, `${day.slots.length} 个时段，剩余 ${remaining} 个名额`)}${day.closed ? ' · ' + t('Closed', '停课') : ''}`}
              onClick={() => onSelect(day.date)}
            >
              <span className="availability-date">
                <strong>{display(day.date, { day: 'numeric' })}</strong>
                <span className="availability-mobile-weekday">
                  {display(day.date, { weekday: 'short' })}
                </span>
                {day.today ? (
                  <small>{t('Today', '今天')}</small>
                ) : day.date.endsWith('-01') ? (
                  <small>{display(day.date, { month: 'short' })}</small>
                ) : null}
              </span>
              {day.closed ? (
                <span className="availability-empty">
                  {t('Date off', '停课')}
                </span>
              ) : day.slots.length ? (
                <>
                  <span
                    className={`availability-count ${remaining === 0 ? 'is-full' : ''}`}
                  >
                    {day.past
                      ? t('Past sessions', '已过去的辅导')
                      : remaining > 0
                        ? t(
                            `${remaining} seats left`,
                            `剩余 ${remaining} 个名额`,
                          )
                        : t('Fully booked', '已约满')}
                  </span>
                  <span className="availability-events">
                    {Array.from(groups.entries()).map(([id, g]) => (
                      <span className="availability-event" key={id}>
                        <strong>
                          {g.start}–{g.end}
                        </strong>
                        <span>{g.location}</span>
                        <span>
                          {Array.from(g.instructors)
                            .map((id) => {
                              const person = staff.find((p) => p.id === id);
                              return person
                                ? t(
                                    person.englishName || person.name,
                                    person.name,
                                  )
                                : id;
                            })
                            .join(' / ') || t('Unassigned', '未安排教师')}
                        </span>
                      </span>
                    ))}
                  </span>
                  {!day.bookable && (
                    <small className="availability-empty">
                      {day.past
                        ? t('Past date', '已过去的日期')
                        : t('Outside booking horizon', '不在预约开放期内')}
                    </small>
                  )}
                </>
              ) : (
                <span className="availability-empty">
                  {t('No upcoming tutorials', '暂无后续辅导')}
                </span>
              )}
            </button>
          );
        })}
        {Array.from(
          { length: (7 - ((offset + days.length) % 7)) % 7 },
          (_, i) => (
            <div
              className="availability-padding"
              key={`end-${i}`}
              aria-hidden="true"
            />
          ),
        )}
      </div>
      <p className="footnote">
        {t(
          'Select a date to manage its time slots below. Closed dates and individual slot changes are included.',
          '选择日期以管理下方的单次时段，已计入停课日期及单次时段调整。',
        )}
      </p>
    </section>
  );
}
