# Backend verification

Run `npm test -- --runInBand`.

- `userRoles.test.js`: Mongoose schema validation without a database.
- `migrateUserRoles.test.js`: migration preflight/write boundary with persistence doubles and an actual fictional CLI dry-run.
- `auth.test.js`: Supertest against the actual Express auth router, using real JWT signing/verification, bcrypt hashing/comparison and User hydration. Only database query persistence is substituted with fictional in-memory records.

These suites never load server.js, seed users, call Telegram or connect to the production database.
They do not prove real MongoDB atomicity/transaction rollback. Verify database persistence on a staging replica set before rollout.

## F1-02 auth endpoint contract

- `POST /api/auth/login`: `{ username, password }`.
- `GET /api/auth/me`: Bearer token required; returns the existing token without extending its expiry.
- `POST /api/auth/change-password`: Bearer token and `{ currentPassword, newPassword }`; returns a replacement session after a successful atomic update.
- Successful session data contains exactly `_id`, `username`, `fullName`, `roles`, `mustChangePassword`, `token`.
- JWT is HS256 with a seven-day expiry and `id`/`tokenVersion`. Unversioned legacy tokens are rejected and require login again.
- Errors include the existing response envelope plus `code`: `USER_DISABLED` (401), `TOKEN_REVOKED` (401), `PASSWORD_CHANGE_REQUIRED` (403), `NOT_AUTHORIZED` (401), `INVALID_CREDENTIALS`, `INVALID_PASSWORD`, `INVALID_CURRENT_PASSWORD`, `PASSWORD_UNCHANGED`, `AUTH_UNAVAILABLE`.
- Forced-change users may log in to obtain a restricted token, then call only the exact protected change-password route. `/me` and other normal protected routes are blocked until the password changes. Public customer forms and cron/webhook authentication remain separate.
- New passwords must be nonblank, differ from the current password, and fit bcrypt's 72 UTF-8 byte limit. No new arbitrary minimum-length business rule has been introduced.
- Missing account fields in legacy stored documents use the F1-01 schema defaults during hydration. New role mapping is still an explicit E-1 migration.

## Rollout dependencies

F1-08 must update frontend session storage, role guards, forced-password-change UI and error handling before deploying this branch. Existing frontend expects legacy role/department fields that F1-02 intentionally removes from authentication responses. F1-06 owns CEO user-management commands and must increment tokenVersion when roles, enabled state or temporary passwords change. No live user migration, push or deployment is performed by these tests.
