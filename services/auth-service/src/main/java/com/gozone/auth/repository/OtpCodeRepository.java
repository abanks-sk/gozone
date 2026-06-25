package com.gozone.auth.repository;

import com.gozone.auth.model.OtpCode;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface OtpCodeRepository extends JpaRepository<OtpCode, UUID> {
    Optional<OtpCode> findTopByPhoneAndConsumedAtIsNullOrderByExpiresAtDesc(String phone);
}
