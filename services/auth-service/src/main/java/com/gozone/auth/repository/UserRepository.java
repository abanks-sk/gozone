package com.gozone.auth.repository;

import com.gozone.auth.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    // Identity is scoped to an app: the same number can be a passenger here and a driver there, so
    // every lookup that used to key on a phone, email or username alone now needs the app with it.

    Optional<User> findByPhoneAndApp(String phone, User.App app);
    boolean existsByPhoneAndApp(String phone, User.App app);
    Optional<User> findByEmailAndApp(String email, User.App app);
    boolean existsByEmailAndApp(String email, User.App app);
    Optional<User> findByUsernameAndApp(String username, User.App app);
    boolean existsByUsernameAndApp(String username, User.App app);

    /**
     * Every account on a number, across apps.
     *
     * Used when a client signs in without naming its app: one match is unambiguous, several mean
     * the caller has to say which. Ordered so the choice is at least stable.
     */
    List<User> findByPhoneOrderByCreatedAtAsc(String phone);
    List<User> findByEmailOrderByCreatedAtAsc(String email);

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
