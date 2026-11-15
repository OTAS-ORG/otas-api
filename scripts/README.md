# User role migration (F1-01)

The E-1 staff mapping is still pending. Do not apply to real users until it is approved.
The legacy `role` field stays in place until the auth and permission rollout is complete.
No role is inferred from Admin/User or departments. An empty `roles` array grants no new role.
The new `active`, `tokenVersion` and `mustChangePassword` fields are data preparation;
their login enforcement belongs to F1-02.

Keep the approved JSON mapping outside the repository. `*.local.json` is also gitignored.
The file format is an array of `{ "username": "example_developer", "roles": ["developer"] }`.
Use exact usernames, at least one valid role, and no duplicates or additional fields.
Never paste real mapping data or migration output into ClickUp or Git.

## Preview with fictional data (no database)

From backend:

```powershell
node scripts/migrate-user-roles.js --config tests/fixtures/role-mapping.json --users-fixture tests/fixtures/legacy-users.json --dry-run
```

## Database preview and apply

Supply `MONGODB_URI` securely in the process environment; the script deliberately does not
load `.env`, the Express app, bots or seeders. Start on a staging replica set with a backup.

```powershell
node scripts/migrate-user-roles.js --config C:/secure/staff-roles.local.json --dry-run
```

Only after E-1 approval and reviewing the preview:

```powershell
node scripts/migrate-user-roles.js --config C:/secure/staff-roles.local.json --apply --staff-roles-approved
```

Dry-run is the default and never writes. Apply preflights every mapped user and runs in
one transaction; a failure rolls back the batch. A replica set is required for apply.
Only role/account fields and updatedAt change. Passwords, legacy role and profile fields
are preserved. Existing false account flags are preserved; only absent flags get defaults.
Role changes increment tokenVersion once. Repeating the same mapping is a no-op, even
when role order differs. Unmapped users are untouched and must be covered by a later
approved mapping before legacy auth can be removed. Verify a second dry-run reports
zero changes after apply. Restrict access to preview output because it contains usernames.
