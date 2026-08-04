package com.gozone.ride.repository;

import com.gozone.ride.model.PickupDispute;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PickupDisputeRepository extends JpaRepository<PickupDispute, UUID> {

    /** The live objection, if there is one. At most one exists — a partial unique index enforces it. */
    Optional<PickupDispute> findByTripIdAndRiderIdAndResolvedAtIsNull(UUID tripId, UUID riderId);

    /**
     * The admin board. {@code openOnly} true is the live queue; false includes settled ones, which
     * is how somebody checks what was decided rather than only what is outstanding.
     */
    @Query("""
        SELECT d FROM PickupDispute d
        WHERE (:openOnly = FALSE OR d.resolvedAt IS NULL)
        ORDER BY d.raisedAt DESC
        """)
    List<PickupDispute> findForBoard(@Param("openOnly") boolean openOnly);
}
