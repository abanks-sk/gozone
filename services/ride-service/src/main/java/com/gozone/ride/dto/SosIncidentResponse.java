package com.gozone.ride.dto;

import com.gozone.ride.model.SosIncident;

import java.time.OffsetDateTime;
import java.util.UUID;

/** An SOS alert as shown on the admin web app's incident board. */
public record SosIncidentResponse(
    UUID id,
    UUID tripId,
    UUID userId,
    Double lat,
    Double lng,
    String status, // NEW | HANDLED
    OffsetDateTime createdAt
) {
    public static SosIncidentResponse from(SosIncident i) {
        return new SosIncidentResponse(i.getId(), i.getTripId(), i.getUserId(),
            i.getLat(), i.getLng(), i.getStatus().name(), i.getCreatedAt());
    }
}
