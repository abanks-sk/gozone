package com.gozone.ride.repository;

import com.gozone.ride.model.Bid;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BidRepository extends JpaRepository<Bid, UUID> {
    List<Bid> findByRequestId(UUID requestId);
    Optional<Bid> findTopByRequestIdAndDriverIdOrderByCreatedAtDesc(UUID requestId, UUID driverId);
    List<Bid> findByRequestIdAndStatus(UUID requestId, Bid.BidStatus status);
}
