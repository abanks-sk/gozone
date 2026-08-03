package com.gozone.auth.repository;

import com.gozone.auth.model.OtpCode;
import com.gozone.auth.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface OtpCodeRepository extends JpaRepository<OtpCode, UUID> {
    Optional<OtpCode> findTopByPhoneAndAppAndConsumedAtIsNullOrderByExpiresAtDesc(String phone, User.App app);
    Optional<OtpCode> findTopByEmailAndAppAndConsumedAtIsNullOrderByExpiresAtDesc(String email, User.App app);

    /**
     * The newest pending code for a number, whatever app it was issued for.
     *
     * The code itself records which account it belongs to, so a client that verifies without naming
     * an app can still be resolved — it can only hold a code that was actually sent to it.
     */
    Optional<OtpCode> findTopByPhoneAndConsumedAtIsNullOrderByExpiresAtDesc(String phone);
    Optional<OtpCode> findTopByEmailAndConsumedAtIsNullOrderByExpiresAtDesc(String email);
}
