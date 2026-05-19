# ChildCosts auth fixes

## Primary Google sign-in fixes

1. Aligned Better Auth packages to `1.4.22` in both the app and backend package manifests:
   - `better-auth`
   - `@better-auth/expo`

2. Replaced the native manual OAuth workaround in `contexts/AuthContext.tsx` with the standard Better Auth Expo flow:
   - uses `authClient.signIn.social({ provider, callbackURL })`
   - uses `Linking.createURL("auth-callback")` on native instead of hard-coding `childcosts://auth-callback`
   - waits for a real Better Auth session before returning success

3. Removed the fragile manual cookie/token deep-link parsing from `AuthContext.tsx`:
   - no more `?cookie=...`, `?token=...`, or `?cookieName=...` handling in the app login function
   - no premature `return` before `fetchUser()`

4. Updated API calls in `utils/api.ts`:
   - sends Better Auth cookie via `authClient.getCookie()` when available
   - keeps Bearer token as a fallback
   - uses `credentials: "include"` on web

5. Backend OAuth/Expo fixes:
   - expanded `trustedOrigins` for `childcosts://`, `exp://`, Expo dev URLs, and localhost
   - removed duplicate manual `/api/auth/expo-authorization-proxy` route because the official `@better-auth/expo` server plugin provides it
   - removed custom OAuth callback `Set-Cookie` → query-param injection from `backend/src/index.ts`; cookie propagation is now left to the official Expo plugin

6. Web callback cleanup:
   - `app/auth-callback.tsx` no longer fails just because `better_auth_token` is missing
   - after OAuth callback, it refreshes the session through `fetchUser()` instead
   - replaced wildcard `postMessage(..., "*")` with `window.location.origin`

7. `app/auth-popup.tsx` now handles social sign-in errors instead of leaving the popup stuck on a spinner.

## Important deployment check

Google Cloud Console must contain the backend redirect URI exactly in this form:

```text
https://<your-backend-domain>/api/auth/callback/google
```

Also make sure the deployed backend has these environment variables:

```text
BETTER_AUTH_URL=https://<your-backend-domain>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

## Validation note

I could not run a full install/typecheck in this sandbox because the ZIP did not include `node_modules` and the environment cannot fetch npm packages. After extracting this ZIP locally, run:

```bash
npm install
npm run lint
cd backend
npm install
npm run typecheck
```

If you use Bun for the backend, regenerate the lockfile after the package version alignment.
