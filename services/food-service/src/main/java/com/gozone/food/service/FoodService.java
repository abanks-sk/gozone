package com.gozone.food.service;

import com.gozone.food.dto.*;
import com.gozone.food.model.*;
import com.gozone.food.repository.*;
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
public class FoodService {

    private static final Logger log = LoggerFactory.getLogger(FoodService.class);

    private final RestaurantRepository restaurantRepo;
    private final MenuItemRepository menuItemRepo;
    private final OrderRepository orderRepo;
    private final DeliveryRepository deliveryRepo;
    private final QueueEntryRepository queueRepo;
    private final FoodRatingRepository ratingRepo;
    private final SimpMessagingTemplate messaging;
    private final WalletClient walletClient;

    @Value("${app.delivery.base-fee:2.00}")
    private BigDecimal deliveryBaseFee;

    @Value("${app.delivery.fee-per-km:1.50}")
    private BigDecimal deliveryFeePerKm;

    public FoodService(RestaurantRepository restaurantRepo,
                       MenuItemRepository menuItemRepo,
                       OrderRepository orderRepo,
                       DeliveryRepository deliveryRepo,
                       QueueEntryRepository queueRepo,
                       FoodRatingRepository ratingRepo,
                       SimpMessagingTemplate messaging,
                       WalletClient walletClient) {
        this.restaurantRepo = restaurantRepo;
        this.menuItemRepo   = menuItemRepo;
        this.orderRepo      = orderRepo;
        this.deliveryRepo   = deliveryRepo;
        this.queueRepo      = queueRepo;
        this.ratingRepo     = ratingRepo;
        this.messaging      = messaging;
        this.walletClient   = walletClient;
    }

    // ── Restaurants ───────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<RestaurantResponse> listOpenRestaurants() {
        return restaurantRepo.findByStatus(Restaurant.Status.OPEN)
            .stream().map(RestaurantResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<MenuItemResponse> getMenu(UUID restaurantId) {
        return menuItemRepo.findByRestaurantIdAndAvailableTrue(restaurantId)
            .stream().map(MenuItemResponse::from).toList();
    }

    // ── Orders ────────────────────────────────────────────────────────────────

    public OrderResponse placeOrder(String customerId, PlaceOrderRequest req) {
        Restaurant restaurant = restaurantRepo.findById(req.getRestaurantId())
            .orElseThrow(() -> new IllegalStateException("Restaurant not found"));

        Order.Mode mode = Order.Mode.valueOf(req.getMode().toUpperCase());

        if (mode == Order.Mode.DELIVERY && (req.getDeliveryAddr() == null || req.getDeliveryAddr().isBlank())) {
            throw new IllegalArgumentException("deliveryAddr required for DELIVERY orders");
        }

        Order order = new Order();
        order.setCustomerId(UUID.fromString(customerId));
        order.setRestaurant(restaurant);
        order.setMode(mode);
        order.setDeliveryAddr(req.getDeliveryAddr());

        BigDecimal subtotal = BigDecimal.ZERO;
        for (PlaceOrderRequest.LineItem line : req.getItems()) {
            MenuItem item = menuItemRepo.findById(line.getMenuItemId())
                .orElseThrow(() -> new IllegalStateException("Menu item not found: " + line.getMenuItemId()));
            if (!item.isAvailable()) {
                throw new IllegalStateException("Item not available: " + item.getName());
            }
            OrderItem oi = new OrderItem();
            oi.setOrder(order);
            oi.setMenuItem(item);
            oi.setQty(line.getQty());
            oi.setUnitPrice(item.getPrice());
            order.getItems().add(oi);
            subtotal = subtotal.add(item.getPrice().multiply(BigDecimal.valueOf(line.getQty())));
        }

        BigDecimal fee = mode == Order.Mode.DELIVERY ? deliveryBaseFee : BigDecimal.ZERO;
        order.setDeliveryFee(fee);
        order.setTotal(subtotal.add(fee));
        orderRepo.save(order);

        // Auto-enqueue walk-in orders
        if (mode == Order.Mode.WALKIN) {
            joinQueue(restaurant, order);
        }

        log.info("[FOOD] order placed id={} customer={} mode={} total={}", order.getId(), customerId, mode, order.getTotal());
        return OrderResponse.from(order);
    }

    @Transactional(readOnly = true)
    public OrderResponse getOrder(UUID orderId, String userId) {
        Order order = orderRepo.findById(orderId)
            .orElseThrow(() -> new IllegalStateException("Order not found"));
        return OrderResponse.from(order);
    }

    @Transactional(readOnly = true)
    public List<OrderResponse> myOrders(String customerId) {
        return orderRepo.findByCustomerIdOrderByCreatedAtDesc(UUID.fromString(customerId))
            .stream().map(OrderResponse::from).toList();
    }

    /** Restaurant dashboard: all active orders for the restaurant. */
    @Transactional(readOnly = true)
    public List<OrderResponse> restaurantOrders(UUID restaurantId) {
        return orderRepo.findByRestaurantIdAndStatusNotOrderByCreatedAtDesc(restaurantId, Order.Status.COMPLETED)
            .stream().map(OrderResponse::from).toList();
    }

    /** Restaurant owner advances order status. */
    public OrderResponse advanceStatus(UUID orderId, String ownerId, AdvanceStatusRequest req) {
        Order order = orderRepo.findById(orderId)
            .orElseThrow(() -> new IllegalStateException("Order not found"));

        Order.Status newStatus = Order.Status.valueOf(req.getStatus().toUpperCase());
        validateOrderTransition(order.getStatus(), newStatus, order.getMode());
        order.setStatus(newStatus);
        orderRepo.save(order);

        // On READY for delivery orders, create delivery record (courier assignment is manual in demo)
        if (newStatus == Order.Status.READY && order.getMode() == Order.Mode.DELIVERY) {
            if (deliveryRepo.findByOrderId(order.getId()).isEmpty()) {
                Delivery delivery = new Delivery();
                delivery.setOrder(order);
                delivery.setAssignedAt(OffsetDateTime.now());
                deliveryRepo.save(delivery);
                log.info("[FOOD] delivery created for order={}", orderId);
            }
        }

        if (newStatus == Order.Status.COMPLETED) {
            onOrderCompleted(order);
        }

        // Broadcast queue update for walkin
        if (order.getMode() == Order.Mode.WALKIN) {
            broadcastQueueUpdate(order.getRestaurant().getId());
        }

        return OrderResponse.from(order);
    }

    // ── Delivery courier tracking ──────────────────────────────────────────────

    /** Courier advances delivery state and pushes location over WebSocket. */
    public void updateDeliveryLocation(String courierId, CourierLocationUpdate dto) {
        // Broadcast over the delivery topic — reuses same WebSocket primitive as ride tracking
        messaging.convertAndSend(
            "/topic/delivery/" + dto.getDeliveryId() + "/location",
            Map.of("lat", dto.getLat(), "lng", dto.getLng(), "courierId", courierId)
        );
        log.debug("[FOOD] courier loc id={} lat={} lng={}", dto.getDeliveryId(), dto.getLat(), dto.getLng());
    }

    public void advanceDeliveryStatus(UUID deliveryId, String courierId, String status) {
        Delivery delivery = deliveryRepo.findById(deliveryId)
            .orElseThrow(() -> new IllegalStateException("Delivery not found"));

        Delivery.Status newStatus = Delivery.Status.valueOf(status.toUpperCase());
        delivery.setStatus(newStatus);

        if (newStatus == Delivery.Status.DELIVERED) {
            delivery.setDeliveredAt(OffsetDateTime.now());
            // Advance order to COMPLETED
            Order order = delivery.getOrder();
            order.setStatus(Order.Status.COMPLETED);
            orderRepo.save(order);
            onOrderCompleted(order);
        }
        deliveryRepo.save(delivery);
    }

    // ── Walk-in queue ─────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<QueuePositionResponse> getQueue(UUID restaurantId) {
        return queueRepo.findByRestaurantIdAndStatusOrderByPosition(restaurantId, QueueEntry.Status.WAITING)
            .stream()
            .map(e -> new QueuePositionResponse(
                e.getId(), e.getPosition(), e.getStatus().name(),
                e.getOrder() != null ? e.getOrder().getId() : null))
            .toList();
    }

    @Transactional(readOnly = true)
    public QueuePositionResponse myQueuePosition(UUID orderId) {
        QueueEntry entry = queueRepo.findByOrderId(orderId)
            .orElseThrow(() -> new IllegalStateException("No queue entry for this order"));
        return new QueuePositionResponse(
            entry.getId(), entry.getPosition(), entry.getStatus().name(), orderId);
    }

    /** Restaurant staff calls next in queue. */
    public QueuePositionResponse callNext(UUID restaurantId) {
        List<QueueEntry> waiting =
            queueRepo.findByRestaurantIdAndStatusOrderByPosition(restaurantId, QueueEntry.Status.WAITING);

        if (waiting.isEmpty()) throw new IllegalStateException("Queue is empty");

        QueueEntry next = waiting.get(0);
        next.setStatus(QueueEntry.Status.CALLED);
        queueRepo.save(next);

        broadcastQueueUpdate(restaurantId);

        return new QueuePositionResponse(next.getId(), next.getPosition(),
            next.getStatus().name(), next.getOrder() != null ? next.getOrder().getId() : null);
    }

    /** Mark queue entry as served. */
    public void serveQueueEntry(UUID entryId) {
        QueueEntry entry = queueRepo.findById(entryId)
            .orElseThrow(() -> new IllegalStateException("Queue entry not found"));
        entry.setStatus(QueueEntry.Status.SERVED);
        queueRepo.save(entry);
        broadcastQueueUpdate(entry.getRestaurant().getId());
    }

    // ── Ratings ───────────────────────────────────────────────────────────────

    public void rateOrder(UUID orderId, RateFoodRequest req) {
        if (ratingRepo.existsByOrderId(orderId)) {
            throw new IllegalStateException("Already rated this order");
        }
        Order order = orderRepo.findById(orderId)
            .orElseThrow(() -> new IllegalStateException("Order not found"));
        if (order.getStatus() != Order.Status.COMPLETED) {
            throw new IllegalStateException("Can only rate completed orders");
        }
        FoodRating rating = new FoodRating();
        rating.setOrder(order);
        rating.setScore(req.getScore());
        rating.setComment(req.getComment());
        ratingRepo.save(rating);
    }

    // ── private helpers ───────────────────────────────────────────────────────

    private void joinQueue(Restaurant restaurant, Order order) {
        int nextPos = queueRepo.maxPositionForRestaurant(restaurant.getId()) + 1;
        QueueEntry entry = new QueueEntry();
        entry.setRestaurant(restaurant);
        entry.setOrder(order);
        entry.setPosition(nextPos);
        queueRepo.save(entry);
        log.info("[QUEUE] entry pos={} restaurant={} order={}", nextPos, restaurant.getId(), order.getId());
        broadcastQueueUpdate(restaurant.getId());
    }

    private void broadcastQueueUpdate(UUID restaurantId) {
        List<QueueEntry> waiting =
            queueRepo.findByRestaurantIdAndStatusOrderByPosition(restaurantId, QueueEntry.Status.WAITING);
        messaging.convertAndSend(
            "/topic/queue/" + restaurantId,
            Map.of("restaurantId", restaurantId.toString(), "queueLength", waiting.size())
        );
    }

    private void validateOrderTransition(Order.Status current, Order.Status next, Order.Mode mode) {
        boolean valid = switch (current) {
            case PLACED          -> next == Order.Status.CONFIRMED || next == Order.Status.CANCELLED;
            case CONFIRMED       -> next == Order.Status.PREPARING || next == Order.Status.CANCELLED;
            case PREPARING       -> next == Order.Status.READY;
            case READY           -> (mode == Order.Mode.DELIVERY)
                                      ? next == Order.Status.OUT_FOR_DELIVERY
                                      : next == Order.Status.COMPLETED;
            case OUT_FOR_DELIVERY -> next == Order.Status.COMPLETED;
            default -> false;
        };
        if (!valid) {
            throw new IllegalStateException("Invalid order transition: " + current + " → " + next);
        }
    }

    private void onOrderCompleted(Order order) {
        walletClient.settleOrder(
            order.getId(),
            order.getRestaurant().getId(),
            order.getTotal()
        );
    }
}
