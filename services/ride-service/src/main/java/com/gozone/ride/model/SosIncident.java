package com.gozone.ride.model;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** An SOS alert raised from a trip; triaged by admins in the admin web app. */
@Entity
@Table(name = "sos_incidents")
public class SosIncident {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "trip_id")
    private UUID tripId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    private Double lat;
    private Double lng;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.NEW;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    /**
     * When {@link #lat}/{@link #lng} were last refreshed by the reporter's app.
     *
     * <p>The coordinates used to be whatever was true when the button was pressed. In a moving
     * vehicle that is the one place the person is certainly no longer, so the app keeps them
     * current while the alert is open — and this timestamp is what lets the board say "2 minutes
     * ago" rather than presenting a stale pin as a live one.
     */
    @Column(name = "location_at")
    private OffsetDateTime locationAt;

    public enum Status { NEW, HANDLED }

    public UUID getId() { return id; }
    public UUID getTripId() { return tripId; }
    public void setTripId(UUID tripId) { this.tripId = tripId; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public Double getLat() { return lat; }
    public void setLat(Double lat) { this.lat = lat; }
    public Double getLng() { return lng; }
    public void setLng(Double lng) { this.lng = lng; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getLocationAt() { return locationAt; }
    public void setLocationAt(OffsetDateTime locationAt) { this.locationAt = locationAt; }
}
