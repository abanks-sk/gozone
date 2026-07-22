package com.gozone.ride.model;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "bids")
public class Bid {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "request_id", nullable = false)
    private RideRequest request;

    @Column(name = "driver_id", nullable = false)
    private UUID driverId;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private BidType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BidStatus status = BidStatus.PENDING;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    // Driver identity + vehicle + position at bid time, so the rider can compare
    // offers (name, car, distance) before choosing one.
    @Column(name = "driver_name")  private String driverName;
    @Column(name = "driver_phone") private String driverPhone;
    @Column(name = "vehicle")      private String vehicle;
    @Column(name = "plate")        private String plate;
    @Column(name = "driver_lat")   private Double driverLat;
    @Column(name = "driver_lng")   private Double driverLng;

    public enum BidType { ACCEPT, COUNTER }
    public enum BidStatus { PENDING, ACCEPTED, REJECTED, WITHDRAWN }

    public UUID getId() { return id; }
    public RideRequest getRequest() { return request; }
    public void setRequest(RideRequest request) { this.request = request; }
    public UUID getDriverId() { return driverId; }
    public void setDriverId(UUID driverId) { this.driverId = driverId; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public BidType getType() { return type; }
    public void setType(BidType type) { this.type = type; }
    public BidStatus getStatus() { return status; }
    public void setStatus(BidStatus status) { this.status = status; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public String getDriverName() { return driverName; }
    public void setDriverName(String driverName) { this.driverName = driverName; }
    public String getDriverPhone() { return driverPhone; }
    public void setDriverPhone(String driverPhone) { this.driverPhone = driverPhone; }
    public String getVehicle() { return vehicle; }
    public void setVehicle(String vehicle) { this.vehicle = vehicle; }
    public String getPlate() { return plate; }
    public void setPlate(String plate) { this.plate = plate; }
    public Double getDriverLat() { return driverLat; }
    public void setDriverLat(Double driverLat) { this.driverLat = driverLat; }
    public Double getDriverLng() { return driverLng; }
    public void setDriverLng(Double driverLng) { this.driverLng = driverLng; }
}
