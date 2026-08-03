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
    /** Square shop mark, uploaded through the app. Null falls back to bundled imagery. */
    String logoUrl,
    String address,
    /** Whether an admin has cleared this business to trade — PENDING until they have. */
    String approvalStatus,
    /** Why it was refused. Null unless rejected. */
    String approvalNote,
    /** The owner, so an admin listing businesses can tie one to the account that made it. */
    UUID ownerId
) {
    public static VendorResponse from(Vendor v) {
        return new VendorResponse(
            v.getId(), v.getName(), v.getLat(), v.getLng(),
            v.getStatus().name(), v.getPrepMinutes(), v.getVendorType().name(),
            v.getDescription(), v.getImageUrl(), v.getLogoUrl(), v.getAddress(),
            v.getApprovalStatus().name(), v.getApprovalNote(), v.getOwnerId());
    }
}
