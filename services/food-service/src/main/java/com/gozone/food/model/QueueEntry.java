package com.gozone.food.model;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "queue_entries")
public class QueueEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "restaurant_id", nullable = false)
    private Vendor restaurant;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id")
    private Order order;

    @Column(nullable = false)
    private int position;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.WAITING;

    @Column(name = "joined_at", nullable = false, updatable = false)
    private OffsetDateTime joinedAt = OffsetDateTime.now();

    public enum Status { WAITING, CALLED, SERVED }

    public UUID getId() { return id; }
    public Vendor getRestaurant() { return restaurant; }
    public void setRestaurant(Vendor restaurant) { this.restaurant = restaurant; }
    public Order getOrder() { return order; }
    public void setOrder(Order order) { this.order = order; }
    public int getPosition() { return position; }
    public void setPosition(int position) { this.position = position; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public OffsetDateTime getJoinedAt() { return joinedAt; }
}
