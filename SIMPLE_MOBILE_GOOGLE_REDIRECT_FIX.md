# Simple mobile Google OAuth redirect fix

This package fixes the 500 error:

`Called reply with an invalid status code: https://accounts.google.com/...`

## Cause

The custom `/api/auth/mobile-google/start` and `/api/auth/mobile-google/callback` routes used Fastify v4-style redirect ordering:

```ts
reply.redirect(302, url)
```

The project uses Fastify v5, where this is interpreted incorrectly and the Google URL is treated as the status code.

## Fix

All mobile Google OAuth redirects now use the unambiguous form:

```ts
return reply.code(302).header("Location", url).send();
```

## Expected flow

After deployment, tapping Google sign-in should open Google directly instead of returning the JSON `AUTH_ERROR`.

The backend log should show:

```text
GET /api/auth/mobile-google/start
302 Location: https://accounts.google.com/o/oauth2/v2/auth?...
GET /api/auth/mobile-google/callback
302 Location: childcosts://auth-callback?token=...
GET /api/auth/get-session -> non-null
```
