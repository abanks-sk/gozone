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

    /**
     * What the driver is owed for the whole trip.
     *
     * <p>On a shared trip this is the SUM of every passenger's locked fare, not any one person's
     * fare — it is the number that settles to the driver's wallet and the number commission comes
     * off. It grows each time somebody joins, which is the point: two people at a discount are
     * worth more to the driver than one at full price.
     */
    @Column(name = "agreed_fare", nullable = false, precision = 10, scale = 2)
    private BigDecimal agreedFare;

    /** This trip can pick up more passengers along its corridor. Set from the booking request. */
    @Column(nullable = false)
    private boolean shared = false;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.MATCHED;

    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_status", nullable = false, length = 20)
    private PaymentStatus paymentStatus = PaymentStatus.UNPAID;

    @Column(name = "payment_method", length = 20)
    private String paymentMethod;

    public enum Status { MATCHED, ENROUTE, STARTED, COMPLETED, CANCELLED }
    public enum PaymentStatus { UNPAID, AWAITING, PAID }

    public UUID getId() { return id; }
    public RideRequest getRequest() { return request; }
    public void setRequest(RideRequest request) { this.request = request; }
    public UUID getDriverId() { return driverId; }
    public void setDriverId(UUID driverId) { this.driverId = driverId; }
    public BigDecimal getAgreedFare() { return agreedFare; }
    public void setAgreedFare(BigDecimal agreedFare) { this.agreedFare = agreedFare; }
    public boolean isShared() { return shared; }
    public void setShared(boolean shared) { this.shared = shared; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public OffsetDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(OffsetDateTime startedAt) { this.startedAt = startedAt; }
    public OffsetDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(OffsetDateTime completedAt) { this.completedAt = completedAt; }
    public PaymentStatus getPaymentStatus() { return paymentStatus; }
    public void setPaymentStatus(PaymentStatus paymentStatus) { this.paymentStatus = paymentStatus; }
    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }
}
