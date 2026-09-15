import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  role: text('role').notNull(),
  password: text('password').notNull(),
  profile: text('profile').notNull(),
  firstLogin: integer('first_login').notNull().default(1),
  blockedUntil: integer('blocked_until').notNull().default(0),
});
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  value: text('value').notNull(),
});
export const appState = sqliteTable('app_state', {
  id: integer('id').primaryKey(),
  restoreReady: integer('restore_ready').notNull().default(0),
  resetAt: integer('reset_at'),
  restoreToken: text('restore_token').notNull().default(''),
});
export const sessions = sqliteTable(
  'sessions',
  {
    token: text('token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    expires: integer('expires').notNull(),
  },
  (t) => [index('idx_sessions_user').on(t.userId)],
);
export const attempts = sqliteTable('attempts', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expires: integer('expires').notNull(),
});
export const bookings = sqliteTable(
  'bookings',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull(),
    slotId: text('slot_id').notNull(),
    seat: integer('seat').notNull(),
    slot: text('slot').notNull(),
    startsAt: integer('starts_at').notNull(),
    endsAt: integer('ends_at').notNull(),
    topic: text('topic').notNull(),
    score: integer('score'),
    feedback: text('feedback').notNull().default(''),
    history: text('history').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('idx_bookings_student_status').on(t.studentId, t.status),
    index('idx_bookings_slot').on(t.slotId),
    uniqueIndex('idx_bookings_active_seat')
      .on(t.slotId, t.seat)
      .where(sql`${t.status} in ('submitted','approved','in_progress')`),
  ],
);
