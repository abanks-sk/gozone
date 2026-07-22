package com.gozone.food.dto;

import com.gozone.food.model.Promo;

import java.math.BigDecimal;
import java.util.UUID;

public record PromoResponse(
    UUID id,
    String title,
    String subtitle,
    String description,
    String color,
    String imageUrl,
    UUID vendorId,
    String category,
    UUID menuItemId,
    String promoKind,      // DISCOUNT | BOGO | OTHER
    String discountType,   // PERCENT | AMOUNT (null unless DISCOUNT)
    BigDecimal discountValue,
    String scope,          // VENDOR | CATEGORY | ITEM
    boolean active
) {
    public static PromoResponse from(Promo p) {
        return new PromoResponse(
            p.getId(), p.getTitle(), p.getSubtitle(), p.getDescription(),
            p.getColor(), p.getImageUrl(), p.getVendorId(), p.getCategory(), p.getMenuItemId(),
            p.getPromoKind().name(),
            p.getDiscountType() != null ? p.getDiscountType().name() : null,
            p.getDiscountValue(),
            p.getScope().name(),
            p.isActive());
    }
}
