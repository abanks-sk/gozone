package com.gozone.food.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.UUID;

public class CreatePromoRequest {
    @NotBlank private String title;
    private String subtitle;
    private String color;
    private UUID vendorId;
    private String category;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getSubtitle() { return subtitle; }
    public void setSubtitle(String subtitle) { this.subtitle = subtitle; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public UUID getVendorId() { return vendorId; }
    public void setVendorId(UUID vendorId) { this.vendorId = vendorId; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
}
