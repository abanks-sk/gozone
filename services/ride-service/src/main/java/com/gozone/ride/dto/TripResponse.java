package com.gozone.ride.dto;

import com.gozone.ride.model.Trip;
import com.gozone.ride.model.TripPassenger;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A trip as one participant sees it.
 *
 * <p>{@code agreedFare} is the whole trip's money — the sum of every passenger's share, which is
 * what the driver earns and what commission comes off. On a shared ride that is emphatically NOT
 * what any one passenger owes, so a passenger's own bill travels separately in {@code myFare},
 * and {@code paymentStatus}/{@code paymentMethod} describe THEIR payment rather than the trip's
 * roll-up. Showing a passenger the trip total would ask the second passenger to pay for the first.
 */
public record TripResponse(
    UUID id,
    UUID driverId,
    BigDecimal agreedFare,
    String status,
    OffsetDateTime startedAt,
    OffsetDateTime completedAt,
    String paymentStatus,
    String paymentMethod,
    // The rider's phone so the matched driver can call them. Trip endpoints are
    // participant-guarded, so this is only ever revealed after a match.
    String riderPhone,
    // Parcel handover: who the courier meets at the far end, and which end the customer is at.
    // Revealed on the same terms as riderPhone — to an assigned participant, after a match.
    String direction,
    String partyName,
    String partyPhone,
    // ── Ride sharing ────────────────────────────────────────────────────────────
    /** This ride can take on more passengers along its corridor. */
    boolean shared,
    /** How many people are on it right now — 1 on an ordinary trip. */
    int passengerCount,
    /** What the caller personally owes. Null when the caller is the driver, not a passenger. */
    BigDecimal myFare,
    /** What the caller would have paid alone, so the app can show what sharing saved them. */
    BigDecimal mySoloFare,
    /**
     * The caller's boarding position: 1 if they booked this ride, higher if they joined it.
     *
     * <p>The app needs this to tell "cancel the ride" from "get out of someone else's" — only a
     * joiner may leave, and only the booker may cancel. Null when the caller is the driver.
     */
    Short myPickupSeq,
    /**
     * Whether the driver has confirmed the caller is in the car.
     *
     * <p>The app hides "leave this ride" once it is true — the exit closes at the car door. Null
     * when the caller is the driver.
     */
    Boolean myPickedUp,
    /** Whether the caller has objected to being marked aboard, so the app doesn't offer it twice. */
    Boolean myPickupDisputed
) {
    /** Trip-level view: the whole fare and the rolled-up payment state. What the driver sees. */
    public static TripResponse from(Trip t) {
        return build(t, null, 1);
    }

    /**
     * One passenger's view: their own share and their own payment state.
     *
     * <p>Use wherever the caller has been identified as a passenger — anything else hands somebody
     * a bill that is not theirs.
     */
    public static TripResponse forPassenger(Trip t, TripPassenger p, int passengerCount) {
        return build(t, p, passengerCount);
    }

    private static TripResponse build(Trip t, TripPassenger p, int passengerCount) {
        var req = t.getRequest();
        return new TripResponse(
            t.getId(),
            t.getDriverId(),
            t.getAgreedFare(),
            t.getStatus().name(),
            t.getStartedAt(),
            t.getCompletedAt(),
            (p != null ? p.getPaymentStatus() : t.getPaymentStatus()).name(),
            p != null ? p.getPaymentMethod() : t.getPaymentMethod(),
            req != null ? req.getRiderPhone() : null,
            req != null && req.getDirection() != null ? req.getDirection().name() : null,
            req != null ? req.getPartyName() : null,
            req != null ? req.getPartyPhone() : null,
            t.isShared(),
            passengerCount,
            p != null ? p.getLockedFare() : null,
            p != null ? p.getSoloFare() : null,
            p != null ? p.getPickupSeq() : null,
            p != null ? p.getPickedUpAt() != null : null,
            p != null ? p.getPickupDisputedAt() != null : null
        );
    }
}
