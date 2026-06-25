package com.gozone.food.repository;

import com.gozone.food.model.Order;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface OrderRepository extends JpaRepository<Order, UUID> {
    List<Order> findByCustomerIdOrderByCreatedAtDesc(UUID customerId);
    List<Order> findByRestaurantIdAndStatusNotOrderByCreatedAtDesc(UUID restaurantId, Order.Status status);
}
