package com.gozone.ride.dto;

import com.gozone.ride.model.RideRequest;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A request as clients see it.
 *
 * <p>Two factories on purpose. {@link #from} is the shape served to the open nearby feed, which
 * every active driver in range can read: it describes the job but carries no contact details.
 * {@link #forOwner} adds the parcel handover contact and is only used where the caller has been
 * checked to own the request. Same reasoning that keeps {@code riderPhone} out of the feed — a
 * driver browsing nearby work must not be able to harvest phone numbers, least of all those of
 * third parties who never signed up to GoZone.
 */
public record RideRequestResponse(
    UUID id,
    UUID riderId,
    double originLat,
    double originLng,
    double destLat,
    double destLng,
    short seats,
    BigDecimal proposedFare,
    String status,
    String kind,
    String rideType,
    /** The passenger opted into ride sharing — the driver's feed labels the card differently. */
    boolean shared,
    String parcelSize,
    String parcelDesc,
    /** SEND | RECEIVE for parcels — tells a courier which end the customer is waiting at. */
    String direction,
    /** The other person in a handover. Null unless the reader owns this request. */
    String partyName,
    String partyPhone,
    OffsetDateTime createdAt
) {
    /** Feed shape: describes the job, carries no contact details. */
    public static RideRequestResponse from(RideRequest r) {
        return build(r, false);
    }

    /** Owner shape: includes the handover contact. Use only behind an ownership check. */
    public static RideRequestResponse forOwner(RideRequest r) {
        return build(r, true);
    }

    private static RideRequestResponse build(RideRequest r, boolean includeContact) {
        return new RideRequestResponse(
            r.getId(),
            r.getRiderId(),
            r.getOrigin().getY(),
            r.getOrigin().getX(),
            r.getDest().getY(),
            r.getDest().getX(),
            r.getSeats(),
            r.getProposedFare(),
            r.getStatus().name(),
            r.getKind().name(),
            r.getRideType().name(),
            r.isShared(),
            r.getParcelSize() != null ? r.getParcelSize().name() : null,
            r.getParcelDesc(),
            r.getDirection() != null ? r.getDirection().name() : null,
            includeContact ? r.getPartyName() : null,
            includeContact ? r.getPartyPhone() : null,
            r.getCreatedAt()
        );
    }
}
