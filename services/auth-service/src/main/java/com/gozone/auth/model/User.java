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

    /**
     * The vehicle this driver drives. Null for passengers, vendors and admins.
     *
     * Collected at sign-up. It used to live only in a store on the driver's phone, which meant the
     * description a passenger saw on a bid had never been seen by anybody, and the admin grading a
     * car Standard or Luxe was deciding without knowing what the car was.
     */
    @Column(name = "vehicle_make", length = 40)
    private String vehicleMake;

    @Column(name = "vehicle_model", length = 40)
    private String vehicleModel;

    @Column(name = "vehicle_colour", length = 30)
    private String vehicleColour;

    @Column(name = "vehicle_plate", length = 20)
    private String vehiclePlate;

    /**
     * Why the account is in its current status, written by the reviewing admin.
     *
     * A rejection used to be a bare status: the driver's app said they had been turned down and
     * could not say what to change, so the only route forward was to ring support and ask someone
     * to look up a decision that had already been made.
     */
    @Column(name = "status_note", length = 500)
    private String statusNote;

    @Column(name = "status_reviewed_by")
    private UUID statusReviewedBy;

    @Column(name = "status_reviewed_at")
    private OffsetDateTime statusReviewedAt;

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
    public String getVehicleMake() { return vehicleMake; }
    public void setVehicleMake(String vehicleMake) { this.vehicleMake = vehicleMake; }
    public String getVehicleModel() { return vehicleModel; }
    public void setVehicleModel(String vehicleModel) { this.vehicleModel = vehicleModel; }
    public String getVehicleColour() { return vehicleColour; }
    public void setVehicleColour(String vehicleColour) { this.vehicleColour = vehicleColour; }
    public String getVehiclePlate() { return vehiclePlate; }
    public void setVehiclePlate(String vehiclePlate) { this.vehiclePlate = vehiclePlate; }
    public String getStatusNote() { return statusNote; }
    public void setStatusNote(String statusNote) { this.statusNote = statusNote; }
    public UUID getStatusReviewedBy() { return statusReviewedBy; }
    public void setStatusReviewedBy(UUID statusReviewedBy) { this.statusReviewedBy = statusReviewedBy; }
    public OffsetDateTime getStatusReviewedAt() { return statusReviewedAt; }
    public void setStatusReviewedAt(OffsetDateTime statusReviewedAt) { this.statusReviewedAt = statusReviewedAt; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
