# Self-hosting SchedU with Docker

The stack is one Node.js application container plus one persistent Docker volume. It serves both the interface and API. SQLite is embedded in the app; there is no separate database server, Redis, SSO service or Cloudflare runtime.

Students, instructors and administrators sign in with their institutional ID and password. OpenAI accounts are not needed. Fonts and application assets are served locally. The deployed app does not require an outbound internet connection.

## Ports

| Port | Protocol | Where | Purpose |
| --- | --- | --- | --- |
| **8080** | TCP / HTTP | Host, bound to **127.0.0.1** by default | Browser access or an institutional reverse proxy. Configurable with `SCHEDU_HTTP_PORT`. |
| **3000** | TCP / HTTP | Inside the app container | Interface, API and health checks. Host 8080 forwards here. |

These are the only ports in the supplied stack. SQLite uses a file, not a network port. No UDP, debugger, SSO, metrics or database ports are exposed. Docker's own management socket is not mounted in the container.

For production HTTPS, an existing institutional reverse proxy normally listens on **443/TCP** and forwards to host **8080**. That reverse proxy is outside this Compose stack. The stack does not open port 80 or 443 itself.

## First deployment

Requirements: a Linux host with Docker Engine and Docker Compose v2 or later. Use one application instance with a local disk-backed volume.

1. Copy `deploy.env.example` to `.env`.
2. Generate a setup token: `openssl rand -hex 32`. Paste the result into `SCHEDU_SETUP_TOKEN` in `.env`. Do not commit this file.
3. Set `SCHEDU_ORIGIN` to the exact origin users will open: for example `https://tutorials.your-institute.edu.cn` or, for a local trial, `http://localhost:8080`. Do not include a path. If you change the host port, change this origin too.
4. Start the stack:

```sh
docker compose up -d --build
docker compose ps
```

For a local trial, visit `http://localhost:8080`. Use the setup token to create the first administrator account, then issue instructor accounts, import students and configure teaching windows. No default account or password is included. Setup is disabled once an account exists; the token does not grant access to an existing account.

For access from another LAN computer during a trial, set `SCHEDU_BIND_ADDRESS=0.0.0.0` and set `SCHEDU_ORIGIN=http://SERVER_LAN_IP:8080` before starting. For production, use HTTPS with the institutional reverse proxy and keep the app's host binding at `127.0.0.1` when the proxy is on the same machine.

## HTTPS with an existing reverse proxy

Point the institutional domain to the host and configure the reverse proxy to forward to `http://127.0.0.1:8080`. Preserve the browser's Host header. Configure `SCHEDU_ORIGIN=https://YOUR_DOMAIN`; this makes session cookies Secure and validates browser write requests against that exact origin. Do not set it to the container's internal address.

Example fragment for an existing Nginx installation (replace the domain and certificate paths):

```nginx
server {
    listen 443 ssl;
    server_name tutorials.your-institute.edu.cn;
    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    client_max_body_size 110m;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Use the institution's certificates. SchedU does not contact an external certificate service or trust arbitrary forwarded headers for authentication.

The proxy allowance covers a migration package plus its request envelope. SchedU independently limits migration packages to 100 MB and ordinary app requests, including roster imports, to 20 MB.

## Mainland China and offline delivery

Only the image-build stage needs registry access. The default npm registry is `https://registry.npmmirror.com`, as documented by the [mirror operator](https://npmmirror.com). `NODE_IMAGE` and `NPM_REGISTRY` can be set to institution-approved mirrors. The default Node image is pinned to `node:24.19.0-bookworm-slim`, and JavaScript packages are pinned in the lockfile. An alternate mirror for the same Docker Official Image is `public.ecr.aws/docker/library/node:24.19.0-bookworm-slim`; availability depends on your network.

### Fix an npm install that stalls on a Mainland China server

In the existing `.env`, set:

```dotenv
NPM_REGISTRY=https://registry.npmmirror.com
```

Then, from the project directory containing `compose.yaml`:

```sh
docker compose --progress plain build app
docker compose up -d --no-build --wait
docker compose ps
docker compose logs --tail=100 app
```

The updated Dockerfile first checks registry connectivity, then prints HTTP download progress with bounded per-request retries/timeouts. A changed registry build argument invalidates the dependency-install layer automatically; `--no-cache` is normally unnecessary.

If the build still prints `registry.npmjs.org`, an existing `.env` or exported shell variable is overriding the default. To force this setting for one build without printing other environment values:

```sh
NPM_REGISTRY=https://registry.npmmirror.com docker compose --progress plain build app
```

Changing `npm config` on the host alone does not change this Docker build. Keep `package-lock.json`: it uses the default npm registry, so [npm supports switching registries](https://docs.npmjs.com/cli/v12/using-npm/registry/) without regenerating it. Versions and integrity checks remain pinned. Keep TLS certificate verification enabled.

If a specific mirror package returns 404 or remains unavailable, use another institution-approved npm mirror or the offline image method below. If the failure instead occurs at `FROM node:...`, change `NODE_IMAGE` to a reachable image registry: `NPM_REGISTRY` affects npm packages only. Host connectivity does not prove Docker build-network connectivity.

### Offline image delivery

Alternatively, build on a connected machine and transfer a completed image:

```sh
docker compose build
docker save schedu:local -o schedu-image.tar
```

Transfer `schedu-image.tar`, `compose.yaml` and `deploy.env.example` to the server. Create the server's own `.env`, then:

```sh
docker load -i schedu-image.tar
docker compose up -d --no-build --pull never
```

Match the image architecture to the server. For example, to build an x86-64 Linux image on an ARM machine:

```sh
docker buildx build --platform linux/amd64 --load -t schedu:local .
```

## Data, updates and backups

- Database: `/app/data/schedu.sqlite`, in the `schedu_data` Compose volume (normally named `schedu_schedu_data`). The volume contains profiles, accounts, bookings, settings and sessions.
- Schema migrations run automatically on first database access, in a transaction. Previously applied migrations are checked by checksum.
- Container replacement and `docker compose down` preserve the volume. **Do not use `docker compose down -v` for a real deployment**: that deletes its data volume.
- Run a single app replica. Keep the SQLite volume on local disk, not a shared network filesystem.
- Self-hosted storage is separate from the hosted preview. Existing preview data is not copied automatically.

Create a consistent online backup without stopping bookings:

```sh
docker compose exec app node deploy/backup.mjs
docker compose cp app:/app/data/backups/schedu-backup.sqlite ./schedu-backup.sqlite
```

The in-volume backup is overwritten each run. Store dated copies outside the host using the institute's backup process. Backups include student records and password hashes.

To restore a backup, stop the app, replace `schedu.sqlite` in the volume with the backup, remove old `schedu.sqlite-wal` and `schedu.sqlite-shm`, ensure the restored file belongs to UID/GID 1000, then start the app. Perform this only against the intended deployment; restoring replaces its current data.

Before an update, take a backup. Then rebuild/load the new image and run `docker compose up -d`. Keep the backup and previous image together if a rollback is needed.

## Moving to another server with an export package

Administrators can use **Configuration → Export & restore** without direct database access. The JSON package includes all accounts and password hashes, profiles, booking restrictions, every meeting status, feedback and history, and all configuration (including semesters, classrooms, teaching windows and individual slot changes). It has a format version and an integrity checksum. Keep it private: it is not encrypted.

1. Update both installations to this version of SchedU or later. The new `0002_migration_packages.sql` migration runs automatically and preserves existing records. No new service, port or environment variable is required.
2. On the source server, open **Export full dataset**, enter the current administrator password and save the package. Each export is a consistent snapshot. For the final migration, stop users making changes on the source before exporting, then keep it out of use until the destination is verified.
3. Deploy the destination and set its own `.env`, including `SCHEDU_ORIGIN` for its new public URL and the appropriate port/bind address. Create a temporary administrator through first-time setup if this is a new installation. Environment settings and the setup token are not in the package.
4. On the destination, use **Reset app data**. This clears existing app data while retaining the destination's administrators so they can perform the restoration. Reset is required even for a newly set-up installation. Do not edit accounts or configuration afterwards; any business-data change invalidates the reset state and requires another reset.
5. Choose the exported JSON file. Review the record counts and the administrator IDs that will be available after restoration. Enter `RESTORE SchedU` and the current **destination** administrator password, then select **Replace data and restore**.
6. Sign in using an administrator ID and its password from the **source** system. Verify the roster, settings and meetings, then direct users to the new URL.

Restore replaces the complete dataset in one transaction; incremental restoration and merging are not supported. All destination administrator accounts are replaced by those in the package. Existing source passwords, first-login flags and booking pauses are preserved. Login sessions and temporary login-attempt records are excluded; all users must sign in again. A successful restore leaves the reset state, so another restoration requires another reset. Invalid packages or failed database writes leave the destination data unchanged.

Exports and uploaded packages support up to 100 MB, without a roster row-count limit. If a reverse proxy is used, allow at least 101 MB for `/api/migration` (the example above uses 110 MB). For larger datasets, use the SQLite backup-and-replacement procedure above while the destination is stopped; that is a separate operator-level procedure, not an incremental import.

## Operation

```sh
docker compose ps
docker compose logs --tail=100 app
docker compose restart app
docker compose down
```

The `/api/health` endpoint checks database access and returns no student data. The container uses a non-root user, a read-only application filesystem, a writable data volume, bounded logs and no added Linux capabilities. Runtime secrets are supplied through `.env`, not baked into the image.


## Updating account permissions and roster management

After copying the updated source into the deployment directory, back up the database and rebuild the app:

```sh
docker compose exec app node deploy/backup.mjs
docker compose up -d --build --wait app
```

Startup applies `0001_keep_last_admin.sql` automatically. It protects the final administrator against role removal and deletion; existing users and bookings are preserved. No new ports, services or environment variables are needed. CSV imports support 1,200 students and larger rosters without a row-count limit; if an external reverse proxy is used, allow request bodies up to 20 MB on `/api/app`.


## Clearing data after testing

An administrator can open **Configuration → Reset app data** to review and clear all non-admin data. This includes every meeting, feedback record, student/instructor account, schedule and custom configuration, even if real records have already been entered. All administrator accounts and credentials are retained. The reset requires typing `RESET SchedU` and entering the administrator's current password. It does not change Docker ports, volumes or environment settings, and does not reopen first-time setup.

Take an online backup using the backup commands above before confirming. Existing backup files are retained, and restoring a backup is the recovery path if a reset was unintended. Reset also clears the classroom list. The roster filtering, pagination and reset update requires rebuilding the app image; no additional database migration is needed.

The classroom configuration update also requires rebuilding the app image, with no additional database migration. Existing schedule locations automatically populate Configuration → Classrooms on upgrade and are persisted when settings are saved. New installations and resets start with no classrooms; add room names before scheduling. Weekly windows, individual slots and timetable imports must use those names. Removing a classroom requires updating or removing the schedules that still reference it first.


## Semester scheduling update

Rebuild the image with the usual update command; no new migration, port or environment variable is required. In Configuration → Semester, enter the start and end dates before adding/importing new teaching windows. Existing windows are preserved and become bounded by these dates when saved. Moving a semester boundary or editing a series cannot remove or change an active booked slot.

Availability now includes calendar navigation and All semester sessions for review and batch removal beyond the 28-day view. Batch removal keeps active booked sessions, preserves all meeting history and applies no student penalty. Reset app data also clears semester dates. A full-semester selection supports up to 50,000 sessions; external reverse proxies should retain the documented 20 MB request-body allowance.
