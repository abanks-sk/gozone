package com.gozone.ride.dto;

import java.math.BigDecimal;

/**
 * Server-authoritative fare quote. The app shows {@code fare} as the suggested/anchor
 * price; on bargainable ride types the rider may still adjust their offer.
 */
public record QuoteResponse(
    double distanceKm,
    BigDecimal fare,          // final suggested fare (after type + surge, floored at minFare)
    BigDecimal baseFare,      // distance fare before type/surge, for transparency
    String rideType,
    double typeMultiplier,
    double surgeMultiplier,   // > 1.0 during peak hours
    boolean surge,
    String currency,
    String ruleVersion
) {}
