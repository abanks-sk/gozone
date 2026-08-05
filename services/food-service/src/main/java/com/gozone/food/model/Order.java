package com.gozone.food.model;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "orders")
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    /**
     * Who ordered, in words — stamped at checkout, not joined at read time.
     *
     * <p>A vendor packing a bag and a courier at the door both need a name to call out, and names
     * live in auth_db which this service must not read. Nullable because the lookup fails soft: an
     * order is worth more than a label.
     */
    @Column(name = "customer_name", length = 120)
    private String customerName;

    @Column(name = "customer_phone", length = 20)
    private String customerPhone;

    /**
     * Why this order was cancelled, in words the customer reads.
     *
     * <p>A cancellation with no reason is indistinguishable from the app losing the order. Set by
     * the timeout sweeps ("the vendor was busy", "no courier was available"); null for orders the
     * customer or vendor cancelled by hand, which they already have context for.
     */
    @Column(name = "cancel_reason", length = 200)
    private String cancelReason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "restaurant_id", nullable = false)
    private Vendor restaurant;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Mode mode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Status status = Status.PLACED;

    @Column(name = "delivery_addr")
    private String deliveryAddr;

    /**
     * Where the delivery is going. Sent at checkout and previously used only to price the
     * delivery fee before being discarded, which left the customer's live-tracking map with no
     * destination to draw and the courier with a street name instead of a pin.
     * Null for pickup/walk-in, and for orders placed before this was stored.
     */
    @Column(name = "delivery_lat", precision = 10, scale = 7)
    private BigDecimal deliveryLat;

    @Column(name = "delivery_lng", precision = 10, scale = 7)
    private BigDecimal deliveryLng;

    @Column(name = "delivery_fee", nullable = false, precision = 10, scale = 2)
    private BigDecimal deliveryFee = BigDecimal.ZERO;

    @Column(name = "service_fee", nullable = false, precision = 10, scale = 2)
    private BigDecimal serviceFee = BigDecimal.ZERO;

    /** Money taken off by an applied DISCOUNT promo (0 when none applied). */
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal discount = BigDecimal.ZERO;

    /** Snapshot of the applied discount promo, so history survives promo edits. */
    @Column(name = "promo_id")
    private UUID promoId;

    @Column(name = "promo_label", columnDefinition = "text")
    private String promoLabel;

    /** Vendor-fulfilled promos in effect on this order, for both sides to see. */
    @Column(name = "promo_notes", columnDefinition = "text")
    private String promoNotes;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal total;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    /**
     * When the kitchen started cooking. Null until the vendor moves the order to PREPARING —
     * created_at would be wrong, as an order can sit at PLACED for as long as the vendor takes
     * to confirm it. This is what lets the collection estimate count down instead of standing still.
     */
    @Column(name = "preparing_at")
    private OffsetDateTime preparingAt;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<OrderItem> items = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_status", nullable = false, length = 20)
    private PaymentStatus paymentStatus = PaymentStatus.UNPAID;

    @Column(name = "payment_method", length = 20)
    private String paymentMethod;

    public enum Mode { DELIVERY, PICKUP, WALKIN }
    public enum PaymentStatus { UNPAID, AWAITING, PAID }

    public enum Status {
        PLACED, CONFIRMED, PREPARING, READY, OUT_FOR_DELIVERY, COMPLETED, CANCELLED
    }

    public UUID getId() { return id; }
    public UUID getCustomerId() { return customerId; }
    public void setCustomerId(UUID customerId) { this.customerId = customerId; }
    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }
    public String getCustomerPhone() { return customerPhone; }
    public void setCustomerPhone(String customerPhone) { this.customerPhone = customerPhone; }
    public String getCancelReason() { return cancelReason; }
    public void setCancelReason(String cancelReason) { this.cancelReason = cancelReason; }
    public Vendor getRestaurant() { return restaurant; }
    public void setRestaurant(Vendor restaurant) { this.restaurant = restaurant; }
    public Mode getMode() { return mode; }
    public void setMode(Mode mode) { this.mode = mode; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public String getDeliveryAddr() { return deliveryAddr; }
    public void setDeliveryAddr(String deliveryAddr) { this.deliveryAddr = deliveryAddr; }
    public BigDecimal getDeliveryLat() { return deliveryLat; }
    public void setDeliveryLat(BigDecimal deliveryLat) { this.deliveryLat = deliveryLat; }
    public BigDecimal getDeliveryLng() { return deliveryLng; }
    public void setDeliveryLng(BigDecimal deliveryLng) { this.deliveryLng = deliveryLng; }
    public BigDecimal getDeliveryFee() { return deliveryFee; }
    public void setDeliveryFee(BigDecimal deliveryFee) { this.deliveryFee = deliveryFee; }
    public BigDecimal getServiceFee() { return serviceFee; }
    public void setServiceFee(BigDecimal serviceFee) { this.serviceFee = serviceFee; }
    public BigDecimal getDiscount() { return discount; }
    public void setDiscount(BigDecimal discount) { this.discount = discount; }
    public UUID getPromoId() { return promoId; }
    public void setPromoId(UUID promoId) { this.promoId = promoId; }
    public String getPromoLabel() { return promoLabel; }
    public void setPromoLabel(String promoLabel) { this.promoLabel = promoLabel; }
    public String getPromoNotes() { return promoNotes; }
    public void setPromoNotes(String promoNotes) { this.promoNotes = promoNotes; }
    public BigDecimal getTotal() { return total; }
    public void setTotal(BigDecimal total) { this.total = total; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getPreparingAt() { return preparingAt; }
    public void setPreparingAt(OffsetDateTime preparingAt) { this.preparingAt = preparingAt; }
    public List<OrderItem> getItems() { return items; }
    public PaymentStatus getPaymentStatus() { return paymentStatus; }
    public void setPaymentStatus(PaymentStatus paymentStatus) { this.paymentStatus = paymentStatus; }
    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }
}
