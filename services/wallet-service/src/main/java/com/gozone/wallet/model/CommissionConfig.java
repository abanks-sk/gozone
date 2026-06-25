package com.gozone.wallet.model;

import jakarta.persistence.*;

import java.math.BigDecimal;

@Entity
@Table(name = "commission_config")
public class CommissionConfig {

    @Id
    @Column(length = 20)
    private String pillar; // RIDE | FOOD

    @Column(nullable = false, precision = 5, scale = 4)
    private BigDecimal rate; // 0.18 = 18%

    public String getPillar() { return pillar; }
    public void setPillar(String pillar) { this.pillar = pillar; }
    public BigDecimal getRate() { return rate; }
    public void setRate(BigDecimal rate) { this.rate = rate; }
}
