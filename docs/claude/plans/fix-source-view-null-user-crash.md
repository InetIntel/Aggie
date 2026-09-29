# Fix: "Cannot read properties of null (reading '_id')" when viewing a feed source

## Context

Viewing (not editing) a source on the Sources/Feeds page crashes with:

```
Cannot read properties of null (reading '_id')
TypeError at SourceDetailsView
```

**Root cause:** In [SourceDetailsView.tsx:342-349](src/pages/Settings/source/SourceDetailsView.tsx#L342-L349), the "Created by" field renders:

```tsx
<Link to={`/settings/user/${data?.user._id}`} ...>
  {data?.user.username}
</Link>
```

The optional chain `data?.` only guards against `data` being null — **not** against `data.user` being null. When `data.user` is `null`, `data.user._id` throws exactly this error.

**Why `user` is null for some feeds:**
- The Mongoose model marks user optional: [source.js:52](backend/models/source.js#L52) — `user: { type: ObjectId, ref: 'User', required: false }`.
- The controller only sets `user` when a request user exists ([sourceController.js:82](backend/api/controllers/sourceController.js#L82)) and populates it read-side ([sourceController.js:46](backend/api/controllers/sourceController.js#L46) — `{ path: 'user', select: 'username' }`). A source created without a user, or referencing a deleted user, populates to `null`.

This surfaces now because IODA/Cloudflare/OONI feed sources (recent branch work, commit 49e44b97) can exist without an associated creator.

The frontend `Source` type also lies about this: [types.ts:32-35](src/api/sources/types.ts#L32-L35) declares `user` as always present and non-null, which is why the unsafe access wasn't caught.

## Fix

Two small changes, both frontend-only.

### 1. Guard the "Created by" field — `src/pages/Settings/source/SourceDetailsView.tsx`

Replace the unconditional `data?.user._id` / `data?.user.username` access (lines ~342-349) so it renders the link only when `data?.user` exists, and falls back to a muted placeholder otherwise (matching the "None" style already used for Tags / Allowed teams):

```tsx
<DetailField label='Created by'>
  {data?.user ? (
    <Link
      to={`/settings/user/${data.user._id}`}
      className='hover:underline text-blue-600'
    >
      {data.user.username}
    </Link>
  ) : (
    <span className='text-slate-500 dark:text-gray-400'>Unknown</span>
  )}
</DetailField>
```

### 2. Make the type honest — `src/api/sources/types.ts`

Change the `user` field on the `Source` interface (lines 32-35) to reflect that it can be null:

```ts
user: {
  _id: string;
  username: string;
} | null;
```

This makes TypeScript flag any other unguarded `source.user.*` access. After the change, grep for `.user._id` / `.user.username` / `.user.` on sources to confirm no other spot has the same unguarded pattern (SourceDetailsView is the only known one; the view is the read path that broke).

## Verification

1. `npm run dev` and open the Feeds/Sources page.
2. Click to **view** (not edit) a feed source that has no creator — specifically an IODA/Cloudflare/OONI source, or any source whose `user` is unset. Previously this crashed; it should now render the details panel with "Created by: Unknown".
3. Confirm a normal source (with a user) still shows the creator as a working link to `/settings/user/<id>`.
4. Confirm `npm run build` (or the TS check) passes after the type change — no new type errors from the nullable `user`.

## Notes

- Per repo convention this plan should live in `docs/claude/plans/`; move it there when implementation starts (plan mode restricts edits to this file only).
