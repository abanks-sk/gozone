package com.gozone.wallet.repository;

import com.gozone.wallet.model.Wallet;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface WalletRepository extends JpaRepository<Wallet, UUID> {
    Optional<Wallet> findByOwnerIdAndOwnerType(UUID ownerId, String ownerType);
}
