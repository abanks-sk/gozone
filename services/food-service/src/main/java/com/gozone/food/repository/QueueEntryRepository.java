package com.gozone.food.repository;

import com.gozone.food.model.QueueEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QueueEntryRepository extends JpaRepository<QueueEntry, UUID> {

    List<QueueEntry> findByRestaurantIdAndStatusOrderByPosition(UUID restaurantId, QueueEntry.Status status);

    @Query("SELECT COALESCE(MAX(q.position), 0) FROM QueueEntry q WHERE q.restaurant.id = :restaurantId AND q.status = 'WAITING'")
    int maxPositionForRestaurant(@Param("restaurantId") UUID restaurantId);

    Optional<QueueEntry> findByOrderId(UUID orderId);
}
