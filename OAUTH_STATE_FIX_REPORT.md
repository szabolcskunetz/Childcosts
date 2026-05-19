# OAuth state fix after `please_restart_the_process`

The backend debug log showed that Google's callback reached the backend and included both:

- `__Secure-better-auth.state`
- `__Secure-better-auth.session_token`

The failure therefore was not a Google redirect URI mismatch. Better Auth redirected to:

`/api/auth/error?error=please_restart_the_process`

This points to OAuth state validation failure. In Better Auth, database-backed OAuth state can fail in serverless or multi-instance deployments if the verification record is unavailable when the callback request arrives, or if the callback is replayed/stale.

## Change made

`backend/src/index.ts` now configures Better Auth with:

```ts
account: {
  storeStateStrategy: "cookie",
},
```

This stores OAuth state in the encrypted/signed browser cookie instead of relying on a database verification lookup. The callback log confirms that the browser is already returning the state cookie, so this is the most targeted fix for the observed failure.

## After deploying

1. Rebuild and redeploy the backend.
2. Clear the old cookies for the backend domain in the external browser / Chrome Custom Tab if possible, or uninstall/reinstall the app during testing.
3. Try Google login again.
4. Check `/api/auth/debug-logs`.

Expected result: the callback should no longer redirect to `/api/auth/error?error=please_restart_the_process`.

If it still fails, capture logs including the initial `/api/auth/sign-in/social` request and the callback response; the next likely issue would be stale browser cookies or callback replay.
