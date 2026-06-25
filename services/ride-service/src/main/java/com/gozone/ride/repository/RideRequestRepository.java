package com.gozone.ride.repository;

import com.gozone.ride.model.RideRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface RideRequestRepository extends JpaRepository<RideRequest, UUID> {

    /**
     * PostGIS radius query: open requests within radiusKm of a driver's position.
     * Uses GEOGRAPHY type so ST_DWithin computes in metres (radiusKm * 1000).
     */
    @Query(value = """
        SELECT r.* FROM ride_requests r
        WHERE r.status = 'OPEN'
        AND ST_DWithin(
            r.origin,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
            :radiusKm * 1000
        )
        ORDER BY ST_Distance(r.origin,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography)
        """,
        nativeQuery = true)
    List<RideRequest> findNearby(
        @Param("lat") double lat,
        @Param("lng") double lng,
        @Param("radiusKm") double radiusKm);

    List<RideRequest> findByRiderIdAndStatus(UUID riderId, RideRequest.Status status);
}
