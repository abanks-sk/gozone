package com.gozone.ride.model;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A passenger's objection to being marked as in a car.
 *
 * <p>Its own table, not columns on {@link TripPassenger}, and that is the point: leaving a shared
 * ride deletes the seat, so a dispute stored on the seat died with the person who raised it. A
 * driver who repeatedly marks people aboard who are not in the car is a pattern nobody could see if
 * every complainant who walked away erased their own complaint.
 *
 * <p>{@code lockedFare} and {@code pickupSeq} are copied rather than joined for the same reason —
 * they are the substance of the claim and would be unreadable once the seat is gone.
 */
@Entity
@Table(name = "pickup_disputes")
public class PickupDispute {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "trip_id", nullable = false)
    private UUID tripId;

    @Column(name = "rider_id", nullable = false)
    private UUID riderId;

    @Column(name = "pickup_seq", nullable = false)
    private short pickupSeq = 1;

    @Column(name = "locked_fare", precision = 10, scale = 2)
    private BigDecimal lockedFare;

    @Column(name = "raised_at", nullable = false)
    private OffsetDateTime raisedAt = OffsetDateTime.now();

    @Column(columnDefinition = "text")
    private String note;

    /** Null while open. A partial unique index allows only one open dispute per rider per trip. */
    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;

    @Column(columnDefinition = "text")
    private String outcome;

    public boolean isOpen() { return resolvedAt == null; }

    public UUID getId() { return id; }
    public UUID getTripId() { return tripId; }
    public void setTripId(UUID tripId) { this.tripId = tripId; }
    public UUID getRiderId() { return riderId; }
    public void setRiderId(UUID riderId) { this.riderId = riderId; }
    public short getPickupSeq() { return pickupSeq; }
    public void setPickupSeq(short pickupSeq) { this.pickupSeq = pickupSeq; }
    public BigDecimal getLockedFare() { return lockedFare; }
    public void setLockedFare(BigDecimal lockedFare) { this.lockedFare = lockedFare; }
    public OffsetDateTime getRaisedAt() { return raisedAt; }
    public void setRaisedAt(OffsetDateTime raisedAt) { this.raisedAt = raisedAt; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public OffsetDateTime getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(OffsetDateTime resolvedAt) { this.resolvedAt = resolvedAt; }
    public String getOutcome() { return outcome; }
    public void setOutcome(String outcome) { this.outcome = outcome; }
}
