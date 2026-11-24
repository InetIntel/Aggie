# Tags

Admins can create, edit, and delete tags. Other users need the "Create, edit, and delete tags" permission enabled under their user settings.

Tags are grouped by category, with a set color for each category. Custom tags have their own color and a star around the name. Existing tags are available for selection and incident filtering.

To add missing standard tags:

- Preview: `npm run seed:standard-tags`
- Apply: `npm run seed:standard-tags -- --apply`

Run after deploying the category changes. Existing tags are skipped, including names with different capitalization or surrounding spaces.
