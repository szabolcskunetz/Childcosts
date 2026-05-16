import { pgTable, text, timestamp, uuid, decimal, numeric } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const participants = pgTable('participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  color: text('color').default('#3B82F6'), // Default blue color
  createdBy: text('created_by'), // nullable for backward compatibility
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: timestamp('date', { withTimezone: true }).notNull(),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  paidBy: uuid('paid_by').notNull(),
  splitPercentage: numeric('split_percentage', { precision: 5, scale: 2 }).default('50.00'),
  createdBy: text('created_by'), // Nullable to support both authenticated and anonymous users
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const settlements = pgTable('settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: timestamp('date', { withTimezone: true }).notNull(),
  fromParticipant: uuid('from_participant').notNull(),
  toParticipant: uuid('to_participant').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  description: text('description').default('Settlement'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Relations
export const expensesRelations = relations(expenses, ({ one }) => ({
  paidByParticipant: one(participants, {
    fields: [expenses.paidBy],
    references: [participants.id],
  }),
}));

export const settlementsRelations = relations(settlements, ({ one }) => ({
  fromParticipant: one(participants, {
    fields: [settlements.fromParticipant],
    references: [participants.id],
  }),
  toParticipant: one(participants, {
    fields: [settlements.toParticipant],
    references: [participants.id],
  }),
}));

export const participantsRelations = relations(participants, ({ many }) => ({
  expensesPaidBy: many(expenses, {
    relationName: 'paidBy',
  }),
  settlementsFrom: many(settlements, {
    relationName: 'fromParticipant',
  }),
  settlementsTo: many(settlements, {
    relationName: 'toParticipant',
  }),
}));
