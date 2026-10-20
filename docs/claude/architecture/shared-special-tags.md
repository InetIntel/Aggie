# Shared custom tags

Incident tags have four standard categories and a shared Custom tags group.
Standard category colors are fixed: measurements blue, protocols purple,
causes amber, and circumvention solutions green. Legacy uncategorized tags
remain visible in gray.

Anyone with `view data` access can create a custom tag from Settings > Tags
or the incident tag picker. Creation takes a name and a color (purple by
default). In the incident picker, creation also selects the new tag; Save tags
still applies that selection to the incident. Creating a tag makes it available
to everyone, even if the incident picker is later canceled.

Custom tags display as `✦ Name ✦`, with their chosen color. Stars are display
decoration; search and storage use the plain name. Custom tags use the same
incident associations and any/all filters as standard tags. They do not expire.

`POST /api/tag/special` requires `view data` and explicitly permits only name,
color, and description. It forces category `special` and assigns the requesting
user as creator. Standard creation and editing, and all deletion, still require
`edit tags`. Creators can edit their own custom tags through the ownership-checked
`PUT /api/tag/special/:_id` endpoint. Creator edits allow only name, color, and
description; ownership and category remain unchanged. Other users can apply
these shared tags but cannot edit them. Existing standard tag seeding is unchanged. No data migration is
needed; deploy the backend enum/endpoint together with the frontend.

Validation: `node --test backend/api/controllers/tagController.test.js` covers
the creation boundary, invalid input, default color, and route permissions.
