package com.gozone.ride.repository;

import com.gozone.ride.model.Trip;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TripRepository extends JpaRepository<Trip, UUID> {
    Optional<Trip> findByRequestId(UUID requestId);
    List<Trip> findByDriverIdAndStatus(UUID driverId, Trip.Status status);
}
