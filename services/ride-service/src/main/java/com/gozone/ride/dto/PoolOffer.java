package com.gozone.ride.dto;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * A ride already on the road that the caller could get into.
 *
 * <p>Offered to a rider who asked to share while they are still waiting for drivers to bid, and it
 * sits alongside those bids as a third option: take a driver's price, counter it, or step into a
 * car that is going your way anyway for less.
 *
 * <p>Everything a person needs to decide is here, priced. {@code yourFare} is what they would
 * actually pay — not a guide, the number the join is executed at — and {@code currentFare}/
 * {@code newFare} are what the ride already costs the passenger inside it, so the offer can say
 * plainly that they are both better off. It carries no phone numbers: this is shown to somebody
 * who has not joined anything yet, and the driver's number is a matched-participant detail.
 */
public record PoolOffer(
    UUID tripId,
    UUID driverId,
    String driverName,
    String vehicle,
    String plate,
    /** Where the car is now, so the offer can be drawn on the map before anyone commits. */
    Double driverLat,
    Double driverLng,
    /** Where the ride is already heading. */
    double destLat,
    double destLng,

    /** What the caller would pay by joining. */
    BigDecimal yourFare,
    /** What they are paying for the ride alone right now — the number yourFare is a discount on. */
    BigDecimal yourSoloFare,
    /** What the passenger already aboard pays today, and what they would pay once you join. */
    BigDecimal currentFare,
    BigDecimal newFare,
    /** Whole-percent saving on the caller's own fare, for a headline that needs no arithmetic. */
    int savingPct,

    /** People already aboard (the caller would be this many plus one). */
    int passengerCount,
    /** How far off the car's line the caller's pickup is — the detour they are asking for. */
    double detourKm,
    /** How far apart the two destinations are. */
    double destGapKm,
    String ruleVersion
) {}
