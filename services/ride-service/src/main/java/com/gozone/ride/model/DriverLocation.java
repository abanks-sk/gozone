package com.gozone.ride.model;

import jakarta.persistence.*;
import org.locationtech.jts.geom.Point;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "driver_locations")
public class DriverLocation {

    @Id
    @Column(name = "driver_id")
    private UUID driverId;

    @Column(columnDefinition = "geography(POINT,4326)", nullable = false)
    private Point point;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    public UUID getDriverId() { return driverId; }
    public void setDriverId(UUID driverId) { this.driverId = driverId; }
    public Point getPoint() { return point; }
    public void setPoint(Point point) { this.point = point; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
