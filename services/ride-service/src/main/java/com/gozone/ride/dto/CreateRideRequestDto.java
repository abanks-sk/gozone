package com.gozone.ride.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public class CreateRideRequestDto {
    @NotNull private Double originLat;
    @NotNull private Double originLng;
    @NotNull private Double destLat;
    @NotNull private Double destLng;
    @Min(1)  private short seats = 1;
    @NotNull @DecimalMin("0.01") private BigDecimal proposedFare;

    public Double getOriginLat() { return originLat; }
    public void setOriginLat(Double originLat) { this.originLat = originLat; }
    public Double getOriginLng() { return originLng; }
    public void setOriginLng(Double originLng) { this.originLng = originLng; }
    public Double getDestLat() { return destLat; }
    public void setDestLat(Double destLat) { this.destLat = destLat; }
    public Double getDestLng() { return destLng; }
    public void setDestLng(Double destLng) { this.destLng = destLng; }
    public short getSeats() { return seats; }
    public void setSeats(short seats) { this.seats = seats; }
    public BigDecimal getProposedFare() { return proposedFare; }
    public void setProposedFare(BigDecimal proposedFare) { this.proposedFare = proposedFare; }
}
