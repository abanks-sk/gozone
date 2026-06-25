package com.gozone.ride.model;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "trip_passengers")
public class TripPassenger {

    @EmbeddedId
    private TripPassengerId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("tripId")
    @JoinColumn(name = "trip_id")
    private Trip trip;

    @Column(name = "locked_fare", nullable = false, precision = 10, scale = 2)
    private BigDecimal lockedFare;

    @Column(name = "join_distance_km", precision = 8, scale = 3)
    private BigDecimal joinDistanceKm;

    @Column(name = "pickup_seq", nullable = false)
    private short pickupSeq = 1;

    @Column(name = "rule_version", nullable = false, length = 20)
    private String ruleVersion = "v1";

    public TripPassengerId getId() { return id; }
    public void setId(TripPassengerId id) { this.id = id; }
    public Trip getTrip() { return trip; }
    public void setTrip(Trip trip) { this.trip = trip; }
    public BigDecimal getLockedFare() { return lockedFare; }
    public void setLockedFare(BigDecimal lockedFare) { this.lockedFare = lockedFare; }
    public BigDecimal getJoinDistanceKm() { return joinDistanceKm; }
    public void setJoinDistanceKm(BigDecimal joinDistanceKm) { this.joinDistanceKm = joinDistanceKm; }
    public short getPickupSeq() { return pickupSeq; }
    public void setPickupSeq(short pickupSeq) { this.pickupSeq = pickupSeq; }
    public String getRuleVersion() { return ruleVersion; }
    public void setRuleVersion(String ruleVersion) { this.ruleVersion = ruleVersion; }

    @Embeddable
    public static class TripPassengerId implements java.io.Serializable {
        @Column(name = "trip_id")
        private UUID tripId;

        @Column(name = "rider_id")
        private UUID riderId;

        public TripPassengerId() {}
        public TripPassengerId(UUID tripId, UUID riderId) {
            this.tripId = tripId;
            this.riderId = riderId;
        }

        public UUID getTripId() { return tripId; }
        public UUID getRiderId() { return riderId; }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof TripPassengerId)) return false;
            TripPassengerId that = (TripPassengerId) o;
            return java.util.Objects.equals(tripId, that.tripId) &&
                   java.util.Objects.equals(riderId, that.riderId);
        }

        @Override
        public int hashCode() {
            return java.util.Objects.hash(tripId, riderId);
        }
    }
}
