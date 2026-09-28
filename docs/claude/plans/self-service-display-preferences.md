# Fix: let users update their own date/time display preferences

## Context

Users on the profile page can change their **Display preferences** (clock 12h/24h,
date format MDY/DMY, time zone local/UTC) and click **Save Preferences**, but the save
fails for some accounts. Root cause: the save hits `PUT /api/user/:_id`, whose route is
gated by `User.can('update users')`. That permission is granted to `['viewer','monitor','admin']`
only, so a `team_lead` or `manager` (or any user with `update users` denied via
`permissionOverrides`) gets a `403` before the request reaches the controller — even though
`user_update` is explicitly written to allow self-service preference edits. The UI still shows
the Save button because it gates on `isSelf` alone, not on the permission.

This is a latent bug (identical on `development`, not introduced by any feature branch).
Goal: a user may always update **their own** record (which, for self, is limited by the
controller to display name / username / email / preferences), while editing *other* users
still requires the `update users` permission.

## Branch

- Base: `development`.
- Branch: `fix/self-service-display-preferences`.

## Change (minimal — self-bypass on the existing route)

Single file: `backend/api/routes/userRoutes.js`

1. Add a small helper that lets a self-edit through and otherwise defers to the existing
   permission middleware (`User` is already imported):

   ```js
   // Let a user edit their own record; editing anyone else still needs the permission.
   // user_update itself restricts which fields self vs. admins may change.
   const allowSelfOr = (permission) => (req, res, next) => {
     if (req.user && String(req.params._id) === String(req.user._id)) return next();
     return User.can(permission)(req, res, next);
   };
   ```

2. Replace the gate:

   ```js
   // before
   router.put('/:_id', User.can('update users'), userController.user_update);
   // after
   router.put('/:_id', allowSelfOr('update users'), userController.user_update);
   ```

Why this shape:
- Reuses the existing self-service logic already in `userController.user_update` — for self,
  `allowedFields = ['email','username','displayName']` plus the nested `preferences` whitelist;
  `if (!isAdmin && !isSelf) return 403`. No controller change needed.
- Consistent with sibling routes that already enforce authorization in the controller instead
  of a route gate: `PUT /:_id/teams` and `PUT /password_set/:_id`.
- Preserves `ADMIN_PARTY` behavior (when `req.user` is absent the helper falls through to
  `User.can`, which handles the bypass).
- No frontend, model, or permission-map changes. `updateUserPreferences`
  (`src/api/users/index.ts`) already targets this endpoint.

Accepted tradeoff (minimal scope): a self user can now also PATCH their own
`email`/`username`/`displayName` via the API. No UI exposes these for self today
(`UserProfile.tsx` renders them read-only), and this matches the controller's documented intent.

## Verification (no test runner configured — manual)

1. `npm run dev`, log in as a **team_lead** (or a user with `update users` denied).
2. Settings → Your Profile → Display preferences: change clock / date format / time zone,
   click **Save Preferences** → expect `200`, values persist, and dates across the app
   re-render (session query is invalidated on success).
3. Regression — still blocked: as that same non-admin, `PUT /api/user/<someone-else-id>`
   must still return `403`.
4. Regression — admin editing others via the profile UI still works; `viewer`/`monitor`
   self edits still work.
