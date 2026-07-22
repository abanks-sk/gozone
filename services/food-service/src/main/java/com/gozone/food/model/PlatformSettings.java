package com.gozone.food.model;

import jakarta.persistence.*;
import java.math.BigDecimal;

/** Single-row platform fee config (id is always 1), edited by admins. */
@Entity
@Table(name = "platform_settings")
public class PlatformSettings {

    @Id
    private Short id = 1;

    @Column(name = "service_fee_pct", nullable = false, precision = 6, scale = 4)
    private BigDecimal serviceFeePct;

    @Column(name = "delivery_base_fee", nullable = false, precision = 10, scale = 2)
    private BigDecimal deliveryBaseFee;

    @Column(name = "delivery_per_km", nullable = false, precision = 10, scale = 2)
    private BigDecimal deliveryPerKm;

    public Short getId() { return id; }
    public void setId(Short id) { this.id = id; }
    public BigDecimal getServiceFeePct() { return serviceFeePct; }
    public void setServiceFeePct(BigDecimal serviceFeePct) { this.serviceFeePct = serviceFeePct; }
    public BigDecimal getDeliveryBaseFee() { return deliveryBaseFee; }
    public void setDeliveryBaseFee(BigDecimal deliveryBaseFee) { this.deliveryBaseFee = deliveryBaseFee; }
    public BigDecimal getDeliveryPerKm() { return deliveryPerKm; }
    public void setDeliveryPerKm(BigDecimal deliveryPerKm) { this.deliveryPerKm = deliveryPerKm; }
}
