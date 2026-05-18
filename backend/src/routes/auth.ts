// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.
import type { App } from '../index.js';
import { projects, participants, expenses, settlements } from '../db/schema.js';
import { user, session, account, verification } from '../db/auth-schema.js';
import { eq } from 'drizzle-orm';

export function registerAuthRoutes(app: App) {
  // Better Auth provides standard auth endpoints at /api/auth/*
  // (sign-up, sign-in, verify-email, reset-password, etc.)

  // GET /api/auth/initiate-social/:provider?callbackURL=...
  //
  // Browser-initiated entry point for the OAuth flow. The mobile app
  // sends the user here via Linking.openURL so the browser owns the
  // whole flow — POST to /sign-in/social, redirect to Google, return
  // through /api/auth/callback/google — in a single cookie session.
  // The previous design POSTed from the app (no shared cookies) and
  // then opened the Google URL in the browser, which made Better Auth
  // fail the callback with state_mismatch because the state cookie
  // it set on the POST response never reached the browser.
  app.fastify.get<{
    Params: { provider: string };
    Querystring: { callbackURL?: string };
  }>('/api/auth/initiate-social/:provider', async (request, reply) => {
    const { provider } = request.params;
    const callbackURL = request.query.callbackURL || 'childcosts://auth-callback';
    const allowed = new Set(['google', 'apple', 'github']);
    if (!allowed.has(provider)) {
      reply.code(400);
      return { error: `Unsupported provider: ${provider}` };
    }

    const host = request.headers.host;
    const proto = (request.headers['x-forwarded-proto'] as string) || 'https';
    const selfBase = process.env.BETTER_AUTH_URL || `${proto}://${host}`;
    const target = `${selfBase}/api/auth/sign-in/social`;

    try {
      const upstream = await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Forward the browser's Origin so Better Auth's CSRF check
          // sees a valid same-origin request.
          Origin: selfBase,
        },
        body: JSON.stringify({ provider, callbackURL }),
        redirect: 'manual',
      });

      // Mirror any Set-Cookie headers from Better Auth back to the
      // user's browser. These contain the state/PKCE binding cookie
      // that the callback step will read to verify the OAuth response.
      const setCookieHeaders = upstream.headers.getSetCookie?.() || [];
      if (Array.isArray(setCookieHeaders) && setCookieHeaders.length > 0) {
        reply.header('Set-Cookie', setCookieHeaders);
      } else {
        const single = upstream.headers.get('set-cookie');
        if (single) reply.header('Set-Cookie', single);
      }

      const upstreamText = await upstream.text();
      let parsed: any = null;
      try { parsed = JSON.parse(upstreamText); } catch {}

      const oauthURL = parsed?.url;
      if (!oauthURL) {
        app.logger.warn({ upstreamStatus: upstream.status, body: upstreamText.slice(0, 500) }, 'initiate-social: no oauthURL in upstream response');
        reply.code(502);
        return { error: 'Upstream sign-in/social returned no URL', body: upstreamText.slice(0, 500) };
      }

      reply.header('Location', oauthURL);
      reply.code(302);
      return '';
    } catch (e: any) {
      app.logger.error({ err: e?.message }, 'initiate-social failed');
      reply.code(500);
      return { error: e?.message || 'initiate-social failed' };
    }
  });

  // GET /api/auth/expo-authorization-proxy?authorizationURL=...
  //
  // The @better-auth/expo client opens this URL in the system browser
  // to begin a social sign-in flow, expecting it to redirect to the
  // provider's OAuth URL. The server-side @better-auth/expo plugin
  // normally registers this route, but we only have the client plugin
  // installed, so the SDK currently gets a 404 here and the OAuth flow
  // dies before reaching Google.
  //
  // Re-implement the proxy ourselves: validate the URL belongs to a
  // known OAuth provider, then 302 to it.
  app.fastify.get<{ Querystring: { authorizationURL?: string } }>(
    '/api/auth/expo-authorization-proxy',
    async (request, reply) => {
      const { authorizationURL } = request.query;
      if (!authorizationURL) {
        reply.code(400);
        return { error: 'authorizationURL is required' };
      }
      const ALLOWED_HOSTS = new Set([
        'accounts.google.com',
        'appleid.apple.com',
        'github.com',
      ]);
      try {
        const parsed = new URL(authorizationURL);
        if (!ALLOWED_HOSTS.has(parsed.hostname)) {
          app.logger.warn({ authorizationURL }, 'Rejected expo proxy redirect to untrusted host');
          reply.code(400);
          return { error: 'Untrusted authorization host' };
        }
        reply.header('Location', authorizationURL);
        reply.code(302);
        return '';
      } catch (e) {
        reply.code(400);
        return { error: 'Invalid authorizationURL' };
      }
    }
  );

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
