package com.gozone.ride.repository;

import com.gozone.ride.model.Trip;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TripRepository extends JpaRepository<Trip, UUID> {
    Optional<Trip> findByRequestId(UUID requestId);
    List<Trip> findByDriverIdAndStatus(UUID driverId, Trip.Status status);

    /**
     * Every job this driver has taken. Unordered on purpose — {@link Trip} has no created_at, and
     * ordering on a nullable completed_at in SQL means arguing with NULLS FIRST/LAST across the
     * two dialects this runs under. A driver's list is small enough to sort in the service.
     */
    List<Trip> findByDriverId(UUID driverId);

    /**
     * Shared rides currently on the road whose destination is near a given point — the cheap first
     * pass of pool matching, done in PostGIS so the expensive corridor geometry only ever runs
     * over a handful of candidates.
     *
     * <p>The point to pass is the JOINING rider's destination: a shared ride is only worth offering
     * if it is already heading roughly where they are going. CANCELLED and COMPLETED trips are
     * excluded by the status list; a car that has finished cannot pick anybody up.
     */
    @Query(value = """
        SELECT t.* FROM trips t
        JOIN ride_requests r ON r.id = t.request_id
        WHERE t.shared = TRUE
          AND t.status IN ('MATCHED', 'ENROUTE', 'STARTED')
          AND r.kind = 'RIDE'
          AND ST_DWithin(
              r.dest,
              CAST(ST_SetSRID(ST_MakePoint(:lng, :lat), 4326) AS geography),
              :radiusKm * 1000)
        ORDER BY ST_Distance(r.dest,
            CAST(ST_SetSRID(ST_MakePoint(:lng, :lat), 4326) AS geography))
        """,
        nativeQuery = true)
    List<Trip> findActiveSharedNearDest(
        @Param("lat") double lat,
        @Param("lng") double lng,
        @Param("radiusKm") double radiusKm);
}
