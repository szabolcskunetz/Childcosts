// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.
import { createApplication, resend } from "@specific-dev/framework";
import * as appSchema from "./db/schema.js";
import * as authSchema from "./db/auth-schema.js";
import { eq } from "drizzle-orm";

// Better Auth's Expo server plugin. Provides the
// /api/auth/expo-authorization-proxy route and the deep-link callback
// behavior that pairs with the @better-auth/expo client plugin used
// in the mobile app. Imported lazily so a missing package doesn't
// crash the backend before deps have been installed.
let expoAuthPlugin: any = null;
try {
  // @ts-ignore - resolved at runtime
  const mod = await import("@better-auth/expo");
  expoAuthPlugin = (mod as any).expo?.() ?? null;
} catch (e) {
  // package not installed yet — fall back to our manual workarounds
}

// Import route registration functions
import { registerParticipantsRoutes } from "./routes/participants.js";
import { registerExpensesRoutes } from "./routes/expenses.js";
import { registerSettlementsRoutes } from "./routes/settlements.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerProjectsRoutes } from "./routes/projects.js";
import { attachSessionCookieFromBearer } from "./utils/mobile-auth.js";

// Combine schemas
const schema = { ...appSchema, ...authSchema };

// Create application with schema for full database type support
export const app = await createApplication(schema);

// Export App type for use in route files
export type App = typeof app;

// Enable authentication with Better Auth
app.withAuth({
  // Public base URL of this backend. Without it Better Auth falls back to
  // http://localhost:3001 and bakes that into the OAuth redirect_uri, which
  // makes Google reject every social sign-in attempt from the installed
  // app (manifests as a one-frame browser flash).
  baseURL:
    process.env.BETTER_AUTH_URL ||
    process.env.BACKEND_URL ||
    process.env.SERVICE_URL ||
    undefined,

  // Email verification configuration
  emailVerification: {
    sendOnSignUp: true,

    // After successful verification, redirect to the frontend app
    // The callbackURL should be provided by the frontend when signing up
    // Default to childcosts:// deep link scheme if no callback URL is provided
    autoSignInAfterVerification: true,

    sendVerificationEmail: async ({ user, url }) => {
      try {
        app.logger.info(
          { userId: user.id, email: user.email, verificationUrl: url },
          "Sending verification email on signup",
        );

        // Send the verification email
        resend.emails
          .send({
            from: "Child Expense Tracker <noreply@example.com>",
            to: user.email,
            subject: "Verify your email address",
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Welcome to Child Expense Tracker!</h2>
              <p>Thank you for signing up. Please verify your email address to complete your registration.</p>
              <p style="margin: 30px 0;">
                <a href="${url}" style="background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Verify Email Address
                </a>
              </p>
              <p style="color: #666; font-size: 14px;">
                If the button doesn't work, copy and paste this link into your browser:<br/>
                <a href="${url}">${url}</a>
              </p>
              <p style="color: #666; font-size: 12px; margin-top: 40px;">
                If you didn't create an account, you can safely ignore this email.
              </p>
            </div>
          `,
          })
          .then((result) => {
            if (result.error) {
              app.logger.error(
                { err: result.error, userId: user.id, email: user.email },
                "Failed to send verification email",
              );
            } else {
              app.logger.info(
                {
                  emailId: result.data?.id,
                  userId: user.id,
                  email: user.email,
                },
                "Verification email sent successfully",
              );
            }
          })
          .catch((error) => {
            app.logger.error(
              { err: error, userId: user.id, email: user.email },
              "Error sending verification email",
            );
          });
      } catch (error) {
        app.logger.error(
          { err: error, userId: user.id, email: user.email },
          "Unexpected error in verification email handler",
        );
      }
    },
  },

  // Email and password configuration
  emailAndPassword: {
    // Require email verification before allowing login
    requireEmailVerification: true,

    // Send password reset emails
    sendResetPassword: async ({ user, url }) => {
      try {
        app.logger.info(
          { userId: user.id, email: user.email, resetUrl: url },
          "Sending password reset email",
        );

        // Send the password reset email
        resend.emails
          .send({
            from: "Child Expense Tracker <noreply@example.com>",
            to: user.email,
            subject: "Reset your password",
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Password Reset Request</h2>
              <p>We received a request to reset your password for your Child Expense Tracker account.</p>
              <p style="margin: 30px 0;">
                <a href="${url}" style="background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Reset Password
                </a>
              </p>
              <p style="color: #666; font-size: 14px;">
                If the button doesn't work, copy and paste this link into your browser:<br/>
                <a href="${url}">${url}</a>
              </p>
              <p style="color: #666; font-size: 12px; margin-top: 40px;">
                If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
              <p style="color: #666; font-size: 12px;">
                This password reset link will expire in 1 hour for security reasons.
              </p>
            </div>
          `,
          })
          .then((result) => {
            if (result.error) {
              app.logger.error(
                { err: result.error, userId: user.id, email: user.email },
                "Failed to send password reset email",
              );
            } else {
              app.logger.info(
                {
                  emailId: result.data?.id,
                  userId: user.id,
                  email: user.email,
                },
                "Password reset email sent successfully",
              );
            }
          })
          .catch((error) => {
            app.logger.error(
              { err: error, userId: user.id, email: user.email },
              "Error sending password reset email",
            );
          });
      } catch (error) {
        app.logger.error(
          { err: error, userId: user.id, email: user.email },
          "Unexpected error in password reset email handler",
        );
      }
    },
  },

  // Configure trusted origins for mobile apps and web clients.
  // The @better-auth/expo server plugin checks ctx.context.isTrustedOrigin
  // before appending ?cookie=... to the OAuth callback redirect, and the
  // "*" wildcard only matches http/https origins — custom URI schemes
  // like childcosts:// need to be listed explicitly, otherwise the
  // mobile client never receives the session cookie after Google sign-in.
  trustedOrigins: [
    "*",
    "childcosts://",
    "childcosts://*",
    "childcosts://**",
    "exp://",
    "exp://*",
    "exp://**",
    "exp://192.168.*.*:*/**",
    "http://localhost:*",
    "http://localhost:*/**",
  ],

  // OAuth state handling.
  //
  // Mobile OAuth on Android/Chrome Custom Tabs has been observed to drop the
  // Better Auth state cookie when the cookie is produced by the app-side fetch
  // or by a JS fetch on an intermediate page. Keep the cookie strategy, but make
  // the state cookie eligible for cross-site OAuth redirects explicitly.
  account: {
    storeStateStrategy: "cookie",
  },

  advanced: {
    useSecureCookies: true,
    defaultCookieAttributes: {
      secure: true,
      sameSite: "none",
      path: "/",
    },
  },

  // Social sign-in providers. Always registered so the route exists;
  // the hosting platform may inject credentials at runtime, otherwise
  // empty strings fall through and sign-in errors are surfaced to the
  // client (which is more useful than a 404 on the endpoint itself).
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
    apple: {
      clientId: process.env.APPLE_CLIENT_ID || "",
      clientSecret: process.env.APPLE_CLIENT_SECRET || "",
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    },
  },

  // Mobile (Expo) integration. Wires up the server side of
  // @better-auth/expo so the mobile client's signIn.social() flow
  // works without our ad-hoc workarounds.
  ...(expoAuthPlugin ? { plugins: [expoAuthPlugin] } : {}),
});

// Better Auth's CSRF check rejects requests with a missing or null Origin
// header (code: MISSING_OR_NULL_ORIGIN, status 403), and mobile clients
// don't send an Origin like browsers do. Inject one derived from the
// request host so the check passes for /api/auth/* — same-origin by
// definition, since the request hit our own server.
app.fastify.addHook("onRequest", async (request) => {
  if (request.url.startsWith("/api/auth/")) {
    const headers = request.raw.headers as Record<
      string,
      string | string[] | undefined
    >;
    if (!headers.origin) {
      const proto = (headers["x-forwarded-proto"] as string) || "https";
      const host = headers.host as string | undefined;
      if (host) {
        headers.origin = `${proto}://${host}`;
      }
    }
  }
});

// Store sign-in email for resending verification if needed
const signInEmailStore = new Map<string, string>();

// Add hook to normalize mobile Bearer tokens into Better Auth cookie headers.
// This lets manually-created mobile sessions work with Better Auth endpoints
// and with routes that still call app.requireAuth().
app.fastify.addHook("onRequest", async (request) => {
  if (request.url.startsWith("/api/")) {
    attachSessionCookieFromBearer(request);
  }
});

// Add hook to capture email from sign-in requests
app.fastify.addHook("onRequest", async (request, reply) => {
  // Only handle sign-in endpoint
  if (
    request.url.startsWith("/api/auth/sign-in/email") &&
    request.method === "POST"
  ) {
    try {
      // Get the email from the request body
      const body = request.body as any;
      if (body?.email) {
        // Store email temporarily for this request (using a simple key based on timestamp + random)
        const key = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        signInEmailStore.set(key, body.email);

        // Store the key in the reply object so we can retrieve it in onSend
        (reply as any)._signInEmailKey = key;

        app.logger.debug(
          { email: body.email },
          "Captured sign-in email for verification resend if needed",
        );

        // Clean up old entries to prevent memory leak
        for (const [k, _] of signInEmailStore) {
          const timestamp = parseInt(k.split("-")[0]);
          if (Date.now() - timestamp > 60000) {
            // Clean up entries older than 1 minute
            signInEmailStore.delete(k);
          }
        }
      }
    } catch (error) {
      app.logger.debug({ err: error }, "Could not capture sign-in email");
    }
  }

  // Only handle email verification endpoint
  if (request.url.startsWith("/api/auth/verify-email")) {
    app.logger.info(
      { url: request.url, query: request.query },
      "Email verification request received",
    );
  }

  // Log every /api/auth/* hit so we can trace the full OAuth flow,
  // not just the callback path. Skip the debug routes themselves to
  // avoid noisy self-traces.
  if (
    request.url.startsWith("/api/auth/") &&
    !request.url.startsWith("/api/auth/debug-") &&
    !request.url.startsWith("/api/auth/ok")
  ) {
    // Capture which credential headers are present (presence only,
    // not value) so we can tell whether the client is sending the
    // session cookie / bearer token we expect.
    const cookieHeader = request.headers.cookie;
    const authHeader = request.headers.authorization;
    const cookieNames: string[] = [];
    if (typeof cookieHeader === "string" && cookieHeader.length > 0) {
      for (const piece of cookieHeader.split(";")) {
        const idx = piece.indexOf("=");
        if (idx > 0) cookieNames.push(piece.slice(0, idx).trim());
      }
    }
    const entry = {
      ts: new Date().toISOString(),
      phase: "request",
      method: request.method,
      url: request.url,
      query: request.query,
      host: request.headers.host,
      referer: request.headers.referer,
      hasCookie: !!cookieHeader,
      cookieNames,
      hasAuthorization: !!authHeader,
      authScheme:
        typeof authHeader === "string" ? authHeader.split(" ")[0] : null,
    };
    app.logger.info(entry, "Auth route hit");
    pushAuthDebugLog(entry);
  }
});

// In-memory ring buffer so we can read recent OAuth events from a
// browser without needing Cloud Run log access.
const AUTH_DEBUG_LOG: any[] = [];
function pushAuthDebugLog(entry: any) {
  AUTH_DEBUG_LOG.push(entry);
  if (AUTH_DEBUG_LOG.length > 50) AUTH_DEBUG_LOG.shift();
}

app.fastify.addHook("onSend", async (request, reply, payload) => {
  // Native OAuth callback fix.
  //
  // In a browser-owned OAuth flow the Google callback is processed in the
  // external browser, not inside the React Native app. The browser can receive
  // Better Auth's Set-Cookie response, but the app cannot read that browser
  // cookie jar. The @better-auth/expo plugin normally appends the Better Auth
  // cookie to the deep-link redirect, but on our Cloud Run/Fastify wrapper the
  // redirect has been observed to reach childcosts://auth-callback without any
  // cookie/token query parameter. In that case the app correctly returns with
  // no active SecureStore session.
  //
  // When Better Auth redirects to the app scheme and also sends Set-Cookie,
  // mirror the Better Auth session cookie into the deep-link query so the
  // mobile app can put it into the expoClient SecureStore cookie cache before
  // calling get-session. This does not affect web OAuth redirects.
  try {
    const locationHeader = reply.getHeader("location");
    const location = Array.isArray(locationHeader)
      ? String(locationHeader[0] || "")
      : typeof locationHeader === "string"
        ? locationHeader
        : locationHeader != null
          ? String(locationHeader)
          : "";

    if (
      reply.statusCode >= 300 &&
      reply.statusCode < 400 &&
      location.startsWith("childcosts://") &&
      !location.includes("cookie=") &&
      !location.includes("token=")
    ) {
      const setCookieHeader = reply.getHeader("set-cookie");
      const setCookies = Array.isArray(setCookieHeader)
        ? setCookieHeader.map(String)
        : typeof setCookieHeader === "string"
          ? [setCookieHeader]
          : [];

      const betterAuthCookies = setCookies.filter((cookie) =>
        /(^|;|,\s*)(?:__Secure-)?better-auth\./i.test(cookie),
      );
      const sessionCookie =
        betterAuthCookies.find((cookie) => /session_token=/i.test(cookie)) ||
        betterAuthCookies[0];

      if (sessionCookie) {
        const redirectUrl = new URL(location);
        redirectUrl.searchParams.set("cookie", sessionCookie);

        const pair = sessionCookie.split(";", 1)[0] || "";
        const idx = pair.indexOf("=");
        if (idx > 0) {
          redirectUrl.searchParams.set("cookieName", pair.slice(0, idx));
        }

        reply.header("Location", redirectUrl.toString());
      }
    }
  } catch (err: any) {
    app.logger.warn(
      { err: err?.message || String(err), url: request.url },
      "Could not append Better Auth cookie to native OAuth redirect",
    );
  }

  // Capture what Better Auth sends back for every /api/auth/* hit
  // (excluding debug/health checks) so we can see how/why the flow
  // ended where it did.
  if (
    request.url.startsWith("/api/auth/") &&
    !request.url.startsWith("/api/auth/debug-") &&
    !request.url.startsWith("/api/auth/ok")
  ) {
    const entry: any = {
      ts: new Date().toISOString(),
      phase: "response",
      url: request.url,
      statusCode: reply.statusCode,
      location: reply.getHeader("location"),
      contentType: reply.getHeader("content-type"),
      setCookieNames: (() => {
        const h = reply.getHeader("set-cookie");
        const arr = Array.isArray(h) ? h.map(String) : typeof h === "string" ? [h] : [];
        return arr
          .map((cookie) => cookie.split(";", 1)[0]?.split("=")[0])
          .filter(Boolean);
      })(),
    };
    try {
      const text =
        typeof payload === "string" ? payload : payload?.toString?.() || "";
      entry.body = text.slice(0, 500);
    } catch {}
    app.logger.info(entry, "OAuth callback response");
    pushAuthDebugLog(entry);
  }

  return payload;
});

// Expose the recent OAuth events ring buffer.
app.fastify.get("/api/auth/debug-logs", async () => ({
  count: AUTH_DEBUG_LOG.length,
  entries: AUTH_DEBUG_LOG.slice(),
}));

// Accept client-side log entries so the mobile app can surface what
// it observed (e.g. WebBrowser.openAuthSessionAsync result) into our
// debug ring buffer without needing remote console access.
app.fastify.post<{ Body: { source?: string; event?: string; data?: any } }>(
  "/api/auth/debug-client-log",
  async (request) => {
    const { source, event, data } = request.body || {};
    pushAuthDebugLog({
      ts: new Date().toISOString(),
      phase: "client",
      source: source || "unknown",
      event: event || "log",
      data,
    });
    return { ok: true };
  },
);

// Catch the root path with an error query (Better Auth's default error
// redirect target when no frontend URL is configured). Surface the full
// query string and any other context so we stop seeing a bare 404 and can
// see what actually failed in the OAuth flow.
app.fastify.get<{ Querystring: Record<string, string> }>(
  "/",
  async (request, reply) => {
    const query = request.query || {};
    if (query.error || query.error_description) {
      const entry = {
        ts: new Date().toISOString(),
        phase: "root-error-landing",
        url: request.url,
        query,
        referer: request.headers.referer,
      };
      app.logger.warn(entry, "OAuth error redirect landed on /");
      pushAuthDebugLog(entry);
      // If this came from a mobile OAuth flow, bounce to the app deep link
      // so the user actually returns to the app with the error info.
      const deepLink = `childcosts://auth-callback?${new URLSearchParams(query as Record<string, string>).toString()}`;
      reply.header("Location", deepLink);
      reply.status(302);
      return "";
    }
    return { ok: true, service: "childcosts-backend" };
  },
);

// Add hook to intercept redirects after successful email verification
app.fastify.addHook("onSend", async (request, reply, payload) => {
  // Handle email verification redirects (302 status with Location header)
  if (
    request.url.startsWith("/api/auth/verify-email") &&
    reply.statusCode === 302
  ) {
    const location = reply.getHeader("Location");
    app.logger.info(
      {
        url: request.url,
        statusCode: reply.statusCode,
        location,
        query: request.query,
      },
      "Email verification redirect detected",
    );

    // Extract callbackURL from query params if provided by frontend
    const url = new URL(request.url, `http://${request.headers.host}`);
    const callbackURL =
      url.searchParams.get("callbackURL") ||
      url.searchParams.get("callback_url");

    // If there's a callback URL from the frontend, redirect there with success
    if (callbackURL) {
      try {
        const decodedCallback = decodeURIComponent(callbackURL);
        const redirectUrl = new URL(decodedCallback);
        redirectUrl.searchParams.set("verified", "true");

        app.logger.info(
          { redirectUrl: redirectUrl.toString() },
          "Redirecting to frontend callback URL",
        );
        reply.header("Location", redirectUrl.toString());
        return payload;
      } catch (error) {
        app.logger.error({ err: error, callbackURL }, "Invalid callback URL");
      }
    }

    // If the redirect is to "/" (default Better Auth behavior), redirect to a mobile deep link or frontend
    if (location === "/" || !location) {
      // Use environment variable for frontend URL, or default to childcosts deep link
      const frontendUrl =
        process.env.FRONTEND_URL || "childcosts://auth-callback";
      const redirectUrl = `${frontendUrl}${frontendUrl.includes("?") ? "&" : "?"}verified=true`;

      app.logger.info(
        { redirectUrl },
        "Redirecting to frontend app after verification",
      );
      reply.header("Location", redirectUrl);
    }

    return payload;
  }

  // Only process auth endpoints for error handling
  if (!request.url.startsWith("/api/auth/")) {
    return payload;
  }

  // Only process error responses (4xx, 5xx status codes)
  const statusCode = reply.statusCode;
  if (statusCode < 400) {
    return payload;
  }

  try {
    const payloadStr =
      typeof payload === "string" ? payload : payload?.toString() || "{}";
    const body = JSON.parse(payloadStr);

    // Log the original error for debugging
    app.logger.warn(
      {
        url: request.url,
        method: request.method,
        statusCode,
        originalError: body,
      },
      "Auth endpoint error being processed",
    );

    // Enhance error messages based on endpoint and error type
    const endpoint = request.url.replace("/api/auth/", "").split("?")[0];
    const method = request.method;

    // Sign in endpoint errors
    if (endpoint === "sign-in/email" && method === "POST") {
      if (statusCode === 401) {
        // Check if error is about email verification
        if (body.message?.includes("verif") || body.error?.includes("verif")) {
          app.logger.info({}, "Email verification required for login");

          // Try to resend verification email
          try {
            const emailKey = (reply as any)._signInEmailKey;
            const email = emailKey ? signInEmailStore.get(emailKey) : undefined;

            if (email) {
              app.logger.info(
                { email },
                "Resending verification email for unverified user attempting sign-in",
              );

              // Find the user by email to send verification email
              const users = await app.db
                .select()
                .from(authSchema.user)
                .where(eq(authSchema.user.email, email));

              if (users.length > 0) {
                const foundUser = users[0];

                if (!foundUser.emailVerified) {
                  // Send verification email using Resend
                  const verificationEmailResult = await resend.emails.send({
                    from: "Child Expense Tracker <noreply@example.com>",
                    to: email,
                    subject: "Verify your email address",
                    html: `
                      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Verify Your Email Address</h2>
                        <p>We noticed you tried to sign in to Child Expense Tracker. Your email address needs to be verified before you can access your account.</p>
                        <p style="margin: 30px 0;">
                          <a href="${process.env.FRONTEND_URL || "childcosts://auth-callback"}?action=verify-email" style="background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                            Verify Email Address
                          </a>
                        </p>
                        <p style="color: #666; font-size: 14px;">
                          If the button doesn't work, please sign in again and follow the verification prompt in the app.
                        </p>
                        <p style="color: #666; font-size: 12px; margin-top: 40px;">
                          If you didn't request this, you can safely ignore this email.
                        </p>
                      </div>
                    `,
                  });

                  if (verificationEmailResult.error) {
                    app.logger.warn(
                      { err: verificationEmailResult.error, email },
                      "Failed to resend verification email on sign-in attempt",
                    );
                  } else {
                    app.logger.info(
                      {
                        emailId: verificationEmailResult.data?.id,
                        email,
                        userId: foundUser.id,
                      },
                      "Verification email resent successfully for unverified sign-in attempt",
                    );
                  }
                }
              }

              // Clean up the email from the store
              if (emailKey) {
                signInEmailStore.delete(emailKey);
              }
            }
          } catch (error) {
            app.logger.warn(
              { err: error },
              "Error attempting to resend verification email on sign-in",
            );
          }

          return JSON.stringify({
            error: "EMAIL_NOT_VERIFIED",
            message:
              "Email not verified. A verification email has been sent to your inbox. Please verify your email to continue.",
            statusCode: 401,
            needsVerification: true,
          });
        }

        // Invalid credentials
        return JSON.stringify({
          error: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
          statusCode: 401,
        });
      }
    }

    // Sign up endpoint errors
    if (endpoint === "sign-up/email" && method === "POST") {
      // Handle all validation and error status codes (400, 422, etc.)
      if (statusCode >= 400 && statusCode < 500) {
        const msg = (body.message || body.error || "").toLowerCase();

        // Email already exists
        if (
          msg.includes("already") ||
          msg.includes("exists") ||
          msg.includes("duplicate") ||
          msg.includes("unique") ||
          msg.includes("constraint")
        ) {
          return JSON.stringify({
            error: "EMAIL_EXISTS",
            message: "An account with this email already exists",
            statusCode: 422,
          });
        }

        // Email is required or missing
        if (
          msg.includes("email") &&
          (msg.includes("required") || msg.includes("missing"))
        ) {
          return JSON.stringify({
            error: "INVALID_EMAIL",
            message: "Email is required",
            statusCode: 422,
          });
        }

        // Invalid email format
        if (
          msg.includes("email") &&
          (msg.includes("invalid") ||
            msg.includes("format") ||
            msg.includes("valid"))
        ) {
          return JSON.stringify({
            error: "INVALID_EMAIL",
            message: "Please enter a valid email address",
            statusCode: 422,
          });
        }

        // Password is required or missing
        if (
          msg.includes("password") &&
          (msg.includes("required") || msg.includes("missing"))
        ) {
          return JSON.stringify({
            error: "PASSWORD_TOO_SHORT",
            message: "Password is required",
            statusCode: 422,
          });
        }

        // Password too short
        if (
          msg.includes("password") &&
          (msg.includes("short") ||
            msg.includes("length") ||
            msg.includes("8") ||
            msg.includes("minimum") ||
            msg.includes("min") ||
            msg.includes("least"))
        ) {
          return JSON.stringify({
            error: "PASSWORD_TOO_SHORT",
            message: "Password must be at least 8 characters long",
            statusCode: 422,
          });
        }

        // Generic email error
        if (msg.includes("email")) {
          return JSON.stringify({
            error: "INVALID_EMAIL",
            message: "Please enter a valid email address",
            statusCode: 422,
          });
        }

        // Generic password error
        if (msg.includes("password")) {
          return JSON.stringify({
            error: "PASSWORD_TOO_SHORT",
            message: "Password must be at least 8 characters long",
            statusCode: 422,
          });
        }

        // If no specific error detected, log and return generic validation error
        app.logger.warn(
          {
            endpoint,
            statusCode,
            originalMessage: body.message || body.error,
          },
          "Unhandled signup validation error",
        );

        return JSON.stringify({
          error: "VALIDATION_ERROR",
          message: body.message || body.error || "Invalid signup data",
          statusCode: 422,
        });
      }
    }

    // Email verification errors
    if (endpoint === "verify-email" && method === "GET") {
      if (statusCode === 400 || statusCode === 404) {
        // If there's a callback URL, redirect to it with error parameter
        const url = new URL(request.url, `http://${request.headers.host}`);
        const callbackURL =
          url.searchParams.get("callbackURL") ||
          url.searchParams.get("callback_url");

        if (callbackURL) {
          try {
            const decodedCallback = decodeURIComponent(callbackURL);
            const redirectUrl = new URL(decodedCallback);
            redirectUrl.searchParams.set("error", "verification_failed");
            redirectUrl.searchParams.set(
              "message",
              "The verification link is invalid or has expired",
            );

            app.logger.info(
              { redirectUrl: redirectUrl.toString() },
              "Redirecting to frontend with verification error",
            );
            reply.header("Location", redirectUrl.toString());
            reply.status(302);
            return "";
          } catch (error) {
            app.logger.error(
              { err: error, callbackURL },
              "Invalid callback URL in error redirect",
            );
          }
        }

        // If no callback URL, redirect to frontend with error
        const frontendUrl =
          process.env.FRONTEND_URL || "childcosts://auth-callback";
        const redirectUrl = `${frontendUrl}${frontendUrl.includes("?") ? "&" : "?"}error=verification_failed&message=${encodeURIComponent("The verification link is invalid or has expired")}`;

        app.logger.info(
          { redirectUrl },
          "Redirecting to frontend with verification error",
        );
        reply.header("Location", redirectUrl);
        reply.status(302);
        return "";
      }
    }

    // Password reset errors
    if (endpoint === "reset-password" && method === "POST") {
      if (statusCode === 400 || statusCode === 404) {
        return JSON.stringify({
          error: "INVALID_RESET_LINK",
          message: "The password reset link is invalid or has expired",
          statusCode: statusCode,
        });
      }
    }

    // OAuth errors
    if (endpoint === "sign-in/social" && method === "POST") {
      if (statusCode === 400 || statusCode === 401) {
        return JSON.stringify({
          error: "OAUTH_ERROR",
          message: body.message || "Social sign-in failed. Please try again.",
          statusCode: statusCode,
        });
      }
    }

    // Return enhanced generic error
    return JSON.stringify({
      error: body.error || "AUTH_ERROR",
      message: body.message || "An authentication error occurred",
      statusCode: statusCode,
    });
  } catch (e) {
    // If we can't parse or enhance, return original payload
    return payload;
  }
});

// Add custom error handler for Better Auth to provide detailed error responses
app.fastify.setErrorHandler(async (error: any, request, reply) => {
  app.logger.error(
    {
      err: error,
      method: request.method,
      url: request.url,
      statusCode: error?.statusCode || 500,
      message: error?.message,
    },
    "Request error in error handler",
  );

  // Check if this is an auth-related error
  const isAuthEndpoint = request.url.startsWith("/api/auth/");

  if (isAuthEndpoint) {
    const statusCode = error?.statusCode || 500;
    const msg = (error?.message || "").toLowerCase();

    // Better Auth specific error handling
    if (statusCode === 401) {
      // Handle various authentication failures with specific messages
      const errorMessage = error?.message || "";

      // Email not verified
      if (errorMessage.includes("email") && errorMessage.includes("verif")) {
        // Try to resend verification email in error handler as well
        try {
          const emailKey = (reply as any)._signInEmailKey;
          const email = emailKey ? signInEmailStore.get(emailKey) : undefined;

          if (email) {
            app.logger.info(
              { email },
              "Resending verification email for unverified user attempting sign-in (error handler)",
            );

            // Find the user by email
            const users = await app.db
              .select()
              .from(authSchema.user)
              .where(eq(authSchema.user.email, email));

            if (users.length > 0) {
              const foundUser = users[0];

              if (!foundUser.emailVerified) {
                // Send verification email using Resend
                const verificationEmailResult = await resend.emails.send({
                  from: "Child Expense Tracker <noreply@example.com>",
                  to: email,
                  subject: "Verify your email address",
                  html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h2>Verify Your Email Address</h2>
                      <p>We noticed you tried to sign in to Child Expense Tracker. Your email address needs to be verified before you can access your account.</p>
                      <p style="margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL || "childcosts://auth-callback"}?action=verify-email" style="background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                          Verify Email Address
                        </a>
                      </p>
                      <p style="color: #666; font-size: 14px;">
                        If the button doesn't work, please sign in again and follow the verification prompt in the app.
                      </p>
                      <p style="color: #666; font-size: 12px; margin-top: 40px;">
                        If you didn't request this, you can safely ignore this email.
                      </p>
                    </div>
                  `,
                });

                if (verificationEmailResult.error) {
                  app.logger.warn(
                    { err: verificationEmailResult.error, email },
                    "Failed to resend verification email on sign-in attempt (error handler)",
                  );
                } else {
                  app.logger.info(
                    {
                      emailId: verificationEmailResult.data?.id,
                      email,
                      userId: foundUser.id,
                    },
                    "Verification email resent successfully for unverified sign-in attempt (error handler)",
                  );
                }
              }
            }

            // Clean up the email from the store
            if (emailKey) {
              signInEmailStore.delete(emailKey);
            }
          }
        } catch (error) {
          app.logger.warn(
            { err: error },
            "Error attempting to resend verification email on sign-in (error handler)",
          );
        }

        return reply.status(401).send({
          error: "EMAIL_NOT_VERIFIED",
          message:
            "Email not verified. A verification email has been sent to your inbox. Please verify your email to continue.",
          statusCode: 401,
          needsVerification: true,
        });
      }

      // Invalid credentials (wrong password or user not found)
      if (
        errorMessage.includes("Invalid") ||
        errorMessage.includes("credentials") ||
        errorMessage.includes("password") ||
        errorMessage.includes("not found")
      ) {
        return reply.status(401).send({
          error: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
          statusCode: 401,
        });
      }

      // Generic unauthorized
      return reply.status(401).send({
        error: "UNAUTHORIZED",
        message: error?.message || "Authentication required",
        statusCode: 401,
      });
    }

    if (statusCode === 403) {
      return reply.status(403).send({
        error: "FORBIDDEN",
        message: error?.message || "Access forbidden",
        statusCode: 403,
      });
    }

    // Handle all validation errors (400, 422)
    if (statusCode === 400 || statusCode === 422) {
      // Email already exists
      if (
        msg.includes("already") ||
        msg.includes("exists") ||
        msg.includes("duplicate") ||
        msg.includes("unique") ||
        msg.includes("constraint")
      ) {
        return reply.status(422).send({
          error: "EMAIL_EXISTS",
          message: "An account with this email already exists",
          statusCode: 422,
        });
      }

      // Email is required or missing
      if (
        msg.includes("email") &&
        (msg.includes("required") || msg.includes("missing"))
      ) {
        return reply.status(422).send({
          error: "INVALID_EMAIL",
          message: "Email is required",
          statusCode: 422,
        });
      }

      // Invalid email format
      if (
        msg.includes("email") &&
        (msg.includes("invalid") ||
          msg.includes("format") ||
          msg.includes("valid"))
      ) {
        return reply.status(422).send({
          error: "INVALID_EMAIL",
          message: "Please enter a valid email address",
          statusCode: 422,
        });
      }

      // Password is required or missing
      if (
        msg.includes("password") &&
        (msg.includes("required") || msg.includes("missing"))
      ) {
        return reply.status(422).send({
          error: "PASSWORD_TOO_SHORT",
          message: "Password is required",
          statusCode: 422,
        });
      }

      // Password too short
      if (
        msg.includes("password") &&
        (msg.includes("short") ||
          msg.includes("length") ||
          msg.includes("8") ||
          msg.includes("minimum") ||
          msg.includes("min") ||
          msg.includes("least"))
      ) {
        return reply.status(422).send({
          error: "PASSWORD_TOO_SHORT",
          message: "Password must be at least 8 characters long",
          statusCode: 422,
        });
      }

      // Generic email error
      if (msg.includes("email")) {
        return reply.status(422).send({
          error: "INVALID_EMAIL",
          message: "Please enter a valid email address",
          statusCode: 422,
        });
      }

      // Generic password error
      if (msg.includes("password")) {
        return reply.status(422).send({
          error: "PASSWORD_TOO_SHORT",
          message: "Password must be at least 8 characters long",
          statusCode: 422,
        });
      }

      // Log unhandled validation errors
      app.logger.warn(
        {
          url: request.url,
          statusCode,
          originalMessage: error?.message,
        },
        "Unhandled validation error in error handler",
      );

      // Generic validation error
      return reply.status(422).send({
        error: "VALIDATION_ERROR",
        message: error?.message || "Invalid request data",
        statusCode: 422,
      });
    }

    // Other auth errors
    return reply.status(statusCode).send({
      error: "AUTH_ERROR",
      message: error?.message || "Authentication error",
      statusCode,
    });
  }

  // Non-auth errors - use default error response
  const statusCode = error?.statusCode || 500;
  return reply.status(statusCode).send({
    error: error?.name || "ERROR",
    message: error?.message || "An error occurred",
    statusCode,
  });
});

// Register routes - add your route modules here
// IMPORTANT: Always use registration functions to avoid circular dependency issues
registerAuthRoutes(app);
registerProjectsRoutes(app);
registerParticipantsRoutes(app);
registerExpensesRoutes(app);
registerSettlementsRoutes(app);

await app.run();
app.logger.info("Application running with email verification enabled");
