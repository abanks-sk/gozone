package com.gozone.auth.repository;

import com.gozone.auth.model.DriverKyc;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DriverKycRepository extends JpaRepository<DriverKyc, UUID> {
    Optional<DriverKyc> findTopByUserIdOrderByCreatedAtDesc(UUID userId);
    List<DriverKyc> findByStatusOrderByCreatedAtDesc(DriverKyc.KycStatus status);
    List<DriverKyc> findAllByOrderByCreatedAtDesc();
}
