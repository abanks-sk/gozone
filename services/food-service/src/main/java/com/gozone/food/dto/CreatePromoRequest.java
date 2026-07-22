package com.gozone.food.dto;

import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Admin creates a promo, or a vendor applies for one — same shape. A vendor's
 * application is restricted to their own business and starts inactive.
 */
public class CreatePromoRequest {
    @NotBlank private String title;
    private String subtitle;
    private String description;     // terms shown on the order for vendor-fulfilled promos
    private String color;
    private String imageUrl;        // background image for the card

    private UUID vendorId;
    private String scope;           // VENDOR | CATEGORY | ITEM (default VENDOR)
    private String category;        // when scope = CATEGORY
    private UUID menuItemId;        // when scope = ITEM

    private String promoKind;       // DISCOUNT | BOGO | OTHER (default DISCOUNT)
    private String discountType;    // PERCENT | AMOUNT (required when DISCOUNT)
    private BigDecimal discountValue;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getSubtitle() { return subtitle; }
    public void setSubtitle(String subtitle) { this.subtitle = subtitle; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    public UUID getVendorId() { return vendorId; }
    public void setVendorId(UUID vendorId) { this.vendorId = vendorId; }
    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public UUID getMenuItemId() { return menuItemId; }
    public void setMenuItemId(UUID menuItemId) { this.menuItemId = menuItemId; }
    public String getPromoKind() { return promoKind; }
    public void setPromoKind(String promoKind) { this.promoKind = promoKind; }
    public String getDiscountType() { return discountType; }
    public void setDiscountType(String discountType) { this.discountType = discountType; }
    public BigDecimal getDiscountValue() { return discountValue; }
    public void setDiscountValue(BigDecimal discountValue) { this.discountValue = discountValue; }
}
