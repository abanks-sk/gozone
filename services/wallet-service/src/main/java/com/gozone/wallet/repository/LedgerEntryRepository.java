package com.gozone.wallet.repository;

import com.gozone.wallet.model.LedgerEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, UUID> {
    List<LedgerEntry> findByWalletIdOrderByCreatedAtDesc(UUID walletId);
    boolean existsByRefIdAndType(UUID refId, String type);
}
