# Validation

- TypeScript check and Cloudflare Worker production build pass.
- Five model checks cover slot boundaries, breaks, unavailable dates, freshman validation, settings validation and CSV quoting.
- Five isolated workflow test groups cover institutional login, first-login password retention, password changes and reset, session revocation, server-side role boundaries, roster atomicity, competing bookings for the final seat, pooled two-seat bookings, active booking limits, cancellation and restriction expiry, instructor feedback, and archiving.
- All workflow test accounts and records exist only in `/private/tmp/schedu-integration-state`; they are not included in the deployed application.
- A guarded WebMCP action stages an available slot in the booking form; it does not submit a booking. No supported WebMCP validation context was available, so this optional integration is unverified.
- Browser interaction and screenshot testing were not performed. Local HTTP checks and the isolated production Worker tests were performed.

## Running checks

`node --test tests/model.test.ts`

`npx tsc --noEmit`

For workflow checks, build the app and start an isolated Worker on port 3001 with persistence at `/private/tmp/schedu-integration-state`. Request `/api/app` once to create the local database, then run `python3 tests/integration.py`. The script resets only that isolated test database and must never be aimed at production.

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
