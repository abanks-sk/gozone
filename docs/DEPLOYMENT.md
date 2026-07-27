# Deploying GoZone

What has to change between the development stack and something facing real users and real
money. The development defaults are chosen so the system runs and can be demonstrated with no
external accounts; several of them are **deliberately unsafe in production** and are listed
here rather than hidden.

Work top to bottom. Nothing in section 1 is optional.

---

## 1. Credentials — all of them, rotated

Every secret currently in `GoZone/.env` has been used in development, shared in logs, or typed
into a terminal. Treat all of them as compromised and issue new ones for production.

| Variable                              | What to do                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`  | Generate a fresh RSA pair (see `.env.example`). Rotating invalidates every issued token. The private key goes to auth-service only. |
| `INTERNAL_KEY`                        | Generate fresh. This is the only thing standing between a caller and free money — see `/wallet/commission`. |
| `SUPERADMIN_PASSWORD`                 | Set explicitly. Left blank, a random one is generated and printed to the log once.   |
| `PAYSTACK_SECRET_KEY`                 | Live key (`sk_live_…`). See section 4 before assuming payouts work.                  |
| `GOOGLE_MAPS_SERVER_KEY`              | Separate key from development, restricted (section 5).                              |
| `MAIL_USERNAME` / `MAIL_APP_PASSWORD` | A real sending account, not a personal one.                                         |
| `SMS_PROVIDER` + `AT_*` / `TWILIO_*`  | Production provider credentials with a funded balance.                              |
| `GOOGLE_CLIENT_IDS`                   | **Must be set.** Blank means the Google ID-token audience check is skipped — anyone's Google token would be accepted. |

```bash
# RS256 signing pair — note the PKCS#8 conversion: openssl's DER output for RSA is PKCS#1,
# which Java's KeyFactory will not accept.
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -outform DER -out priv.der
openssl pkcs8 -topk8 -nocrypt -inform DER -in priv.der -outform DER -out priv_pk8.der
openssl rsa -inform DER -in priv.der -pubout -outform DER -out pub.der
base64 -w0 priv_pk8.der   # JWT_PRIVATE_KEY
base64 -w0 pub.der        # JWT_PUBLIC_KEY

openssl rand -base64 32   # INTERNAL_KEY
```

Do not commit `.env`. It is gitignored; keep it that way and inject values through your host's
secret store instead of a file wherever you can.

---

## 2. Flip the development conveniences off

| Variable          | Dev default | Production | Why                                                                             |
| ----------------- | ----------- | ---------- | ------------------------------------------------------------------------------- |
| `OTP_LOG_CODES`   | `true`      | **`false`** | Otherwise every OTP is written to the service log after being sent — anyone with log access can sign in as anyone. |
| `PAYSTACK_SECRET_KEY` | `mock`  | live key    | `mock` serves a local checkout page that always succeeds.                       |

Also confirm `server.error.include-message: always` is what you want. It is on deliberately so
the apps can show real messages ("That username is already taken"), and the messages are written
for users rather than leaking internals — but it does mean exception messages reach clients.

---

## 3. Tokens and sessions

Current settings (`app.jwt` in auth-service, overridable by env):

| Setting                 | Value          | Notes                                                              |
| ----------------------- | -------------- | ------------------------------------------------------------------ |
| `JWT_PRIVATE_KEY`       | base64 DER     | **auth-service only.** The one value that can mint a session — including an admin one. |
| `JWT_PUBLIC_KEY`        | base64 DER     | Every service. Verifies but cannot sign; not a secret.             |
| `JWT_EXPIRY_MS`         | 1 hour         | Access tokens cannot be revoked, so this is the only thing ending one. |
| `JWT_REFRESH_EXPIRY_MS` | 7 days         | Revocable, single-use, rotated on every refresh.                   |
| `JWT_ISSUER`            | `gozone-auth`  | Required by the gateway and all four services.                     |
| `JWT_AUDIENCE`          | `gozone-apps`  | Required likewise.                                                 |
| `JWT_PREVIOUS_PUBLIC_KEYS` | *(empty)*   | auth-service only. Retired keys still published and accepted during a rotation. |
| `JWKS_URL`              | internal URL   | The four verifiers. Where they fetch keys from; blank = configured key only. |
| `JWKS_REFRESH_MS`       | 5 minutes      | How often they re-fetch. Also the worst-case lag on picking up a new key. |

`POST /auth/logout` revokes the refresh token (all sessions with `allDevices: true`). All four
clients call it on sign-out.

**Signing is RS256.** auth-service holds the private key and is the only thing that can mint a
token; the gateway, ride, food and wallet hold only the public key, so a break in any of them
cannot produce a valid session. Generate a fresh pair for production (section 1) and give the
private key to auth-service alone — Compose already wires it that way.

### Rotating the key pair

Verifiers fetch their keys from **`GET /auth/.well-known/jwks.json`** and cache them by `kid`
(the key's RFC 7638 thumbprint, derived from the key itself — there is no key *name* to keep in
step across services). So a rotation touches auth-service only. Note that this does not make the
services depend on auth to validate tokens: signatures are still checked locally against the
cached key, and `JWT_PUBLIC_KEY` remains configured as a fallback, so a verifier boots and keeps
working with auth-service down.

Rotate in two restarts of auth-service, so no token in the wild is invalidated:

1. **Publish the new key alongside the old one.** Generate a new pair. Set
   `JWT_PREVIOUS_PUBLIC_KEYS` to the **new** public key, leave `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`
   on the old pair, restart auth-service. Both keys are now in the JWKS. Wait one
   `JWKS_REFRESH_MS` (5 min) for the verifiers to pick the new one up — confirm with
   `docker logs gozone-ride | grep JWKS`.
2. **Switch signing over.** Set `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` to the new pair and
   `JWT_PREVIOUS_PUBLIC_KEYS` to the **old** public key, restart auth-service. New tokens are
   signed with the new key, which every verifier already holds; tokens issued minutes ago still
   verify against the old one.
3. **Drop the old key** once every token signed with it has expired — one `JWT_EXPIRY_MS`, so an
   hour. Clear `JWT_PREVIOUS_PUBLIC_KEYS` and restart auth-service.

Doing it in one step instead would 401 everyone holding an access token — up to an hour of
users, who only find out when a request fails. There is a safety net, but it is not free: a
token whose `kid` a service does not recognise makes that service fetch the JWKS again in the
background, so the **first** request to reach it after a surprise rotation fails and requests a
second later succeed. Per service, independently — measured, not assumed. Fine as a backstop,
not something to plan a rotation around.

Also update `JWT_PUBLIC_KEY` in the verifiers'
environment at your leisure afterwards: it is only the fallback now, but leaving it on a dead key
means an auth-service outage during a later rotation degrades to failing verification rather than
to the last known good key.

---

## 4. Payments and payouts

- **Money in** works with a live key: Paystack checkout, then server-side verification before
  anything is marked paid. An unverified reference is rejected.
- **Money out** needs a **registered** Paystack business. A starter account is refused outright
  ("You cannot initiate third party payouts as a starter business"), and every payout then waits
  on the admin **Payouts** board to be sent by hand. That is a working fallback, not a bug — but
  decide which one you are running on before launch, and staff the board if it is the fallback.
- **Bank payouts always queue**, because Paystack needs a bank code and the app collects a bank
  name. Wiring Paystack's `/bank?currency=GHS` list into the cash-out sheet is what makes bank
  transfers automatic. Mobile money already uses real network codes.
- Commission rates live in the `commission_config` table (rides 18%, food 12%) and platform fees
  in `platform_settings` — set both for production before taking orders.

---

## 5. Third-party key restrictions

- **Maps server key** (`GOOGLE_MAPS_SERVER_KEY`, used only by ride-service's `/rides/maps/*`
  proxy): restrict by IP. Prefer a `/24` range — home and mobile IPs rotate, and a single-IP
  restriction is the usual reason routes and search suddenly stop working.
- **Maps SDK keys** in `customer-app/.env` and `driver-app/.env`: restrict to the Android package
  name + SHA-1 and the iOS bundle id. These ship inside the app and are readable by anyone.
- **Expo push**: set `EXPO_ACCESS_TOKEN` if you enable push security on the Expo project.

---

## 6. Edge and network

- **TLS.** Everything assumes plain HTTP today. Terminate TLS in front of the gateway and serve
  the apps over `https://`; tokens and OTPs are otherwise in clear text on the wire.
- **CORS** is `allowedOrigins: "*"` in the gateway (and auth-service has its own permissive
  `CorsFilter`). Narrow both to your real origins.
- **Rate limiting** is in place at the gateway, counted in memory per instance
  (`app.ratelimit.*`): 40 requests/minute per IP on sign-in and OTP endpoints, 600/minute
  otherwise. These are sized to absorb carrier NAT, where many subscribers share one address —
  per-account protection comes from the 5-attempt OTP cap instead. **Running more than one
  gateway instance makes the limit per-instance**; at that point switch to Spring Cloud Gateway's
  Redis-backed `RequestRateLimiter` so the counter is shared.
- **Only the gateway (8080) should be reachable.** Ports 8081–8084 and Postgres 5432 stay on the
  internal network. Internal-only paths (`/wallet/commission`, `/wallet/settle`,
  `/wallet/pay/verify`, `/notify`, `/auth/delivery-riders`) are 404'd at the edge; keep it that way.
- **Actuator** exposes `health` only. Do not widen it on a public port.

---

## 7. Data

- Use managed PostgreSQL with **PostGIS** available (ride-service needs it) and automated
  backups; the compose Postgres is for development.
- Each service owns its own database and only Flyway changes schema. Never edit a schema by hand
  in production — write a migration, so every environment converges.
- Do not run the `seed/` scripts against production. They create demo accounts with known phone
  numbers, including an admin.

---

## 8. Before you announce it

- [ ] Every credential in section 1 regenerated for production
- [ ] `OTP_LOG_CODES=false`, `GOOGLE_CLIENT_IDS` populated
- [ ] TLS in front of the gateway, CORS narrowed
- [ ] Paystack live key in, business registered (or payout board staffed)
- [ ] Maps keys restricted, server key by IP range
- [ ] Commission and platform fees set to real values
- [ ] `docker compose up -d` on the target, then `bash scripts/e2e.sh` against it
- [ ] Sign in on a real device over the public URL — phone OTP by SMS, and an email code
- [ ] One real ride, one real order, one real cash out, end to end

---

## Known gaps, stated plainly

These are unfinished rather than decided against:

- **Google Sign-In in the apps** — backend verification is done; the button needs OAuth client
  ids and a development build, since Google rejects Expo Go's `exp://` redirect.
- **Automatic bank payouts** (section 4).
- **Distributed rate limiting** (section 6).
- **A transactional outbox** for settlement. Today ride/food call wallet synchronously; the calls
  are idempotent on reference id, so a retry is safe, but a wallet outage during completion needs
  a manual replay.
