import { pgTable, text, timestamp, uuid, decimal, numeric } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const participants = pgTable('participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  color: text('color').default('#3B82F6'),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: timestamp('date', { withTimezone: true }).notNull(),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  paidBy: uuid('paid_by').notNull(),
  splitPercentage: numeric('split_percentage', { precision: 5, scale: 2 }).default('50.00'),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const settlements = pgTable('settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: timestamp('date', { withTimezone: true }).notNull(),
  fromParticipant: uuid('from_participant').notNull(),
  toParticipant: uuid('to_participant').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  description: text('description').default('Settlement'),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const projectsRelations = relations(projects, ({ many }) => ({
  participants: many(participants),
  expenses: many(expenses),
  settlements: many(settlements),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  paidByParticipant: one(participants, {
    fields: [expenses.paidBy],
    references: [participants.id],
  }),
  project: one(projects, {
    fields: [expenses.projectId],
    references: [projects.id],
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
  project: one(projects, {
    fields: [settlements.projectId],
    references: [projects.id],
  }),
}));

export const participantsRelations = relations(participants, ({ many, one }) => ({
  expensesPaidBy: many(expenses, {
    relationName: 'paidBy',
  }),
  settlementsFrom: many(settlements, {
    relationName: 'fromParticipant',
  }),
  settlementsTo: many(settlements, {
    relationName: 'toParticipant',
  }),
  project: one(projects, {
    fields: [participants.projectId],
    references: [projects.id],
  }),
}));
