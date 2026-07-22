package com.gozone.ride.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/** One entry in a rider's history: the request, its trip (if matched), and timing. */
public record RideHistoryItem(
    UUID requestId,
    UUID tripId,
    String status,      // trip status if matched, else request status (OPEN/CANCELLED)
    BigDecimal fare,
    double originLat,
    double originLng,
    double destLat,
    double destLng,
    OffsetDateTime scheduledAt,
    OffsetDateTime createdAt
) {}
