package com.gozone.food.model;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A promotion. Two families:
 *
 * <ul>
 *   <li>{@code DISCOUNT} — the platform reduces the order total at checkout, by
 *       {@code discountType}/{@code discountValue}, over whatever {@code scope}
 *       selects.</li>
 *   <li>{@code BOGO} / {@code OTHER} — the vendor fulfils it. The platform only
 *       records and shows the terms so customer and vendor see the same thing on
 *       the order; no money logic runs.</li>
 * </ul>
 *
 * {@code active} doubles as the approval flag: a vendor's application is created
 * inactive and an admin activating it is the approval.
 */
@Entity
@Table(name = "promos")
public class Promo {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 80)
    private String title;

    @Column(length = 120)
    private String subtitle;

    /** Longer terms, shown on the order for vendor-fulfilled promos. */
    @Column(columnDefinition = "text")
    private String description;

    @Column(nullable = false, length = 16)
    private String color = "#2563EB";

    /** Optional background image for the card; falls back to {@link #color}. */
    @Column(name = "image_url", columnDefinition = "text")
    private String imageUrl;

    @Column(name = "vendor_id")
    private UUID vendorId;

    /** With scope CATEGORY: the menu category. Legacy generic promos use it as a cuisine filter. */
    @Column(length = 40)
    private String category;

    @Column(name = "menu_item_id")
    private UUID menuItemId;

    @Enumerated(EnumType.STRING)
    @Column(name = "promo_kind", nullable = false, length = 20)
    private Kind promoKind = Kind.DISCOUNT;

    @Enumerated(EnumType.STRING)
    @Column(name = "discount_type", length = 10)
    private DiscountType discountType;

    @Column(name = "discount_value", precision = 10, scale = 2)
    private BigDecimal discountValue;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Scope scope = Scope.VENDOR;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    /** DISCOUNT is settled by the platform; the rest are fulfilled by the vendor. */
    public enum Kind { DISCOUNT, BOGO, OTHER }
    public enum DiscountType { PERCENT, AMOUNT }
    public enum Scope { VENDOR, CATEGORY, ITEM }

    /** True when the platform has to compute money for this promo. */
    public boolean isPlatformDiscount() {
        return promoKind == Kind.DISCOUNT && discountType != null
            && discountValue != null && discountValue.signum() > 0;
    }

    public UUID getId() { return id; }
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
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public UUID getMenuItemId() { return menuItemId; }
    public void setMenuItemId(UUID menuItemId) { this.menuItemId = menuItemId; }
    public Kind getPromoKind() { return promoKind; }
    public void setPromoKind(Kind promoKind) { this.promoKind = promoKind; }
    public DiscountType getDiscountType() { return discountType; }
    public void setDiscountType(DiscountType discountType) { this.discountType = discountType; }
    public BigDecimal getDiscountValue() { return discountValue; }
    public void setDiscountValue(BigDecimal discountValue) { this.discountValue = discountValue; }
    public Scope getScope() { return scope; }
    public void setScope(Scope scope) { this.scope = scope; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
