package com.gozone.ride.repository;

import com.gozone.ride.model.TripPassenger;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TripPassengerRepository extends JpaRepository<TripPassenger, TripPassenger.TripPassengerId> {
    List<TripPassenger> findByIdTripId(UUID tripId);
    long countByIdTripId(UUID tripId);

    /** In boarding order — the driver collects people in the order they joined. */
    List<TripPassenger> findByIdTripIdOrderByPickupSeqAsc(UUID tripId);

    /**
     * The ride a request got on. For the booking passenger that is their own trip; for someone who
     * joined an en-route ride it is the only link between their request and the car they are in.
     */
    Optional<TripPassenger> findByRequestId(UUID requestId);

    /**
     * Pickup disputes for the admin board, newest first.
     *
     * <p>{@code openOnly} true is the live queue — raised and not yet answered. False returns
     * settled ones too, which is how an admin checks what was decided rather than only what is
     * outstanding.
     */
    @Query("""
        SELECT p FROM TripPassenger p
        WHERE p.pickupDisputedAt IS NOT NULL
          AND (:openOnly = FALSE OR p.pickupDisputeResolvedAt IS NULL)
        ORDER BY p.pickupDisputedAt DESC
        """)
    List<TripPassenger> findDisputes(@Param("openOnly") boolean openOnly);
}
