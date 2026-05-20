// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.
import type { App } from "../index.js";
import { session, user } from "../db/auth-schema.js";
import { and, eq, gt } from "drizzle-orm";

export type AuthSessionResult = {
  session: {
    id: string;
    token: string;
    userId: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  };
};

function parseCookieHeader(cookieHeader?: string | string[]) {
  const out = new Map<string, string>();
  const raw = Array.isArray(cookieHeader)
    ? cookieHeader.join(";")
    : cookieHeader || "";
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out.set(key, decodeURIComponent(value));
  }
  return out;
}

export function getAuthTokenFromRequest(request: any): string | null {
  const auth = request.headers?.authorization;
  if (typeof auth === "string") {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }

  const cookies = parseCookieHeader(request.headers?.cookie);
  return (
    cookies.get("__Secure-better-auth.session_token") ||
    cookies.get("better-auth.session_token") ||
    cookies.get("better-auth.session-token") ||
    null
  );
}

export function attachSessionCookieFromBearer(request: any) {
  const token = getAuthTokenFromRequest(request);
  if (!token) return;

  const existing =
    typeof request.headers?.cookie === "string" ? request.headers.cookie : "";
  if (
    existing.includes("better-auth.session_token") ||
    existing.includes("__Secure-better-auth.session_token")
  ) {
    return;
  }

  const encoded = encodeURIComponent(token);
  const appended = [
    existing,
    `__Secure-better-auth.session_token=${encoded}`,
    `better-auth.session_token=${encoded}`,
  ]
    .filter(Boolean)
    .join("; ");

  request.headers.cookie = appended;
  if (request.raw?.headers) {
    request.raw.headers.cookie = appended;
  }
}

export async function getDbSessionFromRequest(
  app: App,
  request: any,
): Promise<AuthSessionResult | null> {
  const token = getAuthTokenFromRequest(request);
  if (!token) return null;

  const rows = await app.db
    .select({ session, user })
    .from(session)
    .innerJoin(user, eq(session.userId, user.id))
    .where(and(eq(session.token, token), gt(session.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    session: row.session,
    user: row.user,
  };
}

export async function requireAnyAuth(
  app: App,
  request: any,
  reply: any,
): Promise<AuthSessionResult | any | null> {
  const dbSession = await getDbSessionFromRequest(app, request);
  if (dbSession) return dbSession;

  attachSessionCookieFromBearer(request);

  try {
    return await app.requireAuth()(request, reply);
  } catch (error) {
    throw error;
  }
}
