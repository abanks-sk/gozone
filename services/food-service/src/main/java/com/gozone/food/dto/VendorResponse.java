package com.gozone.food.dto;

import com.gozone.food.model.Vendor;

import java.math.BigDecimal;
import java.util.UUID;

public record VendorResponse(
    UUID id,
    String name,
    BigDecimal lat,
    BigDecimal lng,
    String status,
    int prepMinutes,
    String vendorType,
    /** Storefront: what the customer reads before ordering. Null until the vendor fills it in. */
    String description,
    String imageUrl,
    String address
) {
    public static VendorResponse from(Vendor v) {
        return new VendorResponse(
            v.getId(), v.getName(), v.getLat(), v.getLng(),
            v.getStatus().name(), v.getPrepMinutes(), v.getVendorType().name(),
            v.getDescription(), v.getImageUrl(), v.getAddress());
    }
}
