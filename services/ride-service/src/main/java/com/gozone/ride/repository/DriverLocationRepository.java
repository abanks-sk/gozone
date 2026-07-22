package com.gozone.ride.repository;

import com.gozone.ride.model.DriverLocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface DriverLocationRepository extends JpaRepository<DriverLocation, UUID> {

    /** Upsert driver location — PostgreSQL ON CONFLICT syntax. */
    @Modifying
    @Query(value = """
        INSERT INTO driver_locations (driver_id, point, updated_at)
        VALUES (:driverId,
                CAST(ST_SetSRID(ST_MakePoint(:lng, :lat), 4326) AS geography),
                NOW())
        ON CONFLICT (driver_id)
        DO UPDATE SET
            point      = EXCLUDED.point,
            updated_at = EXCLUDED.updated_at
        """,
        nativeQuery = true)
    void upsertLocation(
        @Param("driverId") UUID driverId,
        @Param("lat") double lat,
        @Param("lng") double lng);
}
