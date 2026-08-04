package com.gozone.ride.model;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One person on a trip, and what they personally owe.
 *
 * <p>A shared trip carries several of these. Everything about paying for the ride hangs off this
 * row rather than off {@link Trip}, because two people in the same car agreed two different fares
 * at two different moments and each has to be able to pay — and be chased — on their own.
 */
@Entity
@Table(name = "trip_passengers")
public class TripPassenger {

    @EmbeddedId
    private TripPassengerId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("tripId")
    @JoinColumn(name = "trip_id")
    private Trip trip;

    /**
     * The request this person joined with. The booking passenger's request is also the trip's own
     * request; a joiner's is not, and this is the only way back from their request to the ride.
     */
    @Column(name = "request_id")
    private UUID requestId;

    /** What this passenger actually pays: {@link #soloFare} after the sharing discount. */
    @Column(name = "locked_fare", nullable = false, precision = 10, scale = 2)
    private BigDecimal lockedFare;

    /**
     * What they would have paid alone — the fare they agreed before anybody joined.
     *
     * <p>Every recomputation starts from this, never from the current locked fare, so discounts
     * cannot compound: applying 75% twice would put a third passenger on 56% of their own quote.
     */
    @Column(name = "solo_fare", nullable = false, precision = 10, scale = 2)
    private BigDecimal soloFare;

    @Column(name = "join_distance_km", precision = 8, scale = 3)
    private BigDecimal joinDistanceKm;

    @Column(name = "pickup_seq", nullable = false)
    private short pickupSeq = 1;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_status", nullable = false, length = 20)
    private Trip.PaymentStatus paymentStatus = Trip.PaymentStatus.UNPAID;

    @Column(name = "payment_method", length = 20)
    private String paymentMethod;

    @Column(name = "joined_at", nullable = false)
    private OffsetDateTime joinedAt = OffsetDateTime.now();

    /**
     * When the driver confirmed this person actually got in. Null until they do.
     *
     * <p>The only thing that separates a passenger waiting at the kerb from one already in the car,
     * and therefore the only thing standing between leaving and riding for free. A trip-level
     * status cannot answer it: a joiner boards minutes after the trip is already STARTED.
     */
    @Column(name = "picked_up_at")
    private OffsetDateTime pickedUpAt;

    /**
     * When this passenger objected to being marked aboard, and why. Null unless they have.
     *
     * <p>Deliberately does NOT clear {@link #pickedUpAt} — a dispute that un-boarded on demand
     * would be the free-ride hole again, entered from the passenger's side. It is a record and a
     * signal: the driver is told and may undo without the usual time limit, and an admin can see it
     * if the two disagree.
     */
    @Column(name = "pickup_disputed_at")
    private OffsetDateTime pickupDisputedAt;

    @Column(name = "pickup_dispute_note", columnDefinition = "text")
    private String pickupDisputeNote;

    @Column(name = "rule_version", nullable = false, length = 20)
    private String ruleVersion = "v1";

    public TripPassengerId getId() { return id; }
    public void setId(TripPassengerId id) { this.id = id; }
    public Trip getTrip() { return trip; }
    public void setTrip(Trip trip) { this.trip = trip; }
    public UUID getRequestId() { return requestId; }
    public void setRequestId(UUID requestId) { this.requestId = requestId; }
    public BigDecimal getLockedFare() { return lockedFare; }
    public void setLockedFare(BigDecimal lockedFare) { this.lockedFare = lockedFare; }
    public BigDecimal getSoloFare() { return soloFare; }
    public void setSoloFare(BigDecimal soloFare) { this.soloFare = soloFare; }
    public BigDecimal getJoinDistanceKm() { return joinDistanceKm; }
    public void setJoinDistanceKm(BigDecimal joinDistanceKm) { this.joinDistanceKm = joinDistanceKm; }
    public short getPickupSeq() { return pickupSeq; }
    public void setPickupSeq(short pickupSeq) { this.pickupSeq = pickupSeq; }
    public Trip.PaymentStatus getPaymentStatus() { return paymentStatus; }
    public void setPaymentStatus(Trip.PaymentStatus paymentStatus) { this.paymentStatus = paymentStatus; }
    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }
    public OffsetDateTime getJoinedAt() { return joinedAt; }
    public void setJoinedAt(OffsetDateTime joinedAt) { this.joinedAt = joinedAt; }
    public OffsetDateTime getPickedUpAt() { return pickedUpAt; }
    public void setPickedUpAt(OffsetDateTime pickedUpAt) { this.pickedUpAt = pickedUpAt; }
    public OffsetDateTime getPickupDisputedAt() { return pickupDisputedAt; }
    public void setPickupDisputedAt(OffsetDateTime pickupDisputedAt) { this.pickupDisputedAt = pickupDisputedAt; }
    public String getPickupDisputeNote() { return pickupDisputeNote; }
    public void setPickupDisputeNote(String pickupDisputeNote) { this.pickupDisputeNote = pickupDisputeNote; }
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
