package com.gozone.ride.repository;

import com.gozone.ride.model.RideRating;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.OptionalDouble;
import java.util.UUID;

public interface RideRatingRepository extends JpaRepository<RideRating, UUID> {
    /**
     * One rating per rater PER PERSON, not per trip.
     *
     * <p>A shared ride carries several passengers and the driver has an opinion about each of them.
     * Keying only on the trip let them rate one and locked out the rest — which is also what the
     * table has always allowed, `UNIQUE (trip_id, rater_id, ratee_id)`; the narrower check was the
     * only thing in the way.
     */
    boolean existsByTripIdAndRaterIdAndRateeId(UUID tripId, UUID raterId, UUID rateeId);

    /** Who this person has already rated on a trip, so the app can hide those. */
    List<RideRating> findByTripIdAndRaterId(UUID tripId, UUID raterId);
    List<RideRating> findByRateeId(UUID rateeId);

    @Query("SELECT AVG(r.score) FROM RideRating r WHERE r.rateeId = :rateeId")
    Double avgScoreForRatee(@Param("rateeId") UUID rateeId);

    /** How many people have rated them — the average means nothing without it. */
    long countByRateeId(UUID rateeId);
}
