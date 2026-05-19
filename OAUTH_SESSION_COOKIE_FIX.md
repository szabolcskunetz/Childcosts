# OAuth session-cookie fix

This patch addresses the case where Google sign-in completes and the app is opened again via `childcosts://auth-callback`, but `authClient.getSession()` still returns `null`.

Observed symptom:

```text
Social sign-in completed, but no active session was returned by the backend.
```

Root cause:

The Google callback is processed in the external browser. Better Auth creates a session and sends it as `Set-Cookie` to the browser, but the React Native app cannot read the browser cookie jar. If the `@better-auth/expo` server plugin does not append the cookie to the deep-link redirect, the app returns without any session stored in SecureStore.

Change made:

`backend/src/index.ts` now detects native OAuth redirects to `childcosts://...` that include Better Auth `Set-Cookie` headers, and appends the session cookie to the deep-link URL as `?cookie=...&cookieName=...`. The existing mobile code in `contexts/AuthContext.tsx` already reads this query parameter and writes it to the Expo SecureStore cookie cache used by `@better-auth/expo/client`.

Expected debug sequence after this patch:

```text
GET /api/auth/initiate-social/google
GET /api/auth/callback/google
response location: childcosts://auth-callback?cookie=...
client event: session-cookie-stored
GET /api/auth/get-session -> user object, not null
```

After deploying, clear previous auth state before testing:

- uninstall/reinstall the Android app, or clear the app storage;
- clear Chrome cookies for the backend domain if testing through Chrome Custom Tabs;
- then retry Google sign-in.
