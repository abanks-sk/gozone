package com.gozone.food.repository;

import com.gozone.food.model.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface OrderRepository extends JpaRepository<Order, UUID> {
    List<Order> findByCustomerIdOrderByCreatedAtDesc(UUID customerId);
    List<Order> findByRestaurantIdAndStatusNotOrderByCreatedAtDesc(UUID restaurantId, Order.Status status);
    List<Order> findByRestaurantIdAndPaymentStatusOrderByCreatedAtDesc(UUID restaurantId, Order.PaymentStatus paymentStatus);

    /** True if the user is the order's customer or the vendor owner (single query — no lazy load). */
    @Query("select (count(o) > 0) from Order o where o.id = :orderId "
         + "and (o.customerId = :userId or o.restaurant.ownerId = :userId)")
    boolean isCustomerOrOwner(@Param("orderId") UUID orderId, @Param("userId") UUID userId);
}
