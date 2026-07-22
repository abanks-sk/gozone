package com.gozone.food.repository;

import com.gozone.food.model.Vendor;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface VendorRepository extends JpaRepository<Vendor, UUID> {
    List<Vendor> findByStatus(Vendor.Status status);
    List<Vendor> findByOwnerId(UUID ownerId);
}
