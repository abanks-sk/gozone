package com.gozone.ride.repository;

import com.gozone.ride.model.RideRating;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.OptionalDouble;
import java.util.UUID;

public interface RideRatingRepository extends JpaRepository<RideRating, UUID> {
    boolean existsByTripIdAndRaterId(UUID tripId, UUID raterId);
    List<RideRating> findByRateeId(UUID rateeId);

    @Query("SELECT AVG(r.score) FROM RideRating r WHERE r.rateeId = :rateeId")
    Double avgScoreForRatee(@Param("rateeId") UUID rateeId);
}
