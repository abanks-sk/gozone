package com.gozone.wallet.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.UUID;

public class SettleRideRequest {
    @NotNull private UUID tripId;
    @NotNull private UUID driverId;
    @NotNull @DecimalMin("0.01") private BigDecimal agreedFare;

    public UUID getTripId() { return tripId; }
    public void setTripId(UUID tripId) { this.tripId = tripId; }
    public UUID getDriverId() { return driverId; }
    public void setDriverId(UUID driverId) { this.driverId = driverId; }
    public BigDecimal getAgreedFare() { return agreedFare; }
    public void setAgreedFare(BigDecimal agreedFare) { this.agreedFare = agreedFare; }
}
