# OAuth cookie context fix

This patch addresses the latest logs where `/api/auth/callback/google` arrives with `hasCookie:false`, producing `state_mismatch` / `please_restart_the_process`.

Changes:

1. Native mobile sign-in now opens `/api/auth/initiate-social/:provider`, not `/api/auth/mobile-social/:provider`.
   - This returns a real browser navigation `302` with `Set-Cookie` before redirecting to Google.
   - It avoids relying on JavaScript `fetch()` on an intermediate page to persist the Better Auth state cookie on Android.

2. Better Auth cookies now explicitly use:
   - `Secure`
   - `SameSite=None`
   - `Path=/`

3. `/api/auth/initiate-social/:provider` sets a short-lived `childcosts_oauth_probe` cookie for diagnostics.
   - If `/api/auth/callback/google` still logs `hasCookie:false`, the browser/hosting layer is dropping the entire cookie jar during the OAuth round-trip.
   - If the probe appears but `__Secure-better-auth.state` does not, the remaining issue is Better Auth cookie attributes/name/path.

Expected debug sequence:

```text
GET /api/auth/initiate-social/google
  setCookieNames includes __Secure-better-auth.state and childcosts_oauth_probe
GET /api/auth/callback/google
  hasCookie:true
  cookieNames includes __Secure-better-auth.state
302 childcosts://auth-callback?cookie=...
GET /api/auth/get-session -> non-null
```
