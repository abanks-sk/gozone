# Deploying GoZone to Railway

The variables each service needs, and the handful of things Railway does differently from
`docker compose` that will otherwise bite. Read alongside `docs/DEPLOYMENT.md`, which covers
credential rotation and the production-hardening switches.

---

## The four things that are genuinely different on Railway

### 1. One Postgres service ≠ four databases

`postgres-init/` creates `auth_db`, `ride_db`, `food_db` and `wallet_db` when the Postgres
*container* first starts. Railway's managed Postgres gives you **one** database and never runs
that script. Nothing will tell you this; the services will simply fail to connect to a database
that does not exist.

Two options:

- **Simplest:** one Railway Postgres, then create the other three by hand once —
  ```sql
  CREATE DATABASE auth_db; CREATE DATABASE ride_db;
  CREATE DATABASE food_db; CREATE DATABASE wallet_db;
  ```
  and point each service's `DB_NAME` at its own. This keeps the "no service reads another
  service's database" rule, which is enforced by convention rather than by permissions.
- **Cleaner, costlier:** four Postgres services, one per domain service.

### 2. PostGIS is not installed by default

`ride_db` needs it — every nearby-driver and pool-matching query is PostGIS. `V1__baseline.sql`
already runs `CREATE EXTENSION IF NOT EXISTS postgis;`, so **if the extension is available** on
the instance, Flyway enables it for you.

Railway's standard Postgres image does not ship the PostGIS binaries. Use their **PostGIS**
template/image for the database that holds `ride_db`, or the migration fails at deploy — loudly,
which is the good case. Verify with `SELECT postgis_version();`.

### 3. Uploaded files are deleted on every deploy

KYC documents (driver licence, selfie, vehicle) and vendor shop photos are written to
`UPLOAD_DIR` (`/var/gozone/uploads`), backed by a named Docker volume locally. **A Railway
container's filesystem is ephemeral.** Without a volume, every driver's documents disappear on
the next deploy and the admin review page shows broken images.

Attach a Railway **Volume** to auth-service mounted at `/var/gozone/uploads`.

### 4. Every service must bind to `$PORT`

Railway injects `PORT` and routes only to it. All five services now read `server.port:
${PORT:<original>}`, so Railway works and local `docker compose` is unchanged. Nothing to do —
noted so nobody "tidies" it back to a fixed port.

---

## Service-by-service variables

`PORT` is injected by Railway — never set it yourself.

### Shared by every service

| Variable | Example | Notes |
| --- | --- | --- |
| `DB_HOST` | `postgres.railway.internal` | Railway's internal hostname |
| `DB_PORT` | `5432` | |
| `DB_NAME` | `auth_db` / `ride_db` / `food_db` / `wallet_db` | **different per service** |
| `DB_USER` | `postgres` | |
| `DB_PASS` | *(from the Postgres service)* | |
| `JWT_PUBLIC_KEY` | base64 DER | same value everywhere |
| `JWT_ISSUER` | `gozone-auth` | must match across services |
| `JWT_AUDIENCE` | `gozone-apps` | must match across services |
| `INTERNAL_KEY` | `openssl rand -base64 32` | shared secret for service-to-service calls |

### gateway

| Variable | Example |
| --- | --- |
| `AUTH_SERVICE_URL` | `http://auth-service.railway.internal:8081` |
| `RIDE_SERVICE_URL` | `http://ride-service.railway.internal:8082` |
| `FOOD_SERVICE_URL` | `http://food-service.railway.internal:8083` |
| `WALLET_SERVICE_URL` | `http://wallet-service.railway.internal:8084` |
| `JWKS_URL` | `http://auth-service.railway.internal:8081/auth/.well-known/jwks.json` |
| `RATE_LIMIT_ENABLED` | `true` |

⚠️ The port in each internal URL must be the `PORT` Railway assigned that service, not the
local default shown here. Read it from the target service's variables.

### auth-service

| Variable | Notes |
| --- | --- |
| `JWT_PRIVATE_KEY` | **auth-service only.** Never set this on another service. |
| `SUPERADMIN_PASSWORD` | Blank generates a random one, logged once at startup. |
| `TERMII_API_KEY` | Blank = OTP is logged instead of sent. |
| `TERMII_SENDER_ID` | Must be a sender ID Termii has **approved**. |
| `MAIL_USERNAME` / `MAIL_APP_PASSWORD` | See the SMTP warning below. |
| `GOOGLE_CLIENT_IDS` | Comma-separated. **Blank disables the audience check** — set it. |
| `UPLOAD_DIR` | `/var/gozone/uploads`, on an attached Volume (see §3). |
| `OTP_LOG_CODES` | `true` while Termii is unapproved. See the warning below. |

### ride-service / food-service

| Variable | Notes |
| --- | --- |
| `WALLET_SERVICE_URL` | internal URL |
| `AUTH_SERVICE_URL` | internal URL (food + ride: customer identity lookups) |
| `NOTIFY_URL` | `<wallet internal URL>/wallet/notify` |
| `JWKS_URL` | as gateway |
| `GOOGLE_MAPS_SERVER_KEY` | ride-service — Directions/Places proxy |

### wallet-service

| Variable | Notes |
| --- | --- |
| `PAYSTACK_SECRET_KEY` | `mock` for now; `sk_test_…` / `sk_live_…` when real |
| `EXPO_ACCESS_TOKEN` | push notifications |

---

## Two standing warnings

### SMTP will probably not work on Railway

Email verification uses **Gmail SMTP on 587 with STARTTLS** through `JavaMailSender`. Railway and
most PaaS providers block or filter outbound SMTP. This is configured correctly and may still
never deliver.

It **fails soft**: `EmailService` catches the failure and logs the code, so email sign-in keeps
working via the logs rather than breaking. That is a demo crutch, not a fix. The real answer is an
HTTP email API (Resend, SendGrid, Mailgun, Postmark) — one class, `EmailService`, changes.

### `OTP_LOG_CODES=true` means logs are credentials

Anyone who can read the deploy logs can sign in as anyone. It is deliberately on while Termii's
sender ID is pending, because otherwise there is no way to sign in at all on a hosted stack. Set
it to `false` the day Termii approves the sender ID.
