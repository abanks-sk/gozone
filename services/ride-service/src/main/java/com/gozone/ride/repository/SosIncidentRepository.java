package com.gozone.ride.repository;

import com.gozone.ride.model.SosIncident;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SosIncidentRepository extends JpaRepository<SosIncident, UUID> {
    List<SosIncident> findAllByOrderByCreatedAtDesc();
}
