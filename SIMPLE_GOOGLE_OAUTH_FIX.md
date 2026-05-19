# Simple Google OAuth mobile fix

This build stops using Better Auth's cookie-based OAuth state for native Android Google sign-in.

## Why

The production logs showed this pattern:

- `POST /api/auth/sign-in/social` sets `__Secure-better-auth.state`
- `GET /api/auth/callback/google` arrives with `hasCookie:false`
- Better Auth returns `state_mismatch` / `please_restart_the_process`

That means the state cookie is not preserved across the Android/Google browser round-trip. More cookie/proxy patches are not the simplest stable solution.

## What changed

### Backend

Added a minimal mobile-only Google OAuth flow:

- `GET /api/auth/mobile-google/start?callbackURL=childcosts://auth-callback`
- `GET /api/auth/mobile-google/callback`

The backend stores OAuth state in the existing `verification` table, exchanges Google's code itself, verifies the Google `id_token`, creates/updates the `user`, links the `account`, creates a Better Auth-compatible `session` row, and redirects back to the app with:

- `token=<session_token>`
- `cookieName=__Secure-better-auth.session_token`

### Frontend

Native Google login now opens:

`/api/auth/mobile-google/start?callbackURL=...`

Apple/GitHub still use the previous path.

## Required Google Console change

Add this Authorized redirect URI to the Google OAuth client:

`https://<backend-domain>/api/auth/mobile-google/callback`

For the current deployment this is likely:

`https://prod-proj-rbwzuzgnbjla5whlal77n-liwg5h36mq-ey.a.run.app/api/auth/mobile-google/callback`

Keep the old Better Auth URI as well:

`https://<backend-domain>/api/auth/callback/google`

## Expected debug log

After this fix, the native Google flow should no longer hit Better Auth's `/api/auth/callback/google` route. The expected flow is:

1. `GET /api/auth/mobile-google/start`
2. Google login / 2FA
3. `GET /api/auth/mobile-google/callback`
4. app receives `childcosts://auth-callback?token=...&cookieName=...`
5. `GET /api/auth/get-session` returns a user, not `null`

If the log still shows `POST /api/auth/sign-in/social` followed by `/api/auth/callback/google`, the installed app build is still using an older bundle.
