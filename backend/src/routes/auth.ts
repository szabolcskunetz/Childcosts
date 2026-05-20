// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.
import type { App } from "../index.js";
import { projects, participants, expenses, settlements } from "../db/schema.js";
import { user, session, account, verification } from "../db/auth-schema.js";
import { and, eq } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";

export function registerAuthRoutes(app: App) {
  // Better Auth provides standard auth endpoints at /api/auth/*
  // (sign-up, sign-in, verify-email, reset-password, etc.)





  // ---------------------------------------------------------------------------
  // SIMPLE MOBILE GOOGLE OAUTH
  // ---------------------------------------------------------------------------
  // This bypasses Better Auth's /sign-in/social -> /callback/google state cookie
  // flow for native mobile Google login. On Android the state cookie is not
  // reliably returned after the Google round-trip, so Better Auth rejects the
  // callback with state_mismatch / please_restart_the_process. The route below
  // keeps the OAuth state server-side in the existing verification table,
  // exchanges Google's code on the backend, creates a normal Better Auth session
  // row, and returns only the session token to the app via its deep link.
  const mobileGoogleRedirectPath = "/api/auth/mobile-google/callback";
  const mobileGoogleStatePrefix = "mobile-google-oauth:";
  const betterAuthSessionCookieName = "__Secure-better-auth.session_token";

  const getPublicBaseUrl = (request: any) => {
    const host = request.headers.host;
    const proto = (request.headers["x-forwarded-proto"] as string) || "https";
    return (
      process.env.BETTER_AUTH_URL ||
      process.env.BACKEND_URL ||
      process.env.SERVICE_URL ||
      `${proto}://${host}`
    ).replace(/\/$/, "");
  };

  const safeMobileCallbackURL = (value?: string) => {
    const candidate = value || "childcosts://auth-callback";
    if (
      candidate.startsWith("childcosts://auth-callback") ||
      candidate.startsWith("exp://") ||
      candidate.startsWith("http://localhost") ||
      candidate.startsWith("https://localhost")
    ) {
      return candidate;
    }
    return "childcosts://auth-callback";
  };

  const appendOAuthError = (callbackURL: string, error: string) => {
    const out = new URL(callbackURL);
    out.searchParams.set("error", error);
    return out.toString();
  };

  const upsertGoogleUserAndSession = async (profile: {
    sub: string;
    email: string;
    emailVerified: boolean;
    name?: string;
    picture?: string;
  }, request: any) => {
    const now = new Date();
    const existingUsers = await app.db
      .select()
      .from(user)
      .where(eq(user.email, profile.email))
      .limit(1);

    let userId = existingUsers[0]?.id;
    if (!userId) {
      userId = randomUUID();
      await app.db.insert(user).values({
        id: userId,
        email: profile.email,
        name: profile.name || profile.email.split("@")[0] || "Google user",
        image: profile.picture || null,
        emailVerified: profile.emailVerified,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await app.db
        .update(user)
        .set({
          name: profile.name || existingUsers[0].name,
          image: profile.picture || existingUsers[0].image,
          emailVerified: profile.emailVerified || existingUsers[0].emailVerified,
          updatedAt: now,
        })
        .where(eq(user.id, userId));
    }

    const existingAccounts = await app.db
      .select()
      .from(account)
      .where(
        and(eq(account.providerId, "google"), eq(account.accountId, profile.sub)),
      )
      .limit(1);

    if (existingAccounts.length === 0) {
      await app.db.insert(account).values({
        id: randomUUID(),
        accountId: profile.sub,
        providerId: "google",
        userId,
        createdAt: now,
        updatedAt: now,
      });
    } else if (existingAccounts[0].userId !== userId) {
      await app.db
        .update(account)
        .set({ userId, updatedAt: now })
        .where(eq(account.id, existingAccounts[0].id));
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 60 * 60 * 24 * 7 * 1000);
    const forwardedFor = request.headers["x-forwarded-for"];
    const ipAddress = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : typeof forwardedFor === "string"
        ? forwardedFor.split(",")[0]?.trim()
        : request.ip;

    await app.db.insert(session).values({
      id: randomUUID(),
      token,
      userId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
      ipAddress: ipAddress || null,
      userAgent: request.headers["user-agent"] || null,
    });

    return token;
  };

  // GET /api/auth/mobile-google/start?callbackURL=childcosts://auth-callback
  app.fastify.get<{
    Querystring: { callbackURL?: string };
  }>("/api/auth/mobile-google/start", async (request, reply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      reply.code(500).type("text/plain; charset=utf-8");
      return "GOOGLE_CLIENT_ID is not configured.";
    }

    const baseURL = getPublicBaseUrl(request);
    const redirectURI = `${baseURL}${mobileGoogleRedirectPath}`;
    const callbackURL = safeMobileCallbackURL(request.query.callbackURL);
    const state = randomBytes(24).toString("base64url");
    const now = new Date();

    try {
      await app.db.insert(verification).values({
        id: randomUUID(),
        identifier: `${mobileGoogleStatePrefix}${state}`,
        value: JSON.stringify({ callbackURL, redirectURI }),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      });
      app.logger.info({ statePrefix: state.slice(0, 8), redirectURI, callbackURL }, "mobile-google/start: state stored");
    } catch (err: any) {
      app.logger.error({ err: err?.message }, "mobile-google/start: failed to store state");
      reply.code(500).type("text/plain; charset=utf-8");
      return `Failed to store OAuth state: ${err?.message || String(err)}`;
    }

    const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    google.searchParams.set("client_id", clientId);
    google.searchParams.set("redirect_uri", redirectURI);
    google.searchParams.set("response_type", "code");
    google.searchParams.set("scope", "openid email profile");
    google.searchParams.set("state", state);
    google.searchParams.set("access_type", "offline");
    google.searchParams.set("prompt", "select_account");

    reply.header("Cache-Control", "no-store");
    return reply.code(302).header("Location", google.toString()).send();
  });

  // GET /api/auth/mobile-google/callback?code=...&state=...
  app.fastify.get<{
    Querystring: { code?: string; state?: string; error?: string };
  }>(mobileGoogleRedirectPath, async (request, reply) => {
    let callbackURL = "childcosts://auth-callback";

    try {
      if (request.query.error) {
        return reply.code(302).header("Location", appendOAuthError(callbackURL, request.query.error)).send();
      }

      const state = request.query.state;
      const code = request.query.code;
      if (!state || !code) {
        return reply.code(302).header("Location", appendOAuthError(callbackURL, "missing_google_code_or_state")).send();
      }

      const records = await app.db
        .select()
        .from(verification)
        .where(eq(verification.identifier, `${mobileGoogleStatePrefix}${state}`))
        .limit(1);

      const record = records[0];
      app.logger.info(
        {
          statePrefix: state.slice(0, 8),
          found: !!record,
          expired: record ? record.expiresAt.getTime() < Date.now() : null,
        },
        "mobile-google/callback: state lookup",
      );
      if (!record || record.expiresAt.getTime() < Date.now()) {
        return reply.code(302).header("Location", appendOAuthError(callbackURL, "expired_or_invalid_google_state")).send();
      }

      try {
        const saved = JSON.parse(record.value);
        callbackURL = safeMobileCallbackURL(saved.callbackURL);
      } catch {}

      await app.db.delete(verification).where(eq(verification.id, record.id));

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return reply.code(302).header("Location", appendOAuthError(callbackURL, "missing_google_oauth_credentials")).send();
      }

      const redirectURI = `${getPublicBaseUrl(request)}${mobileGoogleRedirectPath}`;
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectURI,
          grant_type: "authorization_code",
        }),
      });

      const tokenJson: any = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || !tokenJson.id_token) {
        app.logger.warn({ status: tokenResponse.status, tokenJson }, "Google token exchange failed");
        return reply.code(302).header("Location", appendOAuthError(callbackURL, "google_token_exchange_failed")).send();
      }

      const infoResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenJson.id_token)}`,
      );
      const info: any = await infoResponse.json().catch(() => ({}));
      if (
        !infoResponse.ok ||
        info.aud !== clientId ||
        !info.sub ||
        !info.email ||
        info.email_verified !== "true"
      ) {
        app.logger.warn({ status: infoResponse.status, info }, "Google id_token verification failed");
        return reply.code(302).header("Location", appendOAuthError(callbackURL, "google_identity_verification_failed")).send();
      }

      const sessionToken = await upsertGoogleUserAndSession(
        {
          sub: info.sub,
          email: info.email,
          emailVerified: true,
          name: info.name,
          picture: info.picture,
        },
        request,
      );

      const out = new URL(callbackURL);
      out.searchParams.set("token", sessionToken);
      out.searchParams.set("cookieName", betterAuthSessionCookieName);
      reply.header("Cache-Control", "no-store");
      return reply.code(302).header("Location", out.toString()).send();
    } catch (error: any) {
      app.logger.error({ err: error?.message || error }, "Mobile Google OAuth callback failed");
      return reply.code(302).header("Location", appendOAuthError(callbackURL, "mobile_google_oauth_failed")).send();
    }
  });


  // GET /api/auth/mobile-social/:provider?callbackURL=...
  //
  // Native mobile OAuth bootstrap page. This page runs inside the external
  // browser/custom tab, performs the Better Auth sign-in/social POST with
  // credentials: "include", receives the state/PKCE cookie in that same
  // browser cookie jar, and only then redirects to Google. This avoids the
  // broken app-fetch -> browser-callback split where the state cookie is set
  // in React Native/Expo storage but Google's callback arrives in Chrome with
  // no cookie, causing `state_mismatch`.
  app.fastify.get<{
    Params: { provider: string };
    Querystring: { callbackURL?: string };
  }>("/api/auth/mobile-social/:provider", async (request, reply) => {
    const { provider } = request.params;
    const callbackURL = request.query.callbackURL || "childcosts://auth-callback";
    const allowed = new Set(["google", "apple", "github"]);
    if (!allowed.has(provider)) {
      reply.code(400).type("text/plain; charset=utf-8");
      return `Unsupported provider: ${provider}`;
    }

    const payload = JSON.stringify({ provider, callbackURL });
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Signing in...</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; color: #111827; }
    .box { max-width: 420px; margin: 18vh auto; line-height: 1.5; }
    .muted { color: #6b7280; font-size: 14px; }
    pre { white-space: pre-wrap; background: #f3f4f6; padding: 12px; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Signing in...</h1>
    <p class="muted">Please wait while Google sign-in starts.</p>
    <pre id="err" hidden></pre>
  </div>
  <script>
    (async function () {
      const err = document.getElementById('err');
      try {
        const res = await fetch('/api/auth/sign-in/social', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: ${JSON.stringify(payload)}
        });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch (_) {}
        if (!res.ok || !data || !data.url) {
          throw new Error('sign-in/social failed: ' + res.status + ' ' + text.slice(0, 500));
        }
        window.location.replace(data.url);
      } catch (e) {
        err.hidden = false;
        err.textContent = e && e.message ? e.message : String(e);
      }
    })();
  </script>
</body>
</html>`;

    reply.type("text/html; charset=utf-8");
    return html;
  });

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
  }>("/api/auth/initiate-social/:provider", async (request, reply) => {
    const { provider } = request.params;
    const callbackURL =
      request.query.callbackURL || "childcosts://auth-callback";
    const allowed = new Set(["google", "apple", "github"]);
    if (!allowed.has(provider)) {
      reply.code(400);
      return { error: `Unsupported provider: ${provider}` };
    }

    const host = request.headers.host;
    const proto = (request.headers["x-forwarded-proto"] as string) || "https";
    const selfBase = process.env.BETTER_AUTH_URL || `${proto}://${host}`;
    const target = `${selfBase}/api/auth/sign-in/social`;

    try {
      const upstream = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Forward the browser's Origin so Better Auth's CSRF check
          // sees a valid same-origin request.
          Origin: selfBase,
        },
        body: JSON.stringify({ provider, callbackURL }),
        redirect: "manual",
      });

      // Mirror any Set-Cookie headers from Better Auth back to the
      // user's browser. These contain the state/PKCE binding cookie
      // that the callback step will read to verify the OAuth response.
      const setCookieHeaders = upstream.headers.getSetCookie?.() || [];
      if (Array.isArray(setCookieHeaders) && setCookieHeaders.length > 0) {
        reply.header("Set-Cookie", setCookieHeaders);
      } else {
        const single = upstream.headers.get("set-cookie");
        if (single) reply.header("Set-Cookie", single);
      }

      // Diagnostic cookie: if this also fails to appear on
      // /api/auth/callback/google, the browser or hosting layer is dropping all
      // cookies for this OAuth round-trip, not only Better Auth's state cookie.
      reply.header(
        "Set-Cookie",
        `childcosts_oauth_probe=${Date.now()}; Path=/; Max-Age=600; Secure; SameSite=None`,
      );
      reply.header("Cache-Control", "no-store");

      const upstreamText = await upstream.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(upstreamText);
      } catch {}

      const oauthURL = parsed?.url;
      if (!oauthURL) {
        app.logger.warn(
          { upstreamStatus: upstream.status, body: upstreamText.slice(0, 500) },
          "initiate-social: no oauthURL in upstream response",
        );
        reply.code(502);
        return {
          error: "Upstream sign-in/social returned no URL",
          body: upstreamText.slice(0, 500),
        };
      }

      reply.header("Location", oauthURL);
      reply.code(302);
      return "";
    } catch (e: any) {
      app.logger.error({ err: e?.message }, "initiate-social failed");
      reply.code(500);
      return { error: e?.message || "initiate-social failed" };
    }
  });

  // The /api/auth/expo-authorization-proxy route is provided by the
  // official @better-auth/expo server plugin registered in src/index.ts.

  // GET /api/auth/debug-callback-trace — diagnostic only.
  // Hits the OAuth callback URL with a fake code and surfaces the raw
  // Better Auth response. Helps us see what Better Auth does when it
  // tries to process a callback — even if the code is invalid, the
  // error message we get back is informative.
  app.fastify.get("/api/auth/debug-callback-trace", async (request, reply) => {
    const host = request.headers.host;
    const proto = (request.headers["x-forwarded-proto"] as string) || "https";
    const selfBase = `${proto}://${host}`;
    const target = `${selfBase}/api/auth/callback/google?code=test-debug-code&state=test-state`;

    try {
      const res = await fetch(target, { method: "GET", redirect: "manual" });
      const text = await res.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {}
      return {
        target,
        status: res.status,
        statusText: res.statusText,
        location: res.headers.get("location"),
        contentType: res.headers.get("content-type"),
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
  app.fastify.get("/api/auth/debug-social-test", async (request, reply) => {
    const host = request.headers.host;
    const proto = (request.headers["x-forwarded-proto"] as string) || "https";
    const selfBase = `${proto}://${host}`;
    const target = `${selfBase}/api/auth/sign-in/social`;

    try {
      const res = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL: "childcosts://auth-callback",
        }),
        redirect: "manual",
      });
      const text = await res.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {}
      return {
        target,
        status: res.status,
        statusText: res.statusText,
        location: res.headers.get("location"),
        contentType: res.headers.get("content-type"),
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
  app.fastify.get("/api/auth/debug-config", async () => {
    return {
      providers: {
        google: {
          clientIdSet: !!process.env.GOOGLE_CLIENT_ID,
          clientSecretSet: !!process.env.GOOGLE_CLIENT_SECRET,
          clientIdLength: (process.env.GOOGLE_CLIENT_ID || "").length,
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
          /natively|newly|specular|specific|google|oauth|client/i.test(k),
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
      // Confirm whether the @better-auth/expo server plugin was loaded.
      expoPluginInstalled: await (async () => {
        try {
          await import("@better-auth/expo");
          return true;
        } catch {
          return false;
        }
      })(),
      // Probe whether the deployed Better Auth instance considers the
      // mobile deep link a trusted origin (needed for the expo plugin
      // to append ?cookie=... to the OAuth callback redirect).
      trustedOriginProbe: await (async () => {
        try {
          // Hit our own root with the deep link as the Origin header
          // and see how Better Auth's CORS treats it. Not perfect but
          // a clear signal.
          const res = await fetch(
            `https://${request.headers.host}/api/auth/ok`,
            {
              method: "GET",
              headers: { Origin: "childcosts://auth-callback" },
            },
          );
          return {
            status: res.status,
            corsAllowOrigin: res.headers.get("access-control-allow-origin"),
            corsAllowCreds: res.headers.get("access-control-allow-credentials"),
          };
        } catch (e: any) {
          return { error: e?.message || String(e) };
        }
      })(),
    };
  });

  // DELETE /api/auth/account
  // Permanently delete the authenticated user's account and all data they created.
  // Required for Apple Guideline 5.1.1(v) and Google Play account-deletion policy.
  app.fastify.delete("/api/auth/account", async (request, reply) => {
    const sess = await app.requireAuth()(request, reply);
    if (!sess) return;

    const userId = sess.user.id;
    const userEmail = sess.user.email;
    app.logger.warn({ userId, email: userEmail }, "Account deletion requested");

    try {
      // Delete all projects the user created. Cascades to participants,
      // expenses, and settlements via the FK ON DELETE CASCADE on project_id.
      const userProjects = await app.db
        .select()
        .from(projects)
        .where(eq(projects.createdBy, userId));
      for (const p of userProjects) {
        await app.db.delete(expenses).where(eq(expenses.projectId, p.id));
        await app.db.delete(settlements).where(eq(settlements.projectId, p.id));
        await app.db
          .delete(participants)
          .where(eq(participants.projectId, p.id));
        await app.db.delete(projects).where(eq(projects.id, p.id));
      }

      // Also remove any orphan participants/expenses/settlements that reference
      // this user as creator but aren't tied to one of the deleted projects.
      await app.db.delete(expenses).where(eq(expenses.createdBy, userId));
      await app.db
        .delete(participants)
        .where(eq(participants.createdBy, userId));

      // Auth tables: session and account have ON DELETE CASCADE on user_id,
      // so deleting the user removes them automatically. Verification rows
      // are keyed by identifier (email), so we clean those up explicitly.
      await app.db
        .delete(verification)
        .where(eq(verification.identifier, userEmail));
      await app.db.delete(user).where(eq(user.id, userId));

      app.logger.warn(
        { userId, email: userEmail, deletedProjects: userProjects.length },
        "Account deleted",
      );
      return { success: true };
    } catch (error) {
      app.logger.error({ err: error, userId }, "Failed to delete account");
      throw error;
    }
  });
}
