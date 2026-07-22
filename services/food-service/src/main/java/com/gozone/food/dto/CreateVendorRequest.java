package com.gozone.food.dto;

import jakarta.validation.constraints.NotBlank;

/** A vendor owner submits their business details during onboarding. */
public class CreateVendorRequest {
    @NotBlank private String name;
    @NotBlank private String vendorType; // RESTAURANT | PHARMACY | GROCERY | CONVENIENCE | OTHER
    private double lat;
    private double lng;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getVendorType() { return vendorType; }
    public void setVendorType(String vendorType) { this.vendorType = vendorType; }
    public double getLat() { return lat; }
    public void setLat(double lat) { this.lat = lat; }
    public double getLng() { return lng; }
    public void setLng(double lng) { this.lng = lng; }
}
