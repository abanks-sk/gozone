package com.gozone.ride.model;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "trips")
public class Trip {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "request_id", nullable = false)
    private RideRequest request;

    @Column(name = "driver_id", nullable = false)
    private UUID driverId;

    @Column(name = "agreed_fare", nullable = false, precision = 10, scale = 2)
    private BigDecimal agreedFare;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.MATCHED;

    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    public enum Status { MATCHED, ENROUTE, STARTED, COMPLETED, CANCELLED }

    public UUID getId() { return id; }
    public RideRequest getRequest() { return request; }
    public void setRequest(RideRequest request) { this.request = request; }
    public UUID getDriverId() { return driverId; }
    public void setDriverId(UUID driverId) { this.driverId = driverId; }
    public BigDecimal getAgreedFare() { return agreedFare; }
    public void setAgreedFare(BigDecimal agreedFare) { this.agreedFare = agreedFare; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public OffsetDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(OffsetDateTime startedAt) { this.startedAt = startedAt; }
    public OffsetDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(OffsetDateTime completedAt) { this.completedAt = completedAt; }
}
