# Fix password reset flow and add admin 2FA recovery

## Summary

Admins reported that resetting passwords was unreliable — it *looked* like the save went through, but the user often still couldn't log in ("locked out"). Investigation found this wasn't one bug but several overlapping ones across the password/2FA surface: a silently-failing UI, a broken authorization check, crash-prone error handling, a missing recovery path for 2FA-locked users, and a pile of dead/misleading "reset password" code that never actually changed a password. This PR fixes the live flow, makes failures visible, adds an admin 2FA-reset capability, and removes the dead code.

## What was wrong & why

| Area | Problem | Why it mattered |
|------|---------|-----------------|
| **Reset UI** | `SetPassword.tsx` only handled `onSuccess` — every error was swallowed, with no success confirmation either | A failed reset closed silently and *looked* successful. This is the core "it saved but I'm locked out" symptom. |
| **Authorization** | The in-controller guard `!User.can('admin users')` called a middleware *factory*, so `!function` was always `false` — the check never fired | Any role that reached the endpoint (incl. viewer/monitor via the over-broad route permission) could set **any** user's password. |
| **Error handling** | `res.status(err.status)` where `err.status` is `undefined` throws a `RangeError` | On any error path the request could crash/hang instead of returning a clean status. |
| **Persistence call** | `user.save(user, cb)` passed the document as the options arg | Worked only by luck; fragile and misleading. |
| **Validation** | Zero server-side validation of the new password | The 7-char rule was client-only and trivially bypassable. |
| **2FA lockout** | No way for an admin to clear **another** user's 2FA — every TOTP/WebAuthn endpoint was scoped to `req.user._id` | A user who lost their authenticator/security key was permanently locked out; recovery required hand-editing MongoDB. |
| **Dead code** | `reset-password.js` was never mounted, wrote plaintext to an unused `password` field, and had a token salt mismatch (`'salt'` vs `'sa2t'`); `/pass-reset` → `passwordReset` changed no password at all (just signed a JWT) | These misled anyone reading the code into thinking password-reset paths existed that don't work. |

> **Root trap:** the schema declares a `password` field that nothing reads for auth — login is verified against the plugin-managed `hash`/`salt`. Any code writing `user.password` was a silent no-op, which is what made the dead code look plausible.

## Changes

### Backend
- **`user_update_password`** (`backend/api/controllers/userController.js`) rewritten: real authorization (admin → any user, any user → self), server-side length validation (min 7), safe error responses (`err.status || 500/400`), corrected `save()`, and a JSON success body.
- **Route tightened** (`backend/api/routes/userRoutes.js`): dropped the over-broad `User.can('update users')` middleware from `password_set`; authorization is now enforced entirely in the controller.
- **New admin endpoint** `POST /admin/reset-mfa/:_id` (`backend/api/controllers/authController.js` `adminResetUserMfa`, admin-guarded in `backend/api/routes/authRoutes.js`): clears a target user's TOTP, WebAuthn credentials, and enforcement flags so they can log in with their password and re-enroll.
- **Removed dead code**: deleted `backend/api/reset-password.js`; removed the `/pass-reset` route and the `passwordReset` controller.

### Frontend
- **`SetPassword.tsx`**: surfaces the backend's error message inline and keeps the dialog open on failure instead of swallowing it.
- **`SecuritySection.tsx`**: replaced the read-only "you can only manage MFA for your own account" notice (for admins viewing others) with a **Reset MFA** button — confirm dialog, loading state, success/error feedback.
- **`UsersIndex.tsx`**: split **Change Password** out of the admin-only Edit gate so it appears on your **own** row (any role) as well as on other users' rows for admins.
- **`api/users/index.ts`**: added the `adminResetUserMfa` client call.

## Impact going forward
- **Password resets are observable.** If a reset fails now, the admin/user sees why instead of a false success — no more silent lockouts from the UI side.
- **Least-privilege authorization.** Only admins can set other users' passwords; everyone can still change their own. Viewers/monitors can no longer set arbitrary users' passwords.
- **Self-service is reachable in both places.** Change Password now works from your own row in the Users list *and* your profile page.
- **2FA lockouts are recoverable in-app.** Admins can reset a stranded user's 2FA without touching the database.
- **Less confusing codebase.** The non-functional "reset password" paths are gone, so future work won't build on endpoints that silently do nothing.

## Testing notes (manual — no test runner configured)
1. Admin resets a non-2FA user's password → success message → log in with the new password.
2. Self-service change password from both the Users list (own row) and the profile page.
3. Submit an empty/too-short password (bypass client validation) → API returns `400`, UI shows the error.
4. TOTP-enrolled user with enforcement → login returns `mfa_required` → admin clicks **Reset MFA** → user logs in with password alone and re-enrolls.
5. Confirm a viewer/monitor can no longer set another user's password but can still change their own.

---

**Base branch:** `development` · **Commits:** `0cd35cd7`, `99bff85b`
