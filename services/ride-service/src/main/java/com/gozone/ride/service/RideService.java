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
import java.util.ArrayList;
import java.util.Comparator;
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

    // ── Ride sharing (pooling) config ───────────────────────────────────────────
    /** How near the joiner's destination must be to where the car is already going. */
    @Value("${app.pooling.max-distance-km:3.0}")
    private double maxPoolDistanceKm;

    /** How far off the car's remaining line the joiner's pickup may sit. */
    @Value("${app.pooling.max-detour-km:2.0}")
    private double maxPoolDetourKm;

    /** How far the joiner's direction of travel may differ from the car's. */
    @Value("${app.pooling.max-bearing-deg:50}")
    private double maxPoolBearingDeg;

    @Value("${app.pooling.max-passengers:3}")
    private int maxPoolPassengers;

    @Value("${app.pooling.discount-per-extra:0.25}")
    private double poolDiscountPerExtra;

    @Value("${app.pooling.min-discount-factor:0.55}")
    private double poolMinDiscountFactor;

    /** How long a driver has to take back a pickup they confirmed by mistake. */
    @Value("${app.pooling.pickup-undo-seconds:300}")
    private int pickupUndoSeconds;

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
        req.setShared(dto.isShared());
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

        // Sharing is a Standard-ride idea and refusing it here is the point: Luxe is sold on
        // having the car to yourself, an okada has one seat, and a parcel has no passenger to
        // share with. Rejecting rather than quietly clearing the flag means a client that asks
        // for the wrong thing is told so instead of silently selling a ride nobody can join.
        if (req.isShared()
                && (req.getKind() != RideRequest.Kind.RIDE
                    || req.getRideType() != RideRequest.RideType.STANDARD)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Ride sharing is only available on Standard rides.");
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
                // A shared ride joined en route has no trip of its own — the trip belongs to
                // whoever booked it — so the passenger row is the way through. Without this, a
                // joined ride shows in the history as a request that never went anywhere.
                TripPassenger seat = passengerRepo.findByRequestId(r.getId()).orElse(null);
                Trip trip = seat != null ? seat.getTrip() : tripRepo.findByRequestId(r.getId()).orElse(null);
                String status = trip != null ? trip.getStatus().name() : r.getStatus().name();
                // Their own share, never the trip total: on a shared ride the total is two people's
                // money and putting it in one person's history reads as what they were charged.
                BigDecimal fare = seat != null ? seat.getLockedFare()
                    : trip != null ? trip.getAgreedFare() : r.getProposedFare();
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

        // Where this request ended up. Booking a ride outright creates a trip against the request;
        // joining a shared ride en route does not — the trip belongs to whoever booked it, and the
        // passenger row is the only link back. Look for a seat first, because a joiner has both a
        // request and a ride and only one of the two lookups finds it.
        TripPassenger seat = passengerRepo.findByRequestId(requestId).orElse(null);
        Trip found = seat != null ? seat.getTrip() : tripRepo.findByRequestId(requestId).orElse(null);

        // Lazy expiry: an immediate request nobody accepted within the TTL flips to
        // EXPIRED here, so the polling rider is told "no drivers available" promptly
        // (the scheduled sweep is only a backstop for riders who stopped polling).
        if (req.getStatus() == RideRequest.Status.OPEN
                && req.getScheduledAt() == null
                && req.getCreatedAt().isBefore(OffsetDateTime.now().minusSeconds(requestTtlSeconds))
                && found == null
                && bidRepo.findByRequestIdAndStatus(requestId, Bid.BidStatus.PENDING).isEmpty()) {
            req.setStatus(RideRequest.Status.EXPIRED);
            requestRepo.save(req);
        }

        TripResponse trip = null;
        BidOffer driver = null;
        if (found != null) {
            TripPassenger me = seat != null ? seat
                : passengerRepo.findById(new TripPassenger.TripPassengerId(found.getId(), req.getRiderId()))
                    .orElse(null);
            trip = me != null
                ? TripResponse.forPassenger(found, me, (int) passengerRepo.countByIdTripId(found.getId()))
                : TripResponse.from(found);
            // The winning driver's details for the live-screen driver card. The accepted bid hangs
            // off the trip's OWN request, not the caller's — a joiner never had a bid of their own,
            // and looking on their request would leave them with a blank driver card.
            driver = bidRepo.findTopByRequestIdAndStatusOrderByCreatedAtDesc(
                    found.getRequest().getId(), Bid.BidStatus.ACCEPTED)
                .map(b -> BidOffer.from(b, driverDistanceKm(b, req)))
                .orElse(null);
        }
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
        // Whether this car can pick anybody else up was decided by the passenger when they asked
        // for the ride, not by the driver accepting it.
        trip.setShared(req.isShared());
        tripRepo.save(trip);

        TripPassenger passenger = new TripPassenger();
        passenger.setId(new TripPassenger.TripPassengerId(trip.getId(), req.getRiderId()));
        passenger.setTrip(trip);
        passenger.setRequestId(req.getId());
        // Solo and locked start equal: nobody has joined yet, so the agreed price IS the share.
        // Every later discount is computed from soloFare, so this is the number the passenger can
        // always be shown as "what you would have paid alone".
        passenger.setSoloFare(bid.getAmount());
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
            // STARTED already means "the passenger who booked is in the car" — that is what the
            // driver is confirming when they tap it. Recording it here rather than asking them to
            // confirm the same thing twice; joiners board later and get their own confirmation.
            passengerRepo.findById(new TripPassenger.TripPassengerId(tripId, trip.getRequest().getRiderId()))
                .filter(p -> p.getPickedUpAt() == null)
                .ifPresent(p -> { p.setPickedUpAt(OffsetDateTime.now()); passengerRepo.save(p); });
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
        // Membership is the passenger table, not the trip's request. On a shared ride the second
        // passenger is every bit a participant and is not named anywhere on the booking request —
        // checking that alone would lock them out of the trip they are sitting in.
        TripPassenger me = passengerRepo
            .findById(new TripPassenger.TripPassengerId(tripId, actor)).orElse(null);
        if (!isDriver && me == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your trip");
        }
        return me != null
            ? TripResponse.forPassenger(trip, me, (int) passengerRepo.countByIdTripId(tripId))
            : TripResponse.from(trip);
    }

    /**
     * Rider pays. A non-blank {@code reference} means a Paystack (card/mobile-money) payment:
     * it's verified server-side before the trip is marked paid. Wallet settles immediately;
     * cash awaits the driver's confirmation.
     */
    public TripResponse payTrip(UUID tripId, String riderId, String method, String reference) {
        UUID rider = UUID.fromString(riderId);
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));

        // The caller pays THEIR share, not the trip's total. On a shared ride those are different
        // numbers, and charging the trip total would bill each passenger for everybody.
        TripPassenger me = passengerRepo
            .findById(new TripPassenger.TripPassengerId(tripId, rider))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your trip"));
        BigDecimal due = me.getLockedFare();

        boolean viaPaystack = reference != null && !reference.isBlank();
        if (viaPaystack && !walletClient.verifyPayment(due, reference)) {
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                "Payment could not be verified. If you completed it, please try again.");
        }

        // Paying from the GoZone wallet has to actually take the money. This throws (402) when
        // the balance won't cover it, before the trip is marked paid — an empty wallet used to
        // pay fine and the driver was credited anyway.
        if (!viaPaystack && "wallet".equalsIgnoreCase(method)) {
            walletClient.chargeWallet(rider, due, trip.getId());
        }

        me.setPaymentMethod(method);
        me.setPaymentStatus((!viaPaystack && "cash".equalsIgnoreCase(method))
            ? Trip.PaymentStatus.AWAITING
            : Trip.PaymentStatus.PAID);
        passengerRepo.save(me);

        rollUpPayment(trip); // settles the driver once every passenger has paid
        log.info("[PAY] trip={} rider={} amount={} method={} status={}",
            tripId, riderId, due, method, me.getPaymentStatus());
        return TripResponse.forPassenger(trip, me, (int) passengerRepo.countByIdTripId(tripId));
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

    /**
     * Driver confirms cash was collected.
     *
     * <p>{@code riderId} names which passenger handed money over — on a shared ride two people pay
     * two different amounts at two different kerbs, and confirming "the trip" would credit one
     * person's cash to everybody. Omitting it clears every passenger still awaiting cash, which on
     * an ordinary single-passenger trip is exactly the old behaviour and the only sensible reading.
     */
    public TripResponse confirmCash(UUID tripId, String driverId, UUID riderId) {
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));
        if (!trip.getDriverId().equals(UUID.fromString(driverId))) {
            throw new IllegalStateException("Not your trip");
        }

        List<TripPassenger> settling = riderId != null
            ? passengerRepo.findById(new TripPassenger.TripPassengerId(tripId, riderId))
                .map(List::of).orElse(List.of())
            : passengerRepo.findByIdTripId(tripId).stream()
                .filter(p -> p.getPaymentStatus() == Trip.PaymentStatus.AWAITING)
                .toList();
        if (settling.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                "No cash payment is waiting to be confirmed.");
        }
        for (TripPassenger p : settling) {
            p.setPaymentStatus(Trip.PaymentStatus.PAID);
            passengerRepo.save(p);
        }

        rollUpPayment(trip);
        log.info("[PAY] trip={} cash confirmed by driver {} for {} passenger(s)",
            tripId, driverId, settling.size());
        return TripResponse.from(trip);
    }

    /**
     * Fold every passenger's payment state up into the trip's, and settle when the money is all in.
     *
     * <p>The trip is PAID only when everybody has paid, because the driver is owed the whole fare
     * and the wallet settles a trip exactly once. A shared ride where one passenger has paid and
     * the other is still fumbling for cash is AWAITING — not half-paid, which the ledger has no
     * way to express.
     */
    private void rollUpPayment(Trip trip) {
        List<TripPassenger> all = passengerRepo.findByIdTripId(trip.getId());
        if (all.isEmpty()) return;
        boolean allPaid = all.stream().allMatch(p -> p.getPaymentStatus() == Trip.PaymentStatus.PAID);
        boolean anyStarted = all.stream().anyMatch(p -> p.getPaymentStatus() != Trip.PaymentStatus.UNPAID);
        trip.setPaymentStatus(allPaid ? Trip.PaymentStatus.PAID
            : anyStarted ? Trip.PaymentStatus.AWAITING
            : Trip.PaymentStatus.UNPAID);
        // The trip-level method is only meaningful when it is unambiguous; two passengers can pay
        // different ways, and the driver's screen reads this to decide whether to expect cash.
        String method = all.stream().map(TripPassenger::getPaymentMethod)
            .filter(java.util.Objects::nonNull).distinct().count() == 1
            ? all.stream().map(TripPassenger::getPaymentMethod)
                .filter(java.util.Objects::nonNull).findFirst().orElse(null)
            : "mixed";
        trip.setPaymentMethod(method);
        tripRepo.save(trip);
        settleIfPaid(trip);
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

    // ── Ride sharing (pooling) ──────────────────────────────────────────────────
    //
    // Two ways in, one matcher. A rider who ticked "share" is shown rides already on the road that
    // are going their way (poolOffers) and steps into one (poolJoin); a driver can look the other
    // way down the same relation and see who they could pick up (poolCandidates). Both run
    // poolFit, so the driver is never shown somebody the rider would not be offered, and neither
    // is ever shown a match the other side's screen contradicts.
    //
    // This is deliberately corridor geometry, not routing: no detour-time model, no ETA cap, no
    // re-solving the driver's route. See CLAUDE.md — the simplification is the design, and the
    // rule_version stamped on every quote is what makes it safe to replace later.

    /** A candidate match that passed every gate, and by how much. */
    private record PoolFit(double detourKm, double destGapKm) {}

    /**
     * Rides already under way that this request could join.
     *
     * <p>Polled by the rider while drivers are still bidding, so it sits beside those bids as a
     * third choice: take a price, counter it, or get into a car that is going there anyway for
     * less. Returns an empty list rather than an error whenever nothing qualifies — "no shared
     * rides near you" is the normal case, not a failure.
     */
    @Transactional(readOnly = true)
    public List<PoolOffer> poolOffers(UUID requestId, String riderId) {
        UUID rider = UUID.fromString(riderId);
        RideRequest joiner = requestRepo.findById(requestId)
            .orElseThrow(() -> new IllegalStateException("Request not found"));
        if (!joiner.getRiderId().equals(rider)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your ride request");
        }
        if (!isPoolable(joiner)) return List.of();
        // Already aboard something: there is nothing left to offer, and offering anyway would let
        // one request be sold twice.
        if (passengerRepo.findByRequestId(requestId).isPresent()) return List.of();

        List<PoolOffer> offers = new ArrayList<>();
        for (Trip trip : tripRepo.findActiveSharedNearDest(
                joiner.getDest().getY(), joiner.getDest().getX(), maxPoolDistanceKm)) {

            if (rider.equals(trip.getDriverId())) continue;   // nobody rides in their own car
            List<TripPassenger> aboard = passengerRepo.findByIdTripIdOrderByPickupSeqAsc(trip.getId());
            if (aboard.isEmpty() || aboard.size() >= maxPoolPassengers) continue;
            if (aboard.stream().anyMatch(p -> p.getId().getRiderId().equals(rider))) continue;

            PoolFit fit = poolFit(trip, joiner);
            if (fit == null) continue;

            int newCount = aboard.size() + 1;
            double factor = shareFactor(newCount);
            BigDecimal yourSolo = joiner.getProposedFare();
            BigDecimal yourFare = applyFactor(yourSolo, factor);

            // What the ride costs the person already in it, before and after. The offer says out
            // loud that they gain too — otherwise joining reads as taking something off somebody.
            TripPassenger first = aboard.get(0);
            BigDecimal theirNow = first.getLockedFare();
            BigDecimal theirNext = min(theirNow, applyFactor(first.getSoloFare(), factor));

            Bid winning = bidRepo.findTopByRequestIdAndStatusOrderByCreatedAtDesc(
                trip.getRequest().getId(), Bid.BidStatus.ACCEPTED).orElse(null);
            double[] car = carPosition(trip);

            offers.add(new PoolOffer(
                trip.getId(), trip.getDriverId(),
                winning != null ? winning.getDriverName() : null,
                winning != null ? winning.getVehicle() : null,
                winning != null ? winning.getPlate() : null,
                car[0], car[1],
                trip.getRequest().getDest().getY(), trip.getRequest().getDest().getX(),
                yourFare, yourSolo, theirNow, theirNext, savingPct(yourSolo, yourFare),
                aboard.size(), fit.detourKm(), fit.destGapKm(), ruleVersion));
        }
        // Least detour first: the closest car is both the soonest pickup and the one whose driver
        // is least inconvenienced.
        offers.sort(Comparator.comparingDouble(PoolOffer::detourKm));
        return offers;
    }

    /**
     * The rider steps into a shared ride already under way.
     *
     * <p>Every check {@link #poolOffers} made runs again here, because the offer list is a poll of
     * a moving world: between it being drawn and the tap landing, the car can fill up, the trip can
     * finish, and the rider's own request can be matched to a driver. The list is a suggestion;
     * this is the decision.
     */
    public PoolJoinResponse poolJoin(UUID tripId, String riderId, PoolJoinRequest req) {
        UUID rider = UUID.fromString(riderId);
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));

        RideRequest joining = requestRepo.findById(req.getRequestId())
            .orElseThrow(() -> new IllegalStateException("Ride request not found"));

        // The request must belong to the caller — nobody matchmakes on someone else's behalf.
        if (!joining.getRiderId().equals(rider)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your ride request");
        }
        if (rider.equals(trip.getDriverId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You are driving this trip");
        }
        if (!trip.isShared() || trip.getRequest().getKind() != RideRequest.Kind.RIDE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This ride isn't shared.");
        }
        if (trip.getStatus() != Trip.Status.MATCHED
                && trip.getStatus() != Trip.Status.ENROUTE
                && trip.getStatus() != Trip.Status.STARTED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That ride has already finished.");
        }
        if (!isPoolable(joining)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "This request can no longer join a shared ride.");
        }
        if (passengerRepo.findByRequestId(joining.getId()).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You're already on a ride.");
        }

        List<TripPassenger> aboard = passengerRepo.findByIdTripIdOrderByPickupSeqAsc(tripId);
        if (aboard.size() >= maxPoolPassengers) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That ride is full.");
        }
        if (aboard.stream().anyMatch(p -> p.getId().getRiderId().equals(rider))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You're already on this ride.");
        }
        if (poolFit(trip, joining) == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "That ride is no longer going your way.");
        }

        TripPassenger passenger = new TripPassenger();
        passenger.setId(new TripPassenger.TripPassengerId(tripId, rider));
        passenger.setTrip(trip);
        passenger.setRequestId(joining.getId());
        passenger.setSoloFare(joining.getProposedFare());
        // Set to the solo fare and immediately discounted by repriceTrip below, which prices
        // everyone on board by the same rule rather than treating the newcomer as a special case.
        passenger.setLockedFare(joining.getProposedFare());
        passenger.setJoinDistanceKm(BigDecimal.valueOf(haversineKm(
                joining.getOrigin().getY(), joining.getOrigin().getX(),
                joining.getDest().getY(), joining.getDest().getX()))
            .setScale(3, RoundingMode.HALF_UP));
        passenger.setPickupSeq((short) (aboard.size() + 1));
        passenger.setRuleVersion(ruleVersion);
        passengerRepo.save(passenger);

        joining.setStatus(RideRequest.Status.MATCHED);
        requestRepo.save(joining);

        // Drivers who bid on this request are still sat waiting on an answer. The rider has taken
        // a different ride, so tell them — otherwise they hold their offer open for a passenger
        // who is already in somebody else's car.
        for (Bid pending : bidRepo.findByRequestIdAndStatus(joining.getId(), Bid.BidStatus.PENDING)) {
            pending.setStatus(Bid.BidStatus.REJECTED);
            bidRepo.save(pending);
        }

        repriceTrip(trip);

        TripPassenger saved = passengerRepo.findByRequestId(joining.getId()).orElse(passenger);
        int count = aboard.size() + 1;

        // Somebody is now getting into a moving car. The driver has a new pickup they did not have
        // a minute ago, and the passenger already aboard is about to be joined by a stranger and
        // to pay less for it — neither of them is watching a screen for this.
        notifyClient.send(trip.getDriverId(), "New shared passenger",
            "Someone joined your shared ride. Check your trip for the extra pickup.");
        for (TripPassenger other : aboard) {
            notifyClient.send(other.getId().getRiderId(), "Someone's sharing your ride",
                "Your fare is now GH₵ " + other.getLockedFare() + " — you're picking up one more passenger on the way.");
        }

        log.info("[POOL] rider={} joined trip={} fare={} (solo {}) passengers={} rule={}",
            riderId, tripId, saved.getLockedFare(), saved.getSoloFare(), count, ruleVersion);
        return new PoolJoinResponse(tripId, saved.getLockedFare(), saved.getSoloFare(), count, ruleVersion);
    }

    /**
     * The driver confirms a passenger has got into the car.
     *
     * <p>The booking passenger is stamped automatically when the trip goes STARTED — that is what
     * that transition already means. This exists for everybody who joined afterwards: they board at
     * their own kerb, minutes later, on a trip that is already under way, so no trip-level status
     * can speak for them.
     *
     * <p>It is the driver's own protection. Until they confirm it, the passenger can still walk
     * away; after it, the fare is owed. Only allowed once the car is actually moving
     * (ENROUTE/STARTED), so a driver cannot mark somebody aboard the moment they are matched and
     * strand them before ever setting off.
     */
    public TripPassengerResponse markPickedUp(UUID tripId, String driverId, UUID riderId) {
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));
        if (trip.getDriverId() == null || !trip.getDriverId().equals(UUID.fromString(driverId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your trip");
        }
        if (trip.getStatus() != Trip.Status.ENROUTE && trip.getStatus() != Trip.Status.STARTED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "You can only pick someone up once you're on the road.");
        }
        TripPassenger p = passengerRepo
            .findById(new TripPassenger.TripPassengerId(tripId, riderId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "That passenger isn't on this trip."));

        // Idempotent: a double tap is not an error, and re-stamping would move a time that is now
        // the record of when somebody's exit closed.
        if (p.getPickedUpAt() == null) {
            p.setPickedUpAt(OffsetDateTime.now());
            passengerRepo.save(p);
            // Tell them. Somebody has just been put on the hook for a fare by a stranger's tap, and
            // being told is the precondition for objecting — an unannounced charge is one nobody
            // can contest.
            notifyClient.send(riderId, "You're marked as on board",
                "Your driver confirmed you're in the car. If you're not, say so in the app.");
            log.info("[POOL] driver={} picked up rider={} on trip={}", driverId, riderId, tripId);
        }
        return TripPassengerResponse.of(p, requestOf(p, trip), true);
    }

    /**
     * The passenger says they are not in that car.
     *
     * <p>The other half of boarding. Confirming a pickup puts a fare on somebody by one person's
     * assertion; this is how the person it lands on answers back.
     *
     * <p>⚠️ It deliberately does <b>not</b> clear the boarding flag. A dispute that un-boarded on
     * demand would be the free-ride hole entered from the passenger's side: ride the whole way,
     * object at the drop-off, walk away. What it does is put the objection on the record, tell the
     * driver — who can fix it in one tap and, once a dispute is open, may do so at any time rather
     * than only inside the usual short window — and make it visible to an admin if they disagree.
     */
    public TripPassengerResponse disputePickup(UUID tripId, String riderId, String note) {
        UUID rider = UUID.fromString(riderId);
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));
        TripPassenger me = passengerRepo
            .findById(new TripPassenger.TripPassengerId(tripId, rider))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "You're not on this ride"));

        if (me.getPickedUpAt() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "You're not marked as on board, so there's nothing to dispute.");
        }
        if (me.getPaymentStatus() != Trip.PaymentStatus.UNPAID) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "You've already paid for this ride — contact support.");
        }
        // Raising it twice is not two disputes. Keep the first timestamp: it is the record of when
        // the objection was made, which is the fact that matters if this is ever adjudicated.
        // A dispute that was already settled and is being raised again IS new, though — clear the
        // resolution so it re-enters the queue rather than looking answered.
        if (!me.hasOpenPickupDispute()) {
            me.setPickupDisputedAt(OffsetDateTime.now());
            me.setPickupDisputeResolvedAt(null);
            me.setPickupDisputeOutcome(null);
        }
        me.setPickupDisputeNote(trimToNull(note));
        passengerRepo.save(me);

        notifyClient.send(trip.getDriverId(), "A passenger disputes their pickup",
            "Someone says they're not in your car. If that's right, undo the pickup in your trip.");
        log.warn("[POOL] rider={} disputes pickup on trip={} note={}", riderId, tripId, me.getPickupDisputeNote());
        return TripPassengerResponse.of(me, requestOf(me, trip), false);
    }

    /** Admin: pickup disputes, so a driver refusing to correct one is not the end of it. */
    @Transactional(readOnly = true)
    public List<PickupDisputeResponse> listPickupDisputes(boolean openOnly) {
        return passengerRepo.findDisputes(openOnly).stream()
            .map(p -> {
                Trip trip = p.getTrip();
                RideRequest r = requestOf(p, trip);
                Bid winning = bidRepo.findTopByRequestIdAndStatusOrderByCreatedAtDesc(
                    trip.getRequest().getId(), Bid.BidStatus.ACCEPTED).orElse(null);
                return PickupDisputeResponse.of(p, trip, r, winning);
            })
            .toList();
    }

    /**
     * Admin settles a pickup dispute.
     *
     * <p>The backstop, and the only path that exists when the driver will not correct one
     * themselves. Two outcomes, and they are not symmetric: upholding takes the passenger off the
     * ride's books, refusing leaves them on it. So a refusal has to say why — the passenger reads
     * it, and "your objection was rejected" with no reason is not an answer.
     *
     * <p>Either way the dispute is marked resolved rather than deleted. What was claimed and what
     * was decided both stay on the row.
     */
    public PickupDisputeResponse resolvePickupDispute(UUID tripId, UUID riderId,
                                                      boolean uphold, String note) {
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));
        TripPassenger p = passengerRepo
            .findById(new TripPassenger.TripPassengerId(tripId, riderId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "That passenger isn't on this trip."));
        if (!p.hasOpenPickupDispute()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "There's no open dispute on that passenger.");
        }
        String reason = trimToNull(note);
        if (!uphold && reason == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Say why the dispute is being refused — the passenger reads it.");
        }

        if (uphold) {
            // Their word is taken: off the ride's books, and free to leave again.
            p.setPickedUpAt(null);
            p.setPickupDisputeOutcome("UPHELD" + (reason != null ? " — " + reason : ""));
            notifyClient.send(riderId, "Your dispute was upheld",
                "You're no longer marked as being in that car"
                    + (reason != null ? ". " + reason : "."));
            notifyClient.send(trip.getDriverId(), "A pickup was reversed",
                "Support reviewed a passenger's dispute and removed them from your trip.");
        } else {
            p.setPickupDisputeOutcome("REJECTED — " + reason);
            notifyClient.send(riderId, "Your dispute was reviewed",
                "We've looked into it and you remain on this ride. " + reason);
        }
        p.setPickupDisputeResolvedAt(OffsetDateTime.now());
        passengerRepo.save(p);

        // Upholding one moves money away from a driver, so it belongs in the log at WARN with both
        // parties named — this is the entry someone reads when a driver asks why they were docked.
        log.warn("[POOL] admin resolved pickup dispute trip={} rider={} outcome={}",
            tripId, riderId, p.getPickupDisputeOutcome());

        RideRequest r = requestOf(p, trip);
        Bid winning = bidRepo.findTopByRequestIdAndStatusOrderByCreatedAtDesc(
            trip.getRequest().getId(), Bid.BidStatus.ACCEPTED).orElse(null);
        return PickupDisputeResponse.of(p, trip, r, winning);
    }

    /**
     * The driver takes back a pickup they confirmed by mistake.
     *
     * <p>Confirming a pickup closes the passenger's exit, so a mis-tap traps somebody in a ride
     * they are not in and will be billed for. That was a real hole and this is the way out of it.
     *
     * <p>Time-boxed on purpose. A mis-tap is noticed in seconds; an open-ended undo would turn "you
     * are aboard and owe the fare" into something revocable at any point in the journey, which is
     * the protection it replaced. After the window the message points at support, because a wrong
     * fare an hour later is a refund question and refunds are not built here.
     *
     * <p>Blocked once they have paid — at that point there is nothing left to undo, and a passenger
     * who has settled cannot be un-boarded into being able to walk away from it.
     */
    public TripPassengerResponse undoPickup(UUID tripId, String driverId, UUID riderId) {
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));
        if (trip.getDriverId() == null || !trip.getDriverId().equals(UUID.fromString(driverId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your trip");
        }
        if (trip.getStatus() == Trip.Status.COMPLETED || trip.getStatus() == Trip.Status.CANCELLED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "That trip is finished — contact support to correct a fare.");
        }
        TripPassenger p = passengerRepo
            .findById(new TripPassenger.TripPassengerId(tripId, riderId))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "That passenger isn't on this trip."));
        if (p.getPickedUpAt() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "They aren't marked as on board.");
        }
        if (p.getPaymentStatus() != Trip.PaymentStatus.UNPAID) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "They've already paid — contact support.");
        }
        // The window exists to stop a driver revoking "aboard and owes the fare" late and
        // unilaterally. A passenger who has objected makes it neither late nor unilateral — they
        // are asking for exactly this — so an open dispute lifts the clock. Without that, somebody
        // wrongly marked aboard who notices at minute six is still stuck, which is the whole
        // problem this was meant to solve.
        boolean disputed = p.hasOpenPickupDispute();
        if (!disputed && p.getPickedUpAt().isBefore(OffsetDateTime.now().minusSeconds(pickupUndoSeconds))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Too late to undo that pickup — contact support.");
        }

        p.setPickedUpAt(null);
        // The objection has been answered, so it leaves the admin queue — but it is marked settled
        // rather than deleted. The claim and the fact that the driver conceded it both stay on the
        // row, which is the whole point of keeping a record of an argument about money.
        if (disputed) {
            p.setPickupDisputeResolvedAt(OffsetDateTime.now());
            p.setPickupDisputeOutcome("UPHELD — the driver undid the pickup themselves");
        }
        passengerRepo.save(p);
        if (disputed) {
            notifyClient.send(p.getId().getRiderId(), "Your driver corrected it",
                "You're no longer marked as being in that car.");
        }
        // Worth a line in the log on its own: this is the one action that re-opens somebody's exit
        // after it closed, so if a fare is ever disputed this is where the story starts.
        log.info("[POOL] driver={} undid pickup of rider={} on trip={}", driverId, riderId, tripId);
        return TripPassengerResponse.of(p, requestOf(p, trip), true);
    }

    /**
     * A joiner changes their mind and gets out.
     *
     * <p>Deliberately not "cancel the trip". A shared ride belongs to the person who booked it, and
     * somebody who stepped into it must be able to leave without ending a journey the other
     * passenger is halfway through — which is exactly what cancelling would do, and why
     * {@code updateTripStatus} only lets the booking passenger cancel. The two are different
     * operations because they have different victims.
     *
     * <p>Leaving unwinds the join: the seat goes, the request is CANCELLED, and everyone left
     * aboard is re-priced for the smaller car. That last part is the reason the pricing rule is a
     * ceiling rather than a ratchet — the remaining passenger's fare returns to what they agreed at
     * booking, and the driver is not left carrying somebody for less than the job they accepted.
     *
     * <p>Only before boarding. Once the driver has confirmed this person is in the car
     * ({@link #markPickedUp}) the exit closes, or a passenger could ride the whole way and then
     * leave rather than pay.
     */
    public void leavePool(UUID tripId, String riderId) {
        UUID rider = UUID.fromString(riderId);
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));

        TripPassenger me = passengerRepo
            .findById(new TripPassenger.TripPassengerId(tripId, rider))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "You're not on this ride"));

        // The person who booked cannot "leave" their own ride — for them the operation is
        // cancelling it, which already exists and which they alone are allowed to do.
        if (me.getPickupSeq() <= 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "This is your ride — cancel it instead of leaving it.");
        }
        if (trip.getStatus() == Trip.Status.COMPLETED || trip.getStatus() == Trip.Status.CANCELLED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That ride has already finished.");
        }
        // The exit closes at the car door. Without this, a passenger could be driven the whole way
        // and then "leave" instead of paying — the fare is only collected at the end, so leaving
        // late is indistinguishable from a free ride.
        if (me.getPickedUpAt() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "You're already on this ride — speak to your driver.");
        }
        // Money already handed over is a refund, and refunds are not built. Blocking here is
        // honest; silently dropping the seat and keeping the payment would not be.
        if (me.getPaymentStatus() != Trip.PaymentStatus.UNPAID) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "You've already paid for this ride — contact support.");
        }

        passengerRepo.delete(me);

        // Their request is finished, not free again. Re-opening it would look right and then die
        // quietly: an immediate request expires on `created_at`, so one that has been sitting in a
        // car for ten minutes is already past its TTL and the next sweep would kill it.
        if (me.getRequestId() != null) {
            requestRepo.findById(me.getRequestId()).ifPresent(r -> {
                r.setStatus(RideRequest.Status.CANCELLED);
                requestRepo.save(r);
            });
        }

        repriceTrip(trip);

        // The driver is on their way to a kerb where nobody is now standing, and the remaining
        // passenger's fare has just moved through no act of their own. Both need telling.
        notifyClient.send(trip.getDriverId(), "A shared passenger left",
            "One of your shared passengers cancelled. That pickup is off — check your trip.");
        for (TripPassenger other : passengerRepo.findByIdTripIdOrderByPickupSeqAsc(tripId)) {
            notifyClient.send(other.getId().getRiderId(), "Your shared ride changed",
                "The other passenger cancelled. Your fare is now GH₵ " + other.getLockedFare() + ".");
        }

        log.info("[POOL] rider={} left trip={} — {} passenger(s) remain, fare now {}",
            riderId, tripId, passengerRepo.countByIdTripId(tripId), trip.getAgreedFare());
    }

    /**
     * The other direction: open requests this driver could pick up on their way.
     *
     * <p>Same matcher as the rider's offer list, so the two screens can never disagree about
     * whether a pairing is possible. Informational — a driver cannot seat somebody who has not
     * chosen to share; only {@link #poolJoin}, called by the rider, puts anybody in the car.
     */
    @Transactional(readOnly = true)
    public List<RideRequestResponse> poolCandidates(UUID tripId, String userId) {
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));
        if (trip.getDriverId() == null || !trip.getDriverId().equals(UUID.fromString(userId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your trip");
        }
        // A courier on a parcel run is never offered passengers, and an ordinary trip's passenger
        // never agreed to share their car.
        if (!trip.isShared() || trip.getRequest().getKind() != RideRequest.Kind.RIDE) return List.of();
        if (passengerRepo.countByIdTripId(tripId) >= maxPoolPassengers) return List.of();

        Point dest = trip.getRequest().getDest();
        // Cast the net at the destination gap and let poolFit apply the real rules — the radius
        // query is a cheap pre-filter, not the match.
        return requestRepo.findNearby(dest.getY(), dest.getX(), maxPoolDistanceKm, requestTtlSeconds)
            .stream()
            .filter(this::isPoolable)
            .filter(r -> poolFit(trip, r) != null)
            .map(RideRequestResponse::from)
            .toList();
    }

    /**
     * Who is on a trip. For the driver: the pickups to make and the fares to collect, with phone
     * numbers. For a passenger: who they are sharing with, without them.
     */
    @Transactional(readOnly = true)
    public List<TripPassengerResponse> tripPassengers(UUID tripId, String userId) {
        UUID actor = UUID.fromString(userId);
        Trip trip = tripRepo.findById(tripId)
            .orElseThrow(() -> new IllegalStateException("Trip not found"));
        boolean isDriver = trip.getDriverId() != null && trip.getDriverId().equals(actor);
        boolean isPassenger = passengerRepo.existsById(new TripPassenger.TripPassengerId(tripId, actor));
        if (!isDriver && !isPassenger) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your trip");
        }
        return passengerRepo.findByIdTripIdOrderByPickupSeqAsc(tripId).stream()
            .map(p -> {
                RideRequest r = requestOf(p, trip);
                return r == null ? null : TripPassengerResponse.of(p, r, isDriver);
            })
            .filter(java.util.Objects::nonNull)
            .toList();
    }

    /** Can this request join a shared ride at all? */
    private boolean isPoolable(RideRequest r) {
        return r.isShared()
            && r.getStatus() == RideRequest.Status.OPEN
            && r.getKind() == RideRequest.Kind.RIDE
            && r.getRideType() == RideRequest.RideType.STANDARD
            // A ride booked for this evening cannot be put into a car that is moving now.
            && (r.getScheduledAt() == null || !r.getScheduledAt().isAfter(OffsetDateTime.now()));
    }

    /**
     * Does this request fit that trip's remaining journey? Returns the geometry when it does.
     *
     * <p>Three gates, and all three are needed. The destination gap alone would seat somebody
     * heading to the same suburb from the opposite side of the city; the detour alone would seat
     * somebody standing on the route but travelling the other way; the bearing alone says nothing
     * about how far out of the way anyone is.
     */
    private PoolFit poolFit(Trip trip, RideRequest joiner) {
        RideRequest booked = trip.getRequest();
        double destLat = booked.getDest().getY(), destLng = booked.getDest().getX();
        double jFromLat = joiner.getOrigin().getY(), jFromLng = joiner.getOrigin().getX();
        double jToLat = joiner.getDest().getY(), jToLng = joiner.getDest().getX();

        double destGapKm = haversineKm(jToLat, jToLng, destLat, destLng);
        if (destGapKm > maxPoolDistanceKm) return null;

        double[] car = carPosition(trip);

        // Only the road still to be driven counts. Before the first pickup that is
        // car → pickup → destination; once the passenger is aboard the pickup is behind us and the
        // leg is simply car → destination. Measuring against the original whole route would offer
        // the driver a detour to somewhere they drove past ten minutes ago.
        boolean beforeFirstPickup = trip.getStatus() == Trip.Status.MATCHED
                                 || trip.getStatus() == Trip.Status.ENROUTE;
        double bookedFromLat = booked.getOrigin().getY(), bookedFromLng = booked.getOrigin().getX();
        double detourKm = beforeFirstPickup
            ? Math.min(
                segmentDistanceKm(jFromLat, jFromLng, car[0], car[1], bookedFromLat, bookedFromLng),
                segmentDistanceKm(jFromLat, jFromLng, bookedFromLat, bookedFromLng, destLat, destLng))
            : segmentDistanceKm(jFromLat, jFromLng, car[0], car[1], destLat, destLng);
        if (detourKm > maxPoolDetourKm) return null;

        // Same road, opposite way is not a match — and it is the failure mode a distance-only rule
        // produces constantly, because a dual carriageway puts both directions within metres.
        double carBearing = bearingDeg(car[0], car[1], destLat, destLng);
        double joinerBearing = bearingDeg(jFromLat, jFromLng, jToLat, jToLng);
        if (bearingGapDeg(carBearing, joinerBearing) > maxPoolBearingDeg) return null;

        return new PoolFit(round3(detourKm), round3(destGapKm));
    }

    /**
     * Where the car actually is.
     *
     * <p>The driver's last GPS ping when it is recent, the trip's pickup point otherwise. A
     * position from an hour ago is worse than no position: it would measure the corridor from
     * somewhere the car has long left, and every answer downstream would be confidently wrong.
     */
    private double[] carPosition(Trip trip) {
        return locationRepo.findById(trip.getDriverId())
            .filter(l -> l.getUpdatedAt() != null
                      && l.getUpdatedAt().isAfter(OffsetDateTime.now().minusMinutes(5)))
            .map(l -> new double[] { l.getPoint().getY(), l.getPoint().getX() })
            .orElseGet(() -> new double[] {
                trip.getRequest().getOrigin().getY(), trip.getRequest().getOrigin().getX() });
    }

    /**
     * What fraction of their solo fare each passenger pays when {@code passengers} share the car.
     *
     * <p>Everyone pays the same fraction of their own quote, so a long trip still costs more than
     * a short one and nobody subsidises anybody. Two at 75% hands the driver 150% of a single
     * fare — the discount comes out of the extra passenger, not out of the driver's pocket, which
     * is the only version of this that a driver would ever agree to.
     */
    private double shareFactor(int passengers) {
        if (passengers <= 1) return 1.0;
        return Math.max(poolMinDiscountFactor, 1.0 - poolDiscountPerExtra * (passengers - 1));
    }

    /**
     * Re-price every passenger for the current occupancy and re-total the driver's fare.
     *
     * <p>Always recomputed from {@code soloFare}, never from the current locked fare, so discounts
     * cannot compound: applying 75% twice would put a third passenger on 56% of their own quote.
     *
     * <p>The guarantee is a <b>ceiling, not a ratchet</b>. Occupancy moves in both directions —
     * people join, and people change their minds — so the fare follows it both ways, capped at what
     * each passenger agreed when they booked. A one-way "downward only" rule reads kinder and is
     * worse: when a joiner leaves, it would strand the remaining passenger's discount and hand the
     * driver less than the job they accepted, so a stranger's change of mind would come out of the
     * driver's pocket. A discount unwinding to the price you already accepted is not a surprise;
     * being charged more than you accepted would be, and the cap makes that impossible.
     *
     * <p>A deliberate departure from "locked_fare is never recomputed" in the playbook.
     */
    private void repriceTrip(Trip trip) {
        List<TripPassenger> all = passengerRepo.findByIdTripIdOrderByPickupSeqAsc(trip.getId());
        if (all.isEmpty()) return;
        double factor = shareFactor(all.size());
        BigDecimal total = BigDecimal.ZERO;
        for (TripPassenger p : all) {
            // Somebody who has already handed over money is not re-quoted; refunds are a different
            // conversation and this is not the place to start one.
            if (p.getPaymentStatus() != Trip.PaymentStatus.PAID) {
                // The ceiling is the whole guarantee. Occupancy goes both ways — people join and
                // people change their minds — so the fare tracks it in both directions, but it can
                // never climb past what this passenger agreed to when they booked. A discount
                // unwinding back to the price you accepted is not a surprise; being charged more
                // than you accepted would be.
                p.setLockedFare(min(applyFactor(p.getSoloFare(), factor), p.getSoloFare()));
                p.setRuleVersion(ruleVersion);
                passengerRepo.save(p);
            }
            total = total.add(p.getLockedFare());
        }
        trip.setAgreedFare(total);
        tripRepo.save(trip);
    }

    /** The request a passenger boarded with — the trip's own for whoever booked it. */
    private RideRequest requestOf(TripPassenger p, Trip trip) {
        if (p.getRequestId() == null) return trip.getRequest();
        return requestRepo.findById(p.getRequestId()).orElse(trip.getRequest());
    }

    private static BigDecimal applyFactor(BigDecimal fare, double factor) {
        return fare.multiply(BigDecimal.valueOf(factor)).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal min(BigDecimal a, BigDecimal b) {
        return a.compareTo(b) <= 0 ? a : b;
    }

    private static int savingPct(BigDecimal solo, BigDecimal shared) {
        if (solo == null || solo.signum() <= 0) return 0;
        return solo.subtract(shared)
            .multiply(BigDecimal.valueOf(100))
            .divide(solo, 0, RoundingMode.HALF_UP)
            .intValue();
    }

    private static double round3(double v) { return Math.round(v * 1000.0) / 1000.0; }

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
     * How many ratings before an average is worth showing.
     *
     * <p>Below this the client is told there is no average yet and shows "New driver". A single
     * rough night would otherwise put a brand-new driver on 1.0 and finish them, which is a worse
     * lie than the hardcoded 4.9 this replaces — that one at least was not actively unfair.
     */
    private static final int MIN_RATINGS_TO_AVERAGE = 3;

    /** Someone's rating, rounded to one decimal — null until enough people have rated them. */
    @Transactional(readOnly = true)
    public RatingSummary ratingFor(UUID userId) {
        long count = ratingRepo.countByRateeId(userId);
        Double avg = count >= MIN_RATINGS_TO_AVERAGE ? ratingRepo.avgScoreForRatee(userId) : null;
        Double rounded = avg == null ? null : Math.round(avg * 10.0) / 10.0;
        return new RatingSummary(userId, rounded, count);
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

    // ── Corridor geometry (pooling) ─────────────────────────────────────────────
    //
    // Flat-Earth arithmetic on purpose. Across one city the error from treating a degree of
    // latitude as a fixed number of kilometres is centimetres, and the alternative — great-circle
    // cross-track distance — is far harder to read for an answer nobody could measure the
    // difference in. Anything continental would need the real thing.

    /** Degrees → kilometres in a local plane centred on {@code refLat}. */
    private static double[] toKmXY(double lat, double lng, double refLat) {
        double kmPerDegLat = 111.32;
        double kmPerDegLng = 111.32 * Math.cos(Math.toRadians(refLat));
        return new double[] { lng * kmPerDegLng, lat * kmPerDegLat };
    }

    /**
     * Shortest distance in km from a point to the line SEGMENT a→b.
     *
     * <p>A segment rather than an infinite line, and that matters: the parameter is clamped to
     * [0,1], so a pickup behind the car measures its distance to the car itself instead of to an
     * imaginary road stretching backwards. Somebody 300 m behind is a small reverse, somebody 8 km
     * behind is not on the route — which is exactly the distinction the clamp produces for free.
     */
    private static double segmentDistanceKm(double pLat, double pLng,
                                            double aLat, double aLng,
                                            double bLat, double bLng) {
        double ref = (aLat + bLat) / 2.0;
        double[] p = toKmXY(pLat, pLng, ref);
        double[] a = toKmXY(aLat, aLng, ref);
        double[] b = toKmXY(bLat, bLng, ref);
        double vx = b[0] - a[0], vy = b[1] - a[1];
        double wx = p[0] - a[0], wy = p[1] - a[1];
        double len2 = vx * vx + vy * vy;
        double t = len2 <= 1e-9 ? 0.0 : Math.max(0.0, Math.min(1.0, (wx * vx + wy * vy) / len2));
        return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
    }

    /** Initial great-circle bearing a→b, degrees clockwise from north. */
    private static double bearingDeg(double lat1, double lng1, double lat2, double lng2) {
        double dLng = Math.toRadians(lng2 - lng1);
        double la1 = Math.toRadians(lat1), la2 = Math.toRadians(lat2);
        double y = Math.sin(dLng) * Math.cos(la2);
        double x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
        return (Math.toDegrees(Math.atan2(y, x)) + 360.0) % 360.0;
    }

    /** Smaller angle between two bearings, 0–180 — so 350° and 10° are 20° apart, not 340°. */
    private static double bearingGapDeg(double a, double b) {
        double d = Math.abs(a - b) % 360.0;
        return d > 180.0 ? 360.0 - d : d;
    }
}
