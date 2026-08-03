package com.gozone.auth.config;

import com.gozone.auth.model.User;
import com.gozone.auth.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.Base64;

/**
 * Ensures a SUPER_ADMIN exists on startup (admins are credential-based and can't self-sign-up,
 * so there must be a bootstrap super admin to create the rest). Idempotent.
 *
 * The bootstrap password comes from SUPERADMIN_PASSWORD; if unset, a strong random one is
 * generated and printed ONCE so it can be captured and rotated. The password itself is never
 * stored in plaintext or logged on subsequent boots.
 */
@Component
public class SeedRunner implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedRunner.class);
    private final UserRepository userRepo;

    @Value("${app.superadmin.password:}")
    private String superAdminPassword;

    public SeedRunner(UserRepository userRepo) {
        this.userRepo = userRepo;
    }

    @Override
    public void run(String... args) {
        if (userRepo.findByUsernameAndApp("superadmin", User.App.ADMIN).isEmpty()
                && !userRepo.existsByPhoneAndApp("+233201000000", User.App.ADMIN)) {
            boolean generated = superAdminPassword == null || superAdminPassword.isBlank();
            String password = generated ? randomPassword() : superAdminPassword;

            User u = new User();
            u.setApp(User.App.ADMIN);
            u.setName("Super Admin");
            u.setUsername("superadmin");
            u.setPasswordHash(new BCryptPasswordEncoder().encode(password));
            u.setPhone("+233201000000");
            u.setRole(User.Role.SUPER_ADMIN);
            u.setStatus(User.Status.ACTIVE);
            userRepo.save(u);

            if (generated) {
                // First boot only: print the generated password once so it can be captured + rotated.
                log.warn("[SEED] super admin created — username=superadmin. Generated one-time password: {} — CHANGE IT.", password);
            } else {
                log.info("[SEED] super admin created — username=superadmin (password from SUPERADMIN_PASSWORD).");
            }
        }
    }

    private String randomPassword() {
        byte[] b = new byte[18];
        new SecureRandom().nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }
}
