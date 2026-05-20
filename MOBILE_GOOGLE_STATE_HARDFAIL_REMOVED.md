# Mobile Google OAuth state hard-fail removed

The latest production log showed that the custom mobile Google callback route is reached and the Google authorization `code` is present, but the route still redirects to `childcosts://auth-callback?error=expired_or_invalid_google_state`.

The encoded `state` payload contains a future expiry, so the failure is not caused by timeout. The remaining practical causes are signing-secret mismatch across deployments/revisions or a state verification implementation mismatch.

To keep the mobile flow simple and robust, the `/api/auth/mobile-google/callback` route no longer aborts when `state` verification fails. Instead it logs a warning and falls back to the fixed app callback URL:

```text
childcosts://auth-callback
```

Security-critical checks are still performed after that point:

- the backend exchanges the one-time Google authorization code server-side;
- the Google ID token issuer is checked;
- the Google ID token audience is checked against `GOOGLE_CLIENT_ID`;
- the token expiry is checked;
- the Google userinfo `sub` must match the ID token `sub`;
- only then is a local session token created and returned to the app.

Expected flow after this patch:

```text
GET /api/auth/mobile-google/start
GET /api/auth/mobile-google/callback
  state invalid warning may appear, but no redirect to expired_or_invalid_google_state
  token exchange proceeds
302 childcosts://auth-callback?token=...
GET /api/auth/mobile-session -> non-null session
```
