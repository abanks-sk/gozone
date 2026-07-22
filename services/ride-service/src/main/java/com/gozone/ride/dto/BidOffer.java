package com.gozone.ride.dto;

import com.gozone.ride.model.Bid;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/** A driver's pending offer on a rider's open request (inDrive-style bargaining). */
public record BidOffer(
    UUID id,
    UUID driverId,
    BigDecimal amount,
    String type,    // ACCEPT | COUNTER
    String status,  // PENDING | ACCEPTED | …
    OffsetDateTime createdAt,
    String driverName,
    String driverPhone,
    String vehicle,
    String plate,
    Double distanceKm // driver → pickup at bid time; null if the driver sent no position
) {
    public static BidOffer from(Bid b, Double distanceKm) {
        return new BidOffer(b.getId(), b.getDriverId(), b.getAmount(), b.getType().name(),
            b.getStatus().name(), b.getCreatedAt(), b.getDriverName(), b.getDriverPhone(),
            b.getVehicle(), b.getPlate(), distanceKm);
    }
}
