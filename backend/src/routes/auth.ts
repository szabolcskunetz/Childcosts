// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.
import type { App } from '../index.js';
import { projects, participants, expenses, settlements } from '../db/schema.js';
import { user, session, account, verification } from '../db/auth-schema.js';
import { eq } from 'drizzle-orm';

export function registerAuthRoutes(app: App) {
  // Better Auth provides standard auth endpoints at /api/auth/*
  // (sign-up, sign-in, verify-email, reset-password, etc.)

  // GET /api/auth/debug-callback-trace — diagnostic only.
  // Hits the OAuth callback URL with a fake code and surfaces the raw
  // Better Auth response. Helps us see what Better Auth does when it
  // tries to process a callback — even if the code is invalid, the
  // error message we get back is informative.
  app.fastify.get('/api/auth/debug-callback-trace', async (request, reply) => {
    const host = request.headers.host;
    const proto = (request.headers['x-forwarded-proto'] as string) || 'https';
    const selfBase = `${proto}://${host}`;
    const target = `${selfBase}/api/auth/callback/google?code=test-debug-code&state=test-state`;

    try {
      const res = await fetch(target, { method: 'GET', redirect: 'manual' });
      const text = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch {}
      return {
        target,
        status: res.status,
        statusText: res.statusText,
        location: res.headers.get('location'),
        contentType: res.headers.get('content-type'),
        body: parsed ?? text.slice(0, 1000),
      };
    } catch (e: any) {
      return { target, error: e?.message || String(e) };
    }
  });

  // GET /api/auth/debug-social-test — diagnostic only.
  // Server-side replays what the mobile SDK does (POST to
  // /api/auth/sign-in/social with provider=google) so we can see the
  // raw Better Auth response that the SDK normally swallows.
  app.fastify.get('/api/auth/debug-social-test', async (request, reply) => {
    const host = request.headers.host;
    const proto = (request.headers['x-forwarded-proto'] as string) || 'https';
    const selfBase = `${proto}://${host}`;
    const target = `${selfBase}/api/auth/sign-in/social`;

    try {
      const res = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          callbackURL: 'childcosts://auth-callback',
        }),
        redirect: 'manual',
      });
      const text = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch {}
      return {
        target,
        status: res.status,
        statusText: res.statusText,
        location: res.headers.get('location'),
        contentType: res.headers.get('content-type'),
        body: parsed ?? text,
      };
    } catch (e: any) {
      return {
        target,
        error: e?.message || String(e),
        stack: e?.stack,
      };
    }
  });

  // GET /api/auth/debug-config — diagnostic only.
  // Reports whether OAuth env vars are present on the deployment.
  // Does NOT expose the actual values.
  app.fastify.get('/api/auth/debug-config', async () => {
    return {
      providers: {
        google: {
          clientIdSet: !!process.env.GOOGLE_CLIENT_ID,
          clientSecretSet: !!process.env.GOOGLE_CLIENT_SECRET,
          clientIdLength: (process.env.GOOGLE_CLIENT_ID || '').length,
        },
        apple: {
          clientIdSet: !!process.env.APPLE_CLIENT_ID,
          clientSecretSet: !!process.env.APPLE_CLIENT_SECRET,
        },
        github: {
          clientIdSet: !!process.env.GITHUB_CLIENT_ID,
          clientSecretSet: !!process.env.GITHUB_CLIENT_SECRET,
        },
      },
      nodeEnv: process.env.NODE_ENV || null,
      // Surface a few platform-provided env var names if they exist
      // so we can detect whether Natively/Specular sets anything obvious.
      platformHints: Object.keys(process.env)
        .filter((k) =>
          /natively|newly|specular|specific|google|oauth|client/i.test(k)
        )
        .sort(),
      // Specific env vars relevant for OAuth redirect_uri construction.
      // Showing presence + value (these are URLs, not secrets).
      authBaseUrl: {
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || null,
        BACKEND_URL: process.env.BACKEND_URL || null,
        SERVICE_URL: process.env.SERVICE_URL || null,
        // List ALL env var names so we can spot what Natively actually
        // injects under (e.g. PUBLIC_URL, APP_URL, etc.).
        allEnvNames: Object.keys(process.env).sort(),
      },
    };
  });

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
