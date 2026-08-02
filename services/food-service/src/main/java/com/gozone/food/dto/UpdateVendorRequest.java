package com.gozone.food.dto;

/**
 * Partial update of a vendor's own business.
 *
 * Every field is optional and **null means "leave alone"**, so the vendor app can send just the
 * one thing the owner edited rather than having to round-trip the whole record and risk
 * overwriting a field someone changed on another device.
 *
 * A *blank* string is different from null and is rejected for `name` — a business with no name is
 * not a legitimate edit — but accepted for `description`, `imageUrl` and `address`, where
 * clearing the field is a thing an owner may reasonably want to do.
 */
public class UpdateVendorRequest {
    private String name;
    private String vendorType;
    private Double lat;
    private Double lng;
    private String address;
    private String description;
    private String imageUrl;
    private Integer prepMinutes;
    /** OPEN / CLOSED / PAUSED. */
    private String status;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getVendorType() { return vendorType; }
    public void setVendorType(String vendorType) { this.vendorType = vendorType; }
    public Double getLat() { return lat; }
    public void setLat(Double lat) { this.lat = lat; }
    public Double getLng() { return lng; }
    public void setLng(Double lng) { this.lng = lng; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    public Integer getPrepMinutes() { return prepMinutes; }
    public void setPrepMinutes(Integer prepMinutes) { this.prepMinutes = prepMinutes; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
