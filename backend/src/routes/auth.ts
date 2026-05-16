// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.
import type { App } from '../index.js';
import { projects, participants, expenses, settlements } from '../db/schema.js';
import { user, session, account, verification } from '../db/auth-schema.js';
import { eq } from 'drizzle-orm';

export function registerAuthRoutes(app: App) {
  // Better Auth provides standard auth endpoints at /api/auth/*
  // (sign-up, sign-in, verify-email, reset-password, etc.)

  // DELETE /api/auth/account
  // Permanently delete the authenticated user's account and all data they created.
  // Required for Apple Guideline 5.1.1(v) and Google Play account-deletion policy.
  app.fastify.delete('/api/auth/account', async (request, reply) => {
    const sess = await app.requireAuth()(request, reply);
    if (!sess) return;

    const userId = sess.user.id;
    const userEmail = sess.user.email;
    app.logger.warn({ userId, email: userEmail }, 'Account deletion requested');

    try {
      // Delete all projects the user created. Cascades to participants,
      // expenses, and settlements via the FK ON DELETE CASCADE on project_id.
      const userProjects = await app.db.select().from(projects).where(eq(projects.createdBy, userId));
      for (const p of userProjects) {
        await app.db.delete(expenses).where(eq(expenses.projectId, p.id));
        await app.db.delete(settlements).where(eq(settlements.projectId, p.id));
        await app.db.delete(participants).where(eq(participants.projectId, p.id));
        await app.db.delete(projects).where(eq(projects.id, p.id));
      }

      // Also remove any orphan participants/expenses/settlements that reference
      // this user as creator but aren't tied to one of the deleted projects.
      await app.db.delete(expenses).where(eq(expenses.createdBy, userId));
      await app.db.delete(participants).where(eq(participants.createdBy, userId));

      // Auth tables: session and account have ON DELETE CASCADE on user_id,
      // so deleting the user removes them automatically. Verification rows
      // are keyed by identifier (email), so we clean those up explicitly.
      await app.db.delete(verification).where(eq(verification.identifier, userEmail));
      await app.db.delete(user).where(eq(user.id, userId));

      app.logger.warn({ userId, email: userEmail, deletedProjects: userProjects.length }, 'Account deleted');
      return { success: true };
    } catch (error) {
      app.logger.error({ err: error, userId }, 'Failed to delete account');
      throw error;
    }
  });
}
