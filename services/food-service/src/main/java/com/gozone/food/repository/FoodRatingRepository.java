package com.gozone.food.repository;

import com.gozone.food.model.FoodRating;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface FoodRatingRepository extends JpaRepository<FoodRating, UUID> {
    boolean existsByOrderId(UUID orderId);
    Optional<FoodRating> findByOrderId(UUID orderId);
}
