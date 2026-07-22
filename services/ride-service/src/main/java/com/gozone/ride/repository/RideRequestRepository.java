package com.gozone.ride.repository;

import com.gozone.ride.model.Bid;
import com.gozone.ride.model.RideRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface RideRequestRepository extends JpaRepository<RideRequest, UUID> {

    /**
     * PostGIS radius query: open requests within radiusKm of a driver's position.
     * Uses GEOGRAPHY type so ST_DWithin computes in metres (radiusKm * 1000).
     * Immediate ("ride now") requests older than ttlSeconds are excluded so drivers
     * never see a request the rider has already timed out of; scheduled requests are
     * governed by scheduled_at instead.
     */
    @Query(value = """
        SELECT r.* FROM ride_requests r
        WHERE r.status = 'OPEN'
        AND (r.scheduled_at IS NULL OR r.scheduled_at <= NOW())
        AND (r.scheduled_at IS NOT NULL OR r.created_at > NOW() - make_interval(secs => :ttlSeconds))
        AND ST_DWithin(
            r.origin,
            CAST(ST_SetSRID(ST_MakePoint(:lng, :lat), 4326) AS geography),
            :radiusKm * 1000
        )
        ORDER BY ST_Distance(r.origin,
            CAST(ST_SetSRID(ST_MakePoint(:lng, :lat), 4326) AS geography))
        """,
        nativeQuery = true)
    List<RideRequest> findNearby(
        @Param("lat") double lat,
        @Param("lng") double lng,
        @Param("radiusKm") double radiusKm,
        @Param("ttlSeconds") int ttlSeconds);

    /**
     * Bulk-expire immediate OPEN requests older than the cutoff (scheduled rides are
     * exempt). Requests with a live driver offer are also exempt — the rider is
     * still choosing and the request must not die under them.
     */
    @Modifying
    @Query("""
        UPDATE RideRequest r SET r.status = :expired
        WHERE r.status = :open AND r.scheduledAt IS NULL AND r.createdAt < :cutoff
        AND NOT EXISTS (SELECT b FROM Bid b WHERE b.request = r AND b.status = :pendingBid)
        """)
    int expireStale(@Param("open") RideRequest.Status open,
                    @Param("expired") RideRequest.Status expired,
                    @Param("cutoff") OffsetDateTime cutoff,
                    @Param("pendingBid") Bid.BidStatus pendingBid);

    List<RideRequest> findByRiderIdAndStatus(UUID riderId, RideRequest.Status status);
    List<RideRequest> findByRiderIdOrderByCreatedAtDesc(UUID riderId);
}
