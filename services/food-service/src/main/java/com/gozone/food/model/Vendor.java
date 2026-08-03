package com.gozone.food.model;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "restaurants")  // table kept; the domain class is now Vendor
public class Vendor {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, precision = 9, scale = 6)
    private BigDecimal lat;

    @Column(nullable = false, precision = 9, scale = 6)
    private BigDecimal lng;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.OPEN;

    @Enumerated(EnumType.STRING)
    @Column(name = "vendor_type", nullable = false, length = 20)
    private VendorType vendorType = VendorType.RESTAURANT;

    @Column(name = "prep_minutes", nullable = false)
    private int prepMinutes = 20;

    /**
     * The storefront a customer reads before ordering. All optional — when empty the customer app
     * falls back to its bundled `shopCatalog` metadata, which is how the seeded vendors have
     * always looked, so leaving these unset changes nothing.
     */
    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "image_url", columnDefinition = "text")
    private String imageUrl;

    /** Human-readable location line. Coordinates route the courier; this tells the customer. */
    @Column(columnDefinition = "text")
    private String address;

    /**
     * Whether an admin has cleared this business to trade.
     *
     * Distinct from {@link #status}, which is the shop's own open/closed switch. Approving the
     * owner's account is a check on a person; this is a check on a business, and a vendor with a
     * second shop needs the second one looked at too.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "approval_status", nullable = false, length = 20)
    private Approval approvalStatus = Approval.PENDING;

    /** Why it was refused — shown to the owner, so it has to say what to change. */
    @Column(name = "approval_note", length = 500)
    private String approvalNote;

    @Column(name = "approved_by")
    private UUID approvedBy;

    @Column(name = "approved_at")
    private OffsetDateTime approvedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    public enum Status { OPEN, CLOSED, PAUSED }
    public enum Approval { PENDING, APPROVED, REJECTED }

    /** A vendor sells one category of goods; orders/queue/delivery work the same for all. */
    public enum VendorType { RESTAURANT, PHARMACY, GROCERY, CONVENIENCE, OTHER }

    public UUID getId() { return id; }
    public UUID getOwnerId() { return ownerId; }
    public void setOwnerId(UUID ownerId) { this.ownerId = ownerId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public BigDecimal getLat() { return lat; }
    public void setLat(BigDecimal lat) { this.lat = lat; }
    public BigDecimal getLng() { return lng; }
    public void setLng(BigDecimal lng) { this.lng = lng; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public VendorType getVendorType() { return vendorType; }
    public void setVendorType(VendorType vendorType) { this.vendorType = vendorType; }
    public int getPrepMinutes() { return prepMinutes; }
    public void setPrepMinutes(int prepMinutes) { this.prepMinutes = prepMinutes; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public OffsetDateTime getCreatedAt() { return createdAt; }

    public Approval getApprovalStatus() { return approvalStatus; }
    public void setApprovalStatus(Approval approvalStatus) { this.approvalStatus = approvalStatus; }
    public String getApprovalNote() { return approvalNote; }
    public void setApprovalNote(String approvalNote) { this.approvalNote = approvalNote; }
    public UUID getApprovedBy() { return approvedBy; }
    public void setApprovedBy(UUID approvedBy) { this.approvedBy = approvedBy; }
    public OffsetDateTime getApprovedAt() { return approvedAt; }
    public void setApprovedAt(OffsetDateTime approvedAt) { this.approvedAt = approvedAt; }
}
