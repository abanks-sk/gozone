#!/usr/bin/env bash
# GoZone — one-shot setup on a fresh Ubuntu VM (AWS Lightsail, EC2, or any 4GB box).
#
# Run as the default user (ubuntu), NOT root:
#   curl -fsSL https://raw.githubusercontent.com/abanks-sk/gozone/main/deploy/aws-setup.sh | bash
#
# It installs Docker, clones the repo, generates fresh JWT + internal keys, writes a .env with
# safe defaults, starts the stack and seeds the database. The only manual step left is pasting
# your third-party keys (Arkesel, Brevo, Paystack, Google Maps) into ~/gozone/.env.
set -euo pipefail

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

say "Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

say "Cloning GoZone"
cd "$HOME"
[ -d gozone ] || git clone https://github.com/abanks-sk/gozone.git
cd gozone

if [ ! -f .env ]; then
  say "Generating keys and writing .env"
  # RS256 pair. openssl's DER for RSA is PKCS#1, which Java's KeyFactory refuses — hence the
  # pkcs8 conversion. Both values are single-line base64 of the DER bytes.
  tmp=$(mktemp -d)
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -outform DER -out "$tmp/priv.der" 2>/dev/null
  openssl pkcs8 -topk8 -nocrypt -inform DER -in "$tmp/priv.der" -outform DER -out "$tmp/priv8.der"
  openssl rsa -inform DER -in "$tmp/priv.der" -pubout -outform DER -out "$tmp/pub.der" 2>/dev/null
  JWT_PRIV=$(base64 -w0 "$tmp/priv8.der")
  JWT_PUB=$(base64 -w0 "$tmp/pub.der")
  INTERNAL=$(openssl rand -base64 32)
  SUPERPW=$(openssl rand -base64 12)
  rm -rf "$tmp"

  cat > .env <<ENV
# Generated on first deploy. Keys are fresh — the development ones never leave the laptop.
JWT_PRIVATE_KEY=$JWT_PRIV
JWT_PUBLIC_KEY=$JWT_PUB
INTERNAL_KEY=$INTERNAL
SUPERADMIN_PASSWORD=$SUPERPW

DB_USER=gozone
DB_PASS=$(openssl rand -hex 16)

# OTP stays in the logs until an SMS provider is reliably delivering.
# ⚠️ Anyone who can read the logs can sign in as anyone. Set false once SMS works.
OTP_LOG_CODES=true

# ── Paste your keys below ────────────────────────────────────────────────────
ARKESEL_API_KEY=
ARKESEL_SENDER=GoZone
BREVO_API_KEY=
BREVO_SENDER_EMAIL=
BREVO_SMS_SENDER=GoZone
PAYSTACK_SECRET_KEY=mock
GOOGLE_MAPS_SERVER_KEY=
GOOGLE_CLIENT_IDS=
ENV
  chmod 600 .env
  echo "Super admin password: $SUPERPW   (write this down — it is not shown again)"
fi

say "Starting the stack (first build takes a few minutes)"
sg docker -c "docker compose up -d --build" || docker compose up -d --build

say "Waiting for Postgres"
for i in $(seq 1 60); do
  docker exec gozone-postgres pg_isready -U gozone >/dev/null 2>&1 && break
  sleep 3
done

say "Seeding"
docker exec -i gozone-postgres psql -U gozone -d auth_db   < seed/01_auth_seed.sql   || true
docker exec -i gozone-postgres psql -U gozone -d food_db   < seed/02_food_seed.sql   || true
docker exec -i gozone-postgres psql -U gozone -d wallet_db < seed/03_wallet_seed.sql || true

IP=$(curl -s --max-time 10 https://checkip.amazonaws.com || echo "<your-vm-ip>")
say "Done"
echo "Backend:  http://${IP}:8080"
echo
echo "Next:"
echo "  1. Open port 8080 in the VM's firewall/security group."
echo "  2. Paste your keys into ~/gozone/.env, then: docker compose up -d"
echo "  3. In each app: Server address -> http://${IP}:8080"
