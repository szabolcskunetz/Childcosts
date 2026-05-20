# Mobile Google OAuth stateless state fix

## Problem shown by the latest debug log

The mobile Google OAuth callback reached the new endpoint:

```text
/api/auth/mobile-google/callback
```

but the backend redirected back to the app with:

```text
expired_or_invalid_google_state
```

That means the previous implementation still depended on finding the OAuth `state` in server-side temporary storage. In Cloud Run/serverless deployments `/start` and `/callback` can hit different instances, or a sandbox redeploy can clear process-local/temporary state. The callback then receives a valid Google `state`, but the backend cannot find its matching temporary record.

## Fix

The mobile Google OAuth state is now stateless:

- `/api/auth/mobile-google/start` creates an HMAC-signed `state` value.
- The state contains only the mobile callback URL, a nonce, and an expiry timestamp.
- `/api/auth/mobile-google/callback` verifies the HMAC and expiry directly.
- No browser cookies, process memory, or database verification row is required for the mobile OAuth state check.

The flow remains:

```text
GET /api/auth/mobile-google/start
  -> Google OAuth
GET /api/auth/mobile-google/callback
  -> childcosts://auth-callback?token=...
GET /api/auth/get-session
  -> active user session
```

## Required Google Console redirect URI

Keep this Authorized redirect URI configured:

```text
https://spx6cgn7eucdtqd2deq8jn96wpw5b83b.app.specular.dev/api/auth/mobile-google/callback
```

## Expected next debug result

The previous error should disappear:

```text
expired_or_invalid_google_state
```

If the next error is `google_token_exchange_failed`, check that the Google Console redirect URI exactly matches the deployed backend URL and that `GOOGLE_CLIENT_SECRET` belongs to the same OAuth client as `GOOGLE_CLIENT_ID`.
