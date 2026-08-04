package com.gozone.ride.dto;

import com.gozone.ride.model.RideRequest;
import com.gozone.ride.model.TripPassenger;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One person on a shared trip, as the driver and the other passengers see them.
 *
 * <p>The driver gets the phone number — they have to be able to ring somebody they are driving to
 * collect, and a second passenger's pickup is a place the driver has to find. A passenger reading
 * the same list gets it blanked: sharing a car with somebody is not consent to hand them your
 * number, and the whole list is served from one endpoint.
 */
public record TripPassengerResponse(
    UUID riderId,
    UUID requestId,
    /** Boarding order — 1 is whoever booked the ride. */
    short pickupSeq,
    BigDecimal lockedFare,
    BigDecimal soloFare,
    String paymentStatus,
    String paymentMethod,
    double originLat,
    double originLng,
    double destLat,
    double destLng,
    /** Null unless the reader is the driver. */
    String riderPhone,
    /**
     * When the driver confirmed they were in the car. Null while they are still a pickup to make —
     * and while they can still walk away.
     */
    java.time.OffsetDateTime pickedUpAt
) {
    public static TripPassengerResponse of(TripPassenger p, RideRequest req, boolean includePhone) {
        return new TripPassengerResponse(
            p.getId().getRiderId(),
            p.getRequestId(),
            p.getPickupSeq(),
            p.getLockedFare(),
            p.getSoloFare(),
            p.getPaymentStatus().name(),
            p.getPaymentMethod(),
            req.getOrigin().getY(),
            req.getOrigin().getX(),
            req.getDest().getY(),
            req.getDest().getX(),
            includePhone ? req.getRiderPhone() : null,
            p.getPickedUpAt()
        );
    }
}
