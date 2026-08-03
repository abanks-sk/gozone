package com.gozone.auth.model;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /**
     * Which app this account belongs to.
     *
     * Identity is scoped to it: phone, email and username are unique within an app, not across the
     * platform. One person can therefore hold a passenger account and a driver account on the same
     * number, and they are genuinely separate accounts — separate names, separate approval.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private App app;

    /** Phone identity — null for email-only accounts. Unique per {@link #app}. */
    @Column(length = 20)
    private String phone;

    /** Email identity — null for phone-only accounts. Unique per {@link #app}. */
    @Column(length = 255)
    private String email;

    @Column(length = 100)
    private String name;

    /** Admin login handle — null for OTP (phone) users. Unique per {@link #app}. */
    @Column(length = 50)
    private String username;

    /** BCrypt hash — admins only; null for OTP users. */
    @Column(name = "password_hash", length = 255)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.ACTIVE;

    /** Driver vehicle class — null for a car awaiting an admin tier (Standard/Luxe). */
    @Enumerated(EnumType.STRING)
    @Column(name = "vehicle_class", length = 20)
    private VehicleClass vehicleClass;

    @Enumerated(EnumType.STRING)
    @Column(name = "service_mode", nullable = false, length = 20)
    private ServiceMode serviceMode = ServiceMode.BOTH;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    public enum Role { RIDER, DRIVER, RESTAURANT_OWNER, COURIER, ADMIN, SUPER_ADMIN }
    public enum Status { ACTIVE, SUSPENDED, PENDING, REJECTED }
    public enum VehicleClass { OKADA, STANDARD, LUXE, CARGO }
    public enum ServiceMode { RIDES, DELIVERIES, BOTH }

    /** The four front-ends. COURIER lives in DRIVER — same app, same person, parcel instead of passenger. */
    public enum App {
        PASSENGER(Role.RIDER),
        DRIVER(Role.DRIVER, Role.COURIER),
        VENDOR(Role.RESTAURANT_OWNER),
        // Deliberately empty: an admin is never self-registered. Only a SUPER_ADMIN can create one,
        // through POST /auth/admins.
        ADMIN;

        private final java.util.Set<Role> selfSignupRoles;

        App(Role... roles) {
            this.selfSignupRoles = java.util.Set.of(roles);
        }

        /** Roles this app is allowed to create through the public sign-up endpoints. */
        public boolean allowsSelfSignup(Role role) {
            return selfSignupRoles.contains(role);
        }

        /** The app a role belongs to — used to place accounts created before apps were separated. */
        public static App of(Role role) {
            return switch (role) {
                case RIDER -> PASSENGER;
                case DRIVER, COURIER -> DRIVER;
                case RESTAURANT_OWNER -> VENDOR;
                case ADMIN, SUPER_ADMIN -> ADMIN;
            };
        }
    }

    public UUID getId() { return id; }
    public App getApp() { return app; }
    public void setApp(App app) { this.app = app; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public Role getRole() { return role; }
    public void setRole(Role role) { this.role = role; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public VehicleClass getVehicleClass() { return vehicleClass; }
    public void setVehicleClass(VehicleClass vehicleClass) { this.vehicleClass = vehicleClass; }
    public ServiceMode getServiceMode() { return serviceMode; }
    public void setServiceMode(ServiceMode serviceMode) { this.serviceMode = serviceMode; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
