package com.gozone.food.repository;

import com.gozone.food.model.Delivery;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface DeliveryRepository extends JpaRepository<Delivery, UUID> {
    Optional<Delivery> findByOrderId(UUID orderId);
    Optional<Delivery> findByCourierIdAndStatus(UUID courierId, Delivery.Status status);
}
