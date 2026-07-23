#!/usr/bin/env bash
# Scripted GPS stream for demo driver (driver 2) — Airport to Osu, Accra
# Usage: JWT=<driver_jwt> ./seed/run_gps_demo.sh
# Calls POST /rides/locations every 2s to simulate live movement.

set -e
GATEWAY=${GATEWAY:-http://localhost:8080}
TOKEN=${JWT:?Set JWT env var to a valid driver access token}

waypoints=(
  "5.6052,-0.1674"   # Kotoka Airport
  "5.6060,-0.1720"
  "5.6075,-0.1780"
  "5.6085,-0.1840"
  "5.6092,-0.1900"
  "5.6098,-0.1950"
  "5.6105,-0.2000"
  "5.6110,-0.1980"
  "5.6120,-0.1950"   # Osu, Oxford Street
)

echo "Starting GPS stream for demo driver (${#waypoints[@]} waypoints)..."
for wp in "${waypoints[@]}"; do
  lat="${wp%%,*}"
  lng="${wp##*,}"
  curl -s -X POST "$GATEWAY/rides/locations" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"lat\": $lat, \"lng\": $lng}" \
    > /dev/null
  echo "→ pushed $lat,$lng"
  sleep 2
done
echo "GPS stream complete."
