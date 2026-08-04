package com.gozone.ride.dto;

import com.gozone.ride.model.Bid;
import com.gozone.ride.model.PickupDispute;
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
    /**
     * @param seat the passenger row, or null when they have since left the ride — the dispute
     *             outlives the seat on purpose, so the board must render without one.
     */
    public static PickupDisputeResponse of(PickupDispute d, Trip trip, RideRequest req,
                                           Bid winningBid, TripPassenger seat) {
        return new PickupDisputeResponse(
            trip.getId(),
            trip.getStatus().name(),
            d.getRiderId(),
            req != null ? req.getRiderPhone() : null,
            trip.getDriverId(),
            winningBid != null ? winningBid.getDriverName() : null,
            winningBid != null ? winningBid.getDriverPhone() : null,
            winningBid != null ? winningBid.getVehicle() : null,
            winningBid != null ? winningBid.getPlate() : null,
            d.getLockedFare(),
            d.getPickupSeq(),
            // No seat means they left the ride after raising this. "LEFT" rather than a payment
            // status, because there is no longer a fare of theirs to be in any state.
            seat != null ? seat.getPaymentStatus().name() : "LEFT",
            req != null ? req.getOrigin().getY() : 0,
            req != null ? req.getOrigin().getX() : 0,
            req != null ? req.getDest().getY() : 0,
            req != null ? req.getDest().getX() : 0,
            seat != null ? seat.getPickedUpAt() : null,
            d.getRaisedAt(),
            d.getNote(),
            d.getResolvedAt(),
            d.getOutcome()
        );
    }
}
