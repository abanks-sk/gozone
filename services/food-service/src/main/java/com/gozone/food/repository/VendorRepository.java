package com.gozone.food.repository;

import com.gozone.food.model.Vendor;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface VendorRepository extends JpaRepository<Vendor, UUID> {
    /**
     * Ordered by name, deliberately.
     *
     * Without an ORDER BY, Postgres returns whatever the heap scan finds, and rewriting a row
     * moves it — so a vendor editing their storefront silently reshuffled the customer's shop
     * list. A stable order is also what makes "the first shop in the list" mean anything to a
     * caller (the e2e suite picks one that way, and started testing a different vendor at a
     * different distance the moment a row was updated).
     */
    List<Vendor> findByStatusOrderByNameAsc(Vendor.Status status);
    List<Vendor> findByOwnerIdOrderByNameAsc(UUID ownerId);

    /**
     * What a customer is allowed to see: trading AND cleared by an admin.
     *
     * Both halves matter. A business the owner has closed is not open for orders; one that has not
     * been approved has never been looked at by anybody, and listing it would let a shop go live
     * simply by existing.
     */
    List<Vendor> findByStatusAndApprovalStatusOrderByNameAsc(Vendor.Status status, Vendor.Approval approvalStatus);

    /** The admin review queue. */
    List<Vendor> findByApprovalStatusOrderByCreatedAtDesc(Vendor.Approval approvalStatus);
    List<Vendor> findAllByOrderByCreatedAtDesc();
}
