package com.gozone.food.model;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "addon_options")
public class AddonOption {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "group_id", nullable = false)
    private AddonGroup group;

    @Column(nullable = false, length = 100)
    private String label;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price = BigDecimal.ZERO;

    @Column(nullable = false)
    private int position = 0;

    public UUID getId() { return id; }
    public AddonGroup getGroup() { return group; }
    public void setGroup(AddonGroup group) { this.group = group; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
    public int getPosition() { return position; }
    public void setPosition(int position) { this.position = position; }
}
