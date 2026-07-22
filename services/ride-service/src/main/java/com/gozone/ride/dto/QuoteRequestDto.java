package com.gozone.ride.dto;

import jakarta.validation.constraints.NotNull;

/** A fare-quote request: pickup + drop-off coords and an optional ride type. */
public class QuoteRequestDto {
    @NotNull private Double originLat;
    @NotNull private Double originLng;
    @NotNull private Double destLat;
    @NotNull private Double destLng;
    private String rideType; // STANDARD | PREMIUM | OKADA (default STANDARD)

    public Double getOriginLat() { return originLat; }
    public void setOriginLat(Double originLat) { this.originLat = originLat; }
    public Double getOriginLng() { return originLng; }
    public void setOriginLng(Double originLng) { this.originLng = originLng; }
    public Double getDestLat() { return destLat; }
    public void setDestLat(Double destLat) { this.destLat = destLat; }
    public Double getDestLng() { return destLng; }
    public void setDestLng(Double destLng) { this.destLng = destLng; }
    public String getRideType() { return rideType; }
    public void setRideType(String rideType) { this.rideType = rideType; }
}
