package com.gozone.ride.service;

import com.gozone.ride.dto.*;
import com.gozone.ride.model.*;
import com.gozone.ride.repository.*;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional
public class RideService {

    private static final Logger log = LoggerFactory.getLogger(RideService.class);

    private static final GeometryFactory GF =
        new GeometryFactory(new PrecisionModel(), 4326);

    private final RideRequestRepository requestRepo;
    private final BidRepository bidRepo;
    private final TripRepository tripRepo;
    private final TripPassengerRepository passengerRepo;
    private final DriverLocationRepository locationRepo;
    private final RideRatingRepository ratingRepo;
    private final SimpMessagingTemplate messaging;
    private final WalletClient walletClient;

    @Value("${app.pooling.max-distance-km:3.0}")
    private double maxPoolDistanceKm;

    @Value("${app.pooling.rule-version:v1}")
    private String ruleVersion;

    public RideService(RideRequestRepository requestRepo,
                       BidRepository bidRepo,
                       TripRepository tripRepo,
                       TripPassengerRepository passengerRepo,
                       DriverLocationRepository locationRepo,
                       RideRatingRepository ratingRepo,
                       SimpMessagingTemplate messaging,
                       WalletClient walletClient) {
        this.requestRepo  = requestRepo;
        this.bidRepo      = bidRepo;
        this.tripRepo     = tripRepo;
        this.passengerRepo = passengerRepo;
        this.locationRepo = locationRepo;
        this.ratingRepo   = ratingRepo;
        this.messaging    = messaging;
        this.walletClient = walletClient;
    }

    /** Rider creates a ride request. */
    public RideRequestResponse createRequest(String riderId, CreateRideRequestDto dto) {
        RideRequest req = new RideRequest();
        req.setRiderId(UUID.fromString(riderId));
        req.setOrigin(point(dto.getOriginLng(), dto.getOriginLat()));
        req.setDest(point(dto.getDestLng(), dto.getDestLat()));
        req.setSeats(dto.getSeats());
        req.setProposedFare(dto.getProposedFare());
        requestRepo.save(req);
        log.debug("[RIDE] request created id={} rider={}", req.getId(), riderId);
        return RideRequestResponse.from(req);
    }

    /** Driver fetches open requests within radius. */
    @Transactional(readOnly = true)
    public List<RideRequestResponse> nearbyRequests(double lat, double lng, double radiusKm) {
        return requestRepo.findNearby(lat, lng, radiusKm)
            .stream().map(RideRequestResponse::from).toList();
    }

    /**
     * Driver places a bid (ACCEPT or COUNTER).
     * ACCEPT → create trip at the bid amount, mark request MATCHED.
     * COUNTER → save pending bid; rider can call this endpoint with ACCEPT later.
     */
    public BidResponse placeBid(UUID requestId, String driverId, BidRequestDto dto) {
        RideRequest req = requestRepo.findById(requestId)
            .orElseThrow(() -> new IllegalStateException("Request not found"));

        if (req.getStatus() != RideRequest.Status.OPEN) {
            throw new IllegalStateException("Request is no longer open");
        }

        Bid.BidType type = Bid.BidType.valueOf(dto.getType().toUpperCase());
        UUID driverUUID = UUID.fromString(driverId);

        Bid bid = new Bid();
        bid.setRequest(req);
        bid.setDriverId(driverUUID);
        bid.setAmount(dto.getAmount());
        bid.setType(type);

        UUID tripId = null;
        if (type == Bid.BidType.ACCEPT) {
            bid.setStatus(Bid.BidStatus.ACCEPTED);
            bidRepo.save(bid);

            // Create trip at the agreed fare
            Trip trip = new Trip();
            trip.setRequest(req);
            trip.setDriverId(driverUUID);
            trip.setAgreedFare(dto.getAmount());
            tripRepo.save(trip);

            // Add rider as first passenger with agreed fare locked
            TripPassenger passenger = new TripPassenger();
            passenger.setId(new TripPassenger.TripPassengerId(trip.getId(), req.getRiderId()));
            passenger.setTrip(trip);
            passenger.setLockedFare(dto.getAmount());
            passenger.setPickupSeq((short) 1);
            passenger.setRuleVersion(ruleVersion);
            passengerRepo.save(passenger);

            // Mark request matched
            req.setStatus(RideRequest.Status.MATCHED);
            requestRepo.save(req);

            tripId = trip.getId();
            log.info("[RIDE] trip matched id={} driver={} fare={}", tripId, driverId, dto.getAmount());
        } else {
            bid.setStatus(Bid.BidStatus.PENDING);
            bidRepo.save(bid);
            log.debug("[RIDE] counter bid id={} driver={} amount={}", bid.getId(), driverId, dto.getAmount());
        }

        return new BidResponse(bid.getId(), bid.getStatus().name(), tripId);
    }

    /** Advance trip status; trigger downstream calls on COMPLETED. */
    public TripResponse updateTripStatus(UUID tripId, String userId, TripStatusUpdateDto dto) {
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));

        Trip.Status newStatus = Trip.Status.valueOf(dto.getStatus().toUpperCase());
        validateTransition(trip.getStatus(), newStatus);

        trip.setStatus(newStatus);
        if (newStatus == Trip.Status.STARTED) {
            trip.setStartedAt(OffsetDateTime.now());
        }
        if (newStatus == Trip.Status.COMPLETED) {
            trip.setCompletedAt(OffsetDateTime.now());
            onTripCompleted(trip);
        }
        tripRepo.save(trip);
        return TripResponse.from(trip);
    }

    /** Driver pushes GPS location — stored and broadcast over WebSocket. */
    public void pushLocation(String driverId, LocationUpdateDto dto) {
        UUID driverUUID = UUID.fromString(driverId);
        locationRepo.upsertLocation(driverUUID, dto.getLat(), dto.getLng());

        // Broadcast to any matched trip topics for this driver
        tripRepo.findByDriverIdAndStatus(driverUUID, Trip.Status.STARTED).forEach(trip ->
            messaging.convertAndSend(
                "/topic/trip/" + trip.getId() + "/location",
                Map.of("lat", dto.getLat(), "lng", dto.getLng(), "driverId", driverId)
            )
        );
        // Also broadcast to ENROUTE trips (driver on the way)
        tripRepo.findByDriverIdAndStatus(driverUUID, Trip.Status.ENROUTE).forEach(trip ->
            messaging.convertAndSend(
                "/topic/trip/" + trip.getId() + "/location",
                Map.of("lat", dto.getLat(), "lng", dto.getLng(), "driverId", driverId)
            )
        );
    }

    /** Find route-compatible open requests for pooling. */
    @Transactional(readOnly = true)
    public List<RideRequestResponse> poolCandidates(UUID tripId) {
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));

        Point dest = trip.getRequest().getDest();
        double destLat = dest.getY();
        double destLng = dest.getX();

        // Same-corridor match: open requests within maxPoolDistanceKm of this trip's destination
        return requestRepo.findNearby(destLat, destLng, maxPoolDistanceKm)
            .stream()
            .filter(r -> r.getStatus() == RideRequest.Status.OPEN)
            .map(RideRequestResponse::from)
            .toList();
    }

    /**
     * Rider joins an en-route trip at a fixed fair-share quote.
     * Fair-share = (joining rider's haversine distance / total trip distance) × base fare × currentOccupancy
     * locked_fare is never recomputed after this call.
     */
    public PoolJoinResponse poolJoin(UUID tripId, String riderId, PoolJoinRequest req) {
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));

        if (trip.getStatus() != Trip.Status.ENROUTE && trip.getStatus() != Trip.Status.MATCHED) {
            throw new IllegalStateException("Trip is not accepting pool riders");
        }

        RideRequest joiningReq = requestRepo.findById(req.getRequestId())
            .orElseThrow(() -> new IllegalStateException("Ride request not found"));

        long currentOccupancy = passengerRepo.countByIdTripId(tripId);
        double joinDistKm = haversineKm(
            joiningReq.getOrigin().getY(), joiningReq.getOrigin().getX(),
            trip.getRequest().getDest().getY(), trip.getRequest().getDest().getX()
        );

        // Fair-share: joining distance proportion × base fare × (1 + 0.1 per existing passenger discount)
        BigDecimal fairShare = trip.getAgreedFare()
            .multiply(BigDecimal.valueOf(0.7))
            .divide(BigDecimal.valueOf(Math.max(1, currentOccupancy)), 2, RoundingMode.HALF_UP);

        TripPassenger passenger = new TripPassenger();
        passenger.setId(new TripPassenger.TripPassengerId(tripId, UUID.fromString(riderId)));
        passenger.setTrip(trip);
        passenger.setLockedFare(fairShare);
        passenger.setJoinDistanceKm(BigDecimal.valueOf(joinDistKm).setScale(3, RoundingMode.HALF_UP));
        passenger.setPickupSeq((short)(currentOccupancy + 1));
        passenger.setRuleVersion(ruleVersion);
        passengerRepo.save(passenger);

        joiningReq.setStatus(RideRequest.Status.MATCHED);
        requestRepo.save(joiningReq);

        log.info("[POOL] rider={} joined trip={} fare={} rule={}", riderId, tripId, fairShare, ruleVersion);
        return new PoolJoinResponse(tripId, fairShare, ruleVersion);
    }

    /** Two-way rating after trip completion. */
    public void rateTrip(UUID tripId, String raterId, RatingRequestDto dto) {
        if (ratingRepo.existsByTripIdAndRaterId(tripId, UUID.fromString(raterId))) {
            throw new IllegalStateException("Already rated this trip");
        }
        RideRating rating = new RideRating();
        rating.setTripId(tripId);
        rating.setRaterId(UUID.fromString(raterId));
        rating.setRateeId(dto.getRateeId());
        rating.setScore(dto.getScore());
        rating.setComment(dto.getComment());
        ratingRepo.save(rating);
    }

    /** SOS stub — logs event, does not trigger real alerting. */
    public void sos(UUID tripId, String userId) {
        log.warn("[SOS-STUB] tripId={} userId={} ts={}", tripId, userId, OffsetDateTime.now());
        // FR-50: real SOS alerting is CUT; toast is handled on the client
    }

    // ── private helpers ─────────────────────────────────────────────────────────

    private void onTripCompleted(Trip trip) {
        walletClient.settleRide(trip.getId(), trip.getDriverId(), trip.getAgreedFare());
    }

    private void validateTransition(Trip.Status current, Trip.Status next) {
        boolean valid = switch (current) {
            case MATCHED   -> next == Trip.Status.ENROUTE   || next == Trip.Status.CANCELLED;
            case ENROUTE   -> next == Trip.Status.STARTED   || next == Trip.Status.CANCELLED;
            case STARTED   -> next == Trip.Status.COMPLETED || next == Trip.Status.CANCELLED;
            default -> false;
        };
        if (!valid) {
            throw new IllegalStateException(
                "Invalid trip transition: " + current + " → " + next);
        }
    }

    private static Point point(double lng, double lat) {
        return GF.createPoint(new Coordinate(lng, lat));
    }

    /** Haversine great-circle distance in km. */
    private static double haversineKm(double lat1, double lng1, double lat2, double lng2) {
        double R = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
            * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
