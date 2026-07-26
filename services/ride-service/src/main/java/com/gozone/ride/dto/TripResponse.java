package com.gozone.ride.dto;

import com.gozone.ride.model.Trip;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

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
    String partyPhone
) {
    public static TripResponse from(Trip t) {
        var req = t.getRequest();
        return new TripResponse(
            t.getId(),
            t.getDriverId(),
            t.getAgreedFare(),
            t.getStatus().name(),
            t.getStartedAt(),
            t.getCompletedAt(),
            t.getPaymentStatus().name(),
            t.getPaymentMethod(),
            req != null ? req.getRiderPhone() : null,
            req != null && req.getDirection() != null ? req.getDirection().name() : null,
            req != null ? req.getPartyName() : null,
            req != null ? req.getPartyPhone() : null
        );
    }
}
