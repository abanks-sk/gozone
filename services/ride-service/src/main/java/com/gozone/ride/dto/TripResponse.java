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
    OffsetDateTime completedAt
) {
    public static TripResponse from(Trip t) {
        return new TripResponse(
            t.getId(),
            t.getDriverId(),
            t.getAgreedFare(),
            t.getStatus().name(),
            t.getStartedAt(),
            t.getCompletedAt()
        );
    }
}
