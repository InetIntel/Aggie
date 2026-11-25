# Fix: login redirect breaks after the host change

## Context

New URLs:

| Env | URL | `PUBLIC_URL` in the live build |
|-----|-----|-----|
| dev | `https://<dev-host>/alerts` | `https://<dev-host>` |
| prod | `https://<prod-host>/aggie/alerts` | `https://<prod-host>/aggie` |

On dev, after login, the page is broken. The Back button recovers it. Prod works.

### Root cause (dev, confirmed in the live bundle)

`Login.tsx` builds the redirect three times ([src/pages/Login.tsx:62-64](src/pages/Login.tsx#L62-L64), [:93-95](src/pages/Login.tsx#L93-L95), [:116-118](src/pages/Login.tsx#L116-L118)):

```ts
const base = new URL(process.env.PUBLIC_URL).pathname; // "/" on dev
window.location.assign(`${base}/alerts`);              // "//alerts"
```

`//alerts` is a protocol-relative URL. The browser goes to `https://alerts/`, which does not exist. On the old dev host the path was `/aggie`, so this did not occur.

The same code also allows an open redirect: `/login?to=//evil.com` sends the user to `evil.com` when the base is empty.

Prod works because its base is `/aggie`, so the redirect is `/aggie/alerts`.

## Change

One source file, plus one test: `src/pages/Login.tsx`.

Add one exported pure function and use it in all three places:

```ts
// Strip the trailing "/" (a root PUBLIC_URL gives "/") and collapse leading
// slashes in `to`, so the result is never a protocol-relative "//host" URL.
export function loginRedirectPath(publicUrl: string | undefined, to: string | null) {
  const base = publicUrl ? new URL(publicUrl).pathname.replace(/\/+$/, "") : "";
  return `${base}/${(to || "/alerts").replace(/^\/+/, "")}`;
}
```

Each call site becomes `window.location.assign(loginRedirectPath(process.env.PUBLIC_URL, getParam("to")));`.

`index.tsx` (router `basename`) is not changed. React Router handles a `/` basename correctly.

## Test

Add `src/pages/Login.test.ts` (Jest, globals from `@jest/globals`). Cases for `loginRedirectPath`:

| `publicUrl` | `to` | Expected |
|-----|-----|-----|
| `https://<dev-host>` | `null` | `/alerts` |
| `https://<prod-host>/aggie` | `null` | `/aggie/alerts` |
| `https://<prod-host>/aggie/` | `/incidents?x=1` | `/aggie/incidents?x=1` |
| `undefined` | `incidents` | `/incidents` |
| `https://<dev-host>` | `//evil.com` | `/evil.com` |

## Deploy (each host)

1. Open a PR to `development`. Promote to `staging` as usual.
2. On each server, pull and run `npm run build` with that host's `PUBLIC_URL` in the env.
3. A backend restart is not necessary. The API serves `/build` from disk.

## Verification

1. Run `npm run test:frontend` and `npx tsc --noEmit`. Both must pass.
2. On each host, open a private window and log in. Expect `/alerts` (dev) or `/aggie/alerts` (prod), with the Alerts table.
3. Log in from a deep link, for example `/incidents`. Expect a return to that page.
4. If an MFA user exists, repeat with TOTP or WebAuthn.

## Stale doc (ask before edit)

`docs/claude/architecture/deployment-topology.md` still names `<old-dev-host>` and `PUBLIC_URL=https://<old-dev-host>/aggie`. Ask the user whether to update it to the new hosts.
