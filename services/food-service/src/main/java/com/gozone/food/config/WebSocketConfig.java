package com.gozone.food.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * WebSocket/STOMP for delivery courier tracking and walk-in queue position.
 * Delivery courier tracking reuses the same primitive as ride tracking —
 * a courier is a driver carrying a parcel.
 *
 * Connection:  ws://host:8083/food/ws/websocket?token=<JWT>
 * Subscribe:   /topic/delivery/{deliveryId}/location   — customer watches courier
 *              /topic/queue/{restaurantId}              — customer watches queue position
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
        config.enableSimpleBroker("/topic");
        config.setApplicationDestinationPrefixes("/app");
    }
}
