package com.gozone.ride.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public class BidRequestDto {
    @NotBlank private String type; // ACCEPT | COUNTER
    @NotNull @DecimalMin("0.01") private BigDecimal amount;

    // Driver identity + vehicle + current position (all optional) so the rider
    // can compare offers by distance and see who/what is coming.
    private String driverName;
    private String driverPhone;
    private String vehicle;
    private String plate;
    private Double lat;
    private Double lng;

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getDriverName() { return driverName; }
    public void setDriverName(String driverName) { this.driverName = driverName; }
    public String getDriverPhone() { return driverPhone; }
    public void setDriverPhone(String driverPhone) { this.driverPhone = driverPhone; }
    public String getVehicle() { return vehicle; }
    public void setVehicle(String vehicle) { this.vehicle = vehicle; }
    public String getPlate() { return plate; }
    public void setPlate(String plate) { this.plate = plate; }
    public Double getLat() { return lat; }
    public void setLat(Double lat) { this.lat = lat; }
    public Double getLng() { return lng; }
    public void setLng(Double lng) { this.lng = lng; }
}
