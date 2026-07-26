package com.gozone.wallet.dto;

import com.gozone.wallet.model.Withdrawal;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * A cash-out as the apps and the admin console see it. The account number is masked to
 * its last 4 digits — enough to recognise the destination, not enough to leak it.
 */
public record WithdrawalResponse(
    UUID id,
    UUID ownerId,
    String ownerType,
    BigDecimal amount,
    String method,
    String accountName,
    String accountNumberMasked,
    String provider,
    String status,
    /** Why it's still queued, or why it failed — the same field serves both. */
    String note,
    String createdAt,
    String completedAt
) {
    public static WithdrawalResponse from(Withdrawal w) {
        return new WithdrawalResponse(
            w.getId(), w.getOwnerId(), w.getOwnerType(), w.getAmount(), w.getMethod(),
            w.getAccountName(), mask(w.getAccountNumber()), w.getProvider(),
            w.getStatus(), w.getFailureReason(),
            w.getCreatedAt() != null ? w.getCreatedAt().toString() : null,
            w.getCompletedAt() != null ? w.getCompletedAt().toString() : null);
    }

    private static String mask(String number) {
        if (number == null || number.length() <= 4) return number;
        return "•••• " + number.substring(number.length() - 4);
    }
}
