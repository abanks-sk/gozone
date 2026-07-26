package com.gozone.wallet.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/** A cash-out request from the driver or vendor app. */
public class WithdrawalRequest {

    @NotNull @DecimalMin("0.01") private BigDecimal amount;

    /** MOMO | BANK */
    @NotBlank private String method;

    @NotBlank @Size(max = 120) private String accountName;

    @NotBlank @Size(max = 40) private String accountNumber;

    /** Mobile-money network (MTN / VODAFONE / AIRTELTIGO) or the bank name. */
    @NotBlank @Size(max = 40) private String provider;

    /** Which wallet to draw from: DRIVER or RESTAURANT. */
    private String ownerType;

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }
    public String getAccountName() { return accountName; }
    public void setAccountName(String accountName) { this.accountName = accountName; }
    public String getAccountNumber() { return accountNumber; }
    public void setAccountNumber(String accountNumber) { this.accountNumber = accountNumber; }
    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
    public String getOwnerType() { return ownerType; }
    public void setOwnerType(String ownerType) { this.ownerType = ownerType; }
}
