# Bug: incident attachments are stored on local disk and don't move with the database

_Status: open, not yet filed as a GitHub issue. Last updated 2026-10-02._

## TL;DR

- When someone attaches a file to an incident comment, the file is saved to a folder on the server (`public/uploads`), not to MongoDB. The database only stores a pointer to that file.
- **The concrete problem:** copying the database to another environment, or pointing another setup at it, brings the pointers but not the files, so every attachment link there 404s.
- **The risk:** the files exist only in one folder on one machine. Normal deploys (`git pull`, rebuild, restart) leave them alone, but anything that recreates that folder (moving servers, re-cloning the repo, `git clean -fdx`, a future move to containers) would delete them for good. No actual loss has been seen so far.
- Report media was moved into MongoDB for the same reasons. Attachments are the last thing left on disk. The fix is to store them the same way.

## How to see it

1. Open any incident and add a comment with a PNG attached.
2. The file appears at `public/uploads/<timestamp>_<filename>.png`.
3. Point a second checkout (another machine, or a fresh clone) at the same database. Alternatively, delete `public/uploads` to simulate the folder being recreated.
4. Reload the incident in that setup and click the attachment.

**Expected:** the file downloads.
**Actual:** 404. The comment still lists the attachment, but the file isn't on that machine.

The storage design is the same in every environment. Staging runs from a checkout at `/home/ioda/Aggie-FuCo`; where production runs hasn't been confirmed.

## Why it happens

The upload flow, in plain terms:

1. The browser sends the comment and files to the API.
2. The API receives the files in memory, then chooses to write them to `public/uploads`.
3. MongoDB stores only a pointer to that file, including the full path on the server's disk (for example `/Users/.../Aggie/public/uploads/...png`).
4. On download, the API looks up the pointer and reads the file from disk.

Because the bytes only exist on one machine's disk:

- Copying the database to another environment brings along pointers to files that don't exist there.
- Two API servers on different hosts can't serve each other's attachments.
- Anything that recreates the checkout folder deletes them. Today's deploys (`git pull`, rebuild, restart) don't do that, because git leaves gitignored files alone. Moving servers, re-cloning, `git clean -fdx` or a future move to containers would.

Report media had the same problems while it lived in `public/media`, and was fixed by moving it into MongoDB.

A smaller side effect: filenames are based on the upload time, so uploading the same screenshot twice stores it twice.

## The fix

Store attachment bytes in MongoDB, reusing the existing media storage instead of building something new.

1. **Reuse the `MediaAsset` model** (`backend/models/mediaAsset.js`) with a new `kind: 'incident-attachment'`. It already has everything needed (key, bytes, content type, size).
2. **Swap the storage helper.** Rewrite `backend/api/utils/fileStorage.js` so `saveFile` writes to MongoDB and `deleteFile` deletes from it. Keep the same function signatures so the controller doesn't change. Key each file by a hash of its contents (`incidents/attachments/{sha256}.{ext}`), which also removes duplicates.
3. **Stop storing disk paths.** Remove `serverPath` from the attachment schema in `backend/models/group.js` and store the MongoDB key instead.
4. **Serve downloads from MongoDB**, keeping the existing permission checks (see "Don't lose this" below).
5. **Migrate existing files** with a one-off script, `backend/scripts/backfillAttachmentsToMongo.js`, modeled on `backend/scripts/backfillMediaToMongo.js`: dry-run by default, safe to re-run, skips orphaned files. Check how many attachments production has before running it.

A working example of this exact pattern already exists in `backend/fetching/utils/socialImageStorage.js`.

### Don't lose this: download permissions

Report media under `/media/*` is intentionally public. Incident attachments are not. The download route checks that the user is logged in, has "view data" permission, and can view that specific incident. The new implementation must keep its own authenticated route and these checks, and must look up the file from the attachment record rather than trusting the filename in the URL.

### Done when

- [ ] Attachment bytes are stored in MongoDB. No request handler writes to `public/uploads` or any other local folder.
- [ ] Storage keys are a hash of the file contents, so the same file uploaded twice is stored once.
- [ ] `serverPath` is gone from the schema and the data: `db.groups.find({"comments.attachments.serverPath":{$exists:true}})` returns 0.
- [ ] Existing attachments are migrated by a re-runnable, dry-run-by-default script. Orphaned files are left alone.
- [ ] A user who can't view an incident gets a 404 for its attachments.
- [ ] Attachments come along when the database is copied, and survive the checkout folder being recreated.
- [ ] `UPLOAD_DIR` is removed from the code and `public/uploads` from `.gitignore`.
- [ ] An "Attachment storage" section is added to `docs/claude/architecture/media-image-storage.md` (or a sibling doc indexed in `CLAUDE.md`).

## Small related cleanups (fold into the same change)

- **Dead env var in the frontend.** `src/pages/incidents/Incident/Comment.tsx:92` reads `process.env.UPLOAD_DIR`. Create React App only exposes `NODE_ENV`, `PUBLIC_URL` and `REACT_APP_*` to the browser, so this is always `undefined`. `UPLOAD_DIR` also isn't in `.env.example` or any docs.
- **URL prefix added in two places.** `Comment.tsx:108` prepends a base URL, then `src/components/FileChip.tsx:24-26` may prepend `PUBLIC_URL || "http://localhost:3000"` again. Replace both with one helper (like `buildMediaUrl`) and drop the hardcoded localhost.

## Found during the audit, not part of this fix

These were spotted while investigating and should be tracked separately:

- ~~`docs/claude/architecture/deployment-topology.md` is out of date.~~ Fixed 2026-10-02: it no longer describes `public/media` as the live store, points at the current IODA backfill instead of `scripts/migrate-ioda-svg-to-storage.js`, and warns to back up `public/uploads` before moving or re-cloning the checkout until this bug is fixed.
- 173 report media keys point at files that exist neither in MongoDB nor on disk, so they show as broken images (44 IODA charts, 129 social images).
- `public/media` (417 MB) and `public/ioda-charts-backup` (107 MB) are leftovers from the media migration and are safe to delete: none of the 173 missing files above exist there either.

---

## Reference for the implementer

### Current limits and rules

| What | Value | Where |
|---|---|---|
| Allowed types | JPEG, PNG, PDF, CSV, plain text | `backend/api/middlewares/groupMiddlewares.js:4`, `src/api/groups/types.ts:116-122` |
| Max files per comment | 3 | `backend/config/models/groupConfigs.js:1` |
| Max size per file | 5 MB | `backend/config/models/groupConfigs.js:2` |
| Filename on disk | `${Date.now()}_${originalname}`, spaces replaced with `_` | `backend/api/utils/fileStorage.js:9-11` |
| Folder | `process.env.UPLOAD_DIR`, otherwise `<checkout>/public/uploads` | `backend/api/utils/fileStorage.js:3` |

Limits are checked in four places: multer (`groupMiddlewares.js:8-11`), `validateAttachments` (`groupController.js:842-852`), the Mongoose schema (`group.js:40-43,53-55`), and Yup on the client (`Comment.tsx:171`).

Nothing else in the app writes to this folder. Scripts under `scripts/` write local files, but those are analysis exports, not app data.

### Code path

**Upload**

1. `PATCH /api/group/_comment_add` and `PATCH /api/group/_comment_update` (`backend/api/routes/groupRoutes.js:75,78`), each using `upload.array('comment[attachments]', MAX_ATTACHMENT_COUNT)`.
2. multer uses `memoryStorage()` (`groupMiddlewares.js:7`), so files arrive as in-memory buffers. Writing to disk is purely the controller's choice, which is why the fix is contained.
3. `groupController.js:559` (add) and `:664` (update) call `saveFile(attachment.buffer, attachment.originalname)`.
4. `fileStorage.js:13-14` runs `fs.mkdir` then `fs.writeFile`.

**Storage** (`backend/models/group.js:32-45`): the `Attachment` subdocument has `fileName`, `path` (`/incidents/uploads/<basename>`, used by the frontend), `serverPath` (absolute disk path), `mimeType`, `fileSize`.

**Download**: `GET /incidents/uploads/:filename` (`backend/api.js:187-192`), outside `/api`. Runs `auth.authenticate()`, `User.can('view data')` and `loadIncidentAccessContext`, then `group_attachment_download` (`groupController.js:30-62`) re-checks `canViewIncident` and calls `res.sendFile`. The path-traversal guard is at `groupController.js:47-51`. For the MongoDB version, model the read on `serveMediaAsset` in `backend/api.js:88-108`.

### Frontend files

| File | Role |
|---|---|
| `src/pages/incidents/Incident/index.tsx:389` | Renders `CommentTimeline`, the only entry point |
| `src/pages/incidents/Incident/CommentTimeline.tsx` | New comment form; calls `addComment` |
| `src/pages/incidents/Incident/Comment.tsx` | Shows and edits existing comments; calls `editComment` |
| `src/components/FileUploader.tsx` | File picker and `FilePickerManager` (`accept={MIME_TYPES}` at L135) |
| `src/components/FileChip.tsx` | Attachment chips and download links |
| `src/api/groups/index.ts:173-190` | `addComment` / `editComment` (multipart PATCH) |
| `src/utils/objectToFormData.ts` | Converts the comment object to `FormData` |

### Evidence (local `aggie` database, 2026-10-02)

- 4 attachment records, 0.16 MB total.
- 5 files in `public/uploads` (196 KB). One has no matching record (orphan).
- Two pairs of files are byte-identical (21,941 bytes and 42,578 bytes): the same screenshot uploaded twice, stored twice.
- For comparison, `mediaassets` holds 1,612 docs (358.63 MB logical, 314.83 MB on disk) served from MongoDB.
