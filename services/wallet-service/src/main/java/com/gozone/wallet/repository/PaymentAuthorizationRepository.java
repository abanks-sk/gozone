package com.gozone.wallet.repository;

import com.gozone.wallet.model.PaymentAuthorization;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PaymentAuthorizationRepository extends JpaRepository<PaymentAuthorization, UUID> {
    List<PaymentAuthorization> findByUserIdOrderByCreatedAtDesc(UUID userId);
    Optional<PaymentAuthorization> findByUserIdAndSignature(UUID userId, String signature);
    Optional<PaymentAuthorization> findByIdAndUserId(UUID id, UUID userId);
}
