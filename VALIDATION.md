# Validation

- TypeScript check and Cloudflare Worker production build pass.
- Five model checks cover slot boundaries, breaks, unavailable dates, freshman validation, settings validation and CSV quoting.
- Five isolated workflow test groups cover institutional login, first-login password retention, password changes and reset, session revocation, server-side role boundaries, roster atomicity, competing bookings for the final seat, pooled two-seat bookings, active booking limits, cancellation and restriction expiry, instructor feedback, and archiving.
- All workflow test accounts and records exist only in `/private/tmp/schedu-integration-state`; they are not included in the deployed application.
- A guarded WebMCP action stages an available slot in the booking form; it does not submit a booking. No supported WebMCP validation context was available, so this optional integration is unverified.
- Browser interaction and screenshot testing were not performed. Local HTTP checks and the isolated production Worker tests were performed.

## Running checks

`node --test tests/model.test.ts tests/permissions.test.ts tests/sqlite.test.ts tests/migration.test.ts tests/records.test.ts`

`npx tsc --noEmit`

For workflow checks, build the app and start an isolated Worker on port 3001 with persistence at `/private/tmp/schedu-integration-state`. Request `/api/app` once to create the local database, then run `python3 tests/integration.py`. The script resets only that isolated test database and must never be aimed at production.

For the self-hosted build, run `npm run build:docker`, start `dist/standalone/server.js` on port 3002 with `SCHEDU_ORIGIN=http://localhost:3002`, a `SCHEDU_SETUP_TOKEN` of at least 32 characters, `SCHEDU_DB_PATH=/private/tmp/schedu-node-integration/schedu.sqlite` and `SCHEDU_MIGRATIONS_DIR=drizzle`. Request `/api/health` once, then run `SCHEDU_TEST_NODE=1 SCHEDU_SETUP_TOKEN=<same token> python3 tests/integration.py`.

## Records and statistics

Checked on 10 October 2026 against local builds only. No deployed server or production database was used.

- `node --test tests/records.test.ts`: nine checks of the calculations behind the new pages. They cover outcomes for every booking status, archived meetings that were completed or cancelled, the five approval outcomes, pool membership matching the staff permission rule, attendance rate and average mark, empty accounts, marks recorded under a removed evaluation option, crediting of guidance, and institute totals that add up across statuses, approval outcomes and students.
- All 43 unit tests pass (`tests/model.test.ts`, `permissions.test.ts`, `sqlite.test.ts`, `migration.test.ts`, `records.test.ts`). `npx tsc --noEmit` passes. `npx oxlint` reports nothing in the new files; the findings it reports in existing files are unchanged.
- All 18 workflow groups pass against an isolated self-hosted build: the 17 existing groups unchanged, plus one for the single server addition. That group checks that an instructor keeps meetings they approved or recorded after reassignment, that this grants no control over those meetings, and that other roles' responses are unchanged.
- Existing screens: with the previous sample data, the seven existing screenshot phases ran against the new build and reproduced 25 of the 26 existing screenshots byte for byte. The remaining one differed only by a keyboard focus ring caused by capture timing, which the script now avoids. With the extended sample data, two screenshots change as intended (one Thursday slot is now taken by a waiting request).
- New screens: the `records` phase captures the nine screenshots used in the manual. The `records-qa` phase checks filters, pagination, search, the details dialog, the chart tooltip, empty states, Simplified Chinese, the dark theme and a 390 px phone width without sideways scrolling. It ends by approving a waiting request as an instructor and confirming the record in the instructor's, the student's and the administrator's views. Its screenshots are in `output/screenshots/records-statistics/`.
- Statistics shown for the sample data were compared with a hand count of the fixture's bookings.
- Not tested: the hosted Cloudflare Worker build, the Docker image, and rosters larger than the 68-account fixture for these pages.

## Self-hosted Docker deployment

- Standalone Node build and TypeScript check pass without the Sites/Cloudflare plugins.
- Seven model/storage tests pass, including schema migration replay, persistence after reopening SQLite and rollback of a failed batch.
- All five workflow groups pass against an isolated native Node/SQLite instance, including the self-hosted setup-token requirement.
- Docker Compose image built and ran successfully on Linux ARM64, using the Docker Official Image mirror on Amazon ECR because Docker Hub was unreachable from the build environment.
- Container checks pass for the health endpoint, setup-token enforcement, institutional login, roster import, permission checks, booking and cancellation.
- Accounts, sessions, a booking and its cancellation restriction survived container replacement with the same volume.
- The online SQLite backup was opened and verified to contain the saved booking.
- Verified runtime UID 1000 and host-only test binding. No OpenAI sign-in or Cloudflare imports were found in the standalone application output.
- Docker test project `schedu-check` used temporary host port 18080; the native test server used 3002. These are test-only ports, not defaults or additional services in the delivered stack. Deployment ports are listed in DEPLOYMENT.md.
