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
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

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
    private final SosIncidentRepository sosRepo;
    private final SimpMessagingTemplate messaging;
    private final WalletClient walletClient;
    private final NotifyClient notifyClient;

    @Value("${app.pooling.max-distance-km:3.0}")
    private double maxPoolDistanceKm;

    @Value("${app.pooling.rule-version:v1}")
    private String ruleVersion;

    /** How long an immediate ("ride now") request stays live before it auto-expires (no drivers found). */
    @Value("${app.ride.request-ttl-seconds:90}")
    private int requestTtlSeconds;

    // ── Dynamic pricing config (env-overridable) ────────────────────────────────
    @Value("${app.pricing.base:5.0}")        private double priceBase;
    @Value("${app.pricing.per-km:2.2}")      private double pricePerKm;
    @Value("${app.pricing.min-fare:5.0}")    private double minFare;
    @Value("${app.pricing.surge:1.0}")       private double baseSurge;      // baseline multiplier
    @Value("${app.pricing.peak-surge:1.25}") private double peakSurge;      // extra factor at peak hours
    @Value("${app.pricing.rule-version:p1}") private String pricingRuleVersion;

    public RideService(RideRequestRepository requestRepo,
                       BidRepository bidRepo,
                       TripRepository tripRepo,
                       TripPassengerRepository passengerRepo,
                       DriverLocationRepository locationRepo,
                       RideRatingRepository ratingRepo,
                       SosIncidentRepository sosRepo,
                       SimpMessagingTemplate messaging,
                       WalletClient walletClient,
                       NotifyClient notifyClient) {
        this.requestRepo  = requestRepo;
        this.bidRepo      = bidRepo;
        this.tripRepo     = tripRepo;
        this.passengerRepo = passengerRepo;
        this.locationRepo = locationRepo;
        this.ratingRepo   = ratingRepo;
        this.sosRepo      = sosRepo;
        this.messaging    = messaging;
        this.walletClient = walletClient;
        this.notifyClient = notifyClient;
    }

    /** Rider creates a ride request. */
    public RideRequestResponse createRequest(String riderId, CreateRideRequestDto dto) {
        RideRequest req = new RideRequest();
        req.setRiderId(UUID.fromString(riderId));
        req.setOrigin(point(dto.getOriginLng(), dto.getOriginLat()));
        req.setDest(point(dto.getDestLng(), dto.getDestLat()));
        req.setSeats(dto.getSeats());
        req.setProposedFare(dto.getProposedFare());
        req.setScheduledAt(dto.getScheduledAt()); // null = ride now
        req.setKind(parseEnum(RideRequest.Kind.class, dto.getKind(), RideRequest.Kind.RIDE));
        req.setRideType(parseEnum(RideRequest.RideType.class, dto.getRideType(), RideRequest.RideType.STANDARD));
        req.setParcelSize(parseEnum(RideRequest.ParcelSize.class, dto.getParcelSize(), null));
        req.setParcelDesc(dto.getParcelDesc());
        req.setDirection(parseEnum(RideRequest.Direction.class, dto.getDirection(), null));
        req.setPartyName(trimToNull(dto.getPartyName()));
        req.setPartyPhone(trimToNull(dto.getPartyPhone()));
        req.setRiderPhone(dto.getRiderPhone());

        // A parcel needs someone at the other end — a ride doesn't. Without this the courier
        // arrives with nobody to hand it to and no number to ring.
        if (req.getKind() == RideRequest.Kind.PARCEL
                && (req.getPartyName() == null || req.getPartyPhone() == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "A parcel needs the other person's name and phone number.");
        }

        requestRepo.save(req);
        log.debug("[RIDE] request created id={} rider={} kind={}", req.getId(), riderId, req.getKind());
        // The creator owns it, so they get their own handover details back.
        return RideRequestResponse.forOwner(req);
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    /**
     * Driver fetches open requests within radius, filtered by their vehicle class +
     * service mode so each driver only sees requests they can actually take.
     */
    @Transactional(readOnly = true)
    public List<RideRequestResponse> nearbyRequests(double lat, double lng, double radiusKm,
                                                    String vehicleClass, String serviceMode) {
        return requestRepo.findNearby(lat, lng, radiusKm, requestTtlSeconds).stream()
            .filter(r -> canServe(r, vehicleClass, serviceMode))
            .map(RideRequestResponse::from).toList();
    }

    /**
     * Periodically expire immediate requests nobody accepted in time, so the
     * request system doesn't run forever. Runs independently of any rider polling.
     */
    @Scheduled(fixedDelayString = "${app.ride.expiry-sweep-ms:30000}")
    public void expireStaleRequests() {
        int n = requestRepo.expireStale(
            RideRequest.Status.OPEN,
            RideRequest.Status.EXPIRED,
            OffsetDateTime.now().minusSeconds(requestTtlSeconds),
            Bid.BidStatus.PENDING);
        if (n > 0) log.info("[RIDE] expired {} stale open request(s)", n);
    }

    /** Routing rules: which requests a driver of the given class + mode may see. */
    private boolean canServe(RideRequest r, String vehicleClass, String serviceMode) {
        if (vehicleClass == null || vehicleClass.isBlank()) return true; // no class → no filtering (e.g. seeded/legacy)
        String cls = vehicleClass.trim().toUpperCase();
        String mode = serviceMode == null || serviceMode.isBlank() ? "BOTH" : serviceMode.trim().toUpperCase();

        if (r.getKind() == RideRequest.Kind.RIDE) {
            if (mode.equals("DELIVERIES")) return false;
            return switch (cls) {
                case "OKADA"    -> r.getRideType() == RideRequest.RideType.OKADA;
                case "STANDARD" -> r.getRideType() == RideRequest.RideType.STANDARD;
                case "LUXE"     -> r.getRideType() == RideRequest.RideType.STANDARD || r.getRideType() == RideRequest.RideType.LUXE;
                default          -> false; // CARGO gets no rides
            };
        }
        // PARCEL
        if (mode.equals("RIDES")) return false;
        RideRequest.ParcelSize size = r.getParcelSize() != null ? r.getParcelSize() : RideRequest.ParcelSize.MEDIUM;
        return switch (cls) {
            case "OKADA"              -> size == RideRequest.ParcelSize.SMALL;
            case "STANDARD", "LUXE"   -> size == RideRequest.ParcelSize.MEDIUM;
            case "CARGO"              -> size == RideRequest.ParcelSize.LARGE;
            default                    -> false;
        };
    }

    private static <E extends Enum<E>> E parseEnum(Class<E> type, String raw, E fallback) {
        if (raw == null || raw.isBlank()) return fallback;
        try { return Enum.valueOf(type, raw.trim().toUpperCase()); }
        catch (IllegalArgumentException e) { return fallback; }
    }

    /**
     * Rider polls their own request: returns its current status plus the matched
     * trip (null until a driver accepts). Drives the customer-side lifecycle.
     */
    /** Rider's ride history (upcoming/scheduled + active + past). */
    @Transactional(readOnly = true)
    public List<RideHistoryItem> myRides(String riderId) {
        return requestRepo.findByRiderIdOrderByCreatedAtDesc(UUID.fromString(riderId)).stream()
            .map(r -> {
                Trip trip = tripRepo.findByRequestId(r.getId()).orElse(null);
                String status = trip != null ? trip.getStatus().name() : r.getStatus().name();
                BigDecimal fare = trip != null ? trip.getAgreedFare() : r.getProposedFare();
                return new RideHistoryItem(
                    r.getId(), trip != null ? trip.getId() : null, status, fare,
                    r.getOrigin().getY(), r.getOrigin().getX(), r.getDest().getY(), r.getDest().getX(),
                    r.getScheduledAt(), r.getCreatedAt());
            })
            .toList();
    }

    public RideStatusResponse getRequestStatus(UUID requestId, String riderId) {
        RideRequest req = requestRepo.findById(requestId)
            .orElseThrow(() -> new IllegalStateException("Request not found"));
        if (!req.getRiderId().equals(UUID.fromString(riderId))) {
            throw new IllegalStateException("Not your request");
        }
        // Lazy expiry: an immediate request nobody accepted within the TTL flips to
        // EXPIRED here, so the polling rider is told "no drivers available" promptly
        // (the scheduled sweep is only a backstop for riders who stopped polling).
        if (req.getStatus() == RideRequest.Status.OPEN
                && req.getScheduledAt() == null
                && req.getCreatedAt().isBefore(OffsetDateTime.now().minusSeconds(requestTtlSeconds))
                && tripRepo.findByRequestId(requestId).isEmpty()
                && bidRepo.findByRequestIdAndStatus(requestId, Bid.BidStatus.PENDING).isEmpty()) {
            req.setStatus(RideRequest.Status.EXPIRED);
            requestRepo.save(req);
        }
        TripResponse trip = tripRepo.findByRequestId(requestId)
            .map(TripResponse::from)
            .orElse(null);
        // Winning driver's details (from the accepted bid) for the live-screen driver card.
        BidOffer driver = trip == null ? null
            : bidRepo.findTopByRequestIdAndStatusOrderByCreatedAtDesc(requestId, Bid.BidStatus.ACCEPTED)
                .map(b -> BidOffer.from(b, driverDistanceKm(b, req)))
                .orElse(null);
        // Ownership was checked at the top of this method, so the owner shape is correct here.
        return new RideStatusResponse(RideRequestResponse.forOwner(req), trip, driver);
    }

    /**
     * Driver places a bid (ACCEPT or COUNTER). Both become PENDING offers the
     * rider chooses from — accepting no longer auto-creates the trip, so several
     * drivers can accept and the rider picks by distance/driver.
     * ACCEPT is pinned to the RIDER's proposed fare; COUNTER carries the driver's
     * amount. The trip is created only when the rider accepts a bid (acceptBid).
     */
    public BidResponse placeBid(UUID requestId, String driverId, BidRequestDto dto) {
        RideRequest req = requestRepo.findById(requestId)
            .orElseThrow(() -> new IllegalStateException("Request not found"));

        if (req.getStatus() != RideRequest.Status.OPEN) {
            throw new IllegalStateException("Request is no longer open");
        }

        Bid.BidType type = Bid.BidType.valueOf(dto.getType().toUpperCase());
        UUID driverUUID = UUID.fromString(driverId);

        // A rider can't bid on / self-accept their own request (blocks the self-payout chain).
        if (req.getRiderId().equals(driverUUID)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot bid on your own request");
        }

        // One live offer per driver per request: re-offering updates it in place.
        Bid bid = bidRepo.findByRequestIdAndDriverIdAndStatus(requestId, driverUUID, Bid.BidStatus.PENDING)
            .orElseGet(Bid::new);
        bid.setRequest(req);
        bid.setDriverId(driverUUID);
        bid.setType(type);
        bid.setStatus(Bid.BidStatus.PENDING);
        bid.setAmount(type == Bid.BidType.ACCEPT ? req.getProposedFare() : dto.getAmount());
        bid.setDriverName(dto.getDriverName());
        bid.setDriverPhone(dto.getDriverPhone());
        bid.setVehicle(dto.getVehicle());
        bid.setPlate(dto.getPlate());
        bid.setDriverLat(dto.getLat());
        bid.setDriverLng(dto.getLng());
        bidRepo.save(bid);

        log.info("[RIDE] offer {} type={} driver={} amount={}", bid.getId(), type, driverId, bid.getAmount());
        return new BidResponse(bid.getId(), bid.getStatus().name(), null);
    }

    /** Driver withdraws their pending offer (no-op if the rider already decided). */
    public void withdrawBid(UUID bidId, String driverId) {
        Bid bid = bidRepo.findById(bidId)
            .orElseThrow(() -> new IllegalStateException("Offer not found"));
        if (!bid.getDriverId().equals(UUID.fromString(driverId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your offer");
        }
        if (bid.getStatus() == Bid.BidStatus.PENDING) {
            bid.setStatus(Bid.BidStatus.WITHDRAWN);
            bidRepo.save(bid);
        }
    }

    /** Driver polls their own offer: PENDING → ACCEPTED (+tripId) / REJECTED. */
    @Transactional(readOnly = true)
    public BidStatusResponse getBidStatus(UUID bidId, String driverId) {
        Bid bid = bidRepo.findById(bidId)
            .orElseThrow(() -> new IllegalStateException("Offer not found"));
        if (!bid.getDriverId().equals(UUID.fromString(driverId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your offer");
        }
        RideRequest req = bid.getRequest();
        UUID tripId = bid.getStatus() == Bid.BidStatus.ACCEPTED
            ? tripRepo.findByRequestId(req.getId()).map(Trip::getId).orElse(null)
            : null;
        return new BidStatusResponse(bid.getId(), bid.getStatus().name(), req.getStatus().name(), tripId);
    }

    /** Rider lists pending driver offers (bids) on their open request. */
    @Transactional(readOnly = true)
    public List<BidOffer> listBids(UUID requestId, String riderId) {
        RideRequest req = requestRepo.findById(requestId)
            .orElseThrow(() -> new IllegalStateException("Request not found"));
        if (!req.getRiderId().equals(UUID.fromString(riderId))) {
            throw new IllegalStateException("Not your request");
        }
        return bidRepo.findByRequestIdAndStatus(requestId, Bid.BidStatus.PENDING).stream()
            .map(b -> BidOffer.from(b, driverDistanceKm(b, req)))
            .toList();
    }

    /** Driver's straight-line distance to the pickup at bid time (null if no position sent). */
    private static Double driverDistanceKm(Bid b, RideRequest req) {
        if (b.getDriverLat() == null || b.getDriverLng() == null) return null;
        double km = haversineKm(b.getDriverLat(), b.getDriverLng(),
            req.getOrigin().getY(), req.getOrigin().getX());
        return Math.round(km * 10.0) / 10.0;
    }

    /** Rider accepts a driver's offer → creates the trip at the offered fare. */
    public TripResponse acceptBid(UUID requestId, UUID bidId, String riderId) {
        RideRequest req = requestRepo.findById(requestId)
            .orElseThrow(() -> new IllegalStateException("Request not found"));
        if (!req.getRiderId().equals(UUID.fromString(riderId))) {
            throw new IllegalStateException("Not your request");
        }
        if (req.getStatus() != RideRequest.Status.OPEN) {
            throw new IllegalStateException("Request is no longer open");
        }
        Bid bid = bidRepo.findById(bidId)
            .orElseThrow(() -> new IllegalStateException("Offer not found"));
        if (!bid.getRequest().getId().equals(requestId)) {
            throw new IllegalStateException("Offer does not belong to this request");
        }

        bid.setStatus(Bid.BidStatus.ACCEPTED);
        bidRepo.save(bid);

        // The rider chose this driver — reject every other live offer so those
        // drivers' apps stop waiting and return to the feed.
        for (Bid other : bidRepo.findByRequestIdAndStatus(requestId, Bid.BidStatus.PENDING)) {
            if (!other.getId().equals(bid.getId())) {
                other.setStatus(Bid.BidStatus.REJECTED);
                bidRepo.save(other);
            }
        }

        Trip trip = new Trip();
        trip.setRequest(req);
        trip.setDriverId(bid.getDriverId());
        trip.setAgreedFare(bid.getAmount());
        tripRepo.save(trip);

        TripPassenger passenger = new TripPassenger();
        passenger.setId(new TripPassenger.TripPassengerId(trip.getId(), req.getRiderId()));
        passenger.setTrip(trip);
        passenger.setLockedFare(bid.getAmount());
        passenger.setPickupSeq((short) 1);
        passenger.setRuleVersion(ruleVersion);
        passengerRepo.save(passenger);

        req.setStatus(RideRequest.Status.MATCHED);
        requestRepo.save(req);

        log.info("[RIDE] rider accepted offer {} → trip {} fare {}", bidId, trip.getId(), bid.getAmount());
        return TripResponse.from(trip);
    }

    /** Advance trip status; trigger downstream calls on COMPLETED. */
    public TripResponse updateTripStatus(UUID tripId, String userId, TripStatusUpdateDto dto) {
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));

        Trip.Status newStatus = Trip.Status.valueOf(dto.getStatus().toUpperCase());

        // Only the trip's driver may advance it; the driver or rider may cancel it.
        UUID actor = UUID.fromString(userId);
        boolean isDriver = trip.getDriverId() != null && trip.getDriverId().equals(actor);
        boolean isRider = trip.getRequest() != null && trip.getRequest().getRiderId().equals(actor);
        boolean allowed = newStatus == Trip.Status.CANCELLED ? (isDriver || isRider) : isDriver;
        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your trip");
        }

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

    // ── Payment ─────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public TripResponse getTrip(UUID tripId, String userId) {
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));
        UUID actor = UUID.fromString(userId);
        boolean isDriver = trip.getDriverId() != null && trip.getDriverId().equals(actor);
        boolean isRider = trip.getRequest() != null && trip.getRequest().getRiderId().equals(actor);
        if (!isDriver && !isRider) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your trip");
        }
        return TripResponse.from(trip);
    }

    /**
     * Rider pays. A non-blank {@code reference} means a Paystack (card/mobile-money) payment:
     * it's verified server-side before the trip is marked paid. Wallet settles immediately;
     * cash awaits the driver's confirmation.
     */
    public TripResponse payTrip(UUID tripId, String riderId, String method, String reference) {
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));
        if (!trip.getRequest().getRiderId().equals(UUID.fromString(riderId))) {
            throw new IllegalStateException("Not your trip");
        }

        boolean viaPaystack = reference != null && !reference.isBlank();
        if (viaPaystack && !walletClient.verifyPayment(trip.getAgreedFare(), reference)) {
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                "Payment could not be verified. If you completed it, please try again.");
        }

        // Paying from the GoZone wallet has to actually take the money. This throws (402) when
        // the balance won't cover it, before the trip is marked paid — an empty wallet used to
        // pay fine and the driver was credited anyway.
        if (!viaPaystack && "wallet".equalsIgnoreCase(method)) {
            walletClient.chargeWallet(trip.getRequest().getRiderId(), trip.getAgreedFare(), trip.getId());
        }

        trip.setPaymentMethod(method);
        trip.setPaymentStatus((!viaPaystack && "cash".equalsIgnoreCase(method))
            ? Trip.PaymentStatus.AWAITING
            : Trip.PaymentStatus.PAID);
        tripRepo.save(trip);
        settleIfPaid(trip); // pays out the driver once the (completed) trip is paid
        log.info("[PAY] trip={} method={} status={}", tripId, method, trip.getPaymentStatus());
        return TripResponse.from(trip);
    }

    /**
     * Driver signals they have reached the pickup point.
     *
     * <p>Push, not a screen change: the customer is outside looking for a car, not watching the
     * tracking map. The trip status is untouched — arriving is not the same as starting, and the
     * driver still taps Start when the passenger is actually in.
     */
    public TripResponse driverArrived(UUID tripId, String driverId) {
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));
        if (!trip.getDriverId().equals(UUID.fromString(driverId))) {
            throw new IllegalStateException("Not your trip");
        }
        if (trip.getStatus() != Trip.Status.ENROUTE) {
            throw new IllegalStateException("You can only arrive while en route to the pickup");
        }
        boolean parcel = trip.getRequest().getKind() == RideRequest.Kind.PARCEL;
        notifyClient.send(
            trip.getRequest().getRiderId(),
            parcel ? "Your courier has arrived" : "Your driver has arrived",
            parcel
                ? "Your courier is at the pickup point for your parcel."
                : "Your driver is waiting at your pickup point.");
        log.info("[ARRIVED] trip={} driver={}", tripId, driverId);
        return TripResponse.from(trip);
    }

    /** Driver confirms a cash payment was collected. */
    public TripResponse confirmCash(UUID tripId, String driverId) {
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));
        if (!trip.getDriverId().equals(UUID.fromString(driverId))) {
            throw new IllegalStateException("Not your trip");
        }
        trip.setPaymentStatus(Trip.PaymentStatus.PAID);
        tripRepo.save(trip);
        settleIfPaid(trip);
        log.info("[PAY] trip={} cash confirmed by driver {}", tripId, driverId);
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
    public List<RideRequestResponse> poolCandidates(UUID tripId, String userId) {
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));
        if (trip.getDriverId() == null || !trip.getDriverId().equals(UUID.fromString(userId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your trip");
        }

        // A courier on a parcel run is never offered passengers to pick up.
        if (trip.getRequest().getKind() != RideRequest.Kind.RIDE) {
            return List.of();
        }

        Point dest = trip.getRequest().getDest();
        double destLat = dest.getY();
        double destLng = dest.getX();

        // Same-corridor match: open requests within maxPoolDistanceKm of this trip's destination.
        // Rides only — pooling is people sharing a car, and the shared request table means a
        // parcel would otherwise show up here as a "passenger" to pick up.
        return requestRepo.findNearby(destLat, destLng, maxPoolDistanceKm, requestTtlSeconds)
            .stream()
            .filter(r -> r.getStatus() == RideRequest.Status.OPEN)
            .filter(r -> r.getKind() == RideRequest.Kind.RIDE)
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

        // The joining request must belong to the caller (can't matchmake others' requests).
        if (!joiningReq.getRiderId().equals(UUID.fromString(riderId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your ride request");
        }

        // Pooling seats people. Because rides and parcels share one request table, guard both
        // ends: a parcel can't join a trip, and a parcel trip can't take on passengers.
        if (joiningReq.getKind() != RideRequest.Kind.RIDE
                || trip.getRequest().getKind() != RideRequest.Kind.RIDE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only rides can be pooled.");
        }

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
        UUID rater = UUID.fromString(raterId);
        // Only a participant (the driver or a passenger) may rate the trip.
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));
        boolean isDriver = trip.getDriverId() != null && trip.getDriverId().equals(rater);
        boolean isPassenger = passengerRepo.existsById(new TripPassenger.TripPassengerId(tripId, rater));
        if (!isDriver && !isPassenger) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You were not on this trip");
        }
        if (ratingRepo.existsByTripIdAndRaterId(tripId, rater)) {
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

    /**
     * SOS: recorded as an incident and surfaced on the admin web app, where the
     * safety team triages it (and decides whether to involve the authorities).
     */
    public SosIncidentResponse sos(UUID tripId, String userId, Double lat, Double lng) {
        SosIncident incident = new SosIncident();
        incident.setTripId(tripId);
        incident.setUserId(UUID.fromString(userId));
        incident.setLat(lat);
        incident.setLng(lng);
        sosRepo.save(incident);
        log.warn("[SOS] incident {} trip={} user={} at {},{}", incident.getId(), tripId, userId, lat, lng);
        return SosIncidentResponse.from(incident);
    }

    /** Admin: all SOS incidents, newest first. */
    @Transactional(readOnly = true)
    public List<SosIncidentResponse> listSosIncidents() {
        return sosRepo.findAllByOrderByCreatedAtDesc().stream()
            .map(SosIncidentResponse::from).toList();
    }

    /** Admin: mark an incident handled. */
    public SosIncidentResponse handleSosIncident(UUID id) {
        SosIncident incident = sosRepo.findById(id)
            .orElseThrow(() -> new IllegalStateException("Incident not found"));
        incident.setStatus(SosIncident.Status.HANDLED);
        sosRepo.save(incident);
        return SosIncidentResponse.from(incident);
    }

    // ── private helpers ─────────────────────────────────────────────────────────

    private void onTripCompleted(Trip trip) {
        settleIfPaid(trip);
    }

    /**
     * Settle a trip only once it is BOTH completed AND paid — so a driver can't force
     * a payout by advancing status without the rider having paid. Idempotent in wallet,
     * so it's safe to call from completion and from payment (whichever lands last wins).
     */
    private void settleIfPaid(Trip trip) {
        if (trip.getStatus() == Trip.Status.COMPLETED
                && trip.getPaymentStatus() == Trip.PaymentStatus.PAID) {
            walletClient.settleRide(trip.getId(), trip.getDriverId(), trip.getAgreedFare());
        }
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

    // ── Dynamic pricing ─────────────────────────────────────────────────────────

    /**
     * Server-authoritative fare quote: (base + perKm × distance) × type multiplier ×
     * surge, floored at minFare. Surge is time-based (peak commute hours) so the fare
     * is computed by the backend, not the client.
     */
    @Transactional(readOnly = true)
    public QuoteResponse quote(QuoteRequestDto req) {
        double distanceKm = haversineKm(req.getOriginLat(), req.getOriginLng(), req.getDestLat(), req.getDestLng());
        double typeMult = typeMultiplier(req.getRideType());
        double surgeMult = currentSurge();

        BigDecimal baseFare = BigDecimal.valueOf(priceBase + pricePerKm * distanceKm)
            .setScale(2, RoundingMode.HALF_UP);
        double raw = (priceBase + pricePerKm * distanceKm) * typeMult * surgeMult;
        BigDecimal fare = BigDecimal.valueOf(Math.max(minFare, Math.round(raw)))
            .setScale(2, RoundingMode.HALF_UP);

        return new QuoteResponse(
            Math.round(distanceKm * 100.0) / 100.0,
            fare,
            baseFare,
            normalizeRideType(req.getRideType()),
            typeMult,
            surgeMult,
            surgeMult > 1.0,
            "GHS",
            pricingRuleVersion
        );
    }

    private double typeMultiplier(String rideType) {
        return switch (normalizeRideType(rideType)) {
            case "PREMIUM" -> 1.7;
            case "OKADA"   -> 0.6;
            default        -> 1.0; // STANDARD
        };
    }

    private String normalizeRideType(String rideType) {
        if (rideType == null || rideType.isBlank()) return "STANDARD";
        return switch (rideType.trim().toUpperCase()) {
            case "PREMIUM" -> "PREMIUM";
            case "OKADA"   -> "OKADA";
            default        -> "STANDARD";
        };
    }

    /** Peak commute hours (07–09, 17–19 server-local) carry a surge; otherwise baseline. */
    private double currentSurge() {
        int hour = OffsetDateTime.now().getHour();
        boolean peak = (hour >= 7 && hour < 9) || (hour >= 17 && hour < 19);
        return peak ? baseSurge * peakSurge : baseSurge;
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
