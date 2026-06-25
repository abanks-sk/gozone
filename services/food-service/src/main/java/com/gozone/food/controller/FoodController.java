package com.gozone.food.controller;

import com.gozone.food.dto.*;
import com.gozone.food.service.FoodService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Food endpoints. Context-path is /food.
 */
@RestController
public class FoodController {

    private final FoodService foodService;

    public FoodController(FoodService foodService) {
        this.foodService = foodService;
    }

    // ── Restaurants ───────────────────────────────────────────────────────────

    @GetMapping("/restaurants")
    public ResponseEntity<List<RestaurantResponse>> listRestaurants() {
        return ResponseEntity.ok(foodService.listOpenRestaurants());
    }

    @GetMapping("/restaurants/{id}/menu")
    public ResponseEntity<List<MenuItemResponse>> getMenu(@PathVariable UUID id) {
        return ResponseEntity.ok(foodService.getMenu(id));
    }

    // ── Orders ────────────────────────────────────────────────────────────────

    @PostMapping("/orders")
    public ResponseEntity<OrderResponse> placeOrder(
            @AuthenticationPrincipal String customerId,
            @Valid @RequestBody PlaceOrderRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(foodService.placeOrder(customerId, req));
    }

    @GetMapping("/orders/{id}")
    public ResponseEntity<OrderResponse> getOrder(
            @PathVariable UUID id,
            @AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(foodService.getOrder(id, userId));
    }

    @GetMapping("/orders/mine")
    public ResponseEntity<List<OrderResponse>> myOrders(
            @AuthenticationPrincipal String customerId) {
        return ResponseEntity.ok(foodService.myOrders(customerId));
    }

    // ── Restaurant dashboard ──────────────────────────────────────────────────

    @GetMapping("/restaurants/{id}/orders")
    public ResponseEntity<List<OrderResponse>> restaurantOrders(@PathVariable UUID id) {
        return ResponseEntity.ok(foodService.restaurantOrders(id));
    }

    @PatchMapping("/orders/{id}/status")
    public ResponseEntity<OrderResponse> advanceStatus(
            @PathVariable UUID id,
            @AuthenticationPrincipal String ownerId,
            @Valid @RequestBody AdvanceStatusRequest req) {
        return ResponseEntity.ok(foodService.advanceStatus(id, ownerId, req));
    }

    // ── Delivery courier ──────────────────────────────────────────────────────

    @PostMapping("/deliveries/location")
    public ResponseEntity<Void> pushCourierLocation(
            @AuthenticationPrincipal String courierId,
            @Valid @RequestBody CourierLocationUpdate dto) {
        foodService.updateDeliveryLocation(courierId, dto);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/deliveries/{id}/status")
    public ResponseEntity<Map<String, String>> advanceDeliveryStatus(
            @PathVariable UUID id,
            @AuthenticationPrincipal String courierId,
            @RequestBody Map<String, String> body) {
        foodService.advanceDeliveryStatus(id, courierId, body.getOrDefault("status", ""));
        return ResponseEntity.ok(Map.of("status", "updated"));
    }

    // ── Queue ─────────────────────────────────────────────────────────────────

    @GetMapping("/restaurants/{id}/queue")
    public ResponseEntity<List<QueuePositionResponse>> getQueue(@PathVariable UUID id) {
        return ResponseEntity.ok(foodService.getQueue(id));
    }

    @GetMapping("/orders/{id}/queue-position")
    public ResponseEntity<QueuePositionResponse> myQueuePosition(@PathVariable UUID id) {
        return ResponseEntity.ok(foodService.myQueuePosition(id));
    }

    @PostMapping("/restaurants/{id}/queue/call-next")
    public ResponseEntity<QueuePositionResponse> callNext(@PathVariable UUID id) {
        return ResponseEntity.ok(foodService.callNext(id));
    }

    @PostMapping("/queue/{entryId}/serve")
    public ResponseEntity<Map<String, String>> serveEntry(@PathVariable UUID entryId) {
        foodService.serveQueueEntry(entryId);
        return ResponseEntity.ok(Map.of("status", "served"));
    }

    // ── Ratings ───────────────────────────────────────────────────────────────

    @PostMapping("/orders/{id}/rate")
    public ResponseEntity<Map<String, String>> rateOrder(
            @PathVariable UUID id,
            @Valid @RequestBody RateFoodRequest req) {
        foodService.rateOrder(id, req);
        return ResponseEntity.ok(Map.of("status", "rated"));
    }

    // ── Health ping ───────────────────────────────────────────────────────────

    @GetMapping("/ping")
    public ResponseEntity<Map<String, String>> ping(@AuthenticationPrincipal String userId) {
        return ResponseEntity.ok(Map.of("service", "food-service", "status", "ok"));
    }
}
