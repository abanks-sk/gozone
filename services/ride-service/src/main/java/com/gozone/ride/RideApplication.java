package com.gozone.ride;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class RideApplication {
    public static void main(String[] args) {
        SpringApplication.run(RideApplication.class, args);
    }
}
