package com.gozone.ride.dto;

import jakarta.validation.constraints.NotNull;

public class LocationUpdateDto {
    @NotNull private Double lat;
    @NotNull private Double lng;

    public Double getLat() { return lat; }
    public void setLat(Double lat) { this.lat = lat; }
    public Double getLng() { return lng; }
    public void setLng(Double lng) { this.lng = lng; }
}
