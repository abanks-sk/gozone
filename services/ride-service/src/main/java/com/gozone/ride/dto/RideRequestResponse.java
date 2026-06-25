package com.gozone.ride.dto;

import com.gozone.ride.model.RideRequest;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

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
    OffsetDateTime createdAt
) {
    public static RideRequestResponse from(RideRequest r) {
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
            r.getCreatedAt()
        );
    }
}
