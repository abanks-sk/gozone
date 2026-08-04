package com.gozone.ride.dto;

import com.gozone.ride.model.Bid;
import com.gozone.ride.model.RideRequest;
import com.gozone.ride.model.Trip;
import com.gozone.ride.model.TripPassenger;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A disputed pickup, as the admin deciding it needs to see it.
 *
 * <p>Deliberately fuller than {@link TripPassengerResponse}. Somebody is being asked to settle an
 * argument about money between two people, and the same lesson applies here as on the KYC board: a
 * truncated UUID is not something you can act on. Both parties' phone numbers are here because the
 * only way to resolve most of these is to ring them and ask.
 *
 * <p>The driver's name and vehicle come from the accepted bid rather than from auth-service —
 * they were captured at bid time and live in this database, so the admin board costs no
 * cross-service call.
 */
public record PickupDisputeResponse(
    UUID tripId,
    String tripStatus,
    UUID riderId,
    String riderPhone,
    UUID driverId,
    String driverName,
    String driverPhone,
    String vehicle,
    String plate,
    /** What the passenger stands to be charged if the dispute fails. */
    BigDecimal lockedFare,
    short pickupSeq,
    String paymentStatus,
    double originLat,
    double originLng,
    double destLat,
    double destLng,
    OffsetDateTime pickedUpAt,
    OffsetDateTime disputedAt,
    String note,
    /** Null while open — this is what makes a row a live piece of work. */
    OffsetDateTime resolvedAt,
    String outcome
) {
    public static PickupDisputeResponse of(TripPassenger p, Trip trip, RideRequest req, Bid winningBid) {
        return new PickupDisputeResponse(
            trip.getId(),
            trip.getStatus().name(),
            p.getId().getRiderId(),
            req != null ? req.getRiderPhone() : null,
            trip.getDriverId(),
            winningBid != null ? winningBid.getDriverName() : null,
            winningBid != null ? winningBid.getDriverPhone() : null,
            winningBid != null ? winningBid.getVehicle() : null,
            winningBid != null ? winningBid.getPlate() : null,
            p.getLockedFare(),
            p.getPickupSeq(),
            p.getPaymentStatus().name(),
            req != null ? req.getOrigin().getY() : 0,
            req != null ? req.getOrigin().getX() : 0,
            req != null ? req.getDest().getY() : 0,
            req != null ? req.getDest().getX() : 0,
            p.getPickedUpAt(),
            p.getPickupDisputedAt(),
            p.getPickupDisputeNote(),
            p.getPickupDisputeResolvedAt(),
            p.getPickupDisputeOutcome()
        );
    }
}
