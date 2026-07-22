package com.gozone.food.dto;

import com.gozone.food.model.Promo;

import java.util.UUID;

public record PromoResponse(
    UUID id, String title, String subtitle, String color,
    UUID vendorId, String category, boolean active
) {
    public static PromoResponse from(Promo p) {
        return new PromoResponse(p.getId(), p.getTitle(), p.getSubtitle(), p.getColor(),
            p.getVendorId(), p.getCategory(), p.isActive());
    }
}
