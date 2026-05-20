# Final Google Auth Hardening

This package hardens the mobile Google sign-in path end-to-end.

## What changed

1. Mobile Google OAuth no longer depends on Better Auth's browser/state cookie round-trip.
   - Start: `/api/auth/mobile-google/start`
   - Callback: `/api/auth/mobile-google/callback`
   - OAuth state is HMAC-signed and stateless.

2. The callback now completes the entire Google flow server-side.
   - Exchanges the Google authorization code.
   - Validates ID token issuer, audience, and expiry.
   - Fetches profile data from Google userinfo.
   - Creates/updates the local user.
   - Creates a server-side session row.
   - Returns the session token through the app deep link.

3. The app stores the returned token in two forms.
   - Bearer token fallback.
   - Better Auth Expo cookie-store compatible JSON.

4. Session loading is now resilient.
   - First tries Better Auth `getSession`.
   - Falls back to `/api/auth/mobile-session`, which validates the session token directly against the database.

5. Protected backend routes are now resilient.
   - Bearer tokens are normalized into Better Auth cookie headers.
   - Expense update/delete and account deletion use the shared fallback auth helper.

6. The auth callback screen also stores returned mobile OAuth tokens.
   - This prevents a race where Expo Router opens `/auth-callback` before the AuthContext deep-link listener finishes.

## Google Console requirement

The following redirect URI must be present in Google Cloud Console:

`https://spx6cgn7eucdtqd2deq8jn96wpw5b83b.app.specular.dev/api/auth/mobile-google/callback`

You can verify the backend's expected URI at:

`/api/auth/debug-config`

Field:

`authBaseUrl.expectedMobileGoogleRedirectUri`

## Expected debug log after a successful login

- `GET /api/auth/mobile-google/start`
- `GET /api/auth/mobile-google/callback`
- redirect to `childcosts://auth-callback?token=...`
- `GET /api/auth/mobile-session` returns user/session

The old problematic path should no longer be used for mobile Google login:

- `POST /api/auth/sign-in/social`
- `GET /api/auth/callback/google`
