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
