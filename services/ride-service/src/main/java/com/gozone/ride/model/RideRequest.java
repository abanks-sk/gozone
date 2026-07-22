package com.gozone.ride.model;

import jakarta.persistence.*;
import org.locationtech.jts.geom.Point;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "ride_requests")
public class RideRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "rider_id", nullable = false)
    private UUID riderId;

    @Column(name = "origin", columnDefinition = "geography(POINT,4326)", nullable = false)
    private Point origin;

    @Column(name = "dest", columnDefinition = "geography(POINT,4326)", nullable = false)
    private Point dest;

    @Column(nullable = false)
    private short seats = 1;

    @Column(name = "proposed_fare", nullable = false, precision = 10, scale = 2)
    private BigDecimal proposedFare;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.OPEN;

    @Column(name = "scheduled_at")
    private OffsetDateTime scheduledAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Kind kind = Kind.RIDE;

    @Enumerated(EnumType.STRING)
    @Column(name = "ride_type", nullable = false, length = 20)
    private RideType rideType = RideType.STANDARD;

    @Enumerated(EnumType.STRING)
    @Column(name = "parcel_size", length = 20)
    private ParcelSize parcelSize;

    @Column(name = "parcel_desc", columnDefinition = "text")
    private String parcelDesc;

    // The rider's phone, shared with the matched driver (via TripResponse) so
    // they can call — never exposed in the open nearby feed.
    @Column(name = "rider_phone", columnDefinition = "text")
    private String riderPhone;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    public enum Status { OPEN, MATCHED, CANCELLED, EXPIRED }
    public enum Kind { RIDE, PARCEL }
    public enum RideType { STANDARD, LUXE, OKADA }
    public enum ParcelSize { SMALL, MEDIUM, LARGE }

    public UUID getId() { return id; }
    public UUID getRiderId() { return riderId; }
    public void setRiderId(UUID riderId) { this.riderId = riderId; }
    public Point getOrigin() { return origin; }
    public void setOrigin(Point origin) { this.origin = origin; }
    public Point getDest() { return dest; }
    public void setDest(Point dest) { this.dest = dest; }
    public short getSeats() { return seats; }
    public void setSeats(short seats) { this.seats = seats; }
    public BigDecimal getProposedFare() { return proposedFare; }
    public void setProposedFare(BigDecimal proposedFare) { this.proposedFare = proposedFare; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public OffsetDateTime getScheduledAt() { return scheduledAt; }
    public void setScheduledAt(OffsetDateTime scheduledAt) { this.scheduledAt = scheduledAt; }
    public Kind getKind() { return kind; }
    public void setKind(Kind kind) { this.kind = kind; }
    public RideType getRideType() { return rideType; }
    public void setRideType(RideType rideType) { this.rideType = rideType; }
    public ParcelSize getParcelSize() { return parcelSize; }
    public void setParcelSize(ParcelSize parcelSize) { this.parcelSize = parcelSize; }
    public String getParcelDesc() { return parcelDesc; }
    public void setParcelDesc(String parcelDesc) { this.parcelDesc = parcelDesc; }
    public String getRiderPhone() { return riderPhone; }
    public void setRiderPhone(String riderPhone) { this.riderPhone = riderPhone; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
