#!/bin/bash

BASE_URL="http://localhost:8080"
PASS=0
FAIL=0

check() {
  local SERVICE=$1
  local PATH=$2
  
  echo -n "Checking $SERVICE... "
  
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$PATH")
  
  if [ "$RESPONSE" = "200" ]; then
    echo "UP ✓"
    PASS=$((PASS + 1))
  else
    echo "DOWN ✗ (HTTP $RESPONSE)"
    FAIL=$((FAIL + 1))
  fi
}

echo "================================"
echo " GoZone Smoke Test"
echo "================================"
echo ""

check "Auth Service"   "/auth/actuator/health"
check "Ride Service"   "/rides/actuator/health"
check "Food Service"   "/food/actuator/health"
check "Wallet Service" "/wallet/actuator/health"

echo ""
echo "================================"
echo " Results: $PASS passed, $FAIL failed"
echo "================================"

if [ "$FAIL" -gt 0 ]; then
  echo " GATE: FAIL — fix before proceeding"
  exit 1
else
  echo " GATE: PASS — spine is alive"
  exit 0
fi