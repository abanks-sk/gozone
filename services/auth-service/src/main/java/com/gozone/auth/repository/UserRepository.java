package com.gozone.auth.repository;

import com.gozone.auth.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByPhone(String phone);
    boolean existsByPhone(String phone);
    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);
    Optional<User> findByUsername(String username);
    boolean existsByUsername(String username);
    List<User> findByStatusOrderByCreatedAtDesc(User.Status status);

    /**
     * Drivers still waiting on an admin to set their vehicle class.
     *
     * <p>Deliberately not filtered by account status. A car driver is class-null from sign-up and
     * stays that way after approval, so filtering on PENDING — which is what the approvals list
     * does — loses them the moment they are approved. Their app says "Awaiting admin" while no
     * admin screen shows them anywhere, which is exactly how they went missing.
     */
    List<User> findByRoleInAndVehicleClassIsNullAndStatusNotOrderByCreatedAtDesc(
        Collection<User.Role> roles, User.Status status);

    /** Count delivery-capable riders (used by food-service to gate delivery orders). */
    long countByStatusAndVehicleClassAndRoleInAndServiceModeIn(
        User.Status status, User.VehicleClass vehicleClass,
        Collection<User.Role> roles, Collection<User.ServiceMode> modes);
}
