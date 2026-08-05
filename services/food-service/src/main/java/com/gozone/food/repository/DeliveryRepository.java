package com.gozone.food.repository;

import com.gozone.food.model.Delivery;
import com.gozone.food.model.Order;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DeliveryRepository extends JpaRepository<Delivery, UUID> {
    Optional<Delivery> findByOrderId(UUID orderId);
    Optional<Delivery> findByCourierIdAndStatus(UUID courierId, Delivery.Status status);
    List<Delivery> findByCourierIdIsNullOrderByAssignedAtDesc();

    /**
     * Unclaimed deliveries whose order is still live.
     *
     * <p>The plain finder above returns deliveries for cancelled orders too, which is how a job
     * nobody could deliver kept reappearing in the courier feed. A courier should never be shown
     * work that no longer exists.
     */
    List<Delivery> findByCourierIdIsNullAndOrderStatusNotOrderByAssignedAtDesc(Order.Status status);
    List<Delivery> findByCourierIdOrderByAssignedAtDesc(UUID courierId);
}
