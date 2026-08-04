package com.gozone.ride.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * The outcome of stepping into a ride that was already going your way.
 *
 * <p>{@code lockedFare} is what the joiner now owes, quoted back rather than left to be discovered
 * on the tracking screen — somebody has just agreed to a price and is entitled to see it
 * confirmed. {@code ruleVersion} stamps which pricing rules produced it, so a fare can still be
 * explained months later when the rules have moved on.
 */
public record PoolJoinResponse(
    UUID tripId,
    BigDecimal lockedFare,
    /** What the joiner would have paid alone. */
    BigDecimal soloFare,
    /** How many are now aboard, the joiner included. */
    int passengerCount,
    String ruleVersion
) {}
