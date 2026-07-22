package com.gozone.food.repository;

import com.gozone.food.model.Promo;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PromoRepository extends JpaRepository<Promo, UUID> {
    List<Promo> findByActiveTrueOrderByCreatedAtDesc();
    List<Promo> findAllByOrderByCreatedAtDesc();
}
