package com.gozone.ride.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * Shared WebSocket/STOMP layer for live ride tracking and delivery courier tracking.
 * Delivery reuses the same primitive — a courier is a driver carrying a parcel.
 *
 * Connection:  ws://host:8082/rides/ws/websocket?token=<JWT>
 * Subscribe:   /topic/trip/{tripId}/location      — rider watches driver
 *              /topic/delivery/{id}/location       — customer watches courier (food)
 *              /topic/queue/{restaurantId}          — customer watches queue position
 * Publish:     /app/location/{tripId}              — driver pushes GPS
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
            .setAllowedOriginPatterns("*")
            .withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // Simple in-memory broker for /topic/** subscriptions
        config.enableSimpleBroker("/topic");
        config.setApplicationDestinationPrefixes("/app");
    }
}
