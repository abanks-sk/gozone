package com.gozone.ride.dto;

import com.gozone.ride.model.SosIncident;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * An SOS alert as shown on the admin web app's incident board.
 *
 * <p>This used to be a pair of UUIDs and a coordinate. A safety team cannot act on that: they
 * need to know who pressed the button, who they are in a car with, and how to ring either of
 * them — the same lesson the KYC and pickup-dispute boards each learned separately. Everything
 * here is resolvable without a cross-service call at read time: the passenger's name and number
 * are stamped on their request, and the driver's come off the offer they were matched on.
 *
 * <p>Two positions, deliberately. {@code lat}/{@code lng} is where the <em>reporter</em> is,
 * refreshed by their app while the alert is open ({@code locationAt} says how fresh). {@code
 * driverLat}/{@code driverLng} is the vehicle's own last ping. On a trip that has gone wrong
 * those are not the same place, and which one diverges is the useful signal.
 */
public record SosIncidentResponse(
    UUID id,
    UUID tripId,
    UUID userId,
    Double lat,
    Double lng,
    /** How current the reporter's position is. Null on alerts raised before this was tracked. */
    OffsetDateTime locationAt,
    String status, // NEW | HANDLED
    OffsetDateTime createdAt,

    /** Who raised it. */
    String reporterName,
    String reporterPhone,

    /** Who they are travelling with, and what they are travelling in. */
    UUID driverId,
    String driverName,
    String driverPhone,
    String vehicle,
    String plate,
    Double driverLat,
    Double driverLng,

    /** Where the trip had got to — MATCHED/ENROUTE/STARTED tells you if they are still moving. */
    String tripStatus,
    Double originLat,
    Double originLng,
    Double destLat,
    Double destLng
) {
    /** Bare shape, for alerts with no trip attached to enrich from. */
    public static SosIncidentResponse from(SosIncident i) {
        return new SosIncidentResponse(i.getId(), i.getTripId(), i.getUserId(),
            i.getLat(), i.getLng(), i.getLocationAt(), i.getStatus().name(), i.getCreatedAt(),
            null, null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    public static SosIncidentResponse enriched(
            SosIncident i,
            String reporterName, String reporterPhone,
            UUID driverId, String driverName, String driverPhone, String vehicle, String plate,
            Double driverLat, Double driverLng,
            String tripStatus,
            Double originLat, Double originLng, Double destLat, Double destLng) {
        return new SosIncidentResponse(i.getId(), i.getTripId(), i.getUserId(),
            i.getLat(), i.getLng(), i.getLocationAt(), i.getStatus().name(), i.getCreatedAt(),
            reporterName, reporterPhone,
            driverId, driverName, driverPhone, vehicle, plate, driverLat, driverLng,
            tripStatus, originLat, originLng, destLat, destLng);
    }
}
