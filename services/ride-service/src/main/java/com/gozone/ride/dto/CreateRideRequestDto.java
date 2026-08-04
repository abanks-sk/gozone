package com.gozone.ride.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public class CreateRideRequestDto {
    @NotNull private Double originLat;
    @NotNull private Double originLng;
    @NotNull private Double destLat;
    @NotNull private Double destLng;
    @Min(1)  private short seats = 1;
    @NotNull @DecimalMin("0.01") private BigDecimal proposedFare;
    private OffsetDateTime scheduledAt; // null = ride now
    private String kind;        // RIDE | PARCEL (default RIDE)
    private String rideType;    // STANDARD | LUXE | OKADA (rides)
    private boolean shared;     // willing to share the car for a cheaper fare (STANDARD rides only)
    private String parcelSize;  // SMALL | MEDIUM | LARGE (parcels)
    private String parcelDesc;  // what the parcel is
    private String direction;   // SEND | RECEIVE (parcels) — which end the customer is at
    private String partyName;   // the other person in the handover (recipient, or sender on RECEIVE)
    private String partyPhone;
    private String riderPhone;  // shared with the matched driver for calling

    public Double getOriginLat() { return originLat; }
    public void setOriginLat(Double originLat) { this.originLat = originLat; }
    public Double getOriginLng() { return originLng; }
    public void setOriginLng(Double originLng) { this.originLng = originLng; }
    public Double getDestLat() { return destLat; }
    public void setDestLat(Double destLat) { this.destLat = destLat; }
    public Double getDestLng() { return destLng; }
    public void setDestLng(Double destLng) { this.destLng = destLng; }
    public short getSeats() { return seats; }
    public void setSeats(short seats) { this.seats = seats; }
    public BigDecimal getProposedFare() { return proposedFare; }
    public void setProposedFare(BigDecimal proposedFare) { this.proposedFare = proposedFare; }
    public OffsetDateTime getScheduledAt() { return scheduledAt; }
    public void setScheduledAt(OffsetDateTime scheduledAt) { this.scheduledAt = scheduledAt; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getRideType() { return rideType; }
    public void setRideType(String rideType) { this.rideType = rideType; }
    public boolean isShared() { return shared; }
    public void setShared(boolean shared) { this.shared = shared; }
    public String getParcelSize() { return parcelSize; }
    public void setParcelSize(String parcelSize) { this.parcelSize = parcelSize; }
    public String getParcelDesc() { return parcelDesc; }
    public void setParcelDesc(String parcelDesc) { this.parcelDesc = parcelDesc; }
    public String getDirection() { return direction; }
    public void setDirection(String direction) { this.direction = direction; }
    public String getPartyName() { return partyName; }
    public void setPartyName(String partyName) { this.partyName = partyName; }
    public String getPartyPhone() { return partyPhone; }
    public void setPartyPhone(String partyPhone) { this.partyPhone = partyPhone; }
    public String getRiderPhone() { return riderPhone; }
    public void setRiderPhone(String riderPhone) { this.riderPhone = riderPhone; }
}
