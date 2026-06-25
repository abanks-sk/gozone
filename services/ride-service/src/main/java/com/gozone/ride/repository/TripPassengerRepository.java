package com.gozone.ride.repository;

import com.gozone.ride.model.TripPassenger;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface TripPassengerRepository extends JpaRepository<TripPassenger, TripPassenger.TripPassengerId> {
    List<TripPassenger> findByIdTripId(UUID tripId);
    long countByIdTripId(UUID tripId);
}
