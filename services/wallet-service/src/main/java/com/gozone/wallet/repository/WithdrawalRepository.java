package com.gozone.wallet.repository;

import com.gozone.wallet.model.Withdrawal;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface WithdrawalRepository extends JpaRepository<Withdrawal, UUID> {

    List<Withdrawal> findByOwnerIdAndOwnerTypeOrderByCreatedAtDesc(UUID ownerId, String ownerType);

    /** Admin payout board — everything still owed, oldest first so the queue is FIFO. */
    List<Withdrawal> findByStatusInOrderByCreatedAtAsc(List<String> statuses);

    List<Withdrawal> findTop100ByOrderByCreatedAtDesc();

    /** One cash-out at a time per wallet keeps the payout queue (and the demo) simple. */
    boolean existsByOwnerIdAndOwnerTypeAndStatusIn(UUID ownerId, String ownerType, List<String> statuses);
}
