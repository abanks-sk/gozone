package com.gozone.food.dto;

import com.gozone.food.model.Restaurant;

import java.math.BigDecimal;
import java.util.UUID;

public record RestaurantResponse(
    UUID id,
    String name,
    BigDecimal lat,
    BigDecimal lng,
    String status,
    int prepMinutes
) {
    public static RestaurantResponse from(Restaurant r) {
        return new RestaurantResponse(
            r.getId(), r.getName(), r.getLat(), r.getLng(),
            r.getStatus().name(), r.getPrepMinutes());
    }
}
