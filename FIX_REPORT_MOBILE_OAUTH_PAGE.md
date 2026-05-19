# Mobile OAuth state_mismatch fix

The latest backend log showed `POST /api/auth/sign-in/social` setting `__Secure-better-auth.state`, followed by `GET /api/auth/callback/google` with `hasCookie:false`. This means the sign-in POST was not executed in the same browser cookie jar that later received Google’s callback.

This patch adds `/api/auth/mobile-social/:provider`, a small browser bootstrap page. Native Expo opens this page, the page performs `fetch('/api/auth/sign-in/social', { credentials: 'include' })` inside the browser, so the state/PKCE cookie is stored in the browser. It then redirects to Google. The Google callback should now include `__Secure-better-auth.state`.

Expected debug sequence:

1. `GET /api/auth/mobile-social/google`
2. `POST /api/auth/sign-in/social` with response `setCookieNames:["__Secure-better-auth.state"]`
3. `GET /api/auth/callback/google` with `hasCookie:true` and `cookieNames:["__Secure-better-auth.state"]`
4. redirect to `childcosts://auth-callback?...cookie=...`
5. app stores the cookie and `get-session` returns a user.
