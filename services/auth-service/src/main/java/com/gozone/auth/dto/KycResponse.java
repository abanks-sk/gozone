package com.gozone.auth.dto;

import java.util.UUID;

public record KycResponse(UUID id, UUID userId, String status, String licenceNo, String vehicleReg) {}
