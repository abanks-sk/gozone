package com.gozone.food.repository;

import com.gozone.food.model.Restaurant;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RestaurantRepository extends JpaRepository<Restaurant, UUID> {
    List<Restaurant> findByStatus(Restaurant.Status status);
    List<Restaurant> findByOwnerId(UUID ownerId);
}
