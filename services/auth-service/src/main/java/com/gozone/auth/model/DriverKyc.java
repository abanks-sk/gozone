package com.gozone.auth.model;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "driver_kyc")
public class DriverKyc {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "licence_no", length = 50)
    private String licenceNo;

    @Column(name = "vehicle_reg", length = 50)
    private String vehicleReg;

    @Column(name = "roadworthy_url")
    private String roadworthyUrl;

    /** The driver's own photograph. Column predates the rename; this is their face. */
    @Column(name = "id_selfie_url")
    private String idSelfieUrl;

    /** Photograph of the driving licence. */
    @Column(name = "licence_url")
    private String licenceUrl;

    /** Photograph of the vehicle. */
    @Column(name = "vehicle_photo_url")
    private String vehiclePhotoUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private KycStatus status = KycStatus.PENDING;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    public enum KycStatus { PENDING, VERIFIED, REJECTED }

    public UUID getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getLicenceNo() { return licenceNo; }
    public void setLicenceNo(String licenceNo) { this.licenceNo = licenceNo; }
    public String getVehicleReg() { return vehicleReg; }
    public void setVehicleReg(String vehicleReg) { this.vehicleReg = vehicleReg; }
    public String getRoadworthyUrl() { return roadworthyUrl; }
    public void setRoadworthyUrl(String roadworthyUrl) { this.roadworthyUrl = roadworthyUrl; }
    public String getIdSelfieUrl() { return idSelfieUrl; }
    public void setIdSelfieUrl(String idSelfieUrl) { this.idSelfieUrl = idSelfieUrl; }
    public String getLicenceUrl() { return licenceUrl; }
    public void setLicenceUrl(String licenceUrl) { this.licenceUrl = licenceUrl; }
    public String getVehiclePhotoUrl() { return vehiclePhotoUrl; }
    public void setVehiclePhotoUrl(String vehiclePhotoUrl) { this.vehiclePhotoUrl = vehiclePhotoUrl; }
    public KycStatus getStatus() { return status; }
    public void setStatus(KycStatus status) { this.status = status; }
    public UUID getReviewedBy() { return reviewedBy; }
    public void setReviewedBy(UUID reviewedBy) { this.reviewedBy = reviewedBy; }
    public LocalDate getExpiryDate() { return expiryDate; }
    public void setExpiryDate(LocalDate expiryDate) { this.expiryDate = expiryDate; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
