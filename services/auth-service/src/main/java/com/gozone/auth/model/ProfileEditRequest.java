package com.gozone.auth.model;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A driver asking to change something an admin already verified.
 *
 * <p>Name, vehicle and documents are locked once the account is approved — they are what was
 * checked, and a driver who could rewrite their own plate or swap their licence photo afterwards
 * could put a different vehicle, or a different person, on the road under a verified identity.
 *
 * <p>Only the fields being changed are set; the rest stay null and are left alone when the request
 * is applied. Nothing takes effect until an admin approves it.
 */
@Entity
@Table(name = "profile_edit_requests")
public class ProfileEditRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.PENDING;

    @Column(length = 100)
    private String name;

    @Column(name = "vehicle_make", length = 40)
    private String vehicleMake;

    @Column(name = "vehicle_model", length = 40)
    private String vehicleModel;

    @Column(name = "vehicle_colour", length = 30)
    private String vehicleColour;

    @Column(name = "vehicle_plate", length = 20)
    private String vehiclePlate;

    @Column(name = "licence_no", length = 60)
    private String licenceNo;

    @Column(name = "id_selfie_url", columnDefinition = "text")
    private String idSelfieUrl;

    @Column(name = "licence_url", columnDefinition = "text")
    private String licenceUrl;

    @Column(name = "vehicle_photo_url", columnDefinition = "text")
    private String vehiclePhotoUrl;

    @Column(name = "roadworthy_url", columnDefinition = "text")
    private String roadworthyUrl;

    /** Why the driver says it changed — an admin approving a new plate deserves the reason. */
    @Column(length = 500)
    private String reason;

    /** Why the admin decided as they did. Required on a rejection; the driver is shown it. */
    @Column(name = "review_note", length = 500)
    private String reviewNote;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    @Column(name = "reviewed_at")
    private OffsetDateTime reviewedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    public enum Status { PENDING, APPROVED, REJECTED }

    /** True when this request would change anything at all — an empty one is not worth reviewing. */
    public boolean isEmpty() {
        return name == null && vehicleMake == null && vehicleModel == null && vehicleColour == null
            && vehiclePlate == null && licenceNo == null && idSelfieUrl == null
            && licenceUrl == null && vehiclePhotoUrl == null && roadworthyUrl == null;
    }

    /** True when it touches anything the KYC record owns, so approving must record a new submission. */
    public boolean touchesDocuments() {
        return licenceNo != null || idSelfieUrl != null || licenceUrl != null
            || vehiclePhotoUrl != null || roadworthyUrl != null;
    }

    public UUID getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getVehicleMake() { return vehicleMake; }
    public void setVehicleMake(String vehicleMake) { this.vehicleMake = vehicleMake; }
    public String getVehicleModel() { return vehicleModel; }
    public void setVehicleModel(String vehicleModel) { this.vehicleModel = vehicleModel; }
    public String getVehicleColour() { return vehicleColour; }
    public void setVehicleColour(String vehicleColour) { this.vehicleColour = vehicleColour; }
    public String getVehiclePlate() { return vehiclePlate; }
    public void setVehiclePlate(String vehiclePlate) { this.vehiclePlate = vehiclePlate; }
    public String getLicenceNo() { return licenceNo; }
    public void setLicenceNo(String licenceNo) { this.licenceNo = licenceNo; }
    public String getIdSelfieUrl() { return idSelfieUrl; }
    public void setIdSelfieUrl(String idSelfieUrl) { this.idSelfieUrl = idSelfieUrl; }
    public String getLicenceUrl() { return licenceUrl; }
    public void setLicenceUrl(String licenceUrl) { this.licenceUrl = licenceUrl; }
    public String getVehiclePhotoUrl() { return vehiclePhotoUrl; }
    public void setVehiclePhotoUrl(String vehiclePhotoUrl) { this.vehiclePhotoUrl = vehiclePhotoUrl; }
    public String getRoadworthyUrl() { return roadworthyUrl; }
    public void setRoadworthyUrl(String roadworthyUrl) { this.roadworthyUrl = roadworthyUrl; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getReviewNote() { return reviewNote; }
    public void setReviewNote(String reviewNote) { this.reviewNote = reviewNote; }
    public UUID getReviewedBy() { return reviewedBy; }
    public void setReviewedBy(UUID reviewedBy) { this.reviewedBy = reviewedBy; }
    public OffsetDateTime getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(OffsetDateTime reviewedAt) { this.reviewedAt = reviewedAt; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
