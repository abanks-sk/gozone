package com.gozone.auth.repository;

import com.gozone.auth.model.DriverKyc;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface DriverKycRepository extends JpaRepository<DriverKyc, UUID> {
    Optional<DriverKyc> findTopByUserIdOrderByCreatedAtDesc(UUID userId);
}
