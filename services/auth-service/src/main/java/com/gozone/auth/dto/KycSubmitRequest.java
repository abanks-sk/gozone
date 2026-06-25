package com.gozone.auth.dto;

public class KycSubmitRequest {
    private String licenceNo;
    private String vehicleReg;
    private String roadworthyUrl;
    private String idSelfieUrl;

    public String getLicenceNo() { return licenceNo; }
    public void setLicenceNo(String licenceNo) { this.licenceNo = licenceNo; }
    public String getVehicleReg() { return vehicleReg; }
    public void setVehicleReg(String vehicleReg) { this.vehicleReg = vehicleReg; }
    public String getRoadworthyUrl() { return roadworthyUrl; }
    public void setRoadworthyUrl(String roadworthyUrl) { this.roadworthyUrl = roadworthyUrl; }
    public String getIdSelfieUrl() { return idSelfieUrl; }
    public void setIdSelfieUrl(String idSelfieUrl) { this.idSelfieUrl = idSelfieUrl; }
}
