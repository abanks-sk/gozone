package com.gozone.ride.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One job in a driver's or courier's history.
 *
 * <p>This exists because the driver app kept its active trip in a persisted store and nowhere
 * else. Clearing that store — which happens on logout <em>and</em> on every fresh OTP verify —
 * destroyed the only route back to a finished trip, so a driver who left before confirming a cash
 * fare could never confirm it and the customer waited forever on "waiting for them to confirm".
 * Server-side history makes an escaped trip recoverable by design rather than by luck.
 *
 * <p>{@code cashToConfirm} is the load-bearing field. A passenger sits at AWAITING only when they
 * chose cash (see {@code payTrip}), so an awaiting seat is exactly "money handed over that the
 * driver has not acknowledged" — and {@code cashAmount} is what is owed on it, summed across
 * everyone on a shared ride who is still waiting.
 */
public record DriverTripItem(
    UUID tripId,
    UUID requestId,
    String status,
    /** The whole fare the driver earns — on a shared trip, the sum of every passenger's share. */
    BigDecimal fare,
    String kind,            // RIDE / PARCEL
    String paymentStatus,   // UNPAID / AWAITING / PAID, rolled up across passengers
    String paymentMethod,
    int cashToConfirm,      // passengers whose cash the driver has not confirmed
    BigDecimal cashAmount,  // what those passengers still owe in cash
    double originLat,
    double originLng,
    double destLat,
    double destLng,
    OffsetDateTime completedAt,
    OffsetDateTime createdAt
) {}
