package com.gozone.food.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public class CourierLocationUpdate {
    @NotNull private UUID deliveryId;
    @NotNull private Double lat;
    @NotNull private Double lng;

    public UUID getDeliveryId() { return deliveryId; }
    public void setDeliveryId(UUID deliveryId) { this.deliveryId = deliveryId; }
    public Double getLat() { return lat; }
    public void setLat(Double lat) { this.lat = lat; }
    public Double getLng() { return lng; }
    public void setLng(Double lng) { this.lng = lng; }
}
