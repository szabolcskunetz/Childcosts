import type { App } from '../index.js';

export function registerAuthRoutes(app: App) {
  // Note: Authentication endpoints are handled by Better Auth at /api/auth/*
  // This file is reserved for any custom authentication-related routes
  // if needed in the future.

  // Better Auth provides these endpoints automatically:
  // POST /api/auth/sign-up/email - Sign up with email/password
  // POST /api/auth/sign-in/email - Sign in with email/password
  // POST /api/auth/send-verification-email - Send verification email
  // GET /api/auth/verify-email - Verify email with token
  // POST /api/auth/request-password-reset - Request password reset
  // POST /api/auth/reset-password - Reset password with token
  // And many more...
}
