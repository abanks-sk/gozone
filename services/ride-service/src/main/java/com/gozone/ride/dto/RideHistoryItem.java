package com.gozone.ride.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One entry in a rider's history: the request, its trip (if matched), and timing.
 *
 * <p>{@code paymentStatus} is what makes history a route back into paying. A completed trip that
 * was never settled is otherwise indistinguishable from one that was, so a passenger who left the
 * payment screen had no way to find the fare they still owe and the driver was never credited.
 * It is this passenger's own status, not the trip's — on a shared ride two people settle separately.
 */
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
    OffsetDateTime createdAt,
    String paymentStatus,   // UNPAID / AWAITING / PAID — null when there is no trip yet
    String paymentMethod
) {}
