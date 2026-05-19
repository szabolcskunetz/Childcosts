# OAuth browser-flow fix

## What the new debug log proved

The prior `please_restart_the_process` / state mismatch was resolved by storing OAuth state in the cookie.

The newer log shows a different failure pattern:

- `/api/auth/sign-in/social` returns a Google authorization URL.
- `/api/auth/expo-authorization-proxy` redirects to Google.
- No `/api/auth/callback/google` request appears after that.
- The client then polls `/api/auth/get-session` repeatedly and receives `null`.

That means the native Expo social-login proxy path is not completing the browser redirect chain back through the backend callback, so the session is never created.

## Code change

`contexts/AuthContext.tsx` now uses a browser-owned OAuth flow on native platforms:

1. Open `/api/auth/initiate-social/:provider?callbackURL=...` in the system browser.
2. The browser receives the Better Auth state/PKCE cookie.
3. The browser goes to Google.
4. Google returns to `/api/auth/callback/google` on the backend.
5. Better Auth redirects to the app deep link.
6. The app stores the returned Better Auth cookie/token into the `@better-auth/expo` cookie store.
7. The app waits for `/api/auth/get-session` to return a real user.

Web still uses `authClient.signIn.social()`.

## Files changed

- `contexts/AuthContext.tsx`

## What to check after deployment

The debug log should now contain this sequence:

1. `GET /api/auth/initiate-social/google?...`
2. `GET /api/auth/callback/google?...`
3. a deep-link/browser-result client debug entry
4. `GET /api/auth/get-session` returning a user object, not `null`

If step 2 is still missing, the browser/Google step is not returning to the backend. If step 2 exists but get-session is still null, the session cookie is not being appended to or stored from the deep link.
